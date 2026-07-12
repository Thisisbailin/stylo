import { useCallback, useEffect, useRef } from "react";
import { ProjectData, SyncStatus } from "../types";
import { dropFileReplacer, backupData, isProjectEmpty } from "../utils/persistence";
import { validateProjectData } from "../utils/validation";
import { computeProjectDelta, isDeltaEmpty, ProjectDelta } from "../utils/delta";
import { normalizeProjectData } from "../utils/projectData";
import { getDeviceId } from "../utils/device";
import { buildApiUrl } from "../utils/api";

type UseCloudSyncOptions = {
  accountScope: string;
  isSignedIn: boolean;
  isLoaded: boolean;
  getToken: (options?: { skipCache?: boolean }) => Promise<string | null>;
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  setHasLoadedRemote: (val: boolean) => void;
  hasLoadedRemote: boolean;
  refreshKey?: number;
  localBackupKey: string;
  remoteBackupKey: string;
  forceClearKey: string;
  onError?: (err: unknown) => void;
  onConflictConfirm?: (opts: { remote: ProjectData; local: ProjectData }) => Promise<boolean> | boolean;
  onConflictNotice?: (opts: { remote: ProjectData; local: ProjectData; merged: ProjectData; conflicts: string[] }) => void;
  saveDebounceMs?: number;
  onStatusChange?: (status: SyncStatus, detail?: { lastSyncAt?: number; error?: string; pendingOps?: number; retryCount?: number; lastAttemptAt?: number }) => void;
};

const defaultConflictConfirm = async () => true;

type ProjectFingerprint = {
  hash: string;
  length: number;
};

type SyncBaseline = ProjectFingerprint & {
  updatedAt?: number;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
};

const fingerprintProjectData = (data: ProjectData): ProjectFingerprint => {
  try {
    const serialized = JSON.stringify(data, dropFileReplacer) || "";
    return { hash: hashString(serialized), length: serialized.length };
  } catch {
    return { hash: "0", length: 0 };
  }
};

const isFingerprintEqual = (left: ProjectFingerprint, right: ProjectFingerprint) =>
  left.hash === right.hash && left.length === right.length;

const parseBaseline = (raw: string): SyncBaseline | null => {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const hash = typeof parsed.hash === "string" ? parsed.hash : "";
    const length = typeof parsed.length === "number" ? parsed.length : NaN;
    if (!hash || !Number.isFinite(length)) return null;
    const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : undefined;
    return { hash, length, updatedAt };
  } catch {
    return null;
  }
};

export const useCloudSync = ({
  accountScope,
  isSignedIn,
  isLoaded,
  getToken,
  projectData,
  setProjectData,
  setHasLoadedRemote,
  hasLoadedRemote,
  refreshKey,
  localBackupKey,
  remoteBackupKey,
  forceClearKey,
  onError,
  onConflictConfirm = defaultConflictConfirm,
  onConflictNotice,
  saveDebounceMs = 1200,
  onStatusChange
}: UseCloudSyncOptions) => {
  const MAX_RETRIES = 10;
  const syncSaveTimeout = useRef<number | null>(null);
  const retryTimeout = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const projectDataRef = useRef(projectData);
  const remoteUpdatedAtRef = useRef<number | null>(null);
  const remoteHasDataRef = useRef<boolean | null>(null);
  const pendingOpRef = useRef<{ id: string; data: ProjectData; baseVersion: number; delta?: ProjectDelta } | null>(null);
  const isSavingRef = useRef(false);
  const saveRetryTimeout = useRef<number | null>(null);
  const saveRetryCountRef = useRef(0);
  const lastRefreshKeyRef = useRef<number | null>(null);
  const syncBlockedRef = useRef<string | null>(null);
  const lastSyncedRef = useRef<ProjectData | null>(null);
  const baselineRef = useRef<SyncBaseline | null>(null);
  const statusRef = useRef<SyncStatus>('idle');
  const deviceIdRef = useRef<string>(getDeviceId());
  const isLoadingRef = useRef(false);
  const onErrorRef = useRef(onError);
  const onStatusChangeRef = useRef(onStatusChange);
  const onConflictConfirmRef = useRef(onConflictConfirm);
  const getTokenRef = useRef(getToken);
  const activeScopeRef = useRef(accountScope);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onConflictConfirmRef.current = onConflictConfirm;
  }, [onConflictConfirm]);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const baselineKey = `${localBackupKey}_last_synced`;

  const isOperationCurrent = (generation: number) =>
    mountedRef.current &&
    generationRef.current === generation &&
    activeScopeRef.current === accountScope;

  useEffect(() => {
    mountedRef.current = true;
    activeScopeRef.current = accountScope;
    generationRef.current += 1;
    projectDataRef.current = projectData;
    remoteUpdatedAtRef.current = null;
    remoteHasDataRef.current = null;
    pendingOpRef.current = null;
    isSavingRef.current = false;
    retryCountRef.current = 0;
    saveRetryCountRef.current = 0;
    lastRefreshKeyRef.current = null;
    syncBlockedRef.current = null;
    lastSyncedRef.current = null;
    baselineRef.current = null;
    statusRef.current = "idle";
    isLoadingRef.current = false;
    if (syncSaveTimeout.current) window.clearTimeout(syncSaveTimeout.current);
    if (retryTimeout.current) window.clearTimeout(retryTimeout.current);
    if (saveRetryTimeout.current) window.clearTimeout(saveRetryTimeout.current);
    syncSaveTimeout.current = null;
    retryTimeout.current = null;
    saveRetryTimeout.current = null;
    setHasLoadedRemote(false);

    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      if (syncSaveTimeout.current) window.clearTimeout(syncSaveTimeout.current);
      if (retryTimeout.current) window.clearTimeout(retryTimeout.current);
      if (saveRetryTimeout.current) window.clearTimeout(saveRetryTimeout.current);
      syncSaveTimeout.current = null;
      retryTimeout.current = null;
      saveRetryTimeout.current = null;
      pendingOpRef.current = null;
      isSavingRef.current = false;
      isLoadingRef.current = false;
    };
  }, [accountScope, setHasLoadedRemote]);

  const shouldForceCloudClear = () => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(forceClearKey) === "1";
    } catch {
      return false;
    }
  };

  const clearForceCloudClear = () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(forceClearKey);
    } catch {
      // Ignore storage failures.
    }
  };

  const readBaseline = () => {
    if (baselineRef.current) return baselineRef.current;
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(baselineKey);
      if (!raw) return null;
      const parsed = parseBaseline(raw);
      if (parsed) baselineRef.current = parsed;
      return parsed;
    } catch {
      return null;
    }
  };

  const storeBaseline = (data: ProjectData, updatedAt?: number) => {
    const baseline: SyncBaseline = {
      ...fingerprintProjectData(data),
      ...(typeof updatedAt === "number" ? { updatedAt } : {})
    };
    baselineRef.current = baseline;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(baselineKey, JSON.stringify(baseline));
    } catch {
      // Ignore storage failures.
    }
  };

  const getBaseline = () => {
    const stored = readBaseline();
    if (stored) return stored;
    if (!lastSyncedRef.current) return null;
    const fallback: SyncBaseline = {
      ...fingerprintProjectData(lastSyncedRef.current),
      ...(typeof remoteUpdatedAtRef.current === "number" ? { updatedAt: remoteUpdatedAtRef.current } : {})
    };
    baselineRef.current = fallback;
    return fallback;
  };

  const isChangedFromBaseline = (fingerprint: ProjectFingerprint, baseline: SyncBaseline) =>
    !isFingerprintEqual(fingerprint, baseline);

  const isRemoteChangedFromBaseline = (
    remoteFingerprint: ProjectFingerprint,
    updatedAt: number | null | undefined,
    baseline: SyncBaseline
  ) => {
    if (typeof updatedAt === "number" && typeof baseline.updatedAt === "number") {
      return updatedAt !== baseline.updatedAt;
    }
    return isChangedFromBaseline(remoteFingerprint, baseline);
  };

  const emitStatus = useCallback((status: SyncStatus, detail?: { lastSyncAt?: number; error?: string; pendingOps?: number; retryCount?: number; lastAttemptAt?: number }) => {
    statusRef.current = status;
    onStatusChangeRef.current?.(status, detail);
  }, []);

  useEffect(() => {
    projectDataRef.current = projectData;
  }, [projectData]);

  const createOpId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const flushSaveQueue = async () => {
    const generation = generationRef.current;
    if (!isOperationCurrent(generation)) return;
    if (!isSignedIn || !isLoaded || !hasLoadedRemote) return;
    if (isSavingRef.current) return;
    const op = pendingOpRef.current;
    if (!op) return;
    if (saveRetryTimeout.current) {
      window.clearTimeout(saveRetryTimeout.current);
      saveRetryTimeout.current = null;
    }
    isSavingRef.current = true;
    const attemptAt = Date.now();
    emitStatus('syncing', { pendingOps: 1, retryCount: saveRetryCountRef.current, lastAttemptAt: attemptAt });

    try {
      let token = await getTokenRef.current();
      if (!isOperationCurrent(generation)) return;
      if (!token) {
        token = await getTokenRef.current({ skipCache: true });
        if (!isOperationCurrent(generation)) return;
      }
      if (!token) {
        throw new Error("Unable to obtain an authentication token for project sync.");
      }
      const executeSave = (authToken: string) =>
        fetch(buildApiUrl("/api/project"), {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${authToken}`,
            "x-device-id": deviceIdRef.current
          },
          body: JSON.stringify(
            op.delta
              ? { delta: op.delta, updatedAt: op.baseVersion, opId: op.id }
              : { projectData: op.data, updatedAt: op.baseVersion, opId: op.id },
            dropFileReplacer
          )
        });

      let res = await executeSave(token);
      if (!isOperationCurrent(generation)) return;
      if ((res.status === 401 || res.status === 403)) {
        const refreshedToken = await getTokenRef.current({ skipCache: true });
        if (!isOperationCurrent(generation)) return;
        if (refreshedToken) {
          res = await executeSave(refreshedToken);
          if (!isOperationCurrent(generation)) return;
        }
      }

      if (res.status === 409) {
        emitStatus('conflict', { pendingOps: 1, retryCount: saveRetryCountRef.current, lastAttemptAt: attemptAt });
        const data = await res.json().catch(() => null);
        if (!isOperationCurrent(generation)) return;
        const remotePayload = data?.projectData?.projectData ? data.projectData.projectData : data?.projectData;
        if (remotePayload) {
          const normalized = normalizeProjectData(remotePayload);
          const local = projectDataRef.current;
          if (shouldForceCloudClear() && isProjectEmpty(local)) {
            if (typeof data?.updatedAt === "number") {
              remoteUpdatedAtRef.current = data.updatedAt;
            }
            pendingOpRef.current = {
              id: createOpId(),
              data: local,
              baseVersion: remoteUpdatedAtRef.current ?? 0
            };
            isSavingRef.current = false;
            void flushSaveQueue();
            return;
          }
          const useRemote = await Promise.resolve(onConflictConfirmRef.current({ remote: normalized, local }));
          if (!isOperationCurrent(generation)) return;
          if (useRemote) {
            backupData(localBackupKey, local);
            projectDataRef.current = normalized;
            setProjectData(normalized);
            if (pendingOpRef.current?.id === op.id) pendingOpRef.current = null;
            remoteHasDataRef.current = !isProjectEmpty(normalized);
            if (typeof data?.updatedAt === "number") {
              remoteUpdatedAtRef.current = data.updatedAt;
            }
            lastSyncedRef.current = normalized;
            storeBaseline(normalized, remoteUpdatedAtRef.current ?? undefined);
            emitStatus('synced', { lastSyncAt: remoteUpdatedAtRef.current ?? undefined, pendingOps: pendingOpRef.current ? 1 : 0, retryCount: saveRetryCountRef.current });
          } else {
            backupData(remoteBackupKey, normalized);
            if (typeof data?.updatedAt === "number") {
              remoteUpdatedAtRef.current = data.updatedAt;
            }
            lastSyncedRef.current = normalized;
            storeBaseline(normalized, remoteUpdatedAtRef.current ?? undefined);
            pendingOpRef.current = {
              id: createOpId(),
              data: local,
              baseVersion: remoteUpdatedAtRef.current ?? 0
            };
            emitStatus(statusRef.current, { pendingOps: 1, retryCount: saveRetryCountRef.current });
          }
        }
        isSavingRef.current = false;
        if (pendingOpRef.current) void flushSaveQueue();
        return;
      }

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => null);
        const detail = errorPayload?.detail || errorPayload?.error;
        if (detail) {
          throw new Error(`Save failed: ${detail}`);
        }
        throw new Error(`Save failed: ${res.status}`);
      }

      const data = await res.json().catch(() => null);
      if (!isOperationCurrent(generation)) return;
      if (typeof data?.updatedAt === "number") {
        remoteUpdatedAtRef.current = data.updatedAt;
      }
      remoteHasDataRef.current = !isProjectEmpty(op.data);
      lastSyncedRef.current = op.data;
      storeBaseline(op.data, remoteUpdatedAtRef.current ?? undefined);
      if (isProjectEmpty(op.data) && shouldForceCloudClear()) {
        clearForceCloudClear();
      }
      if (pendingOpRef.current?.id === op.id) pendingOpRef.current = null;
      saveRetryCountRef.current = 0;
      emitStatus('synced', { lastSyncAt: remoteUpdatedAtRef.current ?? undefined, pendingOps: pendingOpRef.current ? 1 : 0, retryCount: saveRetryCountRef.current });
      isSavingRef.current = false;
      if (pendingOpRef.current) void flushSaveQueue();
    } catch (e) {
      if (!isOperationCurrent(generation)) return;
      onErrorRef.current?.(e);
      const message = e instanceof Error ? e.message : "Failed to save project";
      emitStatus('error', { error: message, pendingOps: pendingOpRef.current ? 1 : 0, retryCount: saveRetryCountRef.current, lastAttemptAt: Date.now() });
      isSavingRef.current = false;
      if (saveRetryCountRef.current >= MAX_RETRIES) {
        const error = "Sync failed after 10 retries. Please sign in again or check your Clerk JWT template.";
        syncBlockedRef.current = error;
        emitStatus('error', { error, pendingOps: pendingOpRef.current ? 1 : 0, retryCount: saveRetryCountRef.current, lastAttemptAt: Date.now() });
        return;
      }
      const delay = Math.min(1000 * Math.pow(2, saveRetryCountRef.current), 15000);
      saveRetryCountRef.current += 1;
      if (saveRetryTimeout.current) window.clearTimeout(saveRetryTimeout.current);
      saveRetryTimeout.current = window.setTimeout(() => {
        if (isOperationCurrent(generation)) void flushSaveQueue();
      }, delay);
    }
  };

  const enqueueSave = (data: ProjectData, baseVersion?: number | null) => {
    if (!mountedRef.current || activeScopeRef.current !== accountScope) return;
    if (syncBlockedRef.current) {
      emitStatus('error', { error: syncBlockedRef.current, pendingOps: pendingOpRef.current ? 1 : 0, retryCount: saveRetryCountRef.current });
      return;
    }
    const validation = validateProjectData(data);
    if (!validation.ok) {
      emitStatus('error', { error: validation.error, pendingOps: pendingOpRef.current ? 1 : 0, retryCount: saveRetryCountRef.current });
      return;
    }
    const delta = computeProjectDelta(data, lastSyncedRef.current);
    if (isDeltaEmpty(delta)) {
      pendingOpRef.current = null;
      emitStatus('synced', { lastSyncAt: remoteUpdatedAtRef.current ?? undefined, pendingOps: 0, retryCount: saveRetryCountRef.current });
      return;
    }
    pendingOpRef.current = {
      id: createOpId(),
      data,
      baseVersion: typeof baseVersion === "number" ? baseVersion : (remoteUpdatedAtRef.current ?? 0),
      delta
    };
    if (saveRetryTimeout.current) {
      window.clearTimeout(saveRetryTimeout.current);
      saveRetryTimeout.current = null;
      saveRetryCountRef.current = 0;
    }
    emitStatus(statusRef.current, { pendingOps: 1, retryCount: saveRetryCountRef.current });
    void flushSaveQueue();
  };

  // Reset loaded flag when sign-out
  useEffect(() => {
    if (!isSignedIn) {
      generationRef.current += 1;
      setHasLoadedRemote(false);
      pendingOpRef.current = null;
      isSavingRef.current = false;
      isLoadingRef.current = false;
      syncBlockedRef.current = null;
      remoteUpdatedAtRef.current = null;
      remoteHasDataRef.current = null;
      lastSyncedRef.current = null;
      baselineRef.current = null;
      retryCountRef.current = 0;
      lastRefreshKeyRef.current = null;
      if (syncSaveTimeout.current) {
        window.clearTimeout(syncSaveTimeout.current);
        syncSaveTimeout.current = null;
      }
      if (retryTimeout.current) {
        window.clearTimeout(retryTimeout.current);
        retryTimeout.current = null;
      }
      if (saveRetryTimeout.current) {
        window.clearTimeout(saveRetryTimeout.current);
        saveRetryTimeout.current = null;
      }
      saveRetryCountRef.current = 0;
    }
  }, [isSignedIn, setHasLoadedRemote]);

  useEffect(() => {
    if (hasLoadedRemote && pendingOpRef.current) {
      void flushSaveQueue();
    }
  }, [hasLoadedRemote]);

  useEffect(() => {
    return () => {
      if (saveRetryTimeout.current) {
        window.clearTimeout(saveRetryTimeout.current);
      }
    };
  }, []);

  // Initial load
  useEffect(() => {
    if (!isSignedIn || !isLoaded) return;
    const generation = generationRef.current;
    if (!isOperationCurrent(generation)) return;
    const refreshChanged = typeof refreshKey === "number" && refreshKey !== lastRefreshKeyRef.current;
    if (hasLoadedRemote && !refreshChanged) return;
    if (refreshChanged) lastRefreshKeyRef.current = refreshKey ?? null;
    let cancelled = false;
    emitStatus('loading', { retryCount: retryCountRef.current, pendingOps: pendingOpRef.current ? 1 : 0 });

    const scheduleRetry = (loadFn: () => void) => {
      if (cancelled || hasLoadedRemote || !isOperationCurrent(generation)) return;
      if (retryCountRef.current >= MAX_RETRIES) {
        const error = "Sync failed after 10 retries. Please sign in again or check your Clerk JWT template.";
        syncBlockedRef.current = error;
        emitStatus('error', { error, retryCount: retryCountRef.current, pendingOps: pendingOpRef.current ? 1 : 0 });
        if (!cancelled) setHasLoadedRemote(true);
        return;
      }
      if (retryTimeout.current) window.clearTimeout(retryTimeout.current);
      const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 15000);
      retryCountRef.current += 1;
      emitStatus('loading', { retryCount: retryCountRef.current, pendingOps: pendingOpRef.current ? 1 : 0 });
      retryTimeout.current = window.setTimeout(() => {
        if (isOperationCurrent(generation)) loadFn();
      }, delay);
    };

    const saveNow = async (data: ProjectData, updatedAt?: number | null) => {
      if (!isOperationCurrent(generation)) return;
      enqueueSave(data, updatedAt ?? remoteUpdatedAtRef.current);
    };

    const loadRemote = async () => {
      if (!isOperationCurrent(generation)) return;
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;
      try {
        let token = await getTokenRef.current();
        if (!isOperationCurrent(generation)) return;
        if (!token) {
          token = await getTokenRef.current({ skipCache: true });
          if (!isOperationCurrent(generation)) return;
        }
        if (!token) {
          scheduleRetry(loadRemote);
          return;
        }
        const executeLoad = (authToken: string) =>
          fetch(buildApiUrl("/api/project"), {
            headers: {
              authorization: `Bearer ${authToken}`,
              "x-device-id": deviceIdRef.current
            }
          });

        let res = await executeLoad(token);
        if (!isOperationCurrent(generation)) return;
        if (res.status === 401 || res.status === 403) {
          const refreshedToken = await getTokenRef.current({ skipCache: true });
          if (!isOperationCurrent(generation)) return;
          if (refreshedToken) {
            res = await executeLoad(refreshedToken);
            if (!isOperationCurrent(generation)) return;
          }
        }

        if (res.status === 404) {
          remoteHasDataRef.current = false;
          remoteUpdatedAtRef.current = 0;
          retryCountRef.current = 0;
          emitStatus('synced', { lastSyncAt: 0, pendingOps: pendingOpRef.current ? 1 : 0, retryCount: retryCountRef.current });
          if (!cancelled) setHasLoadedRemote(true);
          return;
        }

        if (res.status === 401 || res.status === 403) {
          throw new Error("Unauthorized");
        }

        if (!res.ok) {
          const errorPayload = await res.json().catch(() => null);
          const detail = errorPayload?.detail || errorPayload?.error;
          if (detail) {
            throw new Error(`Load failed: ${detail}`);
          }
          throw new Error(`Load failed: ${res.status}`);
        }

        const data = await res.json();
        if (!isOperationCurrent(generation)) return;
        if (!cancelled && data.projectData) {
          const remotePayload = data.projectData.projectData ? data.projectData.projectData : data.projectData;
          const remote = normalizeProjectData(remotePayload);
          const validation = validateProjectData(remote);
          if (!validation.ok) {
            syncBlockedRef.current = `Remote data invalid: ${validation.error}`;
            emitStatus('error', { error: syncBlockedRef.current, pendingOps: pendingOpRef.current ? 1 : 0, retryCount: retryCountRef.current });
            if (!cancelled) setHasLoadedRemote(true);
            return;
          }
          syncBlockedRef.current = null;
          if (typeof data.updatedAt === "number") {
            remoteUpdatedAtRef.current = data.updatedAt;
          }
          const local = projectDataRef.current;
          const remoteHas = !isProjectEmpty(remote);
          const localHas = !isProjectEmpty(local);
          remoteHasDataRef.current = remoteHas;
          const baseVersion = typeof data.updatedAt === "number" ? data.updatedAt : (remoteUpdatedAtRef.current ?? 0);
          const forceClear = shouldForceCloudClear();

          if (forceClear && !localHas) {
            if (remoteHas) {
              await saveNow(local, baseVersion);
            } else {
              clearForceCloudClear();
            }
            retryCountRef.current = 0;
            if (!cancelled) setHasLoadedRemote(true);
            return;
          }

          if (remoteHas && localHas) {
            const localFingerprint = fingerprintProjectData(local);
            const remoteFingerprint = fingerprintProjectData(remote);

            if (isFingerprintEqual(localFingerprint, remoteFingerprint)) {
              lastSyncedRef.current = remote;
              storeBaseline(remote, baseVersion);
              emitStatus('synced', { lastSyncAt: remoteUpdatedAtRef.current ?? undefined, pendingOps: pendingOpRef.current ? 1 : 0, retryCount: retryCountRef.current });
              if (!cancelled) setHasLoadedRemote(true);
              return;
            }

            const baseline = getBaseline();
            const localChanged = baseline ? isChangedFromBaseline(localFingerprint, baseline) : null;
            const remoteChanged = baseline ? isRemoteChangedFromBaseline(remoteFingerprint, baseVersion, baseline) : null;

            if (remoteChanged === false && localChanged === true) {
              backupData(remoteBackupKey, remote);
              lastSyncedRef.current = remote;
              storeBaseline(remote, baseVersion);
              await saveNow(local, baseVersion);
              retryCountRef.current = 0;
              if (!cancelled) setHasLoadedRemote(true);
              return;
            }

            emitStatus('conflict', { pendingOps: pendingOpRef.current ? 1 : 0, retryCount: retryCountRef.current });
            const useRemote = await Promise.resolve(onConflictConfirmRef.current({ remote, local }));
            if (!isOperationCurrent(generation)) return;
            if (useRemote) {
              backupData(localBackupKey, local);
              setProjectData(remote);
              lastSyncedRef.current = remote;
              storeBaseline(remote, baseVersion);
              emitStatus('synced', { lastSyncAt: remoteUpdatedAtRef.current ?? undefined, pendingOps: pendingOpRef.current ? 1 : 0, retryCount: retryCountRef.current });
            } else {
              backupData(remoteBackupKey, remote);
              lastSyncedRef.current = remote;
              remoteUpdatedAtRef.current = baseVersion;
              await saveNow(local, baseVersion);
            }
          } else if (remoteHas) {
            setProjectData(remote);
            lastSyncedRef.current = remote;
            storeBaseline(remote, remoteUpdatedAtRef.current ?? undefined);
            emitStatus('synced', { lastSyncAt: remoteUpdatedAtRef.current ?? undefined, pendingOps: pendingOpRef.current ? 1 : 0, retryCount: retryCountRef.current });
          }
        }
        retryCountRef.current = 0;
        emitStatus('synced', { lastSyncAt: remoteUpdatedAtRef.current ?? undefined, pendingOps: pendingOpRef.current ? 1 : 0, retryCount: retryCountRef.current });
        if (!cancelled) setHasLoadedRemote(true);
      } catch (e) {
        if (!cancelled && isOperationCurrent(generation)) {
          onErrorRef.current?.(e);
          const message = e instanceof Error ? e.message : "Failed to load cloud project data";
          emitStatus('error', { error: message, retryCount: retryCountRef.current, pendingOps: pendingOpRef.current ? 1 : 0 });
          scheduleRetry(loadRemote);
        }
      } finally {
        if (isOperationCurrent(generation)) isLoadingRef.current = false;
      }
    };

    loadRemote();
    return () => {
      cancelled = true;
      generationRef.current += 1;
      if (retryTimeout.current) window.clearTimeout(retryTimeout.current);
    };
  }, [accountScope, isSignedIn, isLoaded, hasLoadedRemote, refreshKey, localBackupKey, remoteBackupKey, forceClearKey, setProjectData, setHasLoadedRemote]);

  // Save with debounce
  useEffect(() => {
    if (!isSignedIn || !isLoaded || !hasLoadedRemote) return;

    if (syncSaveTimeout.current) {
      clearTimeout(syncSaveTimeout.current);
    }

    syncSaveTimeout.current = window.setTimeout(() => {
      if (remoteHasDataRef.current && isProjectEmpty(projectDataRef.current) && !shouldForceCloudClear()) {
        onErrorRef.current?.(new Error("Refusing to overwrite non-empty remote with empty local state."));
        emitStatus('error', { error: "Local data empty; refusing to overwrite cloud.", pendingOps: pendingOpRef.current ? 1 : 0, retryCount: retryCountRef.current });
        return;
      }
      const baseVersion = typeof remoteUpdatedAtRef.current === "number" ? remoteUpdatedAtRef.current : 0;
      enqueueSave(projectDataRef.current, baseVersion);
    }, saveDebounceMs);

    return () => {
      if (syncSaveTimeout.current) {
        clearTimeout(syncSaveTimeout.current);
      }
    };
  }, [accountScope, projectData, isSignedIn, isLoaded, hasLoadedRemote, saveDebounceMs, forceClearKey]);
};
