import { useCallback, useEffect, useRef } from "react";
import type { ProjectData, SyncStatus } from "../types";
import { backupData } from "../utils/persistence";
import { restoreLocalProjectMedia } from "../utils/cloudProjectData";
import type { AccountApiSession } from "../sync/authenticatedFetch";
import { createLocalStorageBaselineStore } from "../sync/localBaselineStore";
import {
  createProjectSyncTransport,
  projectSyncCodec,
} from "../sync/projectSyncAdapter";
import {
  VersionedSyncEngine,
  type SyncStatusDetail,
  type VersionedSyncLease,
} from "../sync/versionedSyncEngine";

type UseCloudSyncOptions = {
  accountScope: string;
  isSignedIn: boolean;
  isLoaded: boolean;
  accountSession: AccountApiSession;
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  refreshKey?: number;
  localBackupKey: string;
  remoteBackupKey: string;
  forceClearKey: string;
  onError?: (error: unknown) => void;
  onConflictConfirm: (options: { remote: ProjectData; local: ProjectData }) => Promise<boolean> | boolean;
  saveDebounceMs?: number;
  onStatusChange?: (status: SyncStatus, detail?: SyncStatusDetail) => void;
};

export type ProjectSyncLease = VersionedSyncLease;
export type EnsureProjectSynced = (
  snapshot: ProjectData,
  expectedRevision: number
) => Promise<ProjectSyncLease>;

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

export const useCloudSync = ({
  accountScope,
  isSignedIn,
  isLoaded,
  accountSession,
  projectData,
  setProjectData,
  refreshKey,
  localBackupKey,
  remoteBackupKey,
  forceClearKey,
  onError,
  onConflictConfirm,
  saveDebounceMs = 1200,
  onStatusChange,
}: UseCloudSyncOptions) => {
  const engineRef = useRef<VersionedSyncEngine<ProjectData> | null>(null);
  const projectDataRef = useRef(projectData);
  const callbacksRef = useRef({ onError, onConflictConfirm, onStatusChange, setProjectData });
  const lastRefreshKeyRef = useRef(refreshKey);

  projectDataRef.current = projectData;
  callbacksRef.current = { onError, onConflictConfirm, onStatusChange, setProjectData };

  useEffect(() => {
    if (!isSignedIn || !isLoaded) {
      callbacksRef.current.onStatusChange?.("disabled", { pendingOps: 0, retryCount: 0 });
      return undefined;
    }

    const baselineStore = createLocalStorageBaselineStore(`${localBackupKey}_last_synced`);
    const engine = new VersionedSyncEngine<ProjectData>({
      transport: createProjectSyncTransport(accountSession),
      codec: projectSyncCodec,
      baselineStore,
      debounceMs: saveDebounceMs,
      onStatusChange: (status, detail) => callbacksRef.current.onStatusChange?.(status, detail),
      onApplyRemote: (remote) => {
        projectDataRef.current = remote;
        callbacksRef.current.setProjectData(remote);
      },
      restoreRemote: restoreLocalProjectMedia,
      onConflict: async ({ remote, local }) => {
        const useRemote = await callbacksRef.current.onConflictConfirm({ remote, local });
        return useRemote ? "remote" : "local";
      },
      onBackupLocal: (local) => backupData(localBackupKey, local),
      onBackupRemote: (remote) => backupData(remoteBackupKey, remote),
      allowEmptyOverwrite: () => {
        try {
          return localStorage.getItem(forceClearKey) === "1";
        } catch {
          return false;
        }
      },
      onEmptyOverwriteCommitted: () => {
        try {
          localStorage.removeItem(forceClearKey);
        } catch {
          // Best-effort reset marker cleanup.
        }
      },
    });
    engineRef.current = engine;
    const handleOnline = () => engine.setOnline(true);
    const handleOffline = () => engine.setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void engine.start(projectDataRef.current).catch((error) => {
      if (!isAbortError(error)) callbacksRef.current.onError?.(error);
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (engineRef.current === engine) engineRef.current = null;
      engine.dispose();
    };
  }, [accountScope, accountSession, forceClearKey, isLoaded, isSignedIn, localBackupKey, remoteBackupKey, saveDebounceMs]);

  useEffect(() => {
    engineRef.current?.stage(projectData);
  }, [projectData]);

  useEffect(() => {
    if (refreshKey === lastRefreshKeyRef.current) return;
    lastRefreshKeyRef.current = refreshKey;
    const engine = engineRef.current;
    if (!engine) return;
    void engine.refresh(projectDataRef.current).catch((error) => {
      if (!isAbortError(error)) callbacksRef.current.onError?.(error);
    });
  }, [refreshKey]);

  const flushProjectSync = useCallback<EnsureProjectSynced>(async (snapshot, expectedRevision) => {
    const engine = engineRef.current;
    if (!engine) {
      throw new Error("当前账户的项目同步会话尚未就绪，Agent 请求未发送。");
    }
    return engine.acquire(snapshot, expectedRevision);
  }, []);

  return { flushProjectSync };
};
