
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useUser, useClerk, useAuth } from './lib/auth';
import { FlowState, ProjectData, SyncState, SyncStatus } from './types';
import { INITIAL_PROJECT_DATA } from './constants';
import { normalizeProjectData } from './utils/projectData';
import { FORCE_CLOUD_CLEAR_KEY } from './utils/persistence';
import { getDeviceId } from './utils/device';
import { hashToBucket, isInRollout, normalizeRolloutPercent } from './utils/rollout';
import { buildApiUrl } from './utils/api';
import { setApiAuthTokenProvider } from './utils/authToken';
import { usePersistedState } from './hooks/usePersistedState';
import { useCloudSync } from './hooks/useCloudSync';
import { useConfig } from './hooks/useConfig';
import { useTheme } from './hooks/useTheme';
import { useSecretsSync } from './hooks/useSecretsSync';
import { AppShell } from './components/layout/AppShell';
import { ConflictModal } from './components/ConflictModal';
import { SyncStatusBanner } from './components/SyncStatusBanner';
import { CreativeWorkspace } from './node-workspace/components/CreativeWorkspace';
import { resetNodeFlowAccountState } from './node-workspace/store/nodeFlowStore';
import type { ProjectSettingsPanelKey } from './node-workspace/components/ProjectSettingsPanel';
import { GlassEffectLab } from './node-workspace/components/GlassEffectLab';
import { FilmRollLab } from './node-workspace/components/FilmRollLab';
import { LandingPage } from './components/LandingPage';
import type { ModuleKey } from './node-workspace/components/ModuleBar';
import {
  buildQalamAccountStorageKeys,
  DEFAULT_QALAM_PROJECT_ID,
  QALAM_ACTIVITY_STORAGE_PREFIX,
  QALAM_CONVERSATION_STORAGE_PREFIX,
} from './agents/runtime/projectScope';

const AgentLab = React.lazy(() =>
  import('./node-workspace/components/AgentLab').then((module) => ({ default: module.AgentLab }))
);

type LabModalKey = ModuleKey;

const PROJECT_STORAGE_KEY = 'qalam_project_v1';
const CONFIG_STORAGE_KEY = 'qalam_config_v1';
const THEME_STORAGE_KEY = 'qalam_theme_v1';
const LOCAL_BACKUP_KEY = 'qalam_local_backup';
const REMOTE_BACKUP_KEY = 'qalam_remote_backup';
const AVATAR_STORAGE_KEY = 'qalam_avatar_url';
const LANDING_ROUTE_HASH = "#/landing";

type AccountScope = "guest" | `user:${string}`;

const buildAccountStorageKey = (baseKey: string, accountScope: AccountScope) =>
  `${baseKey}:${encodeURIComponent(accountScope)}`;

const LEGACY_MIGRATION_MARKER_PREFIX = "qalam_legacy_migration_v1";

const isUnscopedLegacyQalamKey = (key: string | null) => {
  if (!key) return false;
  const prefix = key.startsWith(`${QALAM_CONVERSATION_STORAGE_PREFIX}:`)
    ? QALAM_CONVERSATION_STORAGE_PREFIX
    : key.startsWith(`${QALAM_ACTIVITY_STORAGE_PREFIX}:`)
      ? QALAM_ACTIVITY_STORAGE_PREFIX
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
  if (!rawProject) return DEFAULT_QALAM_PROJECT_ID;
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
  return DEFAULT_QALAM_PROJECT_ID;
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
    const prefix = key.startsWith(`${QALAM_CONVERSATION_STORAGE_PREFIX}:`)
      ? QALAM_CONVERSATION_STORAGE_PREFIX
      : key.startsWith(`${QALAM_ACTIVITY_STORAGE_PREFIX}:`)
        ? QALAM_ACTIVITY_STORAGE_PREFIX
        : null;
    if (!prefix || !isUnscopedLegacyQalamKey(key)) continue;
    const encodedScope = key.slice(prefix.length + 1);
    let legacyProjectScope = "";
    try {
      legacyProjectScope = decodeURIComponent(encodedScope);
    } catch {
      continue;
    }
    const targetKeys = buildQalamAccountStorageKeys(accountScope, legacyProjectScope);
    const targetKey = prefix === QALAM_CONVERSATION_STORAGE_PREFIX
      ? targetKeys.conversationStorageKey
      : targetKeys.activityStorageKey;
    const value = localStorage.getItem(key);
    if (value !== null && localStorage.getItem(targetKey) === null) localStorage.setItem(targetKey, value);
    localStorage.removeItem(key);
  }

  const targetConversationKey = buildQalamAccountStorageKeys(accountScope, projectId).conversationStorageKey;
  if (localStorage.getItem(targetConversationKey) === null) {
    const legacyConversation = localStorage.getItem("qalam_conversations_v1");
    const legacyMessages = localStorage.getItem("qalam_messages_v1");
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
  localStorage.removeItem("qalam_conversations_v1");
  localStorage.removeItem("qalam_messages_v1");
};

const readAppViewFromLocation = (): "main" | "landing" => {
  if (typeof window === "undefined") return "main";
  return window.location.hash === LANDING_ROUTE_HASH ? "landing" : "main";
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
  const setProjectData = useCallback(
    (value: React.SetStateAction<ProjectData>) => {
      setProjectDataRaw((prev) =>
        normalizeProjectData(typeof value === 'function' ? (value as (prevState: ProjectData) => ProjectData)(prev) : value)
      );
    },
    [setProjectDataRaw]
  );

  const { config, setConfig } = useConfig(configStorageKey);

  const { isDarkMode, setIsDarkMode, toggleTheme } = useTheme(THEME_STORAGE_KEY, true);

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

  const [appView, setAppView] = useState<"main" | "landing">(() => readAppViewFromLocation());
  const [hasLoadedRemote, setHasLoadedRemote] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>({
    project: { status: 'idle' },
    secrets: { status: 'disabled' }
  });
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [syncRefreshKey, setSyncRefreshKey] = useState(0);
  const conflictQueueRef = useRef<Array<{ remote: ProjectData; local: ProjectData; resolve?: (useRemote: boolean) => void; mode: 'decision' | 'notice' }>>([]);
  const activeConflictRef = useRef<{ remote: ProjectData; local: ProjectData; resolve?: (useRemote: boolean) => void; mode: 'decision' | 'notice' } | null>(null);
  const [activeConflict, setActiveConflict] = useState<{ remote: ProjectData; local: ProjectData; resolve?: (useRemote: boolean) => void; mode: 'decision' | 'notice' } | null>(null);

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

  const openProjectSettings = useCallback((panel: ProjectSettingsPanelKey = "provider") => {
    setProjectSettingsRequest({ panel, nonce: Date.now() });
  }, []);
  useEffect(() => {
    const syncAppView = () => setAppView(readAppViewFromLocation());
    window.addEventListener("hashchange", syncAppView);
    window.addEventListener("popstate", syncAppView);
    return () => {
      window.removeEventListener("hashchange", syncAppView);
      window.removeEventListener("popstate", syncAppView);
    };
  }, []);

  const navigateToAppView = useCallback((nextView: "main" | "landing", mode: "push" | "replace" = "push") => {
    if (typeof window === "undefined") {
      setAppView(nextView);
      return;
    }
    const url = new URL(window.location.href);
    url.hash = nextView === "landing" ? "/landing" : "";
    window.history[mode === "replace" ? "replaceState" : "pushState"](null, "", url);
    setAppView(nextView);
  }, []);

  const openLandingPage = useCallback(() => {
    setOpenLabModal(null);
    navigateToAppView("landing");
  }, [navigateToAppView]);
  const closeLandingPage = useCallback(() => navigateToAppView("main"), [navigateToAppView]);

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
    activeConflictRef.current?.resolve?.(true);
    conflictQueueRef.current.forEach((item) => item.resolve?.(true));
    conflictQueueRef.current = [];
    activeConflictRef.current = null;
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
    const projectEnabled = authSignedIn && isSyncFeatureEnabled;
    const secretsEnabled = authSignedIn && isSyncFeatureEnabled && config.syncApiKeys;
    setSyncState(prev => ({
      project: projectEnabled ? (prev.project.status === 'disabled' ? { status: 'loading' } : prev.project) : { status: 'disabled' },
      secrets: secretsEnabled
        ? (prev.secrets.status === 'disabled' ? { status: 'loading' } : prev.secrets)
        : { status: 'disabled' }
    }));
  }, [authSignedIn, config.syncApiKeys, isSyncFeatureEnabled]);

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
      conflictQueueRef.current.push({ remote, local, resolve, mode: 'decision' });
      if (!activeConflictRef.current) {
        const next = conflictQueueRef.current.shift();
        if (next) setActiveConflict(next);
      }
    });
  }, []);

  const requestConflictNotice = useCallback(({ remote, local }: { remote: ProjectData; local: ProjectData }) => {
    conflictQueueRef.current.push({ remote, local, mode: 'notice' });
    if (!activeConflictRef.current) {
      const next = conflictQueueRef.current.shift();
      if (next) setActiveConflict(next);
    }
  }, []);

  const handleConflictChoice = useCallback((useRemote: boolean) => {
    if (!activeConflict || activeConflict.mode !== 'decision') return;
    activeConflict.resolve?.(useRemote);
    setActiveConflict(null);
    const next = conflictQueueRef.current.shift();
    if (next) setActiveConflict(next);
  }, [activeConflict]);

  const handleConflictAcknowledge = useCallback(() => {
    if (!activeConflict || activeConflict.mode !== 'notice') return;
    setActiveConflict(null);
    const next = conflictQueueRef.current.shift();
    if (next) setActiveConflict(next);
  }, [activeConflict]);


  // --- Cloud Sync (Clerk + Cloudflare Pages) ---
  useCloudSync({
    accountScope,
    isSignedIn: !!authSignedIn && isSyncFeatureEnabled,
    isLoaded: isAuthLoaded,
    getToken: getAuthToken,
    projectData,
    setProjectData,
    setHasLoadedRemote,
    hasLoadedRemote,
    refreshKey: syncRefreshKey,
    localBackupKey,
    remoteBackupKey,
    forceClearKey: forceCloudClearKey,
    onError: handleCloudSyncError,
    onStatusChange: updateProjectSyncStatus,
    onConflictConfirm: requestConflictResolution,
    onConflictNotice: requestConflictNotice,
    saveDebounceMs: 1200
  });

  useSecretsSync({
    accountScope,
    isSignedIn: !!authSignedIn && isSyncFeatureEnabled,
    isLoaded: isAuthLoaded,
    getToken: getAuthToken,
    config,
    setConfig,
    debounceMs: 1200,
    onStatusChange: updateSecretsSyncStatus
  });

  // Fetch avatar from profile (account-scoped) once per session
  useEffect(() => {
    const fetchProfile = async () => {
      if (!authSignedIn || !isAuthLoaded || hasFetchedProfileAvatar.current) return;
      try {
        const token = await getAuthToken();
        if (!token) return;
        hasFetchedProfileAvatar.current = true;
        const res = await fetch(buildApiUrl('/api/profile'), { headers: { authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          if (data.avatarUrl) setAvatarUrl(data.avatarUrl);
        }
      } catch (e) {
        console.warn('Fetch profile avatar failed', e);
      }
    };
    fetchProfile();
  }, [authSignedIn, isAuthLoaded, getAuthToken, setAvatarUrl]);

  // --- Handlers ---

  const handleResetProject = async () => {
    if (window.confirm("确认清空整个项目吗？\n\n这会清空本地与云端的项目数据（脚本、镜头、生成内容等），且不可恢复。")) {
      localStorage.setItem(forceCloudClearKey, "1");
      setProjectData(INITIAL_PROJECT_DATA);
      localStorage.removeItem(projectStorageKey);
      localStorage.removeItem(localBackupKey);
      localStorage.removeItem(remoteBackupKey);
      localStorage.removeItem(`${localBackupKey}_last_synced`);
      setAvatarUrl('');
      try {
        const token = await getAuthToken();
        if (token) {
          await fetch(buildApiUrl('/api/account-data-reset'), {
            method: 'DELETE',
            headers: { authorization: `Bearer ${token}` },
          });
        }
      } catch (error) {
        console.warn('Cloud project reset failed', error);
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
      const token = await getAuthToken();
      if (!token) {
        throw new Error('请先登录后再上传头像。');
      }
      const res = await fetch(buildApiUrl('/api/upload-url'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
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
        await fetch(buildApiUrl('/api/profile'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
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
    navigateToAppView('main');

    setProjectData((prev) => {
      const flow: FlowState = {
        flowNodes: [],
        links: [],
        ...(prev.flow || {}),
      };
      const flowNodes = Array.isArray(flow.flowNodes) ? flow.flowNodes : [];
      const existing = flowNodes.find(
        (node) => node.type === 'identityCard' && (node.data as any)?.identityId === identityId
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
              type: 'identityCard',
              position: { x: 280, y: 180 },
              data: {
                identityId,
                title: '身份卡片',
                avatarOverrides: {},
              },
            },
          ],
        },
      };
    });
  }, [navigateToAppView, setProjectData]);

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
        syncState={syncState}
        syncRollout={syncRollout}
        onForceSync={forceCloudPull}
        onOpenLanding={openLandingPage}
        externalProjectSettingsRequest={projectSettingsRequest}
        onOpenModule={handleOpenLabModule}
        syncIndicator={syncIndicator}
        onResetProject={handleResetProject}
        onSignOut={() => signOut()}
        accountInfo={{
          isLoaded: isUserLoaded,
          isSignedIn: !!userSignedIn,
          name: user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || "Qalam User",
          email: user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || undefined,
          avatarUrl: avatarUrl || user?.imageUrl || undefined,
          onSignIn: () => openSignIn(),
          onSignOut: () => signOut(),
          onUploadAvatar: handleAvatarUploadClick,
        }}
      />
    </div>
  );

  if (appView === "landing") {
    return <LandingPage isDarkMode={isDarkMode} onEnterApp={closeLandingPage} />;
  }

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
        {activeConflict && (
          <ConflictModal
            isOpen={!!activeConflict}
            remoteData={activeConflict.remote}
            localData={activeConflict.local}
            mode={activeConflict.mode}
            onUseRemote={activeConflict.mode === 'decision' ? () => handleConflictChoice(true) : undefined}
            onKeepLocal={activeConflict.mode === 'decision' ? () => handleConflictChoice(false) : undefined}
            onAcknowledge={activeConflict.mode === 'notice' ? handleConflictAcknowledge : undefined}
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
      </AppShell>
    </>
  );
};

const AccountMigrationGate: React.FC<{ accountScope: AccountScope }> = ({ accountScope }) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
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
        "qalam_conversations_v1",
        "qalam_messages_v1",
      ].some((key) => localStorage.getItem(key) !== null) ||
        Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
          .some(isUnscopedLegacyQalamKey);
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
      if (shouldImport) migrateLegacyLocalState(accountScope);
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
