import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectData, SyncStatus } from "../types";
import { backupData } from "../utils/persistence";
import { restoreLocalProjectMedia } from "../utils/cloudProjectData";
import type { AccountApiSession } from "../sync/authenticatedFetch";
import { createLocalStorageBaselineStore } from "../sync/localBaselineStore";
import {
  createProjectSyncTransport,
  createProjectSyncCodec,
} from "../sync/projectSyncAdapter";
import { mergeStyloScopedProjectData } from "../agents/runtime/projectScope";
import {
  VersionedSyncEngine,
  type SyncStatusDetail,
  type VersionedSyncLease,
} from "../sync/versionedSyncEngine";

type UseCloudSyncOptions = {
  accountScope: string;
  projectId: string;
  isSignedIn: boolean;
  isLoaded: boolean;
  accountSession: AccountApiSession;
  projectEditLeaseId?: string;
  onProjectEditLeaseLost?: () => void;
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
export type ResumeProjectSync = () => void;

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

export const useCloudSync = ({
  accountScope,
  projectId,
  isSignedIn,
  isLoaded,
  accountSession,
  projectEditLeaseId,
  onProjectEditLeaseLost,
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
  const suspendedRef = useRef(false);
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const projectDataRef = useRef(projectData);
  const callbacksRef = useRef({ onError, onConflictConfirm, onStatusChange, setProjectData });
  const lastRefreshKeyRef = useRef(refreshKey);

  projectDataRef.current = projectData;
  callbacksRef.current = { onError, onConflictConfirm, onStatusChange, setProjectData };

  useEffect(() => {
    if (!isSignedIn || !isLoaded || !projectEditLeaseId || suspendedRef.current) {
      callbacksRef.current.onStatusChange?.("disabled", { pendingOps: 0, retryCount: 0 });
      return undefined;
    }

    const baselineStore = createLocalStorageBaselineStore(
      `${localBackupKey}_last_synced:${encodeURIComponent(projectId)}`,
    );
    const engine = new VersionedSyncEngine<ProjectData>({
      transport: createProjectSyncTransport(accountSession, projectId, projectEditLeaseId, onProjectEditLeaseLost),
      codec: createProjectSyncCodec(projectId),
      baselineStore,
      debounceMs: saveDebounceMs,
      onStatusChange: (status, detail) => callbacksRef.current.onStatusChange?.(status, detail),
      onApplyRemote: (remote) => {
        callbacksRef.current.setProjectData((local) => {
          const merged = mergeStyloScopedProjectData(local, remote, projectId);
          projectDataRef.current = merged;
          return merged;
        });
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
  }, [accountScope, accountSession, forceClearKey, isLoaded, isSignedIn, localBackupKey, onProjectEditLeaseLost, projectEditLeaseId, projectId, remoteBackupKey, saveDebounceMs, sessionGeneration]);

  useEffect(() => {
    if (suspendedRef.current) return;
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

  const suspendProjectSync = useCallback((): ResumeProjectSync => {
    if (suspendedRef.current) {
      throw new Error("项目同步会话已处于重置状态。");
    }
    suspendedRef.current = true;
    const engine = engineRef.current;
    engineRef.current = null;
    engine?.dispose();
    callbacksRef.current.onStatusChange?.("syncing", {
      pendingOps: 1,
      retryCount: 0,
      lastAttemptAt: Date.now(),
    });

    let resumed = false;
    return () => {
      if (resumed) return;
      resumed = true;
      suspendedRef.current = false;
      setSessionGeneration((generation) => generation + 1);
    };
  }, []);

  return { flushProjectSync, suspendProjectSync };
};
