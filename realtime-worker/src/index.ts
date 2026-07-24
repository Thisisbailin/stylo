import * as Y from "yjs";
import {
  decodeUpdateBase64,
  encodeUpdateBase64,
  readProjectSnapshot,
} from "../../collaboration/yProjectDocument";

type RoomEnv = { DB: any };
type RoomIdentity = { userId: string; projectId: string };
type RoomAccess = "edit" | "view";
type RoomClientIdentity = RoomIdentity & { access: RoomAccess; viewerUserId: string };
type ClientMessage = {
  type?: unknown;
  actorId?: unknown;
  opId?: unknown;
  update?: unknown;
};
type ResetMode = "reset" | "delete";
type RoomMetaRow = {
  user_id: string;
  project_id: string;
  server_seq: number;
  checkpoint_seq: number;
  checkpoint: ArrayBuffer;
  projected_seq: number;
  pending_bytes: number;
};
type RoomUpdateRow = {
  server_seq: number;
  actor_id: string;
  op_id: string;
  update_blob: ArrayBuffer;
};

const REALTIME_PROTOCOL = "stylo-realtime.v1";
const MAX_UPDATE_BYTES = 2_000_000;
const MAX_PENDING_BYTES = 8_000_000;
const MAX_PROJECT_BYTES = 8_000_000;
const PROJECTION_BYTE_THRESHOLD = 512_000;
const PROJECTION_DEBOUNCE_MS = 450;
const RETAINED_OPERATION_IDS = 2_000;

const normalizeId = (value: unknown, max = 180) =>
  typeof value === "string" && value.trim().length >= 8 && value.trim().length <= max
    ? value.trim()
    : "";

const toBytes = (value: ArrayBuffer | ArrayLike<number>) =>
  value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value);

const toArrayBuffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer;

const websocketPair = () => {
  const Pair = (globalThis as unknown as { WebSocketPair: new () => {
    0: WebSocket;
    1: WebSocket;
  } }).WebSocketPair;
  return new Pair();
};

type HibernatingWebSocket = WebSocket & {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
};

/**
 * The Durable Object SQLite database is the realtime authority for one
 * (user_id, project_id) room:
 *
 * - every edit appends exactly one compact Yjs update and advances server_seq;
 * - D1 user_project_documents is a read projection, not the acknowledgement path;
 * - an event-triggered alarm compacts a burst into one full checkpoint;
 * - strong readers call /flush before reading the D1 projection.
 */
export class ProjectRealtimeRoom {
  private readonly doc = new Y.Doc();
  private identity: RoomIdentity | null = null;
  private serverSeq = 0;
  private loadPromise: Promise<void> | null = null;
  private flushPromise: Promise<number> | null = null;
  private resetting = false;
  private readonly schemaReady: Promise<void>;

  constructor(private readonly state: any, private readonly env: RoomEnv) {
    this.schemaReady = this.state.blockConcurrencyWhile(async () => {
      this.state.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS room_meta (
           singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
           user_id TEXT NOT NULL,
           project_id TEXT NOT NULL,
           server_seq INTEGER NOT NULL DEFAULT 0,
           checkpoint_seq INTEGER NOT NULL DEFAULT 0,
           checkpoint BLOB NOT NULL,
           projected_seq INTEGER NOT NULL DEFAULT 0,
           pending_bytes INTEGER NOT NULL DEFAULT 0
         )`,
      );
      this.state.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS room_updates (
           server_seq INTEGER PRIMARY KEY,
           actor_id TEXT NOT NULL,
           op_id TEXT NOT NULL,
           update_blob BLOB NOT NULL,
           created_at INTEGER NOT NULL
         )`,
      );
      this.state.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS room_operations (
           op_id TEXT PRIMARY KEY,
           server_seq INTEGER NOT NULL,
           created_at INTEGER NOT NULL
         )`,
      );
    });
  }

  private readRoomMeta() {
    return (this.state.storage.sql.exec(
      `SELECT user_id, project_id, server_seq, checkpoint_seq,
              checkpoint, projected_seq, pending_bytes
       FROM room_meta WHERE singleton = 1`,
    ).toArray() as RoomMetaRow[])[0] || null;
  }

  private assertRoomIdentity(identity: RoomIdentity) {
    if (
      this.identity
      && (this.identity.userId !== identity.userId || this.identity.projectId !== identity.projectId)
    ) {
      throw new Error("Durable Object room identity mismatch");
    }
  }

  private ensureLoaded(identity?: RoomIdentity) {
    if (identity) this.assertRoomIdentity(identity);
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.state.blockConcurrencyWhile(async () => {
      await this.schemaReady;
      const stored = this.readRoomMeta();
      const resolvedIdentity = identity || (stored
        ? { userId: String(stored.user_id), projectId: String(stored.project_id) }
        : null);
      if (!resolvedIdentity) throw new Error("Realtime room identity is unavailable");
      this.assertRoomIdentity(resolvedIdentity);
      this.identity = resolvedIdentity;

      if (stored) {
        const checkpoint = toBytes(stored.checkpoint);
        if (checkpoint.byteLength) Y.applyUpdate(this.doc, checkpoint, "room-checkpoint");
        const updates = this.state.storage.sql.exec(
          `SELECT server_seq, actor_id, op_id, update_blob
           FROM room_updates
           WHERE server_seq > ?1
           ORDER BY server_seq ASC`,
          Number(stored.checkpoint_seq) || 0,
        ).toArray() as RoomUpdateRow[];
        for (const row of updates) {
          Y.applyUpdate(this.doc, toBytes(row.update_blob), `actor:${row.actor_id}`);
        }
        this.serverSeq = Number(stored.server_seq) || 0;
        return;
      }

      // One-time bootstrap for rooms created before the incremental authority
      // rollout. All subsequent edit durability is local to the Durable Object.
      const legacy = await this.env.DB.prepare(
        `SELECT y_state, server_seq FROM user_project_documents
         WHERE user_id = ?1 AND project_id = ?2`,
      ).bind(resolvedIdentity.userId, resolvedIdentity.projectId).first();
      if (legacy?.y_state) {
        Y.applyUpdate(this.doc, toBytes(legacy.y_state), "d1-bootstrap");
      }
      this.serverSeq = Number(legacy?.server_seq) || 0;
      const checkpoint = Y.encodeStateAsUpdate(this.doc);
      this.state.storage.sql.exec(
        `INSERT INTO room_meta
           (singleton, user_id, project_id, server_seq, checkpoint_seq,
            checkpoint, projected_seq, pending_bytes)
         VALUES (1, ?1, ?2, ?3, ?3, ?4, ?3, 0)`,
        resolvedIdentity.userId,
        resolvedIdentity.projectId,
        this.serverSeq,
        toArrayBuffer(checkpoint),
      );
    });
    return this.loadPromise;
  }

  private readSocketIdentity(socket: WebSocket): RoomClientIdentity | null {
    const attachment = (socket as HibernatingWebSocket).deserializeAttachment?.();
    if (!attachment || typeof attachment !== "object") return null;
    const candidate = attachment as Partial<RoomClientIdentity>;
    const userId = normalizeId(candidate.userId);
    const projectId = normalizeId(candidate.projectId);
    const viewerUserId = normalizeId(candidate.viewerUserId);
    const access = candidate.access === "view" ? "view" : candidate.access === "edit" ? "edit" : null;
    return userId && projectId && viewerUserId && access
      ? { userId, projectId, viewerUserId, access }
      : null;
  }

  private scheduleProjection(delay = PROJECTION_DEBOUNCE_MS) {
    return this.state.storage.setAlarm(Date.now() + delay);
  }

  private async projectToD1() {
    await this.ensureLoaded();
    if (!this.identity) throw new Error("Realtime room identity is unavailable");
    const meta = this.readRoomMeta();
    if (!meta || Number(meta.projected_seq) >= this.serverSeq) return this.serverSeq;

    const projectionSeq = this.serverSeq;
    const checkpoint = Y.encodeStateAsUpdate(this.doc);
    const serialized = JSON.stringify(readProjectSnapshot<Record<string, unknown>>(this.doc));
    if (serialized.length > MAX_PROJECT_BYTES) {
      throw new Error("Realtime project exceeds the maximum projected size");
    }
    const now = Date.now();
    await this.env.DB.prepare(
      `INSERT INTO user_project_documents
         (user_id, project_id, y_state, project_data, server_seq, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(user_id, project_id) DO UPDATE SET
         y_state = excluded.y_state,
         project_data = excluded.project_data,
         server_seq = excluded.server_seq,
         updated_at = excluded.updated_at
       WHERE user_project_documents.server_seq <= excluded.server_seq`,
    ).bind(
      this.identity.userId,
      this.identity.projectId,
      toArrayBuffer(checkpoint),
      serialized,
      projectionSeq,
      now,
    ).run();

    this.state.storage.transactionSync(() => {
      this.state.storage.sql.exec(
        `UPDATE room_meta SET
           checkpoint = ?1,
           checkpoint_seq = MAX(checkpoint_seq, ?2),
           projected_seq = MAX(projected_seq, ?2),
           pending_bytes = COALESCE((
             SELECT SUM(LENGTH(update_blob)) FROM room_updates WHERE server_seq > ?2
           ), 0)
         WHERE singleton = 1`,
        toArrayBuffer(checkpoint),
        projectionSeq,
      );
      this.state.storage.sql.exec(
        "DELETE FROM room_updates WHERE server_seq <= ?1",
        projectionSeq,
      );
      this.state.storage.sql.exec(
        "DELETE FROM room_operations WHERE server_seq <= ?1",
        Math.max(0, projectionSeq - RETAINED_OPERATION_IDS),
      );
    });
    if (this.serverSeq > projectionSeq) {
      this.state.waitUntil(this.scheduleProjection());
    }
    return projectionSeq;
  }

  private async flushProjection(requiredSeq = this.serverSeq) {
    while ((Number(this.readRoomMeta()?.projected_seq) || 0) < requiredSeq) {
      if (!this.flushPromise) {
        this.flushPromise = this.projectToD1().finally(() => {
          this.flushPromise = null;
        });
      }
      await this.flushPromise;
    }
    return Number(this.readRoomMeta()?.projected_seq) || 0;
  }

  private projectInBackground(requiredSeq: number) {
    this.state.waitUntil(
      this.flushProjection(requiredSeq).catch(async (error) => {
        console.error("Realtime project projection failed", error);
        await this.scheduleProjection(2_000);
      }),
    );
  }

  private async resetProject(identity: RoomIdentity, mode: ResetMode) {
    this.resetting = true;
    try {
      await this.ensureLoaded(identity);
      if (this.flushPromise) await this.flushPromise.catch(() => undefined);
      this.doc.transact(() => {
        this.doc.getMap("project").clear();
      }, `server-${mode}`);
      const checkpoint = Y.encodeStateAsUpdate(this.doc);
      this.state.storage.transactionSync(() => {
        this.state.storage.sql.exec("DELETE FROM room_updates");
        this.state.storage.sql.exec("DELETE FROM room_operations");
        this.state.storage.sql.exec("DELETE FROM room_meta");
        this.state.storage.sql.exec(
          `INSERT INTO room_meta
             (singleton, user_id, project_id, server_seq, checkpoint_seq,
              checkpoint, projected_seq, pending_bytes)
           VALUES (1, ?1, ?2, 0, 0, ?3, 0, 0)`,
          identity.userId,
          identity.projectId,
          toArrayBuffer(checkpoint),
        );
      });
      this.serverSeq = 0;
      await this.state.storage.deleteAlarm();
      await this.env.DB.prepare(
        `DELETE FROM user_project_documents
         WHERE user_id = ?1 AND project_id = ?2`,
      ).bind(identity.userId, identity.projectId).run();
    } finally {
      this.resetting = false;
    }

    const message = JSON.stringify({ type: "reset", mode });
    for (const peer of this.state.getWebSockets()) {
      peer.send(message);
      if (mode === "delete") {
        peer.close(4004, "Project permanently deleted");
      }
    }
  }

  async fetch(request: Request) {
    const userId = normalizeId(request.headers.get("x-stylo-user-id"));
    const projectId = normalizeId(request.headers.get("x-stylo-project-id"));
    const accessHeader = request.headers.get("x-stylo-access-mode");
    const access: RoomAccess = accessHeader === "view" ? "view" : "edit";
    const viewerUserId = normalizeId(request.headers.get("x-stylo-viewer-id"))
      || (!accessHeader ? userId : "");
    if (!userId || !projectId) return new Response("Missing trusted room identity", { status: 401 });

    const pathname = new URL(request.url).pathname;
    if (request.method === "POST" && pathname === "/flush") {
      await this.ensureLoaded({ userId, projectId });
      const serverSeq = await this.flushProjection(this.serverSeq);
      return Response.json({ serverSeq });
    }
    if (request.method === "POST" && pathname === "/reset") {
      const mode = request.headers.get("x-stylo-reset-mode") === "delete" ? "delete" : "reset";
      await this.resetProject({ userId, projectId }, mode);
      return new Response(null, { status: 204 });
    }
    if (request.method === "POST" && pathname === "/revoke-viewers") {
      for (const peer of this.state.getWebSockets()) {
        if (this.readSocketIdentity(peer)?.access === "view") {
          peer.close(4003, "Project visibility changed");
        }
      }
      return new Response(null, { status: 204 });
    }
    if (!viewerUserId) return new Response("Missing trusted viewer identity", { status: 401 });
    if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }
    await this.ensureLoaded({ userId, projectId });

    const pair = websocketPair();
    const client = pair[0];
    const server = pair[1] as HibernatingWebSocket;
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ userId, projectId, access, viewerUserId });
    server.send(JSON.stringify({
      type: "sync",
      serverSeq: this.serverSeq,
      update: encodeUpdateBase64(Y.encodeStateAsUpdate(this.doc)),
      stateVector: encodeUpdateBase64(Y.encodeStateVector(this.doc)),
    }));
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "sec-websocket-protocol": REALTIME_PROTOCOL },
    } as ResponseInit & { webSocket: WebSocket });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    const attachedIdentity = this.readSocketIdentity(socket);
    if (!attachedIdentity) {
      socket.close(1008, "Missing project room identity");
      return;
    }
    await this.ensureLoaded(attachedIdentity);
    if (typeof raw !== "string" || !this.identity) return;
    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      socket.send(JSON.stringify({ type: "error", error: "Invalid realtime message" }));
      return;
    }
    if (message.type !== "update") return;
    if (this.resetting) {
      socket.send(JSON.stringify({ type: "error", error: "Project reset is in progress" }));
      return;
    }
    if (attachedIdentity.access !== "edit" || attachedIdentity.viewerUserId !== attachedIdentity.userId) {
      socket.send(JSON.stringify({ type: "error", error: "Public project connections are read-only" }));
      return;
    }
    const actorId = normalizeId(message.actorId);
    const opId = normalizeId(message.opId);
    if (!actorId || !opId || typeof message.update !== "string") {
      socket.send(JSON.stringify({ type: "error", opId, error: "Invalid realtime update" }));
      return;
    }
    let update: Uint8Array;
    try {
      update = decodeUpdateBase64(message.update);
      const validationDoc = new Y.Doc();
      Y.applyUpdate(validationDoc, update, "validate");
      validationDoc.destroy();
    } catch {
      socket.send(JSON.stringify({ type: "error", opId, error: "Invalid realtime update encoding" }));
      return;
    }
    if (update.byteLength === 0 || update.byteLength > MAX_UPDATE_BYTES) {
      socket.send(JSON.stringify({ type: "error", opId, error: "Realtime update is too large" }));
      return;
    }

    try {
      const duplicate = (this.state.storage.sql.exec(
        "SELECT server_seq FROM room_operations WHERE op_id = ?1",
        opId,
      ).toArray() as Array<{ server_seq: number }>)[0];
      if (duplicate) {
        socket.send(JSON.stringify({ type: "ack", opId, serverSeq: Number(duplicate.server_seq) || 0 }));
        return;
      }

      const meta = this.readRoomMeta();
      const pendingBytes = Number(meta?.pending_bytes) || 0;
      if (pendingBytes + update.byteLength > MAX_PENDING_BYTES) {
        this.projectInBackground(this.serverSeq);
        socket.send(JSON.stringify({
          type: "error",
          opId,
          error: "Realtime room is compacting; retry the update",
        }));
        return;
      }

      const serverSeq = this.serverSeq + 1;
      const now = Date.now();
      this.state.storage.transactionSync(() => {
        this.state.storage.sql.exec(
          `INSERT INTO room_operations (op_id, server_seq, created_at)
           VALUES (?1, ?2, ?3)`,
          opId,
          serverSeq,
          now,
        );
        this.state.storage.sql.exec(
          `INSERT INTO room_updates
             (server_seq, actor_id, op_id, update_blob, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5)`,
          serverSeq,
          actorId,
          opId,
          toArrayBuffer(update),
          now,
        );
        this.state.storage.sql.exec(
          `UPDATE room_meta
           SET server_seq = ?1, pending_bytes = pending_bytes + ?2
           WHERE singleton = 1`,
          serverSeq,
          update.byteLength,
        );
      });
      Y.applyUpdate(this.doc, update, `actor:${actorId}`);
      this.serverSeq = serverSeq;
      if (pendingBytes + update.byteLength >= PROJECTION_BYTE_THRESHOLD) {
        this.projectInBackground(serverSeq);
      } else {
        this.state.waitUntil(this.scheduleProjection());
      }

      socket.send(JSON.stringify({ type: "ack", opId, serverSeq }));
      const broadcast = JSON.stringify({
        type: "update",
        opId,
        actorId,
        serverSeq,
        update: message.update,
      });
      for (const peer of this.state.getWebSockets()) {
        if (peer !== socket) peer.send(broadcast);
      }
    } catch (error) {
      console.error("Realtime project update failed", error);
      socket.send(JSON.stringify({ type: "error", opId, error: "Realtime project update failed" }));
    }
  }

  async alarm() {
    await this.flushProjection();
  }

  webSocketClose(socket: WebSocket, code: number, reason: string) {
    socket.close(code, reason);
  }

  webSocketError(socket: WebSocket) {
    socket.close(1011, "Realtime room error");
  }
}

export default {
  fetch() {
    return new Response("Stylo realtime rooms are accessible through authenticated Pages Functions only.", {
      status: 404,
    });
  },
};
