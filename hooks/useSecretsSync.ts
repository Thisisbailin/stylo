import { useEffect, useRef } from "react";
import type { AppConfig, SyncStatus } from "../types";
import type { AccountApiSession } from "../sync/authenticatedFetch";
import { createLocalStorageBaselineStore } from "../sync/localBaselineStore";
import {
  createSecretsSyncTransport,
  secretsSyncCodec,
  type SecretsPayload,
} from "../sync/secretsSyncAdapter";
import {
  VersionedSyncEngine,
  type SyncStatusDetail,
} from "../sync/versionedSyncEngine";

type Options = {
  accountScope: string;
  isSignedIn: boolean;
  isLoaded: boolean;
  accountSession: AccountApiSession;
  config: AppConfig;
  setConfig: (config: AppConfig | ((config: AppConfig) => AppConfig)) => void;
  debounceMs?: number;
  onStatusChange?: (status: SyncStatus, detail?: SyncStatusDetail) => void;
  onConflictConfirm: (options: { remote: SecretsPayload; local: SecretsPayload }) => Promise<boolean> | boolean;
};

const payloadFromConfig = (config: AppConfig): SecretsPayload => ({
  textApiKey: config.textConfig.apiKey || "",
  multiApiKey: config.multimodalConfig.apiKey || "",
  videoApiKey: config.videoConfig.apiKey || "",
});

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

export const useSecretsSync = ({
  accountScope,
  isSignedIn,
  isLoaded,
  accountSession,
  config,
  setConfig,
  debounceMs = 1200,
  onStatusChange,
  onConflictConfirm,
}: Options) => {
  const engineRef = useRef<VersionedSyncEngine<SecretsPayload> | null>(null);
  const payloadRef = useRef(payloadFromConfig(config));
  const callbacksRef = useRef({ setConfig, onStatusChange, onConflictConfirm });
  payloadRef.current = payloadFromConfig(config);
  callbacksRef.current = { setConfig, onStatusChange, onConflictConfirm };

  useEffect(() => {
    const enabled = isSignedIn && isLoaded && config.syncApiKeys;
    if (!enabled) {
      callbacksRef.current.onStatusChange?.("disabled", { pendingOps: 0, retryCount: 0 });
      return undefined;
    }

    const baselineStore = createLocalStorageBaselineStore(
      `stylo_secrets_last_synced_v2:${encodeURIComponent(accountScope)}`
    );
    const engine = new VersionedSyncEngine<SecretsPayload>({
      transport: createSecretsSyncTransport(accountSession),
      codec: secretsSyncCodec,
      baselineStore,
      debounceMs,
      onStatusChange: (status, detail) => callbacksRef.current.onStatusChange?.(status, detail),
      onApplyRemote: (remote) => {
        payloadRef.current = remote;
        callbacksRef.current.setConfig((previous) => ({
          ...previous,
          textConfig: { ...previous.textConfig, apiKey: remote.textApiKey },
          multimodalConfig: { ...previous.multimodalConfig, apiKey: remote.multiApiKey },
          videoConfig: { ...previous.videoConfig, apiKey: remote.videoApiKey },
        }));
      },
      onConflict: async ({ remote, local }) => {
        const useRemote = await callbacksRef.current.onConflictConfirm({ remote, local });
        return useRemote ? "remote" : "local";
      },
    });
    engineRef.current = engine;
    const handleOnline = () => engine.setOnline(true);
    const handleOffline = () => engine.setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void engine.start(payloadRef.current).catch((error) => {
      if (!isAbortError(error)) console.warn("Secrets sync bootstrap failed", error);
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (engineRef.current === engine) engineRef.current = null;
      engine.dispose();
    };
  }, [accountScope, accountSession, config.syncApiKeys, debounceMs, isLoaded, isSignedIn]);

  useEffect(() => {
    engineRef.current?.stage(payloadFromConfig(config));
  }, [config.textConfig.apiKey, config.multimodalConfig.apiKey, config.videoConfig.apiKey]);
};
