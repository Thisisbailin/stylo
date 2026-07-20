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
import type { SyncStatusDetail, VersionedSyncCodec, VersionedSyncLease } from "./versionedSyncEngine";
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
  codec: VersionedSyncCodec<ProjectData>;
  onApplyRemote: (project: ProjectData) => void;
  onStatusChange?: (status: SyncStatus, detail?: SyncStatusDetail) => void;
  onError?: (error: unknown) => void;
  onReset?: (mode: "reset" | "delete") => void;
  debounceMs?: number;
};

const createId = () => globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

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
  private latestLocal: ProjectData | null = null;
  private pendingOfflineUpdate: Uint8Array | null = null;
  private pendingAcks = new Map<string, PendingAck>();
  private persistTail: Promise<void> = Promise.resolve();
  private lastLocalSend: Promise<number> | null = null;

  constructor(private readonly options: Options) {
    this.actorId = `${options.session.deviceId}:${createId()}`.slice(0, 180);
    this.storageKey = `${options.accountScope}:${options.projectId}`;
    this.doc.on("update", this.handleDocumentUpdate);
  }

  async start(local: ProjectData) {
    this.latestLocal = this.options.codec.snapshot(local);
    const persisted = await readRealtimeDocument(this.storageKey).catch(() => null);
    if (persisted?.byteLength) Y.applyUpdate(this.doc, persisted, PERSISTED_ORIGIN);
    if (!isProjectDocumentEmpty(this.doc)) this.applyDocumentToApp();
    await this.connect();
  }

  stage(local: ProjectData) {
    if (this.disposed) return;
    this.latestLocal = this.options.codec.snapshot(local);
    applyProjectSnapshot(
      this.doc,
      this.latestLocal as unknown as Record<string, unknown>,
      LOCAL_ORIGIN,
    );
  }

  async acquire(local: ProjectData, expectedRevision: number): Promise<VersionedSyncLease> {
    const snapshot = this.options.codec.snapshot(local);
    const revision = this.options.codec.revision?.(snapshot) ?? null;
    if (revision !== expectedRevision) {
      throw new Error(`实时项目修订 ${revision ?? "missing"} 与 Agent 请求 ${expectedRevision} 不一致。`);
    }
    const receipt = await this.applyAndWait(snapshot);
    return { expectedRevision, remoteVersion: receipt, release: () => undefined };
  }

  refresh() {
    if (!this.disposed) this.reconnect(true);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    if (this.stageTimer) clearTimeout(this.stageTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
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
    this.options.onStatusChange?.("loading", { pendingOps: this.pendingOfflineUpdate ? 1 : 0 });
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

  private reconnect(immediate = false) {
    if (this.disposed || this.reconnectTimer) return;
    const delay = immediate ? 0 : Math.min(1_000 * (2 ** this.reconnectAttempt), 15_000);
    this.reconnectAttempt += 1;
    this.options.onStatusChange?.("offline", {
      pendingOps: this.pendingOfflineUpdate ? 1 : 0,
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
      Y.applyUpdate(this.doc, decodeUpdateBase64(message.update), REMOTE_ORIGIN);
      this.serverSeq = Math.max(this.serverSeq, Number(message.serverSeq) || 0);
      this.applyDocumentToApp();
      if (message.type === "sync") {
        this.ready = true;
        this.reconnectAttempt = 0;
        if (isProjectDocumentEmpty(this.doc) && this.latestLocal) {
          applyProjectSnapshot(this.doc, this.latestLocal as unknown as Record<string, unknown>, LOCAL_ORIGIN);
        }
        this.queueUpdate(Y.encodeStateAsUpdate(this.doc));
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
      this.options.onStatusChange?.("synced", { lastSyncAt: Date.now(), pendingOps: this.pendingAcks.size });
      return;
    }
    if (message.type === "error") {
      const error = new Error(message.error || "实时项目同步失败。");
      if (message.opId) {
        const pending = this.pendingAcks.get(message.opId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.queueUpdate(pending.update);
          pending.reject(error);
        }
        this.pendingAcks.delete(message.opId);
      }
      this.options.onError?.(error);
    }
  }

  private readonly handleDocumentUpdate = (update: Uint8Array, origin: unknown) => {
    this.persistTail = this.persistTail
      .then(() => writeRealtimeDocument(this.storageKey, Y.encodeStateAsUpdate(this.doc)))
      .catch(() => undefined);
    if (origin === REMOTE_ORIGIN || origin === PERSISTED_ORIGIN) return;
    this.queueUpdate(update);
    if (this.stageTimer) clearTimeout(this.stageTimer);
    this.stageTimer = setTimeout(() => {
      this.stageTimer = null;
      this.lastLocalSend = this.flushPendingUpdate();
      void this.lastLocalSend.catch((error) => this.options.onError?.(error));
    }, this.options.debounceMs ?? 180);
  };

  private queueUpdate(update: Uint8Array) {
    if (!update.byteLength) return;
    this.pendingOfflineUpdate = this.pendingOfflineUpdate
      ? Y.mergeUpdates([this.pendingOfflineUpdate, update])
      : update;
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) {
      this.options.onStatusChange?.("offline", {
        pendingOps: this.pendingAcks.size + 1,
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
        pending.reject(new Error("实时项目写入确认超时，更改将在重连后重发。"));
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
      pendingOps: this.pendingAcks.size,
      retryCount: 0,
      lastAttemptAt: Date.now(),
    });
    return promise;
  }

  private requeuePendingAcks(error: Error) {
    if (!this.pendingAcks.size) return;
    this.pendingAcks.forEach((pending) => {
      clearTimeout(pending.timeout);
      this.queueUpdate(pending.update);
      pending.reject(error);
    });
    this.pendingAcks.clear();
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
    this.options.onApplyRemote(snapshot);
  }
}
