
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useUser, useClerk, useAuth } from './lib/auth';
import { ProjectData, AppConfig, WorkflowStep, Episode, Shot, TokenUsage, AnalysisSubStep, VideoParams, ActiveTab, SyncState, SyncStatus, Character } from './types';
import { INITIAL_PROJECT_DATA, INITIAL_VIDEO_CONFIG, INITIAL_TEXT_CONFIG, INITIAL_MULTIMODAL_CONFIG } from './constants';
import {
  parseScriptToEpisodes,
  exportToCSV,
  exportToXLS,
  parseCSVToShots,
  exportUnderstandingToJSON,
  parseUnderstandingJSON
} from './utils/parser';
import { normalizeProjectData } from './utils/projectData';
import { dropFileReplacer, isProjectEmpty, backupData, FORCE_CLOUD_CLEAR_KEY } from './utils/persistence';
import { getDeviceId } from './utils/device';
import { hashToBucket, isInRollout, normalizeRolloutPercent } from './utils/rollout';
import { buildApiUrl } from './utils/api';
import { ensureStableId } from './utils/id';
import { usePersistedState } from './hooks/usePersistedState';
import { useCloudSync } from './hooks/useCloudSync';
import { useVideoPolling } from './hooks/useVideoPolling';
import { useConfig } from './hooks/useConfig';
import { useTheme } from './hooks/useTheme';
import { useWorkflowEngine } from './hooks/useWorkflowEngine';
import { useSecretsSync } from './hooks/useSecretsSync';
import { useShotGeneration } from './hooks/useShotGeneration';
import { useSoraGeneration } from './hooks/useSoraGeneration';
import { useStoryboardGeneration } from './hooks/useStoryboardGeneration';
import { AppShell } from './components/layout/AppShell';
import { WorkflowCard } from './components/layout/Header';
import { ConflictModal } from './components/ConflictModal';
import { SyncStatusBanner } from './components/SyncStatusBanner';
import { VideoModule } from './modules/video/VideoModule';
import { NodeFlow } from './node-workspace/components/NodeFlow';
import type { NodeFlowFile, NodeFlowNodeDefaults } from './node-workspace/types';
import { buildNodeFlowFile } from './node-workspace/nodeflow/serialization';
import { WritingPanel } from './node-workspace/components/WritingPanel';
import { WorkspacePanel, type WorkspaceSection } from './node-workspace/components/WorkspacePanel';
import { GlassEffectLab } from './node-workspace/components/GlassEffectLab';
import { ProjectorModule } from './components/ProjectorModule';
import { LandingPage } from './components/LandingPage';
import type { ModuleKey } from './node-workspace/components/ModuleBar';
import { FloatingPanelShell } from './node-workspace/components/FloatingPanelShell';
import * as ResponsesTextService from './services/responsesTextService';
import * as SoraService from './services/soraService';
import { useNodeFlowStore } from './node-workspace/store/nodeFlowStore';
import defaultShotGuide from './guides/ShotGuide.md?raw';
import defaultSoraGuide from './guides/PromptGuide.md?raw';
import defaultDramaGuide from './guides/DramaGuide.md?raw';
import defaultStoryboardGuide from './guides/Storyboard Guide.md?raw';
import {
  buildPersonRolesFromAnalysis,
  buildSceneRolesFromAnalysis,
  projectRolesToCharacters,
  projectRolesToLocations,
  replaceRolesByKind,
} from './utils/projectRoles';

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
    () => projectRolesToCharacters(projectData.context.roles || []) as Character[],
    [projectData.context.roles]
  );
  const projectLocations = useMemo(
    () => projectRolesToLocations(projectData.context.roles || []),
    [projectData.context.roles]
  );

  const { isDarkMode, setIsDarkMode, toggleTheme } = useTheme(THEME_STORAGE_KEY, true);
  const setAppConfigStore = useNodeFlowStore(state => state.setAppConfig);
  const addWorkflowNode = useNodeFlowStore(state => state.addNode);
  const workflowNodes = useNodeFlowStore(state => state.nodes);
  const workflowLinks = useNodeFlowStore(state => state.links);
  const workflowGraphLinks = useNodeFlowStore(state => state.graphLinks);
  const workflowLinkStyle = useNodeFlowStore(state => state.linkStyle);
  const workflowGlobalAssetHistory = useNodeFlowStore(state => state.globalAssetHistory);
  const workflowActiveView = useNodeFlowStore(state => state.activeView);
  const workflowViewport = useNodeFlowStore(state => state.viewport);
  const workflowNodeDefaults = useNodeFlowStore(state => state.nodeDefaults);
  const importNodeFlow = useNodeFlowStore(state => state.importNodeFlow);
  const clearNodeFlow = useNodeFlowStore(state => state.clearNodeFlow);
  const setWorkflowNodeDefaults = useNodeFlowStore(state => state.setNodeDefaults);
  const hasHydratedNodeFlowRef = useRef(false);
  const isApplyingProjectNodeFlowRef = useRef(false);
  const lastNodeFlowSerializedRef = useRef<string | null>(null);
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
    const remoteNodeFlow = projectData.nodeFlow;
    if (remoteNodeFlow && Array.isArray(remoteNodeFlow.nodes) && Array.isArray(remoteNodeFlow.links)) {
      try {
        const serialized = JSON.stringify(remoteNodeFlow);
        if (serialized === lastNodeFlowSerializedRef.current) {
          hasHydratedNodeFlowRef.current = true;
          return;
        }
        isApplyingProjectNodeFlowRef.current = true;
        hasHydratedNodeFlowRef.current = true;
        lastNodeFlowSerializedRef.current = serialized;
        importNodeFlow(remoteNodeFlow as NodeFlowFile);
        window.localStorage.setItem(NODEFLOW_STORAGE_KEY, serialized);
        window.setTimeout(() => {
          isApplyingProjectNodeFlowRef.current = false;
        }, 0);
        return;
      } catch (e) {
        console.warn("Failed to restore NodeFlow from project data", e);
      }
    }

    if (hasHydratedNodeFlowRef.current) return;
    hasHydratedNodeFlowRef.current = true;
    try {
      const raw = window.localStorage.getItem(NODEFLOW_STORAGE_KEY);
      if (!raw) return;
      lastNodeFlowSerializedRef.current = raw;
      const parsed = JSON.parse(raw) as NodeFlowFile;
      if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.links)) {
        importNodeFlow(parsed);
      }
    } catch (e) {
      console.warn("Failed to restore NodeFlow from local storage", e);
    }
  }, [importNodeFlow, projectData.nodeFlow]);

  useEffect(() => {
    if (!hasHydratedNodeFlowRef.current) return;
    const timeout = window.setTimeout(() => {
      try {
        const snapshot = buildNodeFlowFile({
          revision: useNodeFlowStore.getState().revision,
          nodes: workflowNodes,
          links: workflowLinks,
          graphLinks: workflowGraphLinks,
          linkStyle: workflowLinkStyle,
          globalAssetHistory: workflowGlobalAssetHistory,
          viewport: workflowViewport,
          activeView: workflowActiveView,
        });
        const serialized = JSON.stringify(snapshot);
        lastNodeFlowSerializedRef.current = serialized;
        window.localStorage.setItem(NODEFLOW_STORAGE_KEY, serialized);
        if (isApplyingProjectNodeFlowRef.current) return;
        setProjectData((prev) => {
          try {
            const prevSerialized = prev.nodeFlow ? JSON.stringify(prev.nodeFlow) : null;
            if (prevSerialized === serialized) return prev;
          } catch {
            // Fall through and overwrite with the latest snapshot.
          }
          return {
            ...prev,
            nodeFlow: snapshot,
          };
        });
      } catch (e) {
        console.warn("Failed to persist NodeFlow locally", e);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [
    workflowNodes,
    workflowLinks,
    workflowGraphLinks,
    workflowLinkStyle,
    workflowGlobalAssetHistory,
    workflowViewport,
    workflowActiveView,
    setProjectData,
  ]);

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
    step: WorkflowStep;
    analysisStep: AnalysisSubStep;
    currentEpIndex: number;
    activeTab: ActiveTab;
  }>({
    key: UI_STATE_STORAGE_KEY,
    initialValue: { step: WorkflowStep.IDLE, analysisStep: AnalysisSubStep.IDLE, currentEpIndex: 0, activeTab: 'lab' },
    deserialize: (value) => {
      const parsed = JSON.parse(value);
      const parsedActiveTab = parsed.activeTab;
      return {
        step: parsed.step ?? WorkflowStep.IDLE,
        analysisStep: parsed.analysisStep ?? AnalysisSubStep.IDLE,
        currentEpIndex: parsed.currentEpIndex ?? 0,
        activeTab:
          parsedActiveTab === 'understanding' ||
          parsedActiveTab === 'visuals' ||
          parsedActiveTab === 'video' ||
          parsedActiveTab === 'lab' ||
          parsedActiveTab === 'stats' ||
          parsedActiveTab === 'projector'
            ? parsedActiveTab
            : 'lab'
      };
    },
    serialize: (value) => JSON.stringify(value)
  });

  const workflow = useWorkflowEngine({
    step: uiState.step,
    analysisStep: uiState.analysisStep,
    currentEpIndex: uiState.currentEpIndex,
    activeTab: uiState.activeTab
  });

  const { state: wfState, setStep, setAnalysisStep, setCurrentEpIndex, setActiveTab, setProcessing, setStatus, setQueue, shiftQueue, resetWorkflow } = workflow;
  const { step, analysisStep, currentEpIndex, activeTab, isProcessing, processingStatus, analysisQueue, analysisTotal } = wfState;
  const [analysisError, setAnalysisError] = useState<{ step: AnalysisSubStep; message: string } | null>(null);

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
      step,
      analysisStep,
      currentEpIndex,
      activeTab
    }));
  }, [step, analysisStep, currentEpIndex, activeTab, setUiState]);

  useEffect(() => {
    setAnalysisError(null);
  }, [analysisStep]);

  const [appView, setAppView] = useState<"main" | "landing">(() => readAppViewFromLocation());
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [workflowAnchor, setWorkflowAnchor] = useState<DOMRect | null>(null);
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
  const [openLabModal, setOpenLabModal] = useState<ModuleKey | null>(null);
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>("understanding:overview");
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

  const openWorkspacePanel = useCallback((section: WorkspaceSection = "understanding:overview") => {
    setWorkspaceSection(section);
    setOpenLabModal("workspace");
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
    setShowWorkflow(false);
    navigateToAppView("landing");
  }, [navigateToAppView]);
  const closeLandingPage = useCallback(() => navigateToAppView("main"), [navigateToAppView]);

  const handleOpenLabModule = useCallback((key: ModuleKey) => {
    if (key === 'characters') {
      openWorkspacePanel("understanding:characters");
      return;
    }
    if (key === 'scenes') {
      openWorkspacePanel("understanding:scenes");
      return;
    }
    if (key === 'workspace') {
      openWorkspacePanel("understanding:overview");
      return;
    }
    setOpenLabModal(key);
  }, [openWorkspacePanel]);

  const closeLabModal = useCallback(() => {
    setOpenLabModal(null);
  }, []);

  // Processing Queues for Phase 1 Batches handled via reducer

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

  useVideoPolling<ProjectData>({
    episodes: projectData.episodes,
    videoConfig: config.videoConfig,
    onUpdate: (updater) => setProjectData(prev => updater(prev)),
    intervalMs: 5000,
    onError: (e) => console.warn("Video polling error", e)
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

  // --- GLOBAL VIDEO TASK POLLING LOOP ---
  useEffect(() => {
    const intervalId = setInterval(async () => {
      // Identify shots that need checking
      const tasksToCheck: { epId: number, shotId: string, taskId: string }[] = [];

      projectData.episodes.forEach(ep => {
        ep.shots.forEach(s => {
          if ((s.videoStatus === 'queued' || s.videoStatus === 'generating') && s.videoId) {
            tasksToCheck.push({ epId: ep.id, shotId: s.id, taskId: s.videoId });
          }
        });
      });

      if (tasksToCheck.length === 0) return;

      // Check tasks (limit concurrency if needed, but 5-10 concurrent requests usually ok)
      // We do them sequentially or in small batches to avoid flooding
      for (const task of tasksToCheck) {
        if (!config.videoConfig.baseUrl || !config.videoConfig.apiKey) continue;

        try {
          const result = await SoraService.checkSoraTaskStatus(task.taskId, config.videoConfig);

          // Only update state if status changed or URL became available
          if (result.status !== 'processing' && result.status !== 'queued') {
            setProjectData(prev => {
              const newEpisodes = prev.episodes.map(e => {
                if (e.id === task.epId) {
                  return {
                    ...e,
                    shots: e.shots.map(s => s.id === task.shotId ? {
                      ...s,
                      videoStatus: result.status === 'succeeded' ? 'completed' : 'error',
                      videoUrl: result.url,
                      videoErrorMsg: result.errorMsg,
                      // Keep start time for duration calc if needed
                    } : s)
                  } as Episode;
                }
                return e;
              });
              return { ...prev, episodes: newEpisodes };
            });
          }
          // If status changed from queued to processing, update that
          else if (result.status === 'processing') {
            setProjectData(prev => {
              const currentEp = prev.episodes.find(e => e.id === task.epId);
              const currentShot = currentEp?.shots.find(s => s.id === task.shotId);

              if (currentShot && currentShot.videoStatus === 'queued') {
                const newEpisodes = prev.episodes.map(e => {
                  if (e.id === task.epId) {
                    return {
                      ...e,
                      shots: e.shots.map(s => s.id === task.shotId ? {
                        ...s,
                        videoStatus: 'generating'
                      } : s)
                    } as Episode;
                  }
                  return e;
                });
                return { ...prev, episodes: newEpisodes };
              }
              return prev;
            });
          }
        } catch (e) {
          console.warn("Polling error for task " + task.taskId, e);
        }
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(intervalId);
  }, [projectData, config.videoConfig]);


  // Load default guides on mount (only if not already loaded)
  useEffect(() => {
    if (!projectData.shotGuide || !projectData.soraGuide || !projectData.dramaGuide || !projectData.storyboardGuide) {
      setProjectData(prev => ({
        ...prev,
        shotGuide: prev.shotGuide || defaultShotGuide,
        soraGuide: prev.soraGuide || defaultSoraGuide,
        dramaGuide: prev.dramaGuide || defaultDramaGuide,
        storyboardGuide: prev.storyboardGuide || defaultStoryboardGuide
      }));
    }
  }, []);

  // --- Helper: Stats Updater ---
  const updateStats = (phase: 'context' | 'shotGen' | 'soraGen' | 'storyboardGen', success: boolean) => {
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
      setStep(WorkflowStep.IDLE);
      setAnalysisStep(AnalysisSubStep.IDLE);
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
      | 'script'
      | 'globalStyleGuide'
      | 'shotGuide'
      | 'soraGuide'
      | 'storyboardGuide'
      | 'dramaGuide'
      | 'csvShots'
      | 'understandingJson',
    content: string,
    fileName?: string
  ) => {
    if (type === 'script') {
      const episodes = parseScriptToEpisodes(content);
      const stats = buildCharacterStats(episodes);
      setProjectData(prev => {
        const existingChars = projectRolesToCharacters(prev.context.roles || []);
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
          context: {
            ...prev.context,
            roles: replaceRolesByKind(
              prev.context.roles || [],
              'person',
              buildPersonRolesFromAnalysis([...updatedExisting, ...newChars])
            ),
          }
        };
      });
      if (episodes.length > 0) setCurrentEpIndex(0);
      setActiveTab('lab');

    } else if (type === 'csvShots') {
      try {
        const shotMap = parseCSVToShots(content);
        setProjectData(prev => {
          const updatedEpisodes = prev.episodes.map(ep => {
            const matchedShots = shotMap.get(ep.title);
            if (matchedShots && matchedShots.length > 0) {
              return {
                ...ep,
                shots: matchedShots,
                status: matchedShots[0].soraPrompt ? 'completed' : 'confirmed_shots'
              } as Episode;
            }
            return ep;
          });
          return { ...prev, episodes: updatedEpisodes };
        });
        alert(`Successfully imported shots for ${shotMap.size} episodes.`);
        setActiveTab('lab');
      } catch (e: any) {
        alert("Error importing CSV: " + e.message);
      }

    } else if (type === 'understandingJson') {
      try {
        const payload = parseUnderstandingJSON(content);
        setProjectData(prev => {
          const episodeSummaryMap = new Map(
            payload.context.episodeSummaries.map(summary => [summary.episodeId, summary.summary])
          );
          const updatedEpisodes = prev.episodes.map(ep => {
            const summary = episodeSummaryMap.get(ep.id);
            return summary ? { ...ep, summary } : ep;
          });
          return {
            ...prev,
            context: payload.context,
            episodes: updatedEpisodes,
        contextUsage: payload.contextUsage ?? prev.contextUsage,
        phase1Usage: payload.phase1Usage ? { ...prev.phase1Usage, ...payload.phase1Usage } : prev.phase1Usage
      };
        });
        alert('Successfully imported understanding data.');
        setActiveTab('understanding');
      } catch (e: any) {
        alert("Error importing understanding JSON: " + e.message);
      }

    } else if (type === 'globalStyleGuide') {
      setProjectData(prev => ({ ...prev, globalStyleGuide: content }));
    } else if (type === 'shotGuide') {
      setProjectData(prev => ({ ...prev, shotGuide: content }));
    } else if (type === 'soraGuide') {
      setProjectData(prev => ({ ...prev, soraGuide: content }));
    } else if (type === 'storyboardGuide') {
      setProjectData(prev => ({ ...prev, storyboardGuide: content }));
    } else if (type === 'dramaGuide') {
      setProjectData(prev => ({ ...prev, dramaGuide: content }));
    }
  };

  const handleTryMe = async () => {
    setProcessing(true, "Concocting a hilarious script with AI...");

    try {
      const dramaGuideText = projectData.dramaGuide || defaultDramaGuide;

      const result = await ResponsesTextService.generateDemoScript(config.textConfig, dramaGuideText);

      const episodes = parseScriptToEpisodes(result.script);

      setProjectData(prev => ({
        ...prev,
        fileName: 'AI_Generated_Joke.txt',
        rawScript: result.script,
        episodes: episodes,
        globalStyleGuide: result.styleGuide,
        dramaGuide: prev.dramaGuide || dramaGuideText || '',
        contextUsage: ResponsesTextService.addUsage(prev.contextUsage || { promptTokens: 0, responseTokens: 0, totalTokens: 0 }, result.usage),
        stats: {
          ...prev.stats,
          context: {
            total: prev.stats.context.total + 1,
            success: prev.stats.context.success + 1,
            error: prev.stats.context.error
          }
        }
      }));

      if (episodes.length > 0) setCurrentEpIndex(0);
      setActiveTab('lab');
      setStep(WorkflowStep.IDLE);
      setProcessing(false);

    } catch (e: any) {
      console.error(e);
      setProcessing(false);
      alert("Failed to generate demo script: " + e.message);
      updateStats('context', false);
    }
  };

  // --- Workflow Logic ---

  // === PHASE 1: DEEP UNDERSTANDING WORKFLOW (Batched) ===

  const startAnalysis = () => {
    setAnalysisError(null);
    setStep(WorkflowStep.SETUP_CONTEXT);
    setAnalysisStep(AnalysisSubStep.PROJECT_SUMMARY);
    processProjectSummary();
  };

  // Step 1: Project Summary
  const processProjectSummary = async () => {
    setAnalysisError(null);
    setProcessing(true, "Step 1/6: Analyzing Global Project Arc...");
    setActiveTab('understanding');
    try {
      const result = await ResponsesTextService.generateProjectSummary(config.textConfig, projectData.rawScript, projectData.globalStyleGuide);

      setProjectData(prev => ({
        ...prev,
        context: { ...prev.context, projectSummary: result.projectSummary },
        contextUsage: ResponsesTextService.addUsage(prev.contextUsage || { promptTokens: 0, responseTokens: 0, totalTokens: 0 }, result.usage),
        phase1Usage: { ...prev.phase1Usage, projectSummary: ResponsesTextService.addUsage(prev.phase1Usage.projectSummary, result.usage) }
      }));

      setProcessing(false);
      setAnalysisError(null);
      updateStats('context', true);
    } catch (e: any) {
      setProcessing(false);
      setAnalysisError({ step: AnalysisSubStep.PROJECT_SUMMARY, message: e.message || "Unknown error" });
      alert("Project summary failed: " + e.message);
      updateStats('context', false);
    }
  };

  const confirmSummaryAndNext = () => {
    setAnalysisError(null);
    // Prepare batch for Episode Summaries
    const epQueue = projectData.episodes.map(ep => ep.id);
    setQueue(epQueue, epQueue.length);
    setAnalysisStep(AnalysisSubStep.EPISODE_SUMMARIES);
  };

  // Step 2: Episode Summaries (Batched 1-by-1 for Detail)
  useEffect(() => {
    if (analysisStep === AnalysisSubStep.EPISODE_SUMMARIES && analysisQueue.length > 0 && !isProcessing) {
      processNextEpisodeSummary();
    }
  }, [analysisStep, analysisQueue, isProcessing]);

  const processNextEpisodeSummary = async () => {
    const epId = analysisQueue[0];
    const episode = projectData.episodes.find(e => e.id === epId);
    if (!episode) {
      shiftQueue();
      return;
    }

    setAnalysisError(null);
    setProcessing(true, `Step 2/6: Analyzing Episode ${epId} (${analysisTotal - analysisQueue.length + 1}/${analysisTotal})...`);

    try {
      const result = await ResponsesTextService.generateEpisodeSummary(
        config.textConfig,
        episode.title,
        episode.content,
        projectData.context,
        epId
      );

      setProjectData(prev => {
        const updatedEps = prev.episodes.map(e => e.id === epId ? { ...e, summary: result.summary } : e);
        const updatedContextEpSummaries = [...prev.context.episodeSummaries, { episodeId: epId, summary: result.summary }];

        return {
          ...prev,
          episodes: updatedEps,
          context: { ...prev.context, episodeSummaries: updatedContextEpSummaries },
          contextUsage: ResponsesTextService.addUsage(prev.contextUsage!, result.usage),
          phase1Usage: { ...prev.phase1Usage, episodeSummaries: ResponsesTextService.addUsage(prev.phase1Usage.episodeSummaries, result.usage) }
        };
      });

      shiftQueue();
      setProcessing(false);
      setAnalysisError(null);
      updateStats('context', true);
    } catch (e: any) {
      setProcessing(false);
      const ignore = window.confirm(`Failed to summarize Episode ${epId}: ${e.message}. Skip this episode?`);
      if (ignore) {
        shiftQueue();
        updateStats('context', false);
        setAnalysisError(null);
      } else {
        setAnalysisError({ step: AnalysisSubStep.EPISODE_SUMMARIES, message: e.message || "Unknown error" });
      }
    }
  };

  const confirmEpSummariesAndNext = () => {
    setAnalysisError(null);
    setAnalysisStep(AnalysisSubStep.CHAR_IDENTIFICATION);
    processCharacterList();
  };

  // Step 3: Character List
  const processCharacterList = async () => {
    setAnalysisError(null);
    setProcessing(true, "Step 3/6: Building Character Roster from Parsed Script...");
    try {
      const stats = buildCharacterStats(projectData.episodes);
      const existing = projectCharacters;
      const existingByName = new Map(existing.map((c) => [c.name, c]));

      const statNames = new Set(stats.keys());
      let counter = 0;

      // 1) Build a complete roster without deleting any existing characters.
      const fromStats: Character[] = Array.from(stats.entries()).map(([name, stat]) => {
        const existingChar = existingByName.get(name);
        const appearanceCount = stat?.count ?? existingChar?.appearanceCount ?? 0;
        const episodeUsage = formatEpisodeUsage(stat.episodeIds) || existingChar?.episodeUsage || "";
        return {
          id: existingChar?.id || `char-script-${Date.now()}-${counter++}`,
          name,
          role: existingChar?.role || "",
          isMain: existingChar?.isMain ?? false,
          bio: existingChar?.bio || "",
          forms: ensureCharacterDefaultForms(name, existingChar?.forms || [], episodeUsage, true),
          appearanceCount,
          episodeUsage,
          assetPriority: (existingChar?.assetPriority || (appearanceCount > 1 ? "medium" : "low")) as "low" | "medium" | "high",
          archetype: existingChar?.archetype,
          tags: existingChar?.tags,
          voiceId: existingChar?.voiceId,
          voicePrompt: existingChar?.voicePrompt,
          previewAudioUrl: existingChar?.previewAudioUrl,
        };
      });

      const fromExistingOnly: Character[] = existing
        .filter((c) => c?.name && !statNames.has(c.name))
        .map((c) => ({
          ...c,
          id: c.id || `char-existing-${Date.now()}-${c.name}`,
          forms: ensureCharacterDefaultForms(c.name, c.forms || [], c.episodeUsage, true),
        }));

      const baseCharacters = [...fromStats, ...fromExistingOnly];

      // 2) Normalize counts/usages and decide passersby vs candidates.
      const countInfo = new Map<
        string,
        { count: number; countKnown: boolean; isPasserby: boolean; isCandidate: boolean }
      >();

      const normalizedCharacters = baseCharacters.map((char) => {
        const stat = stats.get(char.name);
        const statCount = typeof stat?.count === "number" ? stat.count : undefined;
        const appearanceCount = typeof statCount === "number" ? statCount : (char.appearanceCount ?? 0);
        const episodeUsage = (stat ? formatEpisodeUsage(stat.episodeIds) : "") || char.episodeUsage || "";
        const countKnown = typeof statCount === "number" || typeof char.appearanceCount === "number";
        const isPasserby = countKnown && appearanceCount <= 1;
        const isCandidate = appearanceCount > 1;
        countInfo.set(char.name, { count: appearanceCount, countKnown, isPasserby, isCandidate });
        return {
          ...char,
          appearanceCount,
          episodeUsage,
          forms: ensureCharacterDefaultForms(char.name, char.forms || [], episodeUsage, true),
          isCore: false,
          isMain: isPasserby ? false : (isCandidate ? false : char.isMain),
        };
      });

      // 3) Only send non-passerby candidates (count > 1) to AI for core classification + field filling.
      const aiCandidates = normalizedCharacters.filter((c) => countInfo.get(c.name)?.isCandidate);

      let briefResult: { characters: Character[]; usage: any } | null = null;
      let briefMap = new Map<string, any>();

      if (aiCandidates.length > 0) {
        const seedsForAI = aiCandidates.map((c) => ({
          name: c.name,
          role: c.role,
          episodeUsage: c.episodeUsage,
          appearanceCount: c.appearanceCount,
          forms: (c.forms || []).map((f) => ({
            formName: f.formName,
            episodeRange: f.episodeRange,
          })),
        }));

        briefResult = await ResponsesTextService.generateCharacterRosterBriefs(
          config.textConfig,
          seedsForAI,
          projectData.rawScript,
          projectData.context.projectSummary,
          projectData.globalStyleGuide
        );
        briefMap = new Map<string, any>((briefResult.characters || []).map((c) => [c.name, c]));
      }

      const aiTouched = new Set(aiCandidates.map((c) => c.name));
      const finalCharacters = normalizedCharacters.map((seed) => {
        const info = countInfo.get(seed.name);
        if (!info) return seed;
        if (info.isPasserby) {
          return {
            ...seed,
            isMain: false,
          };
        }
        if (!aiTouched.has(seed.name)) return seed;
        const brief = briefMap.get(seed.name);
        const isCore = !!brief?.isCore;

        // Step 3 only classifies core, but does not fill core details.
        if (isCore) {
          return {
            ...seed,
            isMain: true,
            isCore: true,
          };
        }

        const mergedForms = mergeCharacterFormsByName(
          seed.name,
          seed.forms || [],
          brief?.forms || [],
          seed.episodeUsage,
          { ensureDefault: true }
        );
        return {
          ...seed,
          isMain: false,
          isCore: false,
          role: brief?.role || seed.role,
          bio: brief?.bio || seed.bio,
          archetype: brief?.archetype || seed.archetype,
          assetPriority: brief?.assetPriority || seed.assetPriority || "medium",
          episodeUsage: seed.episodeUsage || brief?.episodeUsage,
          tags: brief?.tags || seed.tags,
          forms: mergedForms,
        };
      });

      setProjectData(prev => ({
        ...prev,
        context: {
          ...prev.context,
          roles: replaceRolesByKind(prev.context.roles || [], 'person', buildPersonRolesFromAnalysis(finalCharacters)),
        },
        contextUsage: briefResult?.usage ? ResponsesTextService.addUsage(prev.contextUsage!, briefResult.usage) : prev.contextUsage,
        phase1Usage: {
          ...prev.phase1Usage,
          charList: briefResult?.usage ? ResponsesTextService.addUsage(prev.phase1Usage.charList, briefResult.usage) : prev.phase1Usage.charList
        }
      }));
      setProcessing(false);
      setAnalysisError(null);
      updateStats('context', true);
    } catch (e: any) {
      setProcessing(false);
      setAnalysisError({ step: AnalysisSubStep.CHAR_IDENTIFICATION, message: e.message || "Unknown error" });
      alert("Character list generation failed: " + e.message);
      updateStats('context', false);
    }
  };

  const confirmCharListAndNext = () => {
    setAnalysisError(null);
    // Setup Queue for deep dive
    const mainChars = projectCharacters.filter(c => c.isMain).map(c => c.name);
    setQueue(mainChars, mainChars.length);
    setAnalysisStep(AnalysisSubStep.CHAR_DEEP_DIVE);
  };

  // Step 4: Character Deep Dive
  useEffect(() => {
    if (analysisStep === AnalysisSubStep.CHAR_DEEP_DIVE && analysisQueue.length > 0 && !isProcessing) {
      processNextCharacter();
    }
  }, [analysisStep, analysisQueue, isProcessing]);

  const processNextCharacter = async () => {
    const charName = analysisQueue[0];
    setAnalysisError(null);
    setProcessing(true, `Step 4/6: Deep Analysis for '${charName}' (${analysisTotal - analysisQueue.length + 1}/${analysisTotal})...`);

    try {
      const targetCharacter = projectCharacters.find((c) => c.name === charName);
      if (!targetCharacter) {
        shiftQueue();
        setProcessing(false);
        return;
      }
      const result = await ResponsesTextService.analyzeCharacterDepth(
        config.textConfig,
        {
          name: targetCharacter.name,
          role: targetCharacter.role,
          episodeUsage: targetCharacter.episodeUsage,
          forms: targetCharacter.forms,
          bio: targetCharacter.bio,
          archetype: targetCharacter.archetype,
          tags: targetCharacter.tags,
        },
        projectData.rawScript,
        projectData.context.projectSummary,
        projectData.globalStyleGuide
      );

      setProjectData(prev => {
        const updatedChars = projectRolesToCharacters(prev.context.roles || []).map(c =>
          c.name === charName
            ? {
              ...c,
              forms: mergeCharacterFormsByName(
                c.name,
                c.forms || [],
                result.forms || [],
                c.episodeUsage
              ),
              bio: result.bio || c.bio,
              archetype: result.archetype || c.archetype,
              episodeUsage: result.episodeUsage || c.episodeUsage,
              tags: result.tags || c.tags
            }
            : c
        );
        return {
          ...prev,
          context: {
            ...prev.context,
            roles: replaceRolesByKind(prev.context.roles || [], 'person', buildPersonRolesFromAnalysis(updatedChars)),
          },
          contextUsage: ResponsesTextService.addUsage(prev.contextUsage!, result.usage),
          phase1Usage: { ...prev.phase1Usage, charDeepDive: ResponsesTextService.addUsage(prev.phase1Usage.charDeepDive, result.usage) }
        };
      });

      shiftQueue();
      setProcessing(false);
      setAnalysisError(null);
      updateStats('context', true);

    } catch (e: any) {
      console.error(e);
      setProcessing(false);
      const ignore = window.confirm(`Failed to analyze ${charName}: ${e.message}. Skip?`);
      if (ignore) {
        shiftQueue();
        updateStats('context', false);
        setAnalysisError(null);
      } else {
        setAnalysisError({ step: AnalysisSubStep.CHAR_DEEP_DIVE, message: e.message || "Unknown error" });
      }
    }
  };

  const confirmCharDepthAndNext = () => {
    setAnalysisError(null);
    setAnalysisStep(AnalysisSubStep.LOC_IDENTIFICATION);
    processLocationList();
  };

  // Step 5: Location List
  const processLocationList = async () => {
    setAnalysisError(null);
    setProcessing(true, "Step 5/6: Building Locations from Parsed Scenes...");
    try {
      const seeds = buildLocationSeedsFromScenes(projectData.episodes, projectLocations || []);
      if (seeds.length === 0) {
        setProcessing(false);
        setAnalysisError({
          step: AnalysisSubStep.LOC_IDENTIFICATION,
          message: "解析结果未发现可用的场景/分区清单。",
        });
        return;
      }
      const countInfo = new Map<
        string,
        { count: number; countKnown: boolean; isPasserby: boolean; isCandidate: boolean }
      >();

      const normalizedSeeds = seeds.map((loc) => {
        const countKnown = typeof loc.appearanceCount === "number";
        const count = loc.appearanceCount ?? 0;
        const isPasserby = countKnown && count <= 1;
        const isCandidate = count > 1;
        countInfo.set(loc.name, { count, countKnown, isPasserby, isCandidate });
        const zones = ensureLocationDefaultZones(loc.name, loc.zones || [], loc.episodeUsage, true);
        return {
          ...loc,
          zones,
          type: isPasserby ? "secondary" : (isCandidate ? "secondary" : loc.type),
        };
      });

      const aiCandidates = normalizedSeeds.filter((loc) => countInfo.get(loc.name)?.isCandidate);

      let result: { locations: any[]; usage: any } | null = null;
      let briefMap = new Map<string, any>();

      if (aiCandidates.length > 0) {
        const seedsForAI = aiCandidates.map((loc) => ({
          name: loc.name,
          episodeUsage: loc.episodeUsage,
          appearanceCount: loc.appearanceCount,
          zones: ensureLocationDefaultZones(loc.name, loc.zones || [], loc.episodeUsage, true).map((zone) => ({
            name: zone.name,
            episodeRange: zone.episodeRange,
          })),
        }));

        result = await ResponsesTextService.generateLocationRosterBriefs(
          config.textConfig,
          seedsForAI,
          projectData.rawScript,
          projectData.context.projectSummary,
          projectData.globalStyleGuide
        );
        briefMap = new Map((result.locations || []).map((loc) => [loc.name, loc]));
      }

      const finalLocations = normalizedSeeds.map((seed) => {
        const info = countInfo.get(seed.name);
        if (!info) return seed;
        if (info.isPasserby) {
          return {
            ...seed,
            type: "secondary",
          };
        }
        if (!info.isCandidate) return seed;
        const brief = briefMap.get(seed.name);
        const isCore = brief?.type === "core";

        // Step 5 only classifies core, but does not fill core details.
        if (isCore) {
          return {
            ...seed,
            type: "core",
          };
        }

        const episodeUsage = seed.episodeUsage || brief?.episodeUsage;
        const mergedZones = mergeLocationZonesByName(
          seed.name,
          seed.zones || [],
          brief?.zones || [],
          episodeUsage,
          { ensureDefault: true }
        );
        return {
          ...seed,
          type: "secondary",
          description: brief?.description || seed.description || "",
          assetPriority: brief?.assetPriority || seed.assetPriority,
          episodeUsage,
          zones: mergedZones,
        };
      });

      setProjectData(prev => ({
        ...prev,
        context: {
          ...prev.context,
          roles: replaceRolesByKind(prev.context.roles || [], 'scene', buildSceneRolesFromAnalysis(finalLocations)),
        },
        contextUsage: result?.usage ? ResponsesTextService.addUsage(prev.contextUsage!, result.usage) : prev.contextUsage,
        phase1Usage: {
          ...prev.phase1Usage,
          locList: result?.usage ? ResponsesTextService.addUsage(prev.phase1Usage.locList, result.usage) : prev.phase1Usage.locList
        }
      }));
      setProcessing(false);
      setAnalysisError(null);
      updateStats('context', true);
    } catch (e: any) {
      setProcessing(false);
      setAnalysisError({ step: AnalysisSubStep.LOC_IDENTIFICATION, message: e.message || "Unknown error" });
      alert("Location mapping failed: " + e.message);
      updateStats('context', false);
    }
  };

  const confirmLocListAndNext = () => {
    setAnalysisError(null);
    const coreLocs = projectLocations.filter(l => l.type === 'core').map(l => l.name);
    const priorityLocs = projectLocations
      .filter((l) => l.assetPriority === "high" || l.assetPriority === "medium")
      .map((l) => l.name);
    const fallbackLocs = projectLocations.map((l) => l.name);
    const queue = coreLocs.length ? coreLocs : (priorityLocs.length ? priorityLocs : fallbackLocs);
    setQueue(queue, queue.length);
    setAnalysisStep(AnalysisSubStep.LOC_DEEP_DIVE);
  };

  // Step 6: Location Deep Dive
  useEffect(() => {
    if (analysisStep === AnalysisSubStep.LOC_DEEP_DIVE && analysisQueue.length > 0 && !isProcessing) {
      processNextLocation();
    }
  }, [analysisStep, analysisQueue, isProcessing]);

  const processNextLocation = async () => {
    const locName = analysisQueue[0];
    setAnalysisError(null);
    setProcessing(true, `Step 6/6: Visualizing '${locName}' (${analysisTotal - analysisQueue.length + 1}/${analysisTotal})...`);

    try {
      const targetLocation = projectLocations.find((l) => l.name === locName);
      if (!targetLocation) {
        shiftQueue();
        setProcessing(false);
        return;
      }
      const result = await ResponsesTextService.analyzeLocationDepth(
        config.textConfig,
        {
          name: targetLocation.name,
          description: targetLocation.description,
          episodeUsage: targetLocation.episodeUsage,
          zones: targetLocation.zones,
        },
        projectData.rawScript,
        projectData.globalStyleGuide
      );

      setProjectData(prev => {
        const updatedLocs = projectRolesToLocations(prev.context.roles || []).map(l =>
          l.name === locName
            ? {
              ...l,
              visuals: result.visuals || l.visuals,
              zones: mergeLocationZonesByName(
                l.name,
                l.zones || [],
                result.zones || [],
                l.episodeUsage,
                { ensureDefault: true }
              ),
            }
            : l
        );
        return {
          ...prev,
          context: {
            ...prev.context,
            roles: replaceRolesByKind(prev.context.roles || [], 'scene', buildSceneRolesFromAnalysis(updatedLocs)),
          },
          contextUsage: ResponsesTextService.addUsage(prev.contextUsage!, result.usage),
          phase1Usage: { ...prev.phase1Usage, locDeepDive: ResponsesTextService.addUsage(prev.phase1Usage.locDeepDive, result.usage) }
        };
      });

      shiftQueue();
      setProcessing(false);
      setAnalysisError(null);
      updateStats('context', true);

    } catch (e: any) {
      setProcessing(false);
      const ignore = window.confirm(`Failed to visualize ${locName}: ${e.message}. Skip?`);
      if (ignore) {
        shiftQueue();
        updateStats('context', false);
        setAnalysisError(null);
      } else {
        setAnalysisError({ step: AnalysisSubStep.LOC_DEEP_DIVE, message: e.message || "Unknown error" });
      }
    }
  };

  const finishAnalysis = () => {
    setAnalysisError(null);
    setAnalysisStep(AnalysisSubStep.COMPLETE);
    alert("Phase 1 Complete! Context is fully established.");
  };

  const retryAnalysisStep = () => {
    if (isProcessing) return;
    setAnalysisError(null);
    switch (analysisStep) {
      case AnalysisSubStep.PROJECT_SUMMARY:
        processProjectSummary();
        break;
      case AnalysisSubStep.EPISODE_SUMMARIES:
        if (analysisQueue.length > 0) processNextEpisodeSummary();
        break;
      case AnalysisSubStep.CHAR_IDENTIFICATION:
        processCharacterList();
        break;
      case AnalysisSubStep.CHAR_DEEP_DIVE:
        if (analysisQueue.length > 0) processNextCharacter();
        break;
      case AnalysisSubStep.LOC_IDENTIFICATION:
        processLocationList();
        break;
      case AnalysisSubStep.LOC_DEEP_DIVE:
        if (analysisQueue.length > 0) processNextLocation();
        break;
      default:
        break;
    }
  };

  // === PHASE 2 & 3 Hooks ===
  const { startPhase2, confirmEpisodeShots, retryCurrentEpisodeShots } = useShotGeneration({
    projectDataRef,
    setProjectData,
    config,
    setStep,
    setCurrentEpIndex,
    setProcessing,
    setStatus,
    setActiveTab,
    updateStats,
    currentEpIndex
  });

  const { startPhase3, continueNextEpisodeSora, retryCurrentEpisodeSora } = useSoraGeneration({
    projectDataRef,
    setProjectData,
    config,
    setStep,
    setCurrentEpIndex,
    setProcessing,
    setStatus,
    setActiveTab,
    updateStats,
    isProcessing,
    currentEpIndex
  });

  const { startPhase4, continueNextEpisodeStoryboard, retryCurrentEpisodeStoryboard } = useStoryboardGeneration({
    projectDataRef,
    setProjectData,
    config,
    setStep,
    setCurrentEpIndex,
    setProcessing,
    setStatus,
    setActiveTab,
    updateStats,
    isProcessing,
    currentEpIndex
  });

  // === PHASE 5: VIDEO GENERATION ===
  const handleGenerateVideo = async (episodeId: number, shotId: string, customPrompt: string, params: VideoParams) => {
    if (!config.videoConfig.apiKey || !config.videoConfig.baseUrl) {
      alert("Video API settings missing. Please open Agent Settings -> Video.");
      return;
    }

    // Ad-hoc Logic
    if (episodeId === -1) {
      const playgroundId = -1;
      let playgroundEpIndex = projectData.episodes.findIndex(e => e.id === playgroundId);

      if (playgroundEpIndex === -1) {
        const playgroundEp: Episode = {
          id: playgroundId,
          title: "Creative Playground",
          content: "Ad-hoc generations",
          scenes: [],
          shots: [],
          status: 'completed'
        };
        setProjectData(prev => ({
          ...prev,
          episodes: [...prev.episodes, playgroundEp]
        }));
        playgroundEpIndex = projectData.episodes.length;
      }

      const newShotId = `gen-${Date.now()}`;
      const newShot: Shot = {
        id: newShotId,
        duration: params.duration || '4s',
        shotType: 'Custom',
        focalLength: '',
        movement: 'Custom',
        composition: '',
        blocking: '',
        description: 'Ad-hoc generation',
        dialogue: '',
        sound: '',
        lightingVfx: '',
        editingNotes: '',
        notes: '',
        soraPrompt: customPrompt,
        storyboardPrompt: '',
        finalVideoPrompt: customPrompt,
        videoStatus: 'queued',
        videoParams: params,
        videoStartTime: Date.now()
      };

      setProjectData(prev => {
        const episodesCopy = [...prev.episodes];
        let existingPlayground = episodesCopy.find(e => e.id === playgroundId);
        if (!existingPlayground) {
          existingPlayground = {
            id: playgroundId,
            title: "Creative Playground",
            content: "Ad-hoc generations",
            scenes: [],
            shots: [],
            status: 'completed'
          };
          episodesCopy.push(existingPlayground);
        }
        existingPlayground.shots = [...existingPlayground.shots, newShot];
        return { ...prev, episodes: episodesCopy };
      });

      try {
        const { id } = await SoraService.submitSoraTask(customPrompt, config.videoConfig, params);
        setProjectData(prev => {
          const episodesCopy = prev.episodes.map(e => {
            if (e.id === playgroundId) {
              return {
                ...e,
                shots: e.shots.map(s => s.id === newShotId ? {
                  ...s,
                  videoId: id
                } : s)
              } as Episode;
            }
            return e;
          });
          return { ...prev, episodes: episodesCopy };
        });
      } catch (e: any) {
        setProjectData(prev => {
          const episodesCopy = prev.episodes.map(ep => {
            if (ep.id === playgroundId) {
              return {
                ...ep,
                shots: ep.shots.map(s => s.id === newShotId ? {
                  ...s,
                  videoStatus: 'error',
                  videoErrorMsg: e.message
                } : s)
              } as Episode;
            }
            return ep;
          });
          return { ...prev, episodes: episodesCopy };
        });
      }
      return;
    }

    // Standard Logic
    const episode = projectData.episodes.find(e => e.id === episodeId);
    if (!episode) return;
    const shot = episode.shots.find(s => s.id === shotId);
    if (!shot) return;

    setProjectData(prev => {
      const newEpisodes = prev.episodes.map(e => {
        if (e.id === episodeId) {
          return {
            ...e,
            shots: e.shots.map(s => s.id === shotId ? {
              ...s,
              videoStatus: 'queued',
              videoErrorMsg: undefined,
              finalVideoPrompt: customPrompt,
              videoParams: params,
              videoStartTime: Date.now()
            } : s)
          } as Episode;
        }
        return e;
      });
      return { ...prev, episodes: newEpisodes };
    });

    try {
      const { id } = await SoraService.submitSoraTask(customPrompt, config.videoConfig, params);
      setProjectData(prev => {
        const newEpisodes = prev.episodes.map(e => {
          if (e.id === episodeId) {
            return {
              ...e,
              shots: e.shots.map(s => s.id === shotId ? {
                ...s,
                videoStatus: 'queued',
                videoId: id,
              } : s)
            } as Episode;
          }
          return e;
        });
        return { ...prev, episodes: newEpisodes };
      });
    } catch (e: any) {
      setProjectData(prev => {
        const newEpisodes = prev.episodes.map(ep => {
          if (ep.id === episodeId) {
            return {
              ...ep,
              shots: ep.shots.map(s => s.id === shotId ? { ...s, videoStatus: 'error', videoErrorMsg: e.message } : s)
            } as Episode;
          }
          return ep;
        });
        return { ...prev, episodes: newEpisodes };
      });
    }
  };

  const handleRemixVideo = async (episodeId: number, shotId: string, customPrompt: string, originalVideoId: string) => {
    if (!config.videoConfig.apiKey || !config.videoConfig.baseUrl) return;

    setProjectData(prev => {
      const newEpisodes = prev.episodes.map(e => {
        if (e.id === episodeId) {
          return {
            ...e,
            shots: e.shots.map(s => s.id === shotId ? {
              ...s,
              videoStatus: 'queued',
              videoErrorMsg: undefined,
              finalVideoPrompt: customPrompt,
              videoStartTime: Date.now()
            } : s)
          } as Episode;
        }
        return e;
      });
      return { ...prev, episodes: newEpisodes };
    });

    try {
      const { id } = await SoraService.remixSoraVideo(originalVideoId, customPrompt, config.videoConfig);
      setProjectData(prev => {
        const newEpisodes = prev.episodes.map(e => {
          if (e.id === episodeId) {
            return {
              ...e,
              shots: e.shots.map(s => s.id === shotId ? {
                ...s,
                videoStatus: 'queued',
                videoId: id
              } : s)
            } as Episode;
          }
          return e;
        });
        return { ...prev, episodes: newEpisodes };
      });
    } catch (e: any) {
      setProjectData(prev => {
        const newEpisodes = prev.episodes.map(ep => {
          if (ep.id === episodeId) {
            return {
              ...ep,
              shots: ep.shots.map(s => s.id === shotId ? { ...s, videoStatus: 'error', videoErrorMsg: e.message } : s)
            } as Episode;
          }
          return ep;
        });
        return { ...prev, episodes: newEpisodes };
      });
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

  const handleExportCsv = () => exportToCSV(projectData.episodes);
  const handleExportXls = () => exportToXLS(projectData.episodes);
  const handleExportUnderstandingJson = () => exportUnderstandingToJSON(projectData);

  const handleToggleWorkflow = useCallback((anchorRect?: DOMRect) => {
    setShowWorkflow((prev) => {
      const next = !prev;
      if (next) {
        if (anchorRect) {
          setWorkflowAnchor(anchorRect);
        } else if (typeof document !== "undefined") {
          const anchor = document.querySelector("[data-workflow-trigger]") as HTMLElement | null;
          if (anchor) setWorkflowAnchor(anchor.getBoundingClientRect());
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!showWorkflow) return;
    const updateAnchor = () => {
      if (typeof document === "undefined") return;
      const anchor = document.querySelector("[data-workflow-trigger]") as HTMLElement | null;
      if (anchor) setWorkflowAnchor(anchor.getBoundingClientRect());
    };
    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);
    return () => {
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
    };
  }, [showWorkflow]);

  const workflowPanelStyle = useMemo<React.CSSProperties>(() => {
    if (!workflowAnchor || typeof window === "undefined") {
      return { right: 16, bottom: 16 };
    }
    const panelWidth = 460;
    const gap = 12;
    const left = Math.min(
      Math.max(workflowAnchor.left + workflowAnchor.width / 2 - panelWidth / 2, 12),
      window.innerWidth - panelWidth - 12
    );
    const bottom = Math.max(16, window.innerHeight - workflowAnchor.top + gap);
    return { left, bottom };
  }, [workflowAnchor]);

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
            <NodeFlow
              projectData={projectData}
              setProjectData={setProjectData}
              getAuthToken={getAuthToken}
              onAssetLoad={handleAssetLoad}
              onOpenModule={handleOpenLabModule}
              syncIndicator={syncIndicator}
              onExportCsv={handleExportCsv}
              onExportXls={handleExportXls}
              onExportUnderstandingJson={handleExportUnderstandingJson}
              onToggleTheme={toggleTheme}
              isDarkMode={isDarkMode}
              onOpenSyncPanel={() => openWorkspacePanel("sync:status")}
              onOpenInfoPanel={() => openWorkspacePanel("info:about")}
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
              onTryMe={handleTryMe}
              onToggleWorkflow={handleToggleWorkflow}
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

  let labModalTitle: string | null = null;
  let labModalWidth: number | string | undefined = undefined;
  let labModalContent: React.ReactNode = null;
  if (openLabModal === "writing") {
    labModalTitle = "Writing";
    labModalWidth = 520;
    labModalContent = (
      <WritingPanel
        projectData={projectData}
        setProjectData={setProjectData}
      />
    );
  } else if (openLabModal === "workspace") {
    labModalTitle = "Workspace";
    labModalWidth = 560;
    labModalContent = (
      <WorkspacePanel
        projectData={projectData}
        setProjectData={setProjectData}
        config={config}
        onConfigChange={setConfig}
        isSignedIn={!!authSignedIn}
        getAuthToken={getAuthToken}
        onForceSync={forceCloudPull}
        syncState={syncState}
        syncRollout={syncRollout}
        onResetProject={handleResetProject}
        onOpenLanding={openLandingPage}
        initialSection={workspaceSection}
      />
    );
  } else if (openLabModal === "projector") {
    labModalTitle = "放映机 (视听实验室)";
    labModalWidth = 560;
    labModalContent = <ProjectorModule projectData={projectData} setProjectData={setProjectData} />;
  }

  if (appView === "landing") {
    return <LandingPage isDarkMode={isDarkMode} onEnterApp={closeLandingPage} onTryMe={handleTryMe} />;
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
              onOpenDetails={() => openWorkspacePanel("sync:status")}
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
        {labModalTitle && labModalContent && (
          <FloatingPanelShell title={labModalTitle} isOpen onClose={closeLabModal} width={labModalWidth} position="right">
            {labModalContent}
          </FloatingPanelShell>
        )}
        <GlassEffectLab isOpen={openLabModal === "glassLab"} onClose={closeLabModal} />
      </AppShell>
      {showWorkflow && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setShowWorkflow(false)} />
          <div
            className="fixed z-[60] pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-300"
            style={workflowPanelStyle}
          >
            <WorkflowCard
              workflow={{
                step,
                analysisStep,
                analysisQueueLength: analysisQueue.length,
                analysisTotal,
                isProcessing,
                analysisError,
                currentEpIndex,
                episodes: projectData.episodes,
                setCurrentEpIndex,
                setStep,
                setAnalysisStep,
                onStartAnalysis: startAnalysis,
                onConfirmSummaryNext: confirmSummaryAndNext,
                onConfirmEpSummariesNext: confirmEpSummariesAndNext,
                onConfirmCharListNext: confirmCharListAndNext,
                onConfirmCharDepthNext: confirmCharDepthAndNext,
                onConfirmLocListNext: confirmLocListAndNext,
                onFinishAnalysis: finishAnalysis,
                onRetryAnalysis: retryAnalysisStep,
                onStartPhase2: startPhase2,
                onConfirmEpisodeShots: confirmEpisodeShots,
                onRetryEpisodeShots: retryCurrentEpisodeShots,
                onStartPhase3: startPhase3,
                onRetryEpisodeSora: retryCurrentEpisodeSora,
                onContinueNextEpisodeSora: continueNextEpisodeSora,
                onStartPhase4: startPhase4,
                onRetryEpisodeStoryboard: retryCurrentEpisodeStoryboard,
                onContinueNextEpisodeStoryboard: continueNextEpisodeStoryboard,
              }}
              onClose={() => setShowWorkflow(false)}
            />
          </div>
        </>
      )}
    </>
  );
};

export default App;
