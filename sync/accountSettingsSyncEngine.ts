import type { SyncStatus } from "../types";
import type { AccountApiSession } from "./authenticatedFetch";
import type { SyncStatusDetail } from "./realtimeSyncTypes";
import {
  loadSecretsSnapshot,
  saveSecretsSnapshot,
  secretsSyncCodec,
  type SecretsPayload,
} from "./secretsSyncAdapter";

type Options = {
  session: AccountApiSession;
  debounceMs: number;
  onApplyRemote: (remote: SecretsPayload) => void;
  onStatusChange?: (status: SyncStatus, detail?: SyncStatusDetail) => void;
  onError?: (error: unknown) => void;
};

const createOperationId = () => globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

const mergeChangedFields = (
  confirmed: SecretsPayload,
  local: SecretsPayload,
  remote: SecretsPayload,
): SecretsPayload => ({
  textApiKey: local.textApiKey !== confirmed.textApiKey ? local.textApiKey : remote.textApiKey,
  multiApiKey: local.multiApiKey !== confirmed.multiApiKey ? local.multiApiKey : remote.multiApiKey,
  videoApiKey: local.videoApiKey !== confirmed.videoApiKey ? local.videoApiKey : remote.videoApiKey,
});

/**
 * Account API keys are not part of the collaborative project document.
 * They use a small event-driven background synchronizer: cloud state is
 * adopted at bootstrap, then only changed fields are written after a local
 * edit. Concurrent writes are merged per field without interrupting the user.
 */
export class AccountSettingsSyncEngine {
  private readonly controller = new AbortController();
  private confirmed: SecretsPayload | null = null;
  private version = 0;
  private staged: SecretsPayload | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private commandTail: Promise<void> = Promise.resolve();
  private ready = false;
  private disposed = false;
  private online = typeof navigator === "undefined" || navigator.onLine !== false;

  constructor(private readonly options: Options) {}

  start(local: SecretsPayload) {
    const initial = secretsSyncCodec.snapshot(local);
    return this.enqueue(async () => {
      this.emit("loading");
      const remote = await loadSecretsSnapshot(this.options.session, this.controller.signal);
      if (this.disposed) return;
      this.ready = true;
      if (!remote) {
        this.confirmed = secretsSyncCodec.snapshot({
          textApiKey: "",
          multiApiKey: "",
          videoApiKey: "",
        });
        this.version = 0;
        if (!secretsSyncCodec.isEmpty(initial)) {
          this.staged = initial;
          await this.flush();
        } else {
          this.emit("synced", { lastSyncAt: Date.now(), pendingOps: 0 });
        }
        return;
      }
      const pendingLocalEdit = this.staged;
      this.staged = null;
      this.confirmed = secretsSyncCodec.snapshot(remote.value);
      this.version = remote.version;
      if (pendingLocalEdit) {
        const merged = mergeChangedFields(initial, pendingLocalEdit, this.confirmed);
        if (secretsSyncCodec.fingerprint(merged) !== secretsSyncCodec.fingerprint(this.confirmed)) {
          this.staged = merged;
          await this.flush();
          return;
        }
      }
      this.options.onApplyRemote(this.confirmed);
      this.emit("synced", { lastSyncAt: Date.now(), pendingOps: 0 });
    }).catch((error) => {
      if (!this.controller.signal.aborted) {
        this.emit("error", { error: error instanceof Error ? error.message : "账户设置同步失败。" });
        this.options.onError?.(error);
      }
      throw error;
    });
  }

  stage(value: SecretsPayload) {
    if (this.disposed) return;
    const snapshot = secretsSyncCodec.snapshot(value);
    if (this.confirmed && secretsSyncCodec.fingerprint(snapshot) === secretsSyncCodec.fingerprint(this.confirmed)) {
      this.staged = null;
      this.clearTimer();
      return;
    }
    this.staged = snapshot;
    if (!this.ready || !this.online) {
      this.emit(this.online ? "loading" : "offline", { pendingOps: 1 });
      return;
    }
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.enqueue(() => this.flush()).catch((error) => {
        if (!this.controller.signal.aborted) this.options.onError?.(error);
      });
    }, this.options.debounceMs);
  }

  setOnline(online: boolean) {
    if (this.disposed || this.online === online) return;
    this.online = online;
    if (!online) {
      this.emit("offline", { pendingOps: this.staged ? 1 : 0 });
      return;
    }
    if (this.staged && this.ready) {
      this.clearTimer();
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.enqueue(() => this.flush()).catch((error) => this.options.onError?.(error));
      }, 0);
    } else {
      this.emit(this.ready ? "synced" : "loading", { pendingOps: 0 });
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    this.staged = null;
    this.clearTimer();
    this.controller.abort();
  }

  private async flush() {
    if (!this.ready || !this.online || !this.staged || !this.confirmed) return;
    let candidate = this.staged;
    this.staged = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (secretsSyncCodec.fingerprint(candidate) === secretsSyncCodec.fingerprint(this.confirmed)) {
        this.emit("synced", { lastSyncAt: Date.now(), pendingOps: 0 });
        return;
      }
      this.emit("syncing", { pendingOps: 1, retryCount: attempt, lastAttemptAt: Date.now() });
      const result = await saveSecretsSnapshot(
        this.options.session,
        candidate,
        this.version,
        createOperationId(),
        this.controller.signal,
      );
      if (result.kind === "saved") {
        this.confirmed = secretsSyncCodec.snapshot(candidate);
        this.version = result.version;
        this.emit("synced", { lastSyncAt: Date.now(), pendingOps: 0, retryCount: 0 });
        return;
      }
      const previousConfirmed = this.confirmed;
      this.confirmed = secretsSyncCodec.snapshot(result.remote.value);
      this.version = result.remote.version;
      candidate = mergeChangedFields(previousConfirmed, candidate, this.confirmed);
      if (secretsSyncCodec.fingerprint(candidate) === secretsSyncCodec.fingerprint(this.confirmed)) {
        this.options.onApplyRemote(this.confirmed);
        this.emit("synced", { lastSyncAt: Date.now(), pendingOps: 0, retryCount: 0 });
        return;
      }
    }
    this.staged = candidate;
    const error = new Error("账户设置连续发生更新，已保留本地改动并等待下次连接。");
    this.emit("error", { error: error.message, pendingOps: 1 });
    throw error;
  }

  private enqueue(command: () => Promise<void>) {
    const result = this.commandTail.then(command);
    this.commandTail = result.catch(() => undefined);
    return result;
  }

  private clearTimer() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private emit(status: SyncStatus, detail: SyncStatusDetail = {}) {
    this.options.onStatusChange?.(status, detail);
  }
}
