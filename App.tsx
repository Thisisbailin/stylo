
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useUser, useClerk, useAuth } from './lib/auth';
import { FlowState, ProjectData, SyncState, SyncStatus } from './types';
import { INITIAL_PROJECT_DATA } from './constants';
import { normalizeProjectData } from './utils/projectData';
import { backupData, FORCE_CLOUD_CLEAR_KEY, isProjectEmpty } from './utils/persistence';
import { getDeviceId } from './utils/device';
import { hashToBucket, isInRollout, normalizeRolloutPercent } from './utils/rollout';
import { buildApiUrl } from './utils/api';
import { setApiAuthTokenProvider } from './utils/authToken';
import { usePersistedState } from './hooks/usePersistedState';
import { useCloudSync } from './hooks/useCloudSync';
import { useProjectEditLease } from './hooks/useProjectEditLease';
import { useConfig } from './hooks/useConfig';
import { useTheme } from './hooks/useTheme';
import { useSecretsSync } from './hooks/useSecretsSync';
import { AppShell } from './components/layout/AppShell';
import { ConflictModal } from './components/ConflictModal';
import { SecretsConflictModal } from './components/SecretsConflictModal';
import { SyncStatusBanner } from './components/SyncStatusBanner';
import { ProjectEditLeaseModal } from './components/ProjectEditLeaseModal';
import { CreativeWorkspace } from './node-workspace/components/CreativeWorkspace';
import { resetNodeFlowAccountState, resetNodeFlowProjectState } from './node-workspace/store/nodeFlowStore';
import type { ProjectSettingsPanelKey } from './node-workspace/components/ProjectSettingsPanel';
import { GlassEffectLab } from './node-workspace/components/GlassEffectLab';
import { FilmRollLab } from './node-workspace/components/FilmRollLab';
import type { ModuleKey } from './node-workspace/components/ModuleBar';
import {
  buildStyloAccountStorageKeys,
  DEFAULT_STYLO_PROJECT_ID,
  STYLO_ACTIVITY_STORAGE_PREFIX,
  STYLO_CONVERSATION_STORAGE_PREFIX,
  resolveStyloProjectId,
  resetStyloScopedProjectData,
} from './agents/runtime/projectScope';
import { resetStyloProjectAgentStorage } from './agents/runtime/projectReset';
import {
  LEGACY_PRODUCT_STORAGE,
  migrateLegacyProductStorage,
} from './utils/styloMigration';
import type { SecretsPayload } from './sync/secretsSyncAdapter';
import { projectSyncCodec } from './sync/projectSyncAdapter';
import { AccountApiSession, requireOkResponse } from './sync/authenticatedFetch';
import { deleteCloudProject, loadCloudProject, loadCloudProjectCatalog, mergeMissingCloudProjects } from './sync/projectCatalog';

const AgentLab = React.lazy(() =>
  import('./node-workspace/components/AgentLab').then((module) => ({ default: module.AgentLab }))
);
const CineworLab = React.lazy(() =>
  import('./node-workspace/components/CineworLab').then((module) => ({ default: module.CineworLab }))
);
const DesignSystemLab = React.lazy(() =>
  import('./node-workspace/components/DesignSystemLab').then((module) => ({ default: module.DesignSystemLab }))
);

type LabModalKey = ModuleKey;

const PROJECT_STORAGE_KEY = 'stylo_project_v1';
const CONFIG_STORAGE_KEY = 'stylo_config_v1';
const THEME_STORAGE_KEY = 'stylo_theme_v1';
const LOCAL_BACKUP_KEY = 'stylo_local_backup';
const REMOTE_BACKUP_KEY = 'stylo_remote_backup';
const AVATAR_STORAGE_KEY = 'stylo_avatar_url';
const LOCAL_ONLY_PROJECT_KEY = 'stylo_local_only_project_v1';

type AccountScope = "guest" | `user:${string}`;

type ProjectConflictRequest = {
  signature: string;
  remote: ProjectData;
  local: ProjectData;
  resolves: Array<(useRemote: boolean) => void>;
};

const buildAccountStorageKey = (baseKey: string, accountScope: AccountScope) =>
  `${baseKey}:${encodeURIComponent(accountScope)}`;

const LEGACY_MIGRATION_MARKER_PREFIX = "stylo_legacy_migration_v1";

const isUnscopedLegacyStyloKey = (key: string | null) => {
  if (!key) return false;
  const prefix = key.startsWith(`${STYLO_CONVERSATION_STORAGE_PREFIX}:`)
    ? STYLO_CONVERSATION_STORAGE_PREFIX
    : key.startsWith(`${STYLO_ACTIVITY_STORAGE_PREFIX}:`)
      ? STYLO_ACTIVITY_STORAGE_PREFIX
      : key.startsWith(`${LEGACY_PRODUCT_STORAGE.conversationsV2Prefix}:`)
        ? LEGACY_PRODUCT_STORAGE.conversationsV2Prefix
        : key.startsWith(`${LEGACY_PRODUCT_STORAGE.activityV2Prefix}:`)
          ? LEGACY_PRODUCT_STORAGE.activityV2Prefix
      : null;
  if (!prefix) return false;
  try {
    const scope = decodeURIComponent(key.slice(prefix.length + 1));
    return !scope.startsWith("user:") && !scope.startsWith("guest:");
  } catch {
    return false;
  }
};

const getLegacyProjectId = (rawProject: string | null) => {
  if (!rawProject) return DEFAULT_STYLO_PROJECT_ID;
  try {
    const project = JSON.parse(rawProject) as Record<string, unknown>;
    if (typeof project.activeFlowProjectId === "string" && project.activeFlowProjectId.trim()) {
      return project.activeFlowProjectId.trim();
    }
    const firstProject = Array.isArray(project.flowProjects) ? project.flowProjects[0] : null;
    if (firstProject && typeof firstProject === "object" && typeof firstProject.id === "string") {
      return firstProject.id;
    }
  } catch {
    // Invalid legacy state remains quarantined and is never loaded implicitly.
  }
  return DEFAULT_STYLO_PROJECT_ID;
};

const migrateLegacyLocalState = (accountScope: AccountScope) => {
  const legacyProject = localStorage.getItem(PROJECT_STORAGE_KEY);
  const projectId = getLegacyProjectId(legacyProject);
  const fixedKeys = [
    PROJECT_STORAGE_KEY,
    CONFIG_STORAGE_KEY,
    LOCAL_BACKUP_KEY,
    REMOTE_BACKUP_KEY,
    AVATAR_STORAGE_KEY,
  ];
  fixedKeys.forEach((legacyKey) => {
    const value = localStorage.getItem(legacyKey);
    if (value === null) return;
    const scopedKey = buildAccountStorageKey(legacyKey, accountScope);
    if (localStorage.getItem(scopedKey) === null) localStorage.setItem(scopedKey, value);
    localStorage.removeItem(legacyKey);
  });

  const allKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key): key is string => Boolean(key));
  for (const key of allKeys) {
    const prefix = key.startsWith(`${STYLO_CONVERSATION_STORAGE_PREFIX}:`)
      ? STYLO_CONVERSATION_STORAGE_PREFIX
      : key.startsWith(`${STYLO_ACTIVITY_STORAGE_PREFIX}:`)
        ? STYLO_ACTIVITY_STORAGE_PREFIX
        : null;
    if (!prefix || !isUnscopedLegacyStyloKey(key)) continue;
    const encodedScope = key.slice(prefix.length + 1);
    let legacyProjectScope = "";
    try {
      legacyProjectScope = decodeURIComponent(encodedScope);
    } catch {
      continue;
    }
    const targetKeys = buildStyloAccountStorageKeys(accountScope, legacyProjectScope);
    const targetKey = prefix === STYLO_CONVERSATION_STORAGE_PREFIX
      ? targetKeys.conversationStorageKey
      : targetKeys.activityStorageKey;
    const value = localStorage.getItem(key);
    if (value !== null && localStorage.getItem(targetKey) === null) localStorage.setItem(targetKey, value);
    localStorage.removeItem(key);
  }

  const targetConversationKey = buildStyloAccountStorageKeys(accountScope, projectId).conversationStorageKey;
  if (localStorage.getItem(targetConversationKey) === null) {
    const legacyConversation = localStorage.getItem("stylo_conversations_v1");
    const legacyMessages = localStorage.getItem("stylo_messages_v1");
    if (legacyConversation) {
      localStorage.setItem(targetConversationKey, legacyConversation);
    } else if (legacyMessages) {
      try {
        const messages = JSON.parse(legacyMessages);
        if (Array.isArray(messages) && messages.length > 0) {
          const now = Date.now();
          const id = `legacy-${now.toString(36)}`;
          localStorage.setItem(targetConversationKey, JSON.stringify({
            activeId: id,
            items: [{ id, title: "迁移的对话", createdAt: now, updatedAt: now, messages }],
          }));
        }
      } catch {
        // Leave malformed legacy messages quarantined.
      }
    }
  }
  localStorage.removeItem("stylo_conversations_v1");
  localStorage.removeItem("stylo_messages_v1");
};

const decodeJwtExpiry = (token: string) => {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const normalized = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    const decoded = JSON.parse(atob(normalized));
    return typeof decoded?.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
};

const decodeJwtSubject = (token: string) => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    const decoded = JSON.parse(atob(normalized));
    return typeof decoded?.sub === "string" ? decoded.sub : null;
  } catch {
    return null;
  }
};

const isJwtExpiredOrNearExpiry = (token: string, leewayMs = 30_000) => {
  const expiresAt = decodeJwtExpiry(token);
  if (!expiresAt) return false;
  return expiresAt - Date.now() <= leewayMs;
};

const ScopedApp: React.FC<{ accountScope: AccountScope }> = ({ accountScope }) => {
  // Clerk Auth Hooks
  const { isSignedIn: userSignedIn, user, isLoaded: isUserLoaded } = useUser();
  const { openSignIn, signOut } = useClerk();
  const { getToken, isLoaded: isAuthLoaded, isSignedIn: authSignedIn, userId: authUserId } = useAuth();
  const projectStorageKey = buildAccountStorageKey(PROJECT_STORAGE_KEY, accountScope);
  const configStorageKey = buildAccountStorageKey(CONFIG_STORAGE_KEY, accountScope);
  const localBackupKey = buildAccountStorageKey(LOCAL_BACKUP_KEY, accountScope);
  const remoteBackupKey = buildAccountStorageKey(REMOTE_BACKUP_KEY, accountScope);
  const forceCloudClearKey = buildAccountStorageKey(FORCE_CLOUD_CLEAR_KEY, accountScope);
  const avatarStorageKey = buildAccountStorageKey(AVATAR_STORAGE_KEY, accountScope);
  const localOnlyProjectKey = buildAccountStorageKey(LOCAL_ONLY_PROJECT_KEY, accountScope);
  React.useLayoutEffect(() => {
    resetNodeFlowAccountState();
    return resetNodeFlowAccountState;
  }, [accountScope]);
  const getAuthToken = useCallback(async (options?: { skipCache?: boolean }) => {
    try {
      const expectedUserId = accountScope.startsWith("user:") ? accountScope.slice(5) : null;
      if (!expectedUserId || !authSignedIn || authUserId !== expectedUserId) return null;
      const token = await getToken({ template: "default", ...(options?.skipCache ? { skipCache: true } : {}) });
      if (!token || decodeJwtSubject(token) !== expectedUserId) return null;
      if (!options?.skipCache && isJwtExpiredOrNearExpiry(token)) {
        const refreshed = await getToken({ template: "default", skipCache: true });
        return refreshed && decodeJwtSubject(refreshed) === expectedUserId ? refreshed : null;
      }
      return token;
    } catch {
      return null;
    }
  }, [accountScope, authSignedIn, authUserId, getToken]);
  const accountSession = useMemo(
    () => new AccountApiSession(accountScope, getAuthToken, getDeviceId(), fetch, buildApiUrl),
    [accountScope, getAuthToken]
  );
  useEffect(() => accountSession.retain(), [accountSession]);
  useEffect(() => {
    setApiAuthTokenProvider(authSignedIn ? getAuthToken : null);
    return () => setApiAuthTokenProvider(null);
  }, [authSignedIn, getAuthToken]);
  const projectDataRef = useRef<ProjectData>(INITIAL_PROJECT_DATA);

  // Initialize state with Persisted hooks
  const [projectData, setProjectDataRaw] = usePersistedState<ProjectData>({
    key: projectStorageKey,
    initialValue: INITIAL_PROJECT_DATA,
    deserialize: (value) => normalizeProjectData(JSON.parse(value)),
    serialize: (value) => JSON.stringify(value),
  });
  const [isLocalOnlyProject, setIsLocalOnlyProject] = usePersistedState<boolean>({
    key: localOnlyProjectKey,
    initialValue: false,
    deserialize: (value) => value === "true",
    serialize: (value) => String(value),
  });
  const setProjectData = useCallback(
    (value: React.SetStateAction<ProjectData>) => {
      setProjectDataRaw((prev) =>
        normalizeProjectData(typeof value === 'function' ? (value as (prevState: ProjectData) => ProjectData)(prev) : value)
      );
    },
    [setProjectDataRaw]
  );
  // Catalog hydration runs before the later synchronization effects on the
  // first mounted frame. Keep the ref current during render so it never merges
  // cloud projects into the static initial value and overwrites local state.
  projectDataRef.current = projectData;

  const { config, setConfig } = useConfig(configStorageKey);

  const { isDarkMode, setIsDarkMode, toggleTheme } = useTheme(THEME_STORAGE_KEY, false);

  // Sync global theme classes for both Tailwind dark styles and CSS variable themes
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const themeClass = isDarkMode ? "theme-dark" : "theme-light";

    root.classList.remove("theme-light", "theme-dark");
    body.classList.remove("theme-light", "theme-dark");
    root.classList.add(themeClass);
    body.classList.add(themeClass);

    if (isDarkMode) {
      root.classList.add("dark");
      body.classList.add("dark");
    } else {
      root.classList.remove("dark");
      body.classList.remove("dark");
    }
  }, [isDarkMode]);

  const [syncState, setSyncState] = useState<SyncState>({
    project: { status: 'idle' },
    secrets: { status: 'disabled' }
  });
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine !== false,
  );
  const [syncRefreshKey, setSyncRefreshKey] = useState(0);
  const [isCloudProjectCatalogReady, setIsCloudProjectCatalogReady] = useState(false);
  const [projectResetToken, setProjectResetToken] = useState(0);
  const conflictQueueRef = useRef<ProjectConflictRequest[]>([]);
  const activeConflictRef = useRef<ProjectConflictRequest | null>(null);
  const [activeConflict, setActiveConflict] = useState<ProjectConflictRequest | null>(null);
  const secretConflictRef = useRef<{
    remote: SecretsPayload;
    local: SecretsPayload;
    resolve: (useRemote: boolean) => void;
  } | null>(null);
  const [secretConflict, setSecretConflict] = useState<{
    remote: SecretsPayload;
    local: SecretsPayload;
    resolve: (useRemote: boolean) => void;
  } | null>(null);

  const [openLabModal, setOpenLabModal] = useState<LabModalKey | null>(null);
  const [projectSettingsRequest, setProjectSettingsRequest] = useState<{ panel: ProjectSettingsPanelKey; nonce: number } | null>(null);
  const [isSyncBannerDismissed, setIsSyncBannerDismissed] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = usePersistedState<string>({
    key: avatarStorageKey,
    initialValue: '',
    deserialize: (v) => JSON.parse(v),
    serialize: (v) => JSON.stringify(v)
  });
  const hasFetchedProfileAvatar = useRef(false);
  const syncRollout = useMemo(() => {
    const percent = normalizeRolloutPercent(import.meta.env.VITE_SYNC_ROLLOUT_PERCENT);
    const salt = import.meta.env.VITE_SYNC_ROLLOUT_SALT || "";
    const allowlistRaw = import.meta.env.VITE_SYNC_ROLLOUT_ALLOWLIST || "";
    const allowlist = allowlistRaw.split(",").map((value: string) => value.trim()).filter(Boolean);
    const userId = user?.id || (userSignedIn ? "" : getDeviceId());
    const allowlisted = !!user?.id && allowlist.includes(user.id);
    if (!userId) {
      return { enabled: percent >= 100, percent, bucket: null, allowlisted };
    }
    const bucket = hashToBucket(userId, salt);
    const enabled = allowlisted || isInRollout(userId, percent, salt);
    return { enabled, percent, bucket, allowlisted };
  }, [user?.id, userSignedIn]);
  const isSyncFeatureEnabled = !!authSignedIn && syncRollout.enabled;
  const cloudProjectId = resolveStyloProjectId(projectData);

  useEffect(() => {
    let active = true;
    if (!isSyncFeatureEnabled || isLocalOnlyProject) {
      setIsCloudProjectCatalogReady(true);
      return () => { active = false; };
    }
    setIsCloudProjectCatalogReady(false);
    void (async () => {
      try {
        const catalog = await loadCloudProjectCatalog(accountSession);
        if (!active || catalog.length === 0) return;
        const current = projectDataRef.current;
        const localIds = new Set((current.flowProjects || []).map((project) => project.id));
        const missing = catalog.filter((entry) => !localIds.has(entry.projectId)).slice(0, 3);
        const loaded = (await Promise.all(missing.map(async (entry) => ({
          projectId: entry.projectId,
          data: await loadCloudProject(accountSession, entry.projectId),
        })))).filter((item): item is { projectId: string; data: ProjectData } => Boolean(item.data));
        if (!active || loaded.length === 0) return;
        let merged = mergeMissingCloudProjects(current, loaded);
        if (isProjectEmpty(current) && !catalog.some((entry) => entry.projectId === cloudProjectId)) {
          const preferred = loaded.find((item) => item.projectId === catalog[0]?.projectId) || loaded[0];
          const preferredProject = preferred.data.flowProjects?.find((project) => project.id === preferred.projectId);
          if (preferredProject) {
            merged = {
              ...preferred.data,
              activeFlowProjectId: preferred.projectId,
              flow: preferredProject.flow || preferred.data.flow,
              flowProjects: merged.flowProjects,
            };
          }
        }
        projectDataRef.current = merged;
        setProjectData(merged);
      } catch (error) {
        console.warn("Cloud project catalog hydration failed", error);
      } finally {
        if (active) setIsCloudProjectCatalogReady(true);
      }
    })();
    return () => { active = false; };
  }, [accountScope, accountSession, isLocalOnlyProject, isSyncFeatureEnabled, setProjectData]);

  const projectEditLease = useProjectEditLease({
    accountScope,
    projectId: cloudProjectId,
    accountSession,
    enabled: isSyncFeatureEnabled && !isLocalOnlyProject && isCloudProjectCatalogReady,
  });

  const openProjectSettings = useCallback((panel: ProjectSettingsPanelKey = "provider") => {
    setProjectSettingsRequest({ panel, nonce: Date.now() });
  }, []);
  const handleOpenLabModule = useCallback((key: ModuleKey) => {
    if (key === 'characters') {
      openProjectSettings("assets");
      return;
    }
    if (key === 'scenes') {
      openProjectSettings("assets");
      return;
    }
    setOpenLabModal(key);
  }, [openProjectSettings]);

  const closeLabModal = useCallback(() => {
    setOpenLabModal(null);
  }, []);

  // --- Cloud Sync Helpers ---

  useEffect(() => {
    projectDataRef.current = projectData;
  }, [projectData]);

  useEffect(() => {
    activeConflictRef.current = activeConflict;
  }, [activeConflict]);

  useEffect(() => () => {
    activeConflictRef.current?.resolves.forEach((resolve) => resolve(true));
    conflictQueueRef.current.forEach((item) => item.resolves.forEach((resolve) => resolve(true)));
    conflictQueueRef.current = [];
    activeConflictRef.current = null;
    secretConflictRef.current?.resolve(true);
    secretConflictRef.current = null;
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const projectEnabled = authSignedIn && isSyncFeatureEnabled && !isLocalOnlyProject;
    const secretsEnabled = authSignedIn && isSyncFeatureEnabled && config.syncApiKeys &&
      (isLocalOnlyProject || projectEditLease.state.status === "owned");
    setSyncState(prev => ({
      project: projectEnabled ? (prev.project.status === 'disabled' ? { status: 'loading' } : prev.project) : { status: 'disabled' },
      secrets: secretsEnabled
        ? (prev.secrets.status === 'disabled' ? { status: 'loading' } : prev.secrets)
        : { status: 'disabled' }
    }));
  }, [authSignedIn, config.syncApiKeys, isLocalOnlyProject, isSyncFeatureEnabled, projectEditLease.state.status]);

  const updateProjectSyncStatus = useCallback((status: SyncStatus, detail?: { lastSyncAt?: number; error?: string; pendingOps?: number; retryCount?: number; lastAttemptAt?: number }) => {
    setSyncState(prev => ({
      ...prev,
      project: {
        status,
        lastSyncAt: detail?.lastSyncAt ?? prev.project.lastSyncAt,
        lastError: status === 'error' ? detail?.error ?? prev.project.lastError : status === 'synced' ? undefined : prev.project.lastError,
        pendingOps: detail?.pendingOps ?? prev.project.pendingOps,
        retryCount: detail?.retryCount ?? prev.project.retryCount,
        lastAttemptAt: detail?.lastAttemptAt ?? prev.project.lastAttemptAt
      }
    }));
  }, []);

  const updateSecretsSyncStatus = useCallback((status: SyncStatus, detail?: { lastSyncAt?: number; error?: string; pendingOps?: number; retryCount?: number; lastAttemptAt?: number }) => {
    setSyncState(prev => ({
      ...prev,
      secrets: {
        status,
        lastSyncAt: detail?.lastSyncAt ?? prev.secrets.lastSyncAt,
        lastError: status === 'error' ? detail?.error ?? prev.secrets.lastError : status === 'synced' ? undefined : prev.secrets.lastError,
        pendingOps: detail?.pendingOps ?? prev.secrets.pendingOps,
        retryCount: detail?.retryCount ?? prev.secrets.retryCount,
        lastAttemptAt: detail?.lastAttemptAt ?? prev.secrets.lastAttemptAt
      }
    }));
  }, []);

  const handleCloudSyncError = useCallback((e: unknown) => {
    console.warn("Cloud sync error", e);
  }, []);

  const forceCloudPull = useCallback(() => {
    setSyncRefreshKey((v) => v + 1);
  }, []);

  const requestConflictResolution = useCallback(({ remote, local }: { remote: ProjectData; local: ProjectData }) => {
    return new Promise<boolean>((resolve) => {
      const signature = `${projectSyncCodec.fingerprint(remote)}>${projectSyncCodec.fingerprint(local)}`;
      const active = activeConflictRef.current;
      if (active?.signature === signature) {
        active.resolves.push(resolve);
        return;
      }
      const queued = conflictQueueRef.current.find((item) => item.signature === signature);
      if (queued) {
        queued.resolves.push(resolve);
        return;
      }
      const request: ProjectConflictRequest = { signature, remote, local, resolves: [resolve] };
      if (!active) {
        activeConflictRef.current = request;
        setActiveConflict(request);
      } else {
        conflictQueueRef.current.push(request);
      }
    });
  }, []);

  const handleConflictChoice = useCallback((useRemote: boolean) => {
    if (!activeConflict) return;
    activeConflict.resolves.forEach((resolve) => resolve(useRemote));
    const next = conflictQueueRef.current.shift();
    activeConflictRef.current = next || null;
    setActiveConflict(next || null);
  }, [activeConflict]);

  const clearProjectConflictQueue = useCallback(() => {
    activeConflictRef.current?.resolves.forEach((resolve) => resolve(true));
    conflictQueueRef.current.forEach((item) => item.resolves.forEach((resolve) => resolve(true)));
    conflictQueueRef.current = [];
    activeConflictRef.current = null;
    setActiveConflict(null);
  }, []);

  const requestSecretsConflictResolution = useCallback(({
    remote,
    local,
  }: {
    remote: SecretsPayload;
    local: SecretsPayload;
  }) => new Promise<boolean>((resolve) => {
    const request = { remote, local, resolve };
    secretConflictRef.current = request;
    setSecretConflict(request);
  }), []);

  const handleSecretsConflictChoice = useCallback((useRemote: boolean) => {
    const conflict = secretConflictRef.current;
    if (!conflict) return;
    secretConflictRef.current = null;
    setSecretConflict(null);
    conflict.resolve(useRemote);
  }, []);


  // --- Cloud Sync (Clerk + Cloudflare Pages) ---
  const { flushProjectSync, suspendProjectSync } = useCloudSync({
    accountScope,
    projectId: cloudProjectId,
    isSignedIn: !!authSignedIn && isSyncFeatureEnabled && !isLocalOnlyProject && projectEditLease.state.status === "owned",
    isLoaded: isAuthLoaded,
    accountSession,
    projectEditLeaseId: projectEditLease.leaseId,
    onProjectEditLeaseLost: projectEditLease.markLost,
    projectData,
    setProjectData,
    refreshKey: syncRefreshKey,
    localBackupKey,
    remoteBackupKey,
    forceClearKey: forceCloudClearKey,
    onError: handleCloudSyncError,
    onStatusChange: updateProjectSyncStatus,
    onConflictConfirm: requestConflictResolution,
    saveDebounceMs: 1200
  });

  const handleCreateLocalProject = useCallback(() => {
    clearProjectConflictQueue();
    backupData(localBackupKey, projectDataRef.current);
    void projectEditLease.release();
    setIsLocalOnlyProject(true);
    resetNodeFlowProjectState();
    const emptyProject = normalizeProjectData({
      ...structuredClone(INITIAL_PROJECT_DATA),
      fileName: "本地项目",
    });
    projectDataRef.current = emptyProject;
    setProjectData(emptyProject);
    setProjectResetToken((token) => token + 1);
  }, [clearProjectConflictQueue, localBackupKey, projectEditLease, setIsLocalOnlyProject, setProjectData]);

  const handleExitProject = useCallback(async () => {
    clearProjectConflictQueue();
    await projectEditLease.release().catch(() => undefined);
    await signOut();
  }, [clearProjectConflictQueue, projectEditLease, signOut]);

  const handleDeleteFlowProject = useCallback(async (projectId: string) => {
    if (!isSyncFeatureEnabled || isLocalOnlyProject) return true;
    const activeLeaseId = projectId === cloudProjectId ? projectEditLease.leaseId : undefined;
    const resumeProjectSync = activeLeaseId ? suspendProjectSync() : null;
    let deleted = false;
    try {
      await deleteCloudProject(accountSession, projectId, activeLeaseId);
      resetStyloProjectAgentStorage(accountScope, projectId);
      localStorage.removeItem(`${localBackupKey}_last_synced:${encodeURIComponent(projectId)}`);
      deleted = true;
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "删除云端项目失败。");
      return false;
    } finally {
      if (resumeProjectSync) {
        if (deleted) window.setTimeout(resumeProjectSync, 0);
        else resumeProjectSync();
      }
    }
  }, [accountScope, accountSession, cloudProjectId, isLocalOnlyProject, isSyncFeatureEnabled, localBackupKey, projectEditLease.leaseId, suspendProjectSync]);

  useSecretsSync({
    accountScope,
    isSignedIn: !!authSignedIn && isSyncFeatureEnabled &&
      (isLocalOnlyProject || projectEditLease.state.status === "owned"),
    isLoaded: isAuthLoaded,
    accountSession,
    config,
    setConfig,
    debounceMs: 1200,
    onStatusChange: updateSecretsSyncStatus,
    onConflictConfirm: requestSecretsConflictResolution,
  });

  // Fetch avatar from profile (account-scoped) once per session
  useEffect(() => {
    const fetchProfile = async () => {
      if (!authSignedIn || !isAuthLoaded || hasFetchedProfileAvatar.current) return;
      try {
        hasFetchedProfileAvatar.current = true;
        const res = await accountSession.request('/api/profile');
        if (res.ok) {
          const data = await res.json();
          if (data.avatarUrl) setAvatarUrl(data.avatarUrl);
        }
      } catch (e) {
        console.warn('Fetch profile avatar failed', e);
      }
    };
    fetchProfile();
  }, [accountSession, authSignedIn, isAuthLoaded, setAvatarUrl]);

  // --- Handlers ---

  const handleResetProject = async () => {
    const resetTarget = isLocalOnlyProject ? "本地项目" : "本地与云端的项目数据";
    if (window.confirm(`确认清空整个项目吗？\n\n这会清空${resetTarget}（脚本、镜头、生成内容等），且不可恢复。`)) {
      if (isLocalOnlyProject) {
        resetNodeFlowProjectState();
        const localProjectId = resolveStyloProjectId(projectDataRef.current);
        const emptyProject = normalizeProjectData(
          resetStyloScopedProjectData(
            projectDataRef.current,
            normalizeProjectData(structuredClone(INITIAL_PROJECT_DATA)),
            localProjectId,
          ),
        );
        projectDataRef.current = emptyProject;
        setProjectData(emptyProject);
        setProjectResetToken((token) => token + 1);
        return;
      }
      const resumeProjectSync = suspendProjectSync();
      const resetProjectId = resolveStyloProjectId(projectDataRef.current);
      const emptyProject = normalizeProjectData(
        resetStyloScopedProjectData(
          projectDataRef.current,
          normalizeProjectData(structuredClone(INITIAL_PROJECT_DATA)),
          resetProjectId,
        ),
      );
      try {
        if (!projectEditLease.leaseId) throw new Error("当前客户端未持有项目编辑权，不能重置云端项目。");
        const response = await accountSession.request(`/api/account-data-reset?projectId=${encodeURIComponent(resetProjectId)}`, {
          method: 'DELETE',
          headers: { "x-project-edit-lease": projectEditLease.leaseId },
        });
        await requireOkResponse(response, '清空云端项目失败');

        resetNodeFlowProjectState();
        resetStyloProjectAgentStorage(accountScope, resetProjectId);
        setProjectResetToken((token) => token + 1);
        localStorage.setItem(forceCloudClearKey, "1");
        projectDataRef.current = emptyProject;
        setProjectData(emptyProject);
        localStorage.removeItem(localBackupKey);
        localStorage.removeItem(remoteBackupKey);
        localStorage.removeItem(`${localBackupKey}_last_synced:${encodeURIComponent(resetProjectId)}`);

      } catch (error) {
        console.warn('Cloud project reset failed', error);
        window.alert(error instanceof Error ? error.message : '清空云端项目失败。');
      } finally {
        // A new engine must handshake from version zero. The force-clear marker
        // remains until that handshake confirms the empty project remotely.
        resumeProjectSync();
      }
    }
  };

  const handleAvatarUploadClick = () => {
    avatarFileInputRef.current?.click();
  };

  const uploadAvatarToSupabase = async (file: File) => {
    try {
      const safeName = file.name
        .normalize("NFKD")
        .replace(/[^\w.\-]+/g, "_")
        .toLowerCase();
      const payload = {
        fileName: `avatars/${Date.now()}-${safeName}`,
        bucket: 'public-assets',
        contentType: file.type
      };
      const res = await accountSession.request('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(`Upload URL error ${res.status}: ${message || 'unknown error'}`);
      }
      const data = await res.json();
      const signedUrl: string = data.signedUrl;
      if (!signedUrl) throw new Error('No signedUrl returned');

      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file
      });
      if (!uploadRes.ok) {
        const txt = await uploadRes.text();
        throw new Error(`Upload failed ${uploadRes.status}: ${txt}`);
      }

      const publicUrl: string | undefined = data.publicUrl;
      const storedUrl = publicUrl || data.path || '';
      if (!storedUrl) throw new Error('No public URL/path returned');
      setAvatarUrl(storedUrl);
      // Save to profile for multi-device sync
      try {
        await accountSession.request('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatarUrl: storedUrl })
        });
      } catch (e) {
        console.warn('Save profile avatar failed', e);
      }
      alert('头像已上传并应用（Supabase public-assets）');
    } catch (e: any) {
      alert(`上传头像失败: ${e.message || e}`);
    }
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadAvatarToSupabase(file);
    e.target.value = '';
  };

  // --- Render Helpers ---
  const statusLabel = (status: SyncStatus) => {
    switch (status) {
      case "synced":
        return "已同步";
      case "syncing":
        return "同步中";
      case "loading":
        return "加载中";
      case "conflict":
        return "冲突";
      case "error":
        return "错误";
      case "offline":
        return "离线";
      case "disabled":
        return "仅本地";
      case "idle":
      default:
        return "就绪";
    }
  };
  const aggregateSyncStatus = () => {
    if (!isOnline) return { state: "offline" as const, label: statusLabel("offline") };
    const statuses = [syncState.project.status, syncState.secrets.status].filter((s) => s !== "disabled");
    if (statuses.includes("error")) return { state: "error" as const, label: statusLabel("error") };
    if (statuses.includes("conflict")) return { state: "conflict" as const, label: statusLabel("conflict") };
    if (statuses.includes("syncing") || statuses.includes("loading")) return { state: "syncing" as const, label: statusLabel("syncing") };
    if (statuses.length === 0) return { state: "disabled" as const, label: statusLabel("disabled") };
    if (statuses.includes("idle")) return { state: "idle" as const, label: statusLabel("idle") };
    return { state: "synced" as const, label: statusLabel("synced") };
  };
  const syncIndicator = (() => {
    const agg = aggregateSyncStatus();
    const colorMap: Record<string, string> = {
      synced: "#34d399",
      syncing: "#38bdf8",
      loading: "#38bdf8",
      conflict: "#fbbf24",
      error: "#f87171",
      offline: "#9ca3af",
      disabled: "#9ca3af",
      idle: "#a5b4fc",
    };
    return { label: agg.label, color: colorMap[agg.state] || "#a5b4fc" };
  })();

  const syncBannerSignature = useMemo(
    () =>
      [
        isOnline ? "online" : "offline",
        !!authSignedIn ? "signed-in" : "signed-out",
        syncRollout.enabled ? `rollout-${syncRollout.percent}` : "rollout-disabled",
        syncState.project.status,
        syncState.project.pendingOps ?? 0,
        syncState.project.retryCount ?? 0,
        syncState.project.lastAttemptAt ?? 0,
        syncState.secrets.status,
        syncState.secrets.pendingOps ?? 0,
        syncState.secrets.retryCount ?? 0,
        syncState.secrets.lastAttemptAt ?? 0,
      ].join("|"),
    [authSignedIn, isOnline, syncRollout.enabled, syncRollout.percent, syncState]
  );

  useEffect(() => {
    setIsSyncBannerDismissed(false);
  }, [syncBannerSignature]);

  const handleLoadIdentityCard = useCallback((identityId: string) => {
    if (!identityId) return;
    setProjectData((prev) => {
      const flow: FlowState = {
        flowNodes: [],
        links: [],
        ...(prev.flow || {}),
      };
      const flowNodes = Array.isArray(flow.flowNodes) ? flow.flowNodes : [];
      const existing = flowNodes.find(
        (node) => (node.type === 'lookbook' || node.type === 'identityCard') && (node.data as any)?.identityId === identityId
      );
      if (existing) return prev;

      return {
        ...prev,
        flow: {
          ...flow,
          flowNodes: [
            ...flowNodes,
            {
              id: `identity-${identityId}`,
              type: 'lookbook',
              position: { x: 280, y: 180 },
              data: {
                identityId,
                title: (prev.roles || []).find((role) => role.id === identityId)?.displayName || 'Lookbook',
                avatarOverrides: {},
              },
            },
          ],
        },
      };
    });
  }, [setProjectData]);

  const renderMainContent = () => (
    <div className="h-full">
      <CreativeWorkspace
        accountScope={accountScope}
        projectData={projectData}
        setProjectData={setProjectData}
        config={config}
        setConfig={setConfig}
        isSignedIn={!!authSignedIn}
        getAuthToken={getAuthToken}
        accountSession={accountSession}
        projectEditLeaseId={projectEditLease.leaseId}
        syncState={syncState}
        ensureProjectSynced={flushProjectSync}
        syncRollout={syncRollout}
        onForceSync={forceCloudPull}
        externalProjectSettingsRequest={projectSettingsRequest}
        onOpenModule={handleOpenLabModule}
        syncIndicator={syncIndicator}
        onResetProject={handleResetProject}
        onDeleteFlowProject={handleDeleteFlowProject}
        projectResetToken={projectResetToken}
        onSignOut={handleExitProject}
        accountInfo={{
          isLoaded: isUserLoaded,
          isSignedIn: !!userSignedIn,
          name: user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || "Stylo User",
          email: user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || undefined,
          avatarUrl: avatarUrl || user?.imageUrl || undefined,
          onSignIn: () => openSignIn(),
          onSignOut: handleExitProject,
          onUploadAvatar: handleAvatarUploadClick,
        }}
      />
    </div>
  );

  return (
    <>
      <AppShell
        isDarkMode={isDarkMode}
        header={null}
        banner={
          !isSyncBannerDismissed && (
            <SyncStatusBanner
              syncState={syncState}
              isOnline={isOnline}
              isSignedIn={!!authSignedIn}
              syncRollout={syncRollout}
              onOpenDetails={() => openProjectSettings("sync")}
              onForceSync={forceCloudPull}
              onClose={() => setIsSyncBannerDismissed(true)}
            />
          )
        }
      >
        {isSyncFeatureEnabled && !isLocalOnlyProject && projectEditLease.state.status !== "owned" && projectEditLease.state.status !== "disabled" ? (
          <ProjectEditLeaseModal
            state={projectEditLease.state}
            onCreateLocal={handleCreateLocalProject}
            onExit={handleExitProject}
            onRetry={projectEditLease.retry}
          />
        ) : null}
        {activeConflict && (
          <ConflictModal
            isOpen={!!activeConflict}
            remoteData={activeConflict.remote}
            localData={activeConflict.local}
            onUseRemote={() => handleConflictChoice(true)}
            onKeepLocal={() => handleConflictChoice(false)}
          />
        )}
        {secretConflict && (
          <SecretsConflictModal
            remote={secretConflict.remote}
            local={secretConflict.local}
            onUseRemote={() => handleSecretsConflictChoice(true)}
            onKeepLocal={() => handleSecretsConflictChoice(false)}
          />
        )}
        <input
          type="file"
          accept="image/*"
          ref={avatarFileInputRef}
          className="hidden"
          onChange={handleAvatarFileChange}
        />
        {renderMainContent()}
        <GlassEffectLab isOpen={openLabModal === "glassLab"} onClose={closeLabModal} />
        <FilmRollLab isOpen={openLabModal === "filmRollLab"} onClose={closeLabModal} />
        {openLabModal === "agentLab" ? (
          <React.Suspense fallback={null}>
            <AgentLab isOpen onClose={closeLabModal} />
          </React.Suspense>
        ) : null}
        {openLabModal === "cineworLab" ? (
          <React.Suspense fallback={null}>
            <CineworLab
              isOpen
              onClose={closeLabModal}
              projectData={projectData}
              setProjectData={setProjectData}
            />
          </React.Suspense>
        ) : null}
        {openLabModal === "designSystemLab" ? (
          <React.Suspense fallback={null}>
            <DesignSystemLab isOpen onClose={closeLabModal} />
          </React.Suspense>
        ) : null}
      </AppShell>
    </>
  );
};

const AccountMigrationGate: React.FC<{ accountScope: AccountScope }> = ({ accountScope }) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      migrateLegacyProductStorage(localStorage, accountScope);
      const markerKey = `${LEGACY_MIGRATION_MARKER_PREFIX}:${encodeURIComponent(accountScope)}`;
      if (localStorage.getItem(markerKey)) {
        setReady(true);
        return;
      }
      const hasLegacyState = [
        PROJECT_STORAGE_KEY,
        CONFIG_STORAGE_KEY,
        LOCAL_BACKUP_KEY,
        REMOTE_BACKUP_KEY,
        AVATAR_STORAGE_KEY,
        "stylo_conversations_v1",
        "stylo_messages_v1",
        LEGACY_PRODUCT_STORAGE.project,
        LEGACY_PRODUCT_STORAGE.config,
        LEGACY_PRODUCT_STORAGE.localBackup,
        LEGACY_PRODUCT_STORAGE.remoteBackup,
        LEGACY_PRODUCT_STORAGE.avatar,
        LEGACY_PRODUCT_STORAGE.conversationsV1,
        LEGACY_PRODUCT_STORAGE.messagesV1,
      ].some((key) => localStorage.getItem(key) !== null) ||
        Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
          .some(isUnscopedLegacyStyloKey);
      if (!hasLegacyState) {
        localStorage.setItem(markerKey, "none");
        setReady(true);
        return;
      }

      const destination = accountScope === "guest" ? "访客空间" : "当前登录账号";
      const shouldImport = window.confirm(
        `检测到升级前的本地项目或对话。是否将它们导入${destination}？\n\n` +
        "选择取消会将旧数据保持隔离，不会在访客或其他账号中自动显示。"
      );
      if (shouldImport) {
        migrateLegacyProductStorage(localStorage, accountScope, { includeUnscoped: true });
        migrateLegacyLocalState(accountScope);
      }
      localStorage.setItem(markerKey, shouldImport ? "imported" : "quarantined");
    } catch (error) {
      console.warn("Legacy local data migration was unavailable", error);
    } finally {
      setReady(true);
    }
  }, [accountScope]);

  return ready ? <ScopedApp key={accountScope} accountScope={accountScope} /> : null;
};

const App: React.FC = () => {
  const { isSignedIn: userSignedIn, user, isLoaded: isUserLoaded } = useUser();
  const { isLoaded: isAuthLoaded, isSignedIn: authSignedIn, userId: authUserId } = useAuth();

  if (!isUserLoaded || !isAuthLoaded) return null;

  const userStateId = user?.id || null;
  const fullySignedOut = !userSignedIn && !authSignedIn && !userStateId && !authUserId;
  if (fullySignedOut) {
    return <AccountMigrationGate key="guest" accountScope="guest" />;
  }

  const identityIsConsistent = Boolean(
    userSignedIn &&
    authSignedIn &&
    userStateId &&
    authUserId &&
    userStateId === authUserId
  );
  if (!identityIsConsistent) return null;

  const accountScope: AccountScope = `user:${userStateId}`;
  return <AccountMigrationGate key={accountScope} accountScope={accountScope} />;
};

export default App;
