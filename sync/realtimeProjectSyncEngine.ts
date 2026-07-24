import * as Y from "yjs";
import type { ProjectData, SyncStatus } from "../types";
import {
  applyProjectSnapshot,
  decodeUpdateBase64,
  encodeUpdateBase64,
  isProjectDocumentEmpty,
  readProjectSnapshot,
} from "../collaboration/yProjectDocument";
import type { AccountApiSession } from "./authenticatedFetch";
import type { RealtimeSyncLease, SyncCodec, SyncStatusDetail } from "./realtimeSyncTypes";
import {
  deleteRealtimeDocument,
  readRealtimeDocument,
  writeRealtimeDocument,
} from "./realtimeDocumentStore";

const REALTIME_PROTOCOL = "stylo-realtime.v1";
const LOCAL_ORIGIN = Symbol("stylo-local-project");
const REMOTE_ORIGIN = Symbol("stylo-remote-project");
const PERSISTED_ORIGIN = Symbol("stylo-persisted-project");

type ServerMessage = {
  type?: "sync" | "update" | "ack" | "error" | "reset";
  opId?: string;
  actorId?: string;
  serverSeq?: number;
  update?: string;
  stateVector?: string;
  error?: string;
  mode?: "reset" | "delete";
};

type PendingAck = {
  update: Uint8Array;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (serverSeq: number) => void;
  reject: (error: Error) => void;
};

type Options = {
  accountScope: string;
  projectId: string;
  session: AccountApiSession;
  codec: SyncCodec<ProjectData>;
  onApplyRemote: (project: ProjectData) => void;
  onStatusChange?: (status: SyncStatus, detail?: SyncStatusDetail) => void;
  onError?: (error: unknown) => void;
  onReset?: (mode: "reset" | "delete") => void;
  debounceMs?: number;
  persistenceDebounceMs?: number;
};

const createId = () => globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

export const areProjectDocumentsSemanticallyEqual = (
  left: Y.Doc,
  right: Y.Doc,
  codec: SyncCodec<ProjectData>,
) => {
  const leftEmpty = isProjectDocumentEmpty(left);
  const rightEmpty = isProjectDocumentEmpty(right);
  if (leftEmpty && rightEmpty) return true;
  if (leftEmpty !== rightEmpty) {
    const populated = leftEmpty ? right : left;
    const snapshot = codec.snapshot(
      readProjectSnapshot<ProjectData & Record<string, unknown>>(populated),
    );
    return codec.isEmpty(snapshot);
  }
  const leftSnapshot = codec.snapshot(
    readProjectSnapshot<ProjectData & Record<string, unknown>>(left),
  );
  const rightSnapshot = codec.snapshot(
    readProjectSnapshot<ProjectData & Record<string, unknown>>(right),
  );
  return codec.fingerprint(leftSnapshot) === codec.fingerprint(rightSnapshot);
};

export class RealtimeProjectSyncEngine {
  private readonly doc = new Y.Doc();
  private readonly actorId: string;
  private readonly storageKey: string;
  private socket: WebSocket | null = null;
  private disposed = false;
  private ready = false;
  private serverSeq = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stageTimer: ReturnType<typeof setTimeout> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private latestLocal: ProjectData | null = null;
  private latestLocalFingerprint: string | null = null;
  private bootstrapLocalDirty = false;
  private pendingOfflineUpdate: Uint8Array | null = null;
  private pendingAcks = new Map<string, PendingAck>();
  private persistDirty = false;
  private persistInFlight: Promise<void> | null = null;
  private lastLocalSend: Promise<number> | null = null;

  constructor(private readonly options: Options) {
    this.actorId = `${options.session.deviceId}:${createId()}`.slice(0, 180);
    this.storageKey = `${options.accountScope}:${options.projectId}`;
    this.doc.on("update", this.handleDocumentUpdate);
  }

  async start(local: ProjectData) {
    this.latestLocal = this.options.codec.snapshot(local);
    this.latestLocalFingerprint = this.options.codec.fingerprint(this.latestLocal);
    const persisted = await readRealtimeDocument(this.storageKey).catch(() => null);
    if (persisted?.byteLength) Y.applyUpdate(this.doc, persisted, PERSISTED_ORIGIN);
    if (!isProjectDocumentEmpty(this.doc)) this.applyDocumentToApp();
    await this.connect();
  }

  stage(local: ProjectData) {
    if (this.disposed) return;
    const next = this.options.codec.snapshot(local);
    const fingerprint = this.options.codec.fingerprint(next);
    if (fingerprint === this.latestLocalFingerprint) return;
    this.latestLocal = next;
    this.latestLocalFingerprint = fingerprint;
    if (!this.ready) {
      this.bootstrapLocalDirty = true;
      // A real edit made while the socket is connecting is still an offline
      // edit: apply and checkpoint it immediately. The initial React effect is
      // filtered above by fingerprint, so it no longer creates a false upload.
      applyProjectSnapshot(
        this.doc,
        this.latestLocal as unknown as Record<string, unknown>,
        LOCAL_ORIGIN,
      );
      return;
    }
    applyProjectSnapshot(
      this.doc,
      this.latestLocal as unknown as Record<string, unknown>,
      LOCAL_ORIGIN,
    );
  }

  async acquire(local: ProjectData, expectedRevision: number): Promise<RealtimeSyncLease> {
    const snapshot = this.options.codec.snapshot(local);
    const revision = this.options.codec.revision?.(snapshot) ?? null;
    if (revision !== expectedRevision) {
      throw new Error(`实时项目修订 ${revision ?? "missing"} 与 Agent 请求 ${expectedRevision} 不一致。`);
    }
    const receipt = await this.applyAndWait(snapshot);
    return { expectedRevision, remoteVersion: receipt, release: () => undefined };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    if (this.stageTimer) clearTimeout(this.stageTimer);
    if (this.persistTimer) clearTimeout(this.persistTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stageTimer = null;
    this.persistTimer = null;
    if (this.persistDirty) void this.flushDocumentPersistence();
    this.socket?.close(1000, "Project sync disposed");
    this.socket = null;
    this.pendingAcks.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error("实时项目同步已停止。"));
    });
    this.pendingAcks.clear();
    this.doc.off("update", this.handleDocumentUpdate);
  }

  private async connect() {
    if (this.disposed) return;
    this.options.onStatusChange?.("loading", { pendingOps: this.pendingOperationCount() });
    try {
      const socket = await this.options.session.openWebSocket(
        `/api/project-realtime?projectId=${encodeURIComponent(this.options.projectId)}`,
        REALTIME_PROTOCOL,
      );
      if (this.disposed) {
        socket.close();
        return;
      }
      this.socket = socket;
      socket.onmessage = (event) => this.handleSocketMessage(event);
      socket.onclose = () => {
        if (this.socket === socket) this.socket = null;
        this.ready = false;
        this.requeuePendingAcks(new Error("实时连接已中断，未确认的更改将在重连后重发。"));
        if (!this.disposed) this.reconnect();
      };
      socket.onerror = () => {
        if (isProjectDocumentEmpty(this.doc) && this.latestLocal) {
          applyProjectSnapshot(this.doc, this.latestLocal as unknown as Record<string, unknown>, LOCAL_ORIGIN);
        }
      };
    } catch (error) {
      if (isProjectDocumentEmpty(this.doc) && this.latestLocal) {
        applyProjectSnapshot(this.doc, this.latestLocal as unknown as Record<string, unknown>, LOCAL_ORIGIN);
      }
      this.options.onError?.(error);
      this.reconnect();
    }
  }

  private reconnect() {
    if (this.disposed || this.reconnectTimer) return;
    const delay = Math.min(1_000 * (2 ** this.reconnectAttempt), 15_000);
    this.reconnectAttempt += 1;
    this.options.onStatusChange?.("offline", {
      pendingOps: this.pendingOperationCount(),
      retryCount: this.reconnectAttempt,
      lastAttemptAt: Date.now(),
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private handleSocketMessage(event: MessageEvent) {
    if (typeof event.data !== "string") return;
    let message: ServerMessage;
    try {
      message = JSON.parse(event.data) as ServerMessage;
    } catch {
      return;
    }
    if ((message.type === "sync" || message.type === "update") && typeof message.update === "string") {
      const remoteUpdate = decodeUpdateBase64(message.update);
      const serverDoc = message.type === "sync" ? new Y.Doc() : null;
      if (serverDoc) Y.applyUpdate(serverDoc, remoteUpdate, REMOTE_ORIGIN);
      const bootstrapSnapshot = this.bootstrapLocalDirty ? this.latestLocal : null;
      Y.applyUpdate(this.doc, remoteUpdate, REMOTE_ORIGIN);
      this.serverSeq = Math.max(this.serverSeq, Number(message.serverSeq) || 0);
      if (message.type === "sync") {
        this.ready = true;
        this.reconnectAttempt = 0;
        if (isProjectDocumentEmpty(this.doc) && this.latestLocal) {
          applyProjectSnapshot(this.doc, this.latestLocal as unknown as Record<string, unknown>, LOCAL_ORIGIN);
        } else if (bootstrapSnapshot) {
          applyProjectSnapshot(this.doc, bootstrapSnapshot as unknown as Record<string, unknown>, LOCAL_ORIGIN);
        }
        this.bootstrapLocalDirty = false;
      }
      this.applyDocumentToApp();
      if (message.type === "sync" && serverDoc) {
        const serverStateVector = typeof message.stateVector === "string"
          ? decodeUpdateBase64(message.stateVector)
          : Y.encodeStateVector(serverDoc);
        if (this.hasSemanticDifferenceFrom(serverDoc)) {
          this.queueUpdate(Y.encodeStateAsUpdate(this.doc, serverStateVector));
        } else if (this.pendingAcks.size === 0) {
          // State vectors also contain CRDT client history. A persisted local
          // document can therefore have a non-empty structural delta even when
          // its materialized project is byte-for-byte equivalent to the server.
          // Do not upload that history as an authored project change.
          this.pendingOfflineUpdate = null;
        }
        serverDoc.destroy();
        if (this.stageTimer) {
          clearTimeout(this.stageTimer);
          this.stageTimer = null;
        }
        const hadPendingUpdate = Boolean(this.pendingOfflineUpdate);
        void this.flushPendingUpdate().catch((error) => this.options.onError?.(error));
        if (!hadPendingUpdate) {
          this.options.onStatusChange?.("synced", {
            lastSyncAt: Date.now(),
            pendingOps: 0,
            retryCount: 0,
          });
        }
      }
      return;
    }
    if (message.type === "reset") {
      if (this.stageTimer) {
        clearTimeout(this.stageTimer);
        this.stageTimer = null;
      }
      this.pendingOfflineUpdate = null;
      this.requeuePendingAcks(new Error("项目已在另一台设备重置。"));
      this.pendingOfflineUpdate = null;
      this.doc.transact(() => this.doc.getMap("project").clear(), REMOTE_ORIGIN);
      this.latestLocal = null;
      void deleteRealtimeDocument(this.storageKey).catch(() => undefined);
      this.options.onReset?.(message.mode === "delete" ? "delete" : "reset");
      this.options.onStatusChange?.("synced", {
        lastSyncAt: Date.now(),
        pendingOps: 0,
        retryCount: 0,
      });
      return;
    }
    if (message.type === "ack" && message.opId) {
      const pending = this.pendingAcks.get(message.opId);
      if (!pending) return;
      this.pendingAcks.delete(message.opId);
      clearTimeout(pending.timeout);
      this.serverSeq = Math.max(this.serverSeq, Number(message.serverSeq) || 0);
      pending.resolve(this.serverSeq);
      if (this.pendingOfflineUpdate && !this.stageTimer) {
        this.lastLocalSend = this.flushPendingUpdate();
        void this.lastLocalSend.catch((error) => this.options.onError?.(error));
      }
      if (this.pendingOperationCount() === 0) {
        this.options.onStatusChange?.("synced", {
          lastSyncAt: Date.now(),
          pendingOps: 0,
          retryCount: 0,
        });
      }
      return;
    }
    if (message.type === "error") {
      const error = new Error(message.error || "实时项目同步失败。");
      if (message.opId) {
        const pending = this.pendingAcks.get(message.opId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingAcks.delete(message.opId);
          this.queueUpdate(pending.update);
          pending.reject(error);
        }
      }
      this.options.onStatusChange?.("error", {
        error: error.message,
        pendingOps: this.pendingOperationCount(),
        retryCount: this.reconnectAttempt,
      });
      this.options.onError?.(error);
      this.ready = false;
      this.socket?.close(1011, "Realtime update rejected");
    }
  }

  private readonly handleDocumentUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === PERSISTED_ORIGIN) return;
    this.scheduleDocumentPersistence();
    if (origin === REMOTE_ORIGIN) return;
    this.queueUpdate(update);
    if (this.stageTimer) clearTimeout(this.stageTimer);
    this.stageTimer = setTimeout(() => {
      this.stageTimer = null;
      this.lastLocalSend = this.flushPendingUpdate();
      void this.lastLocalSend.catch((error) => this.options.onError?.(error));
    }, this.options.debounceMs ?? 180);
  };

  private queueUpdate(update: Uint8Array) {
    // Yjs encodes an empty update as two bytes. Do not turn a connection
    // handshake or a semantically unchanged React render into a network write.
    if (update.byteLength <= 2) return;
    this.pendingOfflineUpdate = this.pendingOfflineUpdate
      ? Y.mergeUpdates([this.pendingOfflineUpdate, update])
      : update;
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) {
      this.options.onStatusChange?.("offline", {
        pendingOps: this.pendingOperationCount(),
        retryCount: this.reconnectAttempt,
      });
    }
  }

  private flushPendingUpdate() {
    if (!this.pendingOfflineUpdate) return Promise.resolve(this.serverSeq);
    if (!this.ready || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.resolve(this.serverSeq);
    }
    const update = this.pendingOfflineUpdate;
    this.pendingOfflineUpdate = null;
    return this.sendUpdate(update);
  }

  private sendUpdate(update: Uint8Array) {
    if (!this.ready || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.queueUpdate(update);
      return Promise.resolve(this.serverSeq);
    }
    const opId = createId();
    const promise = new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = this.pendingAcks.get(opId);
        if (!pending) return;
        this.pendingAcks.delete(opId);
        this.queueUpdate(pending.update);
        const error = new Error("实时项目写入确认超时，更改将在重连后重发。");
        pending.reject(error);
        this.options.onStatusChange?.("error", {
          error: error.message,
          pendingOps: this.pendingOperationCount(),
          retryCount: this.reconnectAttempt,
        });
        this.socket?.close(1012, "Realtime acknowledgement timeout");
      }, 15_000);
      this.pendingAcks.set(opId, { update, timeout, resolve, reject });
    });
    this.socket.send(JSON.stringify({
      type: "update",
      actorId: this.actorId,
      opId,
      update: encodeUpdateBase64(update),
    }));
    this.options.onStatusChange?.("syncing", {
      pendingOps: this.pendingOperationCount(),
      retryCount: 0,
      lastAttemptAt: Date.now(),
    });
    return promise;
  }

  private requeuePendingAcks(error: Error) {
    if (!this.pendingAcks.size) return;
    const pending = Array.from(this.pendingAcks.values());
    this.pendingAcks.clear();
    pending.forEach((entry) => {
      clearTimeout(entry.timeout);
      this.queueUpdate(entry.update);
      entry.reject(error);
    });
  }

  private pendingOperationCount() {
    return this.pendingAcks.size + (this.pendingOfflineUpdate ? 1 : 0);
  }

  private hasSemanticDifferenceFrom(serverDoc: Y.Doc) {
    return !areProjectDocumentsSemanticallyEqual(this.doc, serverDoc, this.options.codec);
  }

  private scheduleDocumentPersistence() {
    this.persistDirty = true;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.flushDocumentPersistence();
    }, this.options.persistenceDebounceMs ?? 240);
  }

  private flushDocumentPersistence(): Promise<void> {
    if (this.persistInFlight) return this.persistInFlight;
    if (!this.persistDirty) return Promise.resolve();
    this.persistDirty = false;
    const checkpoint = Y.encodeStateAsUpdate(this.doc);
    const task = writeRealtimeDocument(this.storageKey, checkpoint).catch(() => undefined);
    this.persistInFlight = task;
    void task.finally(() => {
      if (this.persistInFlight === task) this.persistInFlight = null;
      if (!this.persistDirty) return;
      if (this.disposed) {
        void this.flushDocumentPersistence();
      } else {
        this.scheduleDocumentPersistence();
      }
    });
    return task;
  }

  private async applyAndWait(snapshot: ProjectData) {
    if (!this.ready || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("实时项目连接尚未就绪，Agent 请求未发送。");
    }
    if (this.stageTimer) {
      clearTimeout(this.stageTimer);
      this.stageTimer = null;
    }
    applyProjectSnapshot(this.doc, snapshot as unknown as Record<string, unknown>, LOCAL_ORIGIN);
    this.lastLocalSend = this.flushPendingUpdate();
    return this.lastLocalSend;
  }

  private applyDocumentToApp() {
    if (isProjectDocumentEmpty(this.doc)) return;
    const candidate = readProjectSnapshot<ProjectData & Record<string, unknown>>(this.doc);
    const snapshot = this.options.codec.snapshot(candidate);
    this.latestLocal = snapshot;
    this.latestLocalFingerprint = this.options.codec.fingerprint(snapshot);
    this.options.onApplyRemote(snapshot);
  }
}
