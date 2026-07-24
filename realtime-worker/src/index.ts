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

const REALTIME_PROTOCOL = "stylo-realtime.v1";
const MAX_UPDATE_BYTES = 2_000_000;
const RETAINED_UPDATES = 1_000;

const normalizeId = (value: unknown, max = 180) =>
  typeof value === "string" && value.trim().length >= 8 && value.trim().length <= max
    ? value.trim()
    : "";

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

export class ProjectRealtimeRoom {
  private readonly doc = new Y.Doc();
  private identity: RoomIdentity | null = null;
  private serverSeq = 0;
  private loadPromise: Promise<void> | null = null;

  constructor(private readonly state: any, private readonly env: RoomEnv) {}

  private ensureLoaded(identity: RoomIdentity) {
    if (this.identity) {
      if (this.identity.userId !== identity.userId || this.identity.projectId !== identity.projectId) {
        throw new Error("Durable Object room identity mismatch");
      }
      return this.loadPromise || Promise.resolve();
    }
    this.identity = identity;
    this.loadPromise = this.state.blockConcurrencyWhile(async () => {
      const row = await this.env.DB.prepare(
        `SELECT y_state, server_seq FROM user_project_documents
         WHERE user_id = ?1 AND project_id = ?2`,
      ).bind(identity.userId, identity.projectId).first();
      if (row?.y_state) {
        const bytes = row.y_state instanceof ArrayBuffer
          ? new Uint8Array(row.y_state)
          : new Uint8Array(row.y_state as ArrayLike<number>);
        Y.applyUpdate(this.doc, bytes, "d1-load");
      }
      this.serverSeq = Number(row?.server_seq) || 0;
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

  private async resetProject(identity: RoomIdentity, mode: ResetMode) {
    await this.ensureLoaded(identity);
    await this.state.blockConcurrencyWhile(async () => {
      this.doc.transact(() => {
        this.doc.getMap("project").clear();
      }, `server-${mode}`);
      await this.env.DB.batch([
        this.env.DB.prepare(
          "DELETE FROM user_project_updates WHERE user_id = ?1 AND project_id = ?2",
        ).bind(identity.userId, identity.projectId),
        this.env.DB.prepare(
          "DELETE FROM user_project_documents WHERE user_id = ?1 AND project_id = ?2",
        ).bind(identity.userId, identity.projectId),
      ]);
      this.serverSeq = 0;
    });
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
    // During a rolling deploy, the previous Pages gateway does not send the
    // viewer headers. Those legacy requests are owner-only edit routes, so
    // treating the room owner as the viewer keeps the upgrade non-breaking.
    // New gateways always send both headers and public routes use view access.
    const viewerUserId = normalizeId(request.headers.get("x-stylo-viewer-id"))
      || (!accessHeader ? userId : "");
    if (!userId || !projectId) return new Response("Missing trusted room identity", { status: 401 });

    if (request.method === "POST" && new URL(request.url).pathname === "/reset") {
      const mode = request.headers.get("x-stylo-reset-mode") === "delete" ? "delete" : "reset";
      await this.resetProject({ userId, projectId }, mode);
      return new Response(null, { status: 204 });
    }
    if (request.method === "POST" && new URL(request.url).pathname === "/revoke-viewers") {
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
    } catch {
      socket.send(JSON.stringify({ type: "error", opId, error: "Invalid realtime update encoding" }));
      return;
    }
    if (update.byteLength === 0 || update.byteLength > MAX_UPDATE_BYTES) {
      socket.send(JSON.stringify({ type: "error", opId, error: "Realtime update is too large" }));
      return;
    }

    try {
      const duplicate = await this.env.DB.prepare(
        `SELECT server_seq FROM user_project_updates
         WHERE user_id = ?1 AND project_id = ?2 AND op_id = ?3`,
      ).bind(this.identity.userId, this.identity.projectId, opId).first();
      if (duplicate) {
        socket.send(JSON.stringify({ type: "ack", opId, serverSeq: Number(duplicate.server_seq) || 0 }));
        return;
      }

      const candidate = new Y.Doc();
      Y.applyUpdate(candidate, Y.encodeStateAsUpdate(this.doc), "room-clone");
      Y.applyUpdate(candidate, update, `actor:${actorId}`);
      const projectData = readProjectSnapshot<Record<string, unknown>>(candidate);
      const serialized = JSON.stringify(projectData);
      if (serialized.length > MAX_UPDATE_BYTES) {
        candidate.destroy();
        socket.send(JSON.stringify({ type: "error", opId, error: "Realtime project is too large" }));
        return;
      }
      const fullState = Y.encodeStateAsUpdate(candidate);
      candidate.destroy();
      const serverSeq = this.serverSeq + 1;
      const now = Date.now();
      await this.env.DB.batch([
        this.env.DB.prepare(
          `INSERT INTO user_project_updates
             (user_id, project_id, server_seq, actor_id, op_id, update_blob, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        ).bind(
          this.identity.userId,
          this.identity.projectId,
          serverSeq,
          actorId,
          opId,
          update.buffer.slice(update.byteOffset, update.byteOffset + update.byteLength),
          now,
        ),
        this.env.DB.prepare(
          `INSERT INTO user_project_documents
             (user_id, project_id, y_state, project_data, server_seq, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT(user_id, project_id) DO UPDATE SET
             y_state = excluded.y_state,
             project_data = excluded.project_data,
             server_seq = excluded.server_seq,
             updated_at = excluded.updated_at`,
        ).bind(
          this.identity.userId,
          this.identity.projectId,
          fullState.buffer.slice(fullState.byteOffset, fullState.byteOffset + fullState.byteLength),
          serialized,
          serverSeq,
          now,
        ),
        this.env.DB.prepare(
          `DELETE FROM user_project_updates
           WHERE user_id = ?1 AND project_id = ?2 AND server_seq <= ?3`,
        ).bind(this.identity.userId, this.identity.projectId, Math.max(0, serverSeq - RETAINED_UPDATES)),
      ]);
      Y.applyUpdate(this.doc, update, `actor:${actorId}`);
      this.serverSeq = serverSeq;

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
