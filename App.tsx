
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useUser, useClerk, useAuth } from './lib/auth';
import { ProjectData, AppConfig, Episode, ActiveTab, SyncState, SyncStatus } from './types';
import { INITIAL_PROJECT_DATA, INITIAL_VIDEO_CONFIG, INITIAL_TEXT_CONFIG, INITIAL_MULTIMODAL_CONFIG } from './constants';
import {
  parseScriptToEpisodes,
} from './utils/parser';
import { normalizeProjectData } from './utils/projectData';
import { dropFileReplacer, isProjectEmpty, backupData, FORCE_CLOUD_CLEAR_KEY } from './utils/persistence';
import { getDeviceId } from './utils/device';
import { hashToBucket, isInRollout, normalizeRolloutPercent } from './utils/rollout';
import { buildApiUrl } from './utils/api';
import { ensureStableId } from './utils/id';
import { usePersistedState } from './hooks/usePersistedState';
import { useCloudSync } from './hooks/useCloudSync';
import { useConfig } from './hooks/useConfig';
import { useTheme } from './hooks/useTheme';
import { useSecretsSync } from './hooks/useSecretsSync';
import { AppShell } from './components/layout/AppShell';
import { ConflictModal } from './components/ConflictModal';
import { SyncStatusBanner } from './components/SyncStatusBanner';
import { ScriptWorkspace } from './node-workspace/components/NodeFlow';
import type { NodeFlowNodeDefaults } from './node-workspace/types';
import type { AgentSettingsPanelKey } from './node-workspace/components/AgentSettingsPanel';
import { GlassEffectLab } from './node-workspace/components/GlassEffectLab';
import { LandingPage } from './components/LandingPage';
import type { ModuleKey } from './node-workspace/components/ModuleBar';
import * as ResponsesTextService from './services/responsesTextService';
import { useNodeFlowStore } from './node-workspace/store/nodeFlowStore';
import {
  buildPersonRolesFromAnalysis,
  buildSceneRolesFromAnalysis,
  projectRolesToCharacters,
  projectRolesToLocations,
  replaceRolesByKind,
} from './utils/projectRoles';

type LabModalKey = ModuleKey;

// --- Helpers: Character stats derived from parsed episodes ---
const buildCharacterStats = (episodes: Episode[]) => {
  const stats = new Map<
    string,
    {
      count: number;
      episodeIds: Set<number>;
    }
  >();

  episodes.forEach((ep) => {
    (ep.characters || []).forEach((rawName) => {
      const name = rawName.trim();
      if (!name) return;
      if (!stats.has(name)) {
        stats.set(name, { count: 0, episodeIds: new Set<number>() });
      }
      const entry = stats.get(name)!;
      entry.count += 1;
      entry.episodeIds.add(ep.id);
    });
  });

  return stats;
};

const formatEpisodeUsage = (episodeIds: Set<number>) => {
  const sorted = Array.from(episodeIds).sort((a, b) => a - b);
  if (!sorted.length) return "";
  return sorted.map((id) => `Ep${id}`).join(", ");
};
const normalizeFormsWithIds = (forms: any[]) =>
  (forms || []).map((form) => ({ ...form, id: ensureStableId(form?.id, "form") }));
const normalizeZonesWithIds = (zones: any[]) =>
  (zones || []).map((zone) => ({ ...zone, id: ensureStableId(zone?.id, "zone") }));

const ensureCharacterDefaultForms = (
  characterName: string,
  forms: any[],
  episodeUsage?: string,
  ensureDefault: boolean = true
) => {
  const normalized = normalizeFormsWithIds(forms || []).map((form) => {
    const baseName = (form.formName || "默认").trim() || "默认";
    const prefixed = baseName.startsWith(`${characterName}-`) ? baseName : `${characterName}-${baseName}`;
    return {
      ...form,
      formName: prefixed,
      episodeRange: form.episodeRange || episodeUsage || "Whole Series",
      description: form.description || "",
      visualTags: form.visualTags || "",
    };
  });

  if (normalized.length > 0) return normalized;

  if (!ensureDefault) return [];

  return [
    {
      id: ensureStableId(undefined, "form"),
      formName: `${characterName}-默认`,
      episodeRange: episodeUsage || "Whole Series",
      description: "",
      visualTags: "",
    },
  ];
};

const mergeCharacterFormsByName = (
  characterName: string,
  currentForms: any[],
  incomingForms: any[],
  episodeUsage?: string,
  options?: { ensureDefault?: boolean }
) => {
  const ensureDefault = options?.ensureDefault ?? true;
  const normalizeName = (name: string) => {
    const trimmed = (name || "默认").trim() || "默认";
    return trimmed.startsWith(`${characterName}-`) ? trimmed : `${characterName}-${trimmed}`;
  };

  const current = ensureCharacterDefaultForms(characterName, currentForms, episodeUsage, ensureDefault);
  const incoming = ensureCharacterDefaultForms(characterName, incomingForms, episodeUsage, ensureDefault);

  const map = new Map<string, any>();
  current.forEach((form) => {
    map.set(normalizeName(form.formName).toLowerCase(), {
      ...form,
      formName: normalizeName(form.formName),
    });
  });

  incoming.forEach((form) => {
    const key = normalizeName(form.formName).toLowerCase();
    const prev = map.get(key);
    map.set(key, {
      ...(prev || {}),
      ...form,
      id: prev?.id || ensureStableId(form?.id, "form"),
      formName: normalizeName(form.formName),
      episodeRange: form.episodeRange || prev?.episodeRange || episodeUsage || "Whole Series",
      description: form.description || prev?.description || "",
      visualTags: form.visualTags || prev?.visualTags || "",
    });
  });

  return Array.from(map.values());
};

const buildLocationSeedsFromScenes = (episodes: Episode[], existingLocations: any[] = []) => {
  const existingByName = new Map<string, any>(
    (existingLocations || []).map((loc) => [loc.name, loc])
  );

  const map = new Map<
    string,
    {
      name: string;
      episodeIds: Set<number>;
      partitions: Map<string, Set<number>>;
      count: number;
    }
  >();

  episodes.forEach((ep) => {
    (ep.scenes || []).forEach((scene) => {
      const sceneName = (scene.title || scene.metadata?.rawTitle || "").trim();
      if (!sceneName) return;
      const defaultPartition = `${sceneName}-默认`;
      const partitionName = (scene.partition || defaultPartition).trim() || defaultPartition;
      if (!map.has(sceneName)) {
        map.set(sceneName, {
          name: sceneName,
          episodeIds: new Set<number>(),
          partitions: new Map<string, Set<number>>(),
          count: 0,
        });
      }
      const entry = map.get(sceneName)!;
      entry.count += 1;
      entry.episodeIds.add(ep.id);
      if (!entry.partitions.has(partitionName)) {
        entry.partitions.set(partitionName, new Set<number>());
      }
      entry.partitions.get(partitionName)!.add(ep.id);
    });
  });

  const seeds = Array.from(map.values()).map((entry) => {
    const episodeUsage = formatEpisodeUsage(entry.episodeIds);
    const defaultZoneName = `${entry.name}-默认`;
    const parsedZones = Array.from(entry.partitions.entries()).map(([name, epIds]) => ({
      id: ensureStableId(undefined, "zone"),
      name,
      kind: "unspecified" as const,
      episodeRange: formatEpisodeUsage(epIds) || episodeUsage || "Whole Series",
      layoutNotes: "",
      keyProps: "",
      lightingWeather: "",
      materialPalette: "",
    }));

    const baseZones = parsedZones.length
      ? parsedZones
      : [
          {
            id: ensureStableId(undefined, "zone"),
            name: defaultZoneName,
            kind: "unspecified" as const,
            episodeRange: episodeUsage || "Whole Series",
            layoutNotes: "",
            keyProps: "",
            lightingWeather: "",
            materialPalette: "",
          },
        ];

    const existing = existingByName.get(entry.name);
    const existingZones = ensureLocationDefaultZones(entry.name, existing?.zones || [], existing?.episodeUsage || episodeUsage, true);
    const zoneMap = new Map<string, any>();
    [...existingZones, ...baseZones].forEach((zone) => {
      const zoneName = (zone.name || defaultZoneName).trim() || defaultZoneName;
      zoneMap.set(zoneName.toLowerCase(), { ...zone, name: zoneName });
    });

    return {
      id: existing?.id || entry.name,
      name: entry.name,
      type: existing?.type || "secondary",
      description: existing?.description || "",
      visuals: existing?.visuals || "",
      assetPriority: existing?.assetPriority,
      appearanceCount: existing?.appearanceCount ?? entry.count,
      episodeUsage: existing?.episodeUsage || episodeUsage,
      zones: Array.from(zoneMap.values()),
    };
  });

  // Preserve any existing locations that might not be present in parsed scenes.
  const seedNames = new Set(seeds.map((s) => s.name));
  const preservedExisting = (existingLocations || []).filter(
    (loc) => loc?.name && !seedNames.has(loc.name)
  ).map((loc) => ({
    ...loc,
    id: loc.id || loc.name,
    episodeUsage: loc.episodeUsage || "Whole Series",
    appearanceCount: loc.appearanceCount,
    zones: ensureLocationDefaultZones(loc.name, loc.zones || [], loc.episodeUsage, true),
  }));

  return [...seeds, ...preservedExisting];
};

const ensureLocationDefaultZones = (
  locationName: string,
  zones: any[],
  episodeUsage?: string,
  ensureDefault: boolean = true
) => {
  const defaultZoneName = `${locationName}-默认`;
  const normalized = normalizeZonesWithIds(zones || []).map((zone) => ({
    ...zone,
    name: (zone.name || defaultZoneName).trim() || defaultZoneName,
    kind: zone.kind || "unspecified",
    episodeRange: zone.episodeRange || episodeUsage || "Whole Series",
    layoutNotes: zone.layoutNotes || "",
    keyProps: zone.keyProps || "",
    lightingWeather: zone.lightingWeather || "",
    materialPalette: zone.materialPalette || "",
  }));

  if (normalized.length > 0) return normalized;
  if (!ensureDefault) return [];

  return [
    {
      id: ensureStableId(undefined, "zone"),
      name: defaultZoneName,
      kind: "unspecified" as const,
      episodeRange: episodeUsage || "Whole Series",
      layoutNotes: "",
      keyProps: "",
      lightingWeather: "",
      materialPalette: "",
    },
  ];
};

const mergeLocationZonesByName = (
  locationName: string,
  currentZones: any[],
  incomingZones: any[],
  episodeUsage?: string,
  options?: { ensureDefault?: boolean }
) => {
  const ensureDefault = options?.ensureDefault ?? true;
  const defaultZoneName = `${locationName}-默认`;
  const current = ensureLocationDefaultZones(locationName, currentZones, episodeUsage, ensureDefault);
  const incoming = ensureLocationDefaultZones(locationName, incomingZones, episodeUsage, ensureDefault);
  const map = new Map<string, any>();

  current.forEach((zone) => {
    const zoneName = (zone.name || defaultZoneName).trim() || defaultZoneName;
    map.set(zoneName.toLowerCase(), { ...zone, name: zoneName });
  });

  incoming.forEach((zone) => {
    const zoneName = (zone.name || defaultZoneName).trim() || defaultZoneName;
    const key = zoneName.toLowerCase();
    const prev = map.get(key);
    map.set(key, {
      ...(prev || {}),
      ...zone,
      id: prev?.id || ensureStableId(zone?.id, "zone"),
      name: zoneName,
      kind: zone.kind || prev?.kind || "unspecified",
      episodeRange: zone.episodeRange || prev?.episodeRange || episodeUsage || "Whole Series",
      layoutNotes: zone.layoutNotes || prev?.layoutNotes || "",
      keyProps: zone.keyProps || prev?.keyProps || "",
      lightingWeather: zone.lightingWeather || prev?.lightingWeather || "",
      materialPalette: zone.materialPalette || prev?.materialPalette || "",
    });
  });

  return Array.from(map.values());
};

const PROJECT_STORAGE_KEY = 'qalam_project_v1';
const CONFIG_STORAGE_KEY = 'qalam_config_v1';
const UI_STATE_STORAGE_KEY = 'qalam_ui_state_v1';
const THEME_STORAGE_KEY = 'qalam_theme_v1';
const NODEFLOW_STORAGE_KEY = 'qalam_nodeflow_v1';
const LOCAL_BACKUP_KEY = 'qalam_local_backup';
const REMOTE_BACKUP_KEY = 'qalam_remote_backup';
const LANDING_ROUTE_HASH = "#/landing";

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

const isJwtExpiredOrNearExpiry = (token: string, leewayMs = 30_000) => {
  const expiresAt = decodeJwtExpiry(token);
  if (!expiresAt) return false;
  return expiresAt - Date.now() <= leewayMs;
};

const App: React.FC = () => {
  // Clerk Auth Hooks
  const { isSignedIn: userSignedIn, user, isLoaded: isUserLoaded } = useUser();
  const { openSignIn, signOut } = useClerk();
  const { getToken, isLoaded: isAuthLoaded, isSignedIn: authSignedIn } = useAuth();
  const getAuthToken = useCallback(async (options?: { skipCache?: boolean }) => {
    try {
      const token = await getToken({ template: "default", ...(options?.skipCache ? { skipCache: true } : {}) });
      if (!token) return null;
      if (!options?.skipCache && isJwtExpiredOrNearExpiry(token)) {
        return await getToken({ template: "default", skipCache: true });
      }
      return token;
    } catch {
      return null;
    }
  }, [getToken]);
  const projectDataRef = useRef<ProjectData>(INITIAL_PROJECT_DATA);

  // Initialize state with Persisted hooks
  const [projectData, setProjectDataRaw] = usePersistedState<ProjectData>({
    key: PROJECT_STORAGE_KEY,
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

  const { config, setConfig } = useConfig(CONFIG_STORAGE_KEY);
  const projectCharacters = useMemo(
    () => projectRolesToCharacters(projectData.roles || []),
    [projectData.roles]
  );
  const projectLocations = useMemo(
    () => projectRolesToLocations(projectData.roles || []),
    [projectData.roles]
  );

  const { isDarkMode, setIsDarkMode, toggleTheme } = useTheme(THEME_STORAGE_KEY, true);
  const setAppConfigStore = useNodeFlowStore(state => state.setAppConfig);
  const addWorkflowNode = useNodeFlowStore(state => state.addNode);
  const workflowNodes = useNodeFlowStore(state => state.nodes);
  const workflowViewport = useNodeFlowStore(state => state.viewport);
  const workflowNodeDefaults = useNodeFlowStore(state => state.nodeDefaults);
  const clearNodeFlow = useNodeFlowStore(state => state.clearNodeFlow);
  const setWorkflowNodeDefaults = useNodeFlowStore(state => state.setNodeDefaults);
  const hasHydratedNodeDefaultsRef = useRef(false);
  const lastNodeDefaultsSerializedRef = useRef<string | null>(null);

  useEffect(() => {
    setAppConfigStore(config);
  }, [config, setAppConfigStore]);

  useEffect(() => {
    try {
      const remoteNodeDefaults = (projectData.nodeDefaults || {}) as NodeFlowNodeDefaults;
      const serialized = JSON.stringify(remoteNodeDefaults);
      if (serialized === lastNodeDefaultsSerializedRef.current) {
        hasHydratedNodeDefaultsRef.current = true;
        return;
      }
      hasHydratedNodeDefaultsRef.current = true;
      lastNodeDefaultsSerializedRef.current = serialized;
      setWorkflowNodeDefaults(remoteNodeDefaults);
    } catch (e) {
      console.warn("Failed to restore node defaults from project data", e);
    }
  }, [projectData.nodeDefaults, setWorkflowNodeDefaults]);

  useEffect(() => {
    if (!hasHydratedNodeDefaultsRef.current) return;
    const timeout = window.setTimeout(() => {
      try {
        const serialized = JSON.stringify(workflowNodeDefaults || {});
        lastNodeDefaultsSerializedRef.current = serialized;
        setProjectData((prev) => {
          try {
            const prevSerialized = JSON.stringify(prev.nodeDefaults || {});
            if (prevSerialized === serialized) return prev;
          } catch {
            // Fall through and overwrite with the latest node defaults.
          }
          return {
            ...prev,
            nodeDefaults: (workflowNodeDefaults || {}) as NodeFlowNodeDefaults,
          };
        });
      } catch (e) {
        console.warn("Failed to persist node defaults", e);
      }
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [workflowNodeDefaults, setProjectData]);

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

  const [uiState, setUiState] = usePersistedState<{
    currentEpIndex: number;
    activeTab: ActiveTab;
  }>({
    key: UI_STATE_STORAGE_KEY,
    initialValue: { currentEpIndex: 0, activeTab: 'lab' },
    deserialize: (value) => {
      const parsed = JSON.parse(value);
      const parsedActiveTab = parsed.activeTab;
      return {
        currentEpIndex: parsed.currentEpIndex ?? 0,
        activeTab:
          parsedActiveTab === 'visuals' ||
          parsedActiveTab === 'video' ||
          parsedActiveTab === 'lab' ||
          parsedActiveTab === 'stats'
            ? parsedActiveTab
            : 'lab'
      };
    },
    serialize: (value) => JSON.stringify(value)
  });

  const [currentEpIndex, setCurrentEpIndex] = useState(uiState.currentEpIndex);
  const [activeTab, setActiveTab] = useState<ActiveTab>(uiState.activeTab);
  const [processingState, setProcessingState] = useState<{ active: boolean; status: string }>({ active: false, status: "" });
  const isProcessing = processingState.active;
  const processingStatus = processingState.status;
  const setProcessing = useCallback((active: boolean, status = "") => {
    setProcessingState({ active, status });
  }, []);

  // Force Lab as the sole surface (no top tab selector)
  useEffect(() => {
    if (activeTab !== 'lab') {
      setActiveTab('lab');
    }
  }, [activeTab, setActiveTab]);

  // Keep persisted uiState in sync with reducer core fields
  useEffect(() => {
    setUiState(prev => ({
      ...prev,
      currentEpIndex,
      activeTab
    }));
  }, [currentEpIndex, activeTab, setUiState]);

  const [appView, setAppView] = useState<"main" | "landing">(() => readAppViewFromLocation());
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
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

  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [splitTab, setSplitTab] = useState<ActiveTab | null>(null);
  const [isSplitMenuOpen, setIsSplitMenuOpen] = useState(false);
  const [openLabModal, setOpenLabModal] = useState<LabModalKey | null>(null);
  const [agentSettingsRequest, setAgentSettingsRequest] = useState<{ panel: AgentSettingsPanelKey; nonce: number } | null>(null);
  const [isSyncBannerDismissed, setIsSyncBannerDismissed] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = usePersistedState<string>({
    key: 'qalam_avatar_url',
    initialValue: '',
    deserialize: (v) => JSON.parse(v),
    serialize: (v) => JSON.stringify(v)
  });
  const hasFetchedProfileAvatar = useRef(false);
  const syncRollout = useMemo(() => {
    const percent = normalizeRolloutPercent(import.meta.env.VITE_SYNC_ROLLOUT_PERCENT);
    const salt = import.meta.env.VITE_SYNC_ROLLOUT_SALT || "";
    const allowlistRaw = import.meta.env.VITE_SYNC_ROLLOUT_ALLOWLIST || "";
    const allowlist = allowlistRaw.split(",").map((value) => value.trim()).filter(Boolean);
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

  const openAgentSettings = useCallback((panel: AgentSettingsPanelKey = "provider") => {
    setAgentSettingsRequest({ panel, nonce: Date.now() });
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
      openAgentSettings("assets");
      return;
    }
    if (key === 'scenes') {
      openAgentSettings("assets");
      return;
    }
    setOpenLabModal(key);
  }, [openAgentSettings]);

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
    isSignedIn: !!authSignedIn && isSyncFeatureEnabled,
    isLoaded: isAuthLoaded,
    getToken: getAuthToken,
    projectData,
    setProjectData,
    setHasLoadedRemote,
    hasLoadedRemote,
    refreshKey: syncRefreshKey,
    localBackupKey: LOCAL_BACKUP_KEY,
    remoteBackupKey: REMOTE_BACKUP_KEY,
    onError: handleCloudSyncError,
    onStatusChange: updateProjectSyncStatus,
    onConflictConfirm: requestConflictResolution,
    onConflictNotice: requestConflictNotice,
    saveDebounceMs: 1200
  });

  useSecretsSync({
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

  // Clamp current episode index when episodes change (e.g., after remote sync)
  useEffect(() => {
    if (projectData.episodes.length === 0) {
      setCurrentEpIndex(0);
    } else if (currentEpIndex >= projectData.episodes.length) {
      setCurrentEpIndex(0);
    }
  }, [projectData.episodes.length]);

  // --- Helper: Stats Updater ---
  const updateStats = (phase: 'context', success: boolean) => {
    setProjectData(prev => {
      const stats = { ...prev.stats };
      const current = stats[phase] || { total: 0, success: 0, error: 0 };
      const next = {
        total: current.total + 1,
        success: current.success + (success ? 1 : 0),
        error: current.error + (success ? 0 : 1)
      };
      stats[phase] = next;
      return { ...prev, stats };
    });
  };


  // --- Handlers ---

  const handleResetProject = () => {
    if (window.confirm("确认清空整个项目吗？\n\n这会清空本地与云端的项目数据（脚本、镜头、生成内容等），且不可恢复。")) {
      localStorage.setItem(FORCE_CLOUD_CLEAR_KEY, "1");
      setProjectData(INITIAL_PROJECT_DATA);
      clearNodeFlow();
      setCurrentEpIndex(0);
      setActiveTab('lab');
      localStorage.removeItem(PROJECT_STORAGE_KEY);
      localStorage.removeItem(NODEFLOW_STORAGE_KEY);
      localStorage.removeItem(UI_STATE_STORAGE_KEY);
      localStorage.removeItem(LOCAL_BACKUP_KEY);
      localStorage.removeItem(REMOTE_BACKUP_KEY);
      setAvatarUrl('');
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
      const res = await fetch(buildApiUrl('/api/upload-url'), {
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
        const token = await getAuthToken();
        if (token) {
          await fetch(buildApiUrl('/api/profile'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({ avatarUrl: storedUrl })
          });
        }
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

  const handleAssetLoad = (
    type:
      | 'script',
    content: string,
    fileName?: string
  ) => {
    if (type === 'script') {
      const episodes = parseScriptToEpisodes(content);
      const stats = buildCharacterStats(episodes);
      setProjectData(prev => {
        const existingChars = projectRolesToCharacters(prev.roles || []);
        const existingNames = new Set(existingChars.map(c => c.name));

        // Update existing characters with fresh stats
        const updatedExisting = existingChars.map((c) => {
          const stat = stats.get(c.name);
          if (!stat) return c;
          const appearanceCount = stat.count;
          const episodeUsage = formatEpisodeUsage(stat.episodeIds);
          return {
            ...c,
            appearanceCount,
            episodeUsage,
            isMain: c.isMain,
            assetPriority: (c.assetPriority || (appearanceCount > 1 ? "medium" : "low")) as "low" | "medium" | "high",
          };
        });

        // Add any new characters parsed from script
        let counter = 0;
        const newChars = Array.from(stats.entries())
          .filter(([name]) => name && !existingNames.has(name))
          .map(([name, stat]) => ({
            id: `char-script-${Date.now()}-${counter++}`,
            name,
            role: "",
            isMain: false,
            bio: "",
            forms: [],
            appearanceCount: stat.count,
            episodeUsage: formatEpisodeUsage(stat.episodeIds),
            assetPriority: (stat.count > 1 ? "medium" : "low") as "low" | "medium" | "high",
          }));

        return {
          ...prev,
          fileName: fileName || 'script.txt',
          rawScript: content,
          episodes,
          roles: replaceRolesByKind(
            prev.roles || [],
            'person',
            buildPersonRolesFromAnalysis([...updatedExisting, ...newChars])
          ),
        };
      });
      if (episodes.length > 0) setCurrentEpIndex(0);
      setActiveTab('lab');
    }
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
    if (activeTab !== 'lab') setActiveTab('lab');

    const existing = workflowNodes.find(
      (node) => node.type === 'identityCard' && (node.data as any).identityId === identityId
    );

    if (existing) {
      useNodeFlowStore.setState((state) => ({
        nodes: state.nodes.map((node) => ({
          ...node,
          selected: node.id === existing.id,
        })),
      }));
      return;
    }

    const zoom = workflowViewport?.zoom || 1;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 960;
    const position = workflowViewport
      ? {
          x: (-workflowViewport.x + viewportWidth * 0.54) / zoom,
          y: (-workflowViewport.y + viewportHeight * 0.22) / zoom,
        }
      : { x: 280, y: 180 };

    addWorkflowNode('identityCard', position, undefined, {
      identityId,
      title: '身份证卡片',
    });
  }, [activeTab, addWorkflowNode, navigateToAppView, setActiveTab, workflowNodes, workflowViewport]);

  const renderTabContent = (tabKey: ActiveTab) => {
    switch (tabKey) {
      case 'lab':
        return (
          <div className="h-full">
            <ScriptWorkspace
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
              externalAgentSettingsRequest={agentSettingsRequest}
              onAssetLoad={handleAssetLoad}
              onOpenModule={handleOpenLabModule}
              syncIndicator={syncIndicator}
              onResetProject={handleResetProject}
              onSignOut={() => signOut()}
              accountInfo={{
                isLoaded: isUserLoaded,
                isSignedIn: !!userSignedIn,
                name: user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || "Qalam User",
                email: user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress,
                avatarUrl: avatarUrl || user?.imageUrl,
                onSignIn: () => openSignIn(),
                onSignOut: () => signOut(),
                onUploadAvatar: handleAvatarUploadClick,
              }}
            />
          </div>
        );
      default:
        return null;
    }
  };

  const renderMainContent = () => {
    if (splitTab) {
      return (
        <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-4 px-4 md:px-6 pb-4 overflow-hidden">
          <div className="min-h-0 overflow-hidden rounded-2xl border border-[var(--border-subtle)]/60 bg-[var(--bg-panel)]/60">
            <div className="h-full overflow-auto">{renderTabContent(activeTab)}</div>
          </div>
          <div className="min-h-0 overflow-hidden rounded-2xl border border-[var(--border-subtle)]/60 bg-[var(--bg-panel)]/60">
            <div className="h-full overflow-auto">{renderTabContent(splitTab)}</div>
          </div>
        </div>
      );
    }

    return renderTabContent(activeTab);
  };

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
              onOpenDetails={() => openAgentSettings("sync")}
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
      </AppShell>
    </>
  );
};

export default App;
