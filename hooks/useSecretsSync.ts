import { useEffect, useRef } from "react";
import { AppConfig, SyncStatus } from "../types";
import { getDeviceId } from "../utils/device";
import { buildApiUrl } from "../utils/api";

type Options = {
  accountScope: string;
  isSignedIn: boolean;
  isLoaded: boolean;
  getToken: (options?: { skipCache?: boolean }) => Promise<string | null>;
  config: AppConfig;
  setConfig: (c: AppConfig | ((c: AppConfig) => AppConfig)) => void;
  debounceMs?: number;
  onStatusChange?: (status: SyncStatus, detail?: { lastSyncAt?: number; error?: string; pendingOps?: number; retryCount?: number; lastAttemptAt?: number }) => void;
};

type SecretsPayload = {
  textApiKey?: string;
  multiApiKey?: string;
  videoApiKey?: string;
};

const normalizeSecretsPayload = (value: SecretsPayload | null | undefined): Required<SecretsPayload> => ({
  textApiKey: typeof value?.textApiKey === "string" ? value.textApiKey : "",
  multiApiKey: typeof value?.multiApiKey === "string" ? value.multiApiKey : "",
  videoApiKey: typeof value?.videoApiKey === "string" ? value.videoApiKey : "",
});

export const useSecretsSync = ({
  accountScope,
  isSignedIn,
  isLoaded,
  getToken,
  config,
  setConfig,
  debounceMs = 1200,
  onStatusChange
}: Options) => {
  const MAX_RETRIES = 10;
  const saveTimeout = useRef<number | null>(null);
  const retryTimeout = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const lastSentRef = useRef<SecretsPayload | null>(null);
  const remoteUpdatedAtRef = useRef<number | null>(null);
  const pendingOpRef = useRef<{ id: string; payload: SecretsPayload; baseVersion: number } | null>(null);
  const isSavingRef = useRef(false);
  const saveRetryTimeout = useRef<number | null>(null);
  const saveRetryCountRef = useRef(0);
  const statusRef = useRef<SyncStatus>('idle');
  const deviceIdRef = useRef<string>(getDeviceId());
  const isLoadingRef = useRef(false);
  const onStatusChangeRef = useRef(onStatusChange);
  const getTokenRef = useRef(getToken);
  const activeScopeRef = useRef(accountScope);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const emitStatus = (status: SyncStatus, detail?: { lastSyncAt?: number; error?: string; pendingOps?: number; retryCount?: number; lastAttemptAt?: number }) => {
    statusRef.current = status;
    onStatusChangeRef.current?.(status, detail);
  };

  const createOpId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const isOperationCurrent = (generation: number) =>
    mountedRef.current &&
    generationRef.current === generation &&
    activeScopeRef.current === accountScope;

  const invalidateOperations = () => {
    generationRef.current += 1;
    if (saveTimeout.current) window.clearTimeout(saveTimeout.current);
    if (retryTimeout.current) window.clearTimeout(retryTimeout.current);
    if (saveRetryTimeout.current) window.clearTimeout(saveRetryTimeout.current);
    saveTimeout.current = null;
    retryTimeout.current = null;
    saveRetryTimeout.current = null;
    retryCountRef.current = 0;
    hasLoadedRef.current = false;
    lastSentRef.current = null;
    remoteUpdatedAtRef.current = null;
    pendingOpRef.current = null;
    isSavingRef.current = false;
    saveRetryCountRef.current = 0;
    statusRef.current = "idle";
    isLoadingRef.current = false;
  };

  useEffect(() => {
    mountedRef.current = true;
    activeScopeRef.current = accountScope;
    invalidateOperations();

    return () => {
      mountedRef.current = false;
      invalidateOperations();
    };
  }, [accountScope]);

  const flushSaveQueue = async () => {
    const generation = generationRef.current;
    if (!isOperationCurrent(generation)) return;
    if (!isSignedIn || !isLoaded || !config.syncApiKeys) return;
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
        throw new Error("Unable to obtain an authentication token for secrets sync.");
      }
      const executeSave = (authToken: string) => fetch(buildApiUrl("/api/secrets"), {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${authToken}`,
          "x-device-id": deviceIdRef.current
        },
        body: JSON.stringify({ secrets: op.payload, updatedAt: op.baseVersion, opId: op.id })
      });

      let res = await executeSave(token);
      if (!isOperationCurrent(generation)) return;
      if (res.status === 401 || res.status === 403) {
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
        const remote = normalizeSecretsPayload(data?.secrets);
        lastSentRef.current = remote;
        if (typeof data?.updatedAt === "number") {
          remoteUpdatedAtRef.current = data.updatedAt;
        }
        setConfig(prev => ({
          ...prev,
          textConfig: { ...prev.textConfig, apiKey: remote.textApiKey || '' },
          multimodalConfig: { ...prev.multimodalConfig, apiKey: remote.multiApiKey || '' },
          videoConfig: { ...prev.videoConfig, apiKey: remote.videoApiKey || '' }
        }));
        if (pendingOpRef.current?.id === op.id) pendingOpRef.current = null;
        emitStatus('synced', { lastSyncAt: remoteUpdatedAtRef.current ?? undefined, pendingOps: pendingOpRef.current ? 1 : 0, retryCount: saveRetryCountRef.current });
        isSavingRef.current = false;
        if (pendingOpRef.current) void flushSaveQueue();
        return;
      }

      if (!res.ok) {
        throw new Error(`Save failed: ${res.status}`);
      }

      const data = await res.json().catch(() => null);
      if (!isOperationCurrent(generation)) return;
      if (typeof data?.updatedAt === "number") {
        remoteUpdatedAtRef.current = data.updatedAt;
      }
      lastSentRef.current = op.payload;
      if (pendingOpRef.current?.id === op.id) pendingOpRef.current = null;
      saveRetryCountRef.current = 0;
      emitStatus('synced', { lastSyncAt: remoteUpdatedAtRef.current ?? undefined, pendingOps: pendingOpRef.current ? 1 : 0, retryCount: saveRetryCountRef.current });
      isSavingRef.current = false;
      if (pendingOpRef.current) void flushSaveQueue();
    } catch (e) {
      if (!isOperationCurrent(generation)) return;
      emitStatus('error', { error: "Failed to save secrets", pendingOps: pendingOpRef.current ? 1 : 0, retryCount: saveRetryCountRef.current, lastAttemptAt: Date.now() });
      isSavingRef.current = false;
      if (saveRetryCountRef.current >= MAX_RETRIES) {
        const error = "Secrets sync failed after 10 retries. Please sign in again or check your Clerk JWT template.";
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

  const enqueueSave = (payload: SecretsPayload, baseVersion?: number | null) => {
    if (!mountedRef.current || activeScopeRef.current !== accountScope) return;
    pendingOpRef.current = {
      id: createOpId(),
      payload,
      baseVersion: typeof baseVersion === "number" ? baseVersion : (remoteUpdatedAtRef.current ?? 0)
    };
    if (saveRetryTimeout.current) {
      window.clearTimeout(saveRetryTimeout.current);
      saveRetryTimeout.current = null;
      saveRetryCountRef.current = 0;
    }
    emitStatus(statusRef.current, { pendingOps: 1, retryCount: saveRetryCountRef.current });
    void flushSaveQueue();
  };

  useEffect(() => {
    if (!isSignedIn || !config.syncApiKeys) {
      invalidateOperations();
    }
  }, [isSignedIn, config.syncApiKeys]);

  // 拉取云端密钥
  useEffect(() => {
    if (!isSignedIn || !isLoaded || !config.syncApiKeys || hasLoadedRef.current) return;
    const generation = generationRef.current;
    if (!isOperationCurrent(generation)) return;
    let cancelled = false;
    emitStatus('loading', { retryCount: retryCountRef.current, pendingOps: pendingOpRef.current ? 1 : 0 });

    const scheduleRetry = (loadFn: () => void) => {
      if (cancelled || hasLoadedRef.current || !isOperationCurrent(generation)) return;
      if (retryCountRef.current >= MAX_RETRIES) {
        const error = "Secrets sync failed after 10 retries. Please sign in again or check your Clerk JWT template.";
        emitStatus('error', { error, retryCount: retryCountRef.current, pendingOps: pendingOpRef.current ? 1 : 0 });
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

    const load = async () => {
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
          scheduleRetry(load);
          return;
        }
        const executeLoad = (authToken: string) => fetch(buildApiUrl("/api/secrets"), {
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
          lastSentRef.current = { textApiKey: '', multiApiKey: '', videoApiKey: '' };
          hasLoadedRef.current = true;
          remoteUpdatedAtRef.current = 0;
          retryCountRef.current = 0;
          emitStatus('synced', { lastSyncAt: 0, pendingOps: pendingOpRef.current ? 1 : 0, retryCount: retryCountRef.current });
          return;
        }
        if (!res.ok) {
          scheduleRetry(load);
          return;
        }
        const data = await res.json();
        if (cancelled || !isOperationCurrent(generation)) return;
        const secrets = normalizeSecretsPayload(data?.secrets);
        lastSentRef.current = secrets;
        hasLoadedRef.current = true;
        if (typeof data.updatedAt === "number") {
          remoteUpdatedAtRef.current = data.updatedAt;
        }
        retryCountRef.current = 0;
        emitStatus('synced', { lastSyncAt: remoteUpdatedAtRef.current ?? undefined, pendingOps: pendingOpRef.current ? 1 : 0, retryCount: retryCountRef.current });
        setConfig(prev => ({
          ...prev,
          textConfig: { ...prev.textConfig, apiKey: secrets.textApiKey ?? '' },
          multimodalConfig: { ...prev.multimodalConfig, apiKey: secrets.multiApiKey ?? '' },
          videoConfig: { ...prev.videoConfig, apiKey: secrets.videoApiKey ?? '' }
        }));
      } catch {
        if (isOperationCurrent(generation)) {
          scheduleRetry(load);
          emitStatus('error', { error: "Failed to load secrets", retryCount: retryCountRef.current, pendingOps: pendingOpRef.current ? 1 : 0 });
        }
      } finally {
        if (isOperationCurrent(generation)) isLoadingRef.current = false;
      }
    };
    load();
    return () => {
      cancelled = true;
      if (retryTimeout.current) window.clearTimeout(retryTimeout.current);
    };
  }, [accountScope, config.syncApiKeys, isLoaded, isSignedIn, setConfig]);

  // 保存云端密钥
  useEffect(() => {
    if (!isSignedIn || !isLoaded || !config.syncApiKeys || !hasLoadedRef.current) return;
    const generation = generationRef.current;
    if (!isOperationCurrent(generation)) return;
    if (saveTimeout.current) window.clearTimeout(saveTimeout.current);

    saveTimeout.current = window.setTimeout(() => {
      if (!isOperationCurrent(generation)) return;
      const payload: SecretsPayload = {
        textApiKey: config.textConfig.apiKey || '',
        multiApiKey: config.multimodalConfig.apiKey || '',
        videoApiKey: config.videoConfig.apiKey || '',
      };
      if (lastSentRef.current &&
        lastSentRef.current.textApiKey === payload.textApiKey &&
        lastSentRef.current.multiApiKey === payload.multiApiKey &&
        lastSentRef.current.videoApiKey === payload.videoApiKey) {
        return;
      }
      const baseVersion = typeof remoteUpdatedAtRef.current === "number" ? remoteUpdatedAtRef.current : 0;
      enqueueSave(payload, baseVersion);
    }, debounceMs);

    return () => {
      if (saveTimeout.current) window.clearTimeout(saveTimeout.current);
    };
  }, [accountScope, config.syncApiKeys, config.textConfig.apiKey, config.multimodalConfig.apiKey, config.videoConfig.apiKey, debounceMs, isLoaded, isSignedIn]);
};
