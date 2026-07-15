import type { SyncStatus } from "../types";

export type SyncStatusDetail = {
  lastSyncAt?: number;
  error?: string;
  pendingOps?: number;
  retryCount?: number;
  lastAttemptAt?: number;
};

export type VersionedSnapshot<T> = {
  value: T;
  version: number;
  revision?: number | null;
};

export type VersionedSaveRequest<T> = {
  value: T;
  baseValue: T | null;
  baseVersion: number;
  operationId: string;
  forceFull: boolean;
  expectedRevision?: number;
};

export type VersionedSaveResult<T> =
  | { kind: "saved"; version: number; revision?: number | null }
  | { kind: "conflict"; remote: VersionedSnapshot<T> };

export interface VersionedSyncTransport<T> {
  load(signal: AbortSignal): Promise<VersionedSnapshot<T> | null>;
  save(request: VersionedSaveRequest<T>, signal: AbortSignal): Promise<VersionedSaveResult<T>>;
}

export type SyncBaseline = {
  fingerprint: string;
  version: number;
};

export type SyncBaselineStore = {
  read(): SyncBaseline | null;
  write(value: SyncBaseline): void;
  clear?(): void;
};

export type SyncConflict<T> = {
  local: T;
  remote: T;
  reason: "bootstrap" | "push";
};

export type VersionedSyncCodec<T> = {
  snapshot(value: T): T;
  fingerprint(value: T): string;
  validate(value: T): string | null;
  isEmpty(value: T): boolean;
  revision?(value: T): number | null;
};

export type VersionedSyncLease = {
  expectedRevision: number;
  remoteVersion: number;
  release(): void;
};

export type VersionedSyncEngineOptions<T> = {
  transport: VersionedSyncTransport<T>;
  codec: VersionedSyncCodec<T>;
  baselineStore: SyncBaselineStore;
  onStatusChange?: (status: SyncStatus, detail?: SyncStatusDetail) => void;
  onApplyRemote: (remote: T, local: T) => void;
  onConflict: (conflict: SyncConflict<T>) => Promise<"remote" | "local">;
  onBackupLocal?: (local: T) => void;
  onBackupRemote?: (remote: T) => void;
  restoreRemote?: (remote: T, local: T) => T;
  allowEmptyOverwrite?: () => boolean;
  onEmptyOverwriteCommitted?: () => void;
  debounceMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
  createOperationId?: () => string;
};

export class RemoteConflictAcceptedError extends Error {
  constructor() {
    super("同步冲突已选择云端版本，本地快照未提交。Agent 请求已取消。");
    this.name = "RemoteConflictAcceptedError";
  }
}

export class SyncProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncProtocolError";
  }
}

const defaultSleep = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Sync engine disposed", "AbortError"));
      return;
    }
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new DOMException("Sync engine disposed", "AbortError"));
    }, { once: true });
  });

const defaultOperationId = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

const isRetryableError = (error: unknown) =>
  Boolean(error && typeof error === "object" && "retryable" in error && (error as { retryable?: unknown }).retryable === true);

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "同步过程中发生未知错误。";

/**
 * Serialized, account-scoped synchronization state machine.
 * Every write operates on an immutable snapshot and one server-issued base version.
 */
export class VersionedSyncEngine<T> {
  private readonly controller = new AbortController();
  private readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  private readonly random: () => number;
  private readonly createOperationId: () => string;
  private readonly debounceMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private commandTail: Promise<void> = Promise.resolve();
  private confirmed: T | null = null;
  private remoteVersion: number | null = null;
  private ready = false;
  private disposed = false;
  private online = typeof navigator === "undefined" || navigator.onLine !== false;
  private staged: T | null = null;
  private stageGeneration = 0;
  private stageTimer: ReturnType<typeof setTimeout> | null = null;
  private activeWrites = 0;
  private holdCount = 0;
  private onlineWaiters = new Set<() => void>();
  private status: SyncStatus = "idle";
  private lastError: string | undefined;
  private retryCount = 0;
  private lastAttemptAt: number | undefined;

  constructor(private readonly options: VersionedSyncEngineOptions<T>) {
    this.sleep = options.sleep || defaultSleep;
    this.random = options.random || Math.random;
    this.createOperationId = options.createOperationId || defaultOperationId;
    this.debounceMs = options.debounceMs ?? 1200;
    this.maxRetries = options.maxRetries ?? 6;
    this.retryBaseMs = options.retryBaseMs ?? 600;
  }

  get isReady() {
    return this.ready && !this.disposed;
  }

  start(local: T) {
    const snapshot = this.capture(local);
    return this.enqueue(() => this.reconcile(snapshot));
  }

  refresh(local: T) {
    const snapshot = this.capture(local);
    return this.enqueue(() => this.reconcile(snapshot));
  }

  stage(local: T) {
    if (this.disposed) return;
    const snapshot = this.capture(local);
    this.stageGeneration += 1;
    if (this.confirmed && this.isEqual(snapshot, this.confirmed) && this.activeWrites === 0) {
      this.staged = null;
      this.clearStageTimer();
      this.emit("synced");
      return;
    }
    this.staged = snapshot;
    this.armStageTimer();
    this.emit(this.ready ? this.status : "loading");
  }

  async acquire(local: T, expectedRevision: number): Promise<VersionedSyncLease> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new SyncProtocolError("Agent 请求缺少有效的画布修订号。");
    }
    const snapshot = this.capture(local);
    const snapshotRevision = this.options.codec.revision?.(snapshot) ?? null;
    if (snapshotRevision !== expectedRevision) {
      throw new SyncProtocolError(
        `不可变项目快照修订为 ${snapshotRevision ?? "missing"}，与请求修订 ${expectedRevision} 不一致。`
      );
    }
    this.holdCount += 1;
    this.stageGeneration += 1;
    this.clearStageTimer();
    this.staged = null;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.holdCount = Math.max(0, this.holdCount - 1);
      if (this.holdCount === 0) this.armStageTimer(0);
    };

    try {
      const receipt = await this.enqueue(() => this.commit(snapshot, true, expectedRevision));
      return { expectedRevision, remoteVersion: receipt.version, release };
    } catch (error) {
      release();
      throw error;
    }
  }

  setOnline(online: boolean) {
    if (this.disposed || this.online === online) return;
    this.online = online;
    if (!online) {
      this.emit("offline");
      return;
    }
    const waiters = Array.from(this.onlineWaiters);
    this.onlineWaiters.clear();
    waiters.forEach((resolve) => resolve());
    if (this.staged) this.armStageTimer(0);
    else this.emit(this.ready ? "synced" : "loading");
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    this.clearStageTimer();
    this.staged = null;
    this.controller.abort();
    const waiters = Array.from(this.onlineWaiters);
    this.onlineWaiters.clear();
    waiters.forEach((resolve) => resolve());
  }

  private capture(value: T) {
    const snapshot = this.options.codec.snapshot(value);
    const validationError = this.options.codec.validate(snapshot);
    if (validationError) throw new SyncProtocolError(validationError);
    return snapshot;
  }

  private isEqual(left: T, right: T) {
    return this.options.codec.fingerprint(left) === this.options.codec.fingerprint(right);
  }

  private enqueue<R>(command: () => Promise<R>): Promise<R> {
    if (this.disposed) return Promise.reject(new DOMException("Sync engine disposed", "AbortError"));
    const result = this.commandTail.then(() => {
      this.controller.signal.throwIfAborted();
      return command();
    });
    this.commandTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private async reconcile(local: T) {
    this.emit("loading");
    try {
      const remote = await this.retry("loading", () => this.options.transport.load(this.controller.signal));
      this.controller.signal.throwIfAborted();
      this.ready = true;

      if (!remote) {
        this.remoteVersion = 0;
        if (this.options.codec.isEmpty(local)) {
          this.acceptConfirmed(local, 0);
          this.emit("synced");
          return;
        }
        this.confirmed = null;
        await this.commit(local, true);
        return;
      }

      const remoteValue = this.capture(remote.value);
      const localEmpty = this.options.codec.isEmpty(local);
      const remoteEmpty = this.options.codec.isEmpty(remoteValue);

      if (this.isEqual(local, remoteValue)) {
        this.acceptConfirmed(remoteValue, remote.version);
        this.emit("synced");
        return;
      }

      if (this.options.allowEmptyOverwrite?.() && localEmpty) {
        this.acceptConfirmed(remoteValue, remote.version);
        await this.commit(local, true);
        return;
      }

      if (localEmpty && !remoteEmpty) {
        this.options.onBackupLocal?.(local);
        this.applyRemote(remoteValue, local, remote.version);
        return;
      }

      if (remoteEmpty && !localEmpty) {
        this.acceptConfirmed(remoteValue, remote.version);
        await this.commit(local, true);
        return;
      }

      const baseline = this.options.baselineStore.read();
      const localFingerprint = this.options.codec.fingerprint(local);
      const remoteFingerprint = this.options.codec.fingerprint(remoteValue);
      const localChanged = baseline ? localFingerprint !== baseline.fingerprint : true;
      const remoteChanged = baseline
        ? remote.version !== baseline.version || remoteFingerprint !== baseline.fingerprint
        : true;

      if (baseline && localChanged && !remoteChanged) {
        this.options.onBackupRemote?.(remoteValue);
        this.acceptConfirmed(remoteValue, remote.version);
        await this.commit(local, false);
        return;
      }
      if (baseline && !localChanged && remoteChanged) {
        this.options.onBackupLocal?.(local);
        this.applyRemote(remoteValue, local, remote.version);
        return;
      }

      this.emit("conflict");
      const choice = await this.resolveConflict({ local, remote: remoteValue, reason: "bootstrap" });
      this.controller.signal.throwIfAborted();
      if (choice === "remote") {
        this.options.onBackupLocal?.(local);
        this.applyRemote(remoteValue, local, remote.version);
        return;
      }
      this.options.onBackupRemote?.(remoteValue);
      this.acceptConfirmed(remoteValue, remote.version);
      await this.commit(local, true);
    } catch (error) {
      if (this.controller.signal.aborted) throw error;
      this.lastError = toErrorMessage(error);
      this.emit("error", this.lastError);
      throw error;
    }
  }

  private async commit(value: T, forceFull: boolean, expectedRevision?: number) {
    if (!this.ready) {
      throw new SyncProtocolError(this.lastError || "项目云同步尚未完成首次握手。");
    }
    if (
      this.confirmed &&
      !this.options.codec.isEmpty(this.confirmed) &&
      this.options.codec.isEmpty(value) &&
      !this.options.allowEmptyOverwrite?.()
    ) {
      throw new SyncProtocolError("拒绝用空的本地状态覆盖非空云端项目。请使用明确的项目重置操作。");
    }
    if (this.confirmed && this.isEqual(value, this.confirmed)) {
      const confirmedRevision = this.options.codec.revision?.(this.confirmed) ?? null;
      if (expectedRevision !== undefined && confirmedRevision !== expectedRevision) {
        throw new SyncProtocolError(
          `云端已确认修订 ${confirmedRevision ?? "missing"}，并非 Agent 请求的 ${expectedRevision}。`
        );
      }
      this.emit("synced");
      return { version: this.remoteVersion ?? 0, revision: confirmedRevision };
    }

    this.activeWrites += 1;
    try {
      for (let conflictAttempt = 0; conflictAttempt < 3; conflictAttempt += 1) {
        const baseVersion = this.remoteVersion ?? 0;
        const operationId = this.createOperationId();
        this.lastAttemptAt = Date.now();
        this.emit("syncing");
        const result = await this.retry("syncing", () => this.options.transport.save({
          value,
          baseValue: this.confirmed,
          baseVersion,
          operationId,
          forceFull,
          expectedRevision,
        }, this.controller.signal));
        this.controller.signal.throwIfAborted();

        if (result.kind === "saved") {
          if (expectedRevision !== undefined && result.revision !== expectedRevision) {
            throw new SyncProtocolError(
              `服务端未确认画布修订 ${expectedRevision}（回执 ${result.revision ?? "missing"}）。`
            );
          }
          this.acceptConfirmed(value, result.version);
          this.options.onEmptyOverwriteCommitted?.();
          this.emit("synced");
          return { version: result.version, revision: result.revision ?? this.options.codec.revision?.(value) ?? null };
        }

        const remoteValue = this.capture(result.remote.value);
        this.emit("conflict");
        const choice = await this.resolveConflict({ local: value, remote: remoteValue, reason: "push" });
        this.controller.signal.throwIfAborted();
        if (choice === "remote") {
          this.options.onBackupLocal?.(value);
          this.applyRemote(remoteValue, value, result.remote.version);
          throw new RemoteConflictAcceptedError();
        }
        this.options.onBackupRemote?.(remoteValue);
        this.acceptConfirmed(remoteValue, result.remote.version);
        forceFull = true;
      }
      throw new SyncProtocolError("云端项目连续发生版本冲突，请检查是否有其它设备持续写入。");
    } catch (error) {
      if (!this.controller.signal.aborted && !(error instanceof RemoteConflictAcceptedError)) {
        this.lastError = toErrorMessage(error);
        this.emit("error", this.lastError);
      }
      throw error;
    } finally {
      this.activeWrites = Math.max(0, this.activeWrites - 1);
    }
  }

  private acceptConfirmed(value: T, version: number) {
    this.confirmed = this.options.codec.snapshot(value);
    this.remoteVersion = version;
    this.lastError = undefined;
    this.retryCount = 0;
    this.options.baselineStore.write({
      fingerprint: this.options.codec.fingerprint(this.confirmed),
      version,
    });
  }

  private applyRemote(remote: T, local: T, version: number) {
    this.acceptConfirmed(remote, version);
    const restored = this.options.restoreRemote?.(remote, local) ?? remote;
    this.options.onApplyRemote(restored, local);
    this.emit("synced");
  }

  private async retry<R>(status: "loading" | "syncing", operation: () => Promise<R>) {
    let attempt = 0;
    while (true) {
      await this.waitUntilOnline();
      this.controller.signal.throwIfAborted();
      try {
        const result = await operation();
        this.retryCount = 0;
        return result;
      } catch (error) {
        if (this.controller.signal.aborted) throw error;
        if (!isRetryableError(error) || attempt >= this.maxRetries) throw error;
        attempt += 1;
        this.retryCount = attempt;
        this.lastAttemptAt = Date.now();
        this.emit(status);
        const exponential = Math.min(this.retryBaseMs * (2 ** (attempt - 1)), 15_000);
        const jitter = 0.75 + this.random() * 0.5;
        await this.sleep(Math.round(exponential * jitter), this.controller.signal);
      }
    }
  }

  private resolveConflict(conflict: SyncConflict<T>) {
    const decision = this.options.onConflict(conflict);
    if (this.controller.signal.aborted) {
      return Promise.reject(new DOMException("Sync engine disposed", "AbortError"));
    }
    return new Promise<"remote" | "local">((resolve, reject) => {
      const abort = () => reject(new DOMException("Sync engine disposed", "AbortError"));
      this.controller.signal.addEventListener("abort", abort, { once: true });
      decision.then(
        (choice) => {
          this.controller.signal.removeEventListener("abort", abort);
          resolve(choice);
        },
        (error) => {
          this.controller.signal.removeEventListener("abort", abort);
          reject(error);
        }
      );
    });
  }

  private waitUntilOnline() {
    if (this.online) return Promise.resolve();
    return new Promise<void>((resolve) => this.onlineWaiters.add(resolve));
  }

  private armStageTimer(delay = this.debounceMs) {
    if (this.disposed || !this.staged || this.holdCount > 0 || !this.online) return;
    this.clearStageTimer();
    this.stageTimer = setTimeout(() => {
      this.stageTimer = null;
      if (!this.staged || this.holdCount > 0 || this.disposed) return;
      const candidate = this.staged;
      const candidateGeneration = this.stageGeneration;
      this.staged = null;
      void this.enqueue(async () => {
        if (candidateGeneration !== this.stageGeneration) return;
        await this.commit(candidate, false);
      }).catch((error) => {
        if (this.disposed || error instanceof RemoteConflictAcceptedError) return;
        if (candidateGeneration === this.stageGeneration && !this.staged) this.staged = candidate;
        this.lastError = toErrorMessage(error);
        this.emit("error", this.lastError);
      });
    }, delay);
  }

  private clearStageTimer() {
    if (!this.stageTimer) return;
    clearTimeout(this.stageTimer);
    this.stageTimer = null;
  }

  private emit(status: SyncStatus, error?: string) {
    if (this.disposed) return;
    this.status = status;
    if (error) this.lastError = error;
    this.options.onStatusChange?.(status, {
      ...(this.remoteVersion !== null ? { lastSyncAt: this.remoteVersion } : {}),
      ...(this.lastError ? { error: this.lastError } : {}),
      pendingOps: (this.staged ? 1 : 0) + this.activeWrites,
      retryCount: this.retryCount,
      ...(this.lastAttemptAt ? { lastAttemptAt: this.lastAttemptAt } : {}),
    });
  }
}
