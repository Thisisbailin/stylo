import { useEffect, useRef } from "react";
import type { AppConfig, SyncStatus } from "../types";
import type { AccountApiSession } from "../sync/authenticatedFetch";
import { AccountSettingsSyncEngine } from "../sync/accountSettingsSyncEngine";
import type { SyncStatusDetail } from "../sync/realtimeSyncTypes";
import type { SecretsPayload } from "../sync/secretsSyncAdapter";

type Options = {
  accountScope: string;
  isSignedIn: boolean;
  isLoaded: boolean;
  accountSession: AccountApiSession;
  config: AppConfig;
  setConfig: (config: AppConfig | ((config: AppConfig) => AppConfig)) => void;
  debounceMs?: number;
  onStatusChange?: (status: SyncStatus, detail?: SyncStatusDetail) => void;
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
}: Options) => {
  const engineRef = useRef<AccountSettingsSyncEngine | null>(null);
  const payloadRef = useRef(payloadFromConfig(config));
  const callbacksRef = useRef({ setConfig, onStatusChange });
  payloadRef.current = payloadFromConfig(config);
  callbacksRef.current = { setConfig, onStatusChange };

  useEffect(() => {
    const enabled = isSignedIn && isLoaded && config.syncApiKeys;
    if (!enabled) {
      callbacksRef.current.onStatusChange?.("disabled", { pendingOps: 0, retryCount: 0 });
      return undefined;
    }

    const engine = new AccountSettingsSyncEngine({
      session: accountSession,
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
      onError: (error) => console.warn("Account settings sync failed", error),
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
