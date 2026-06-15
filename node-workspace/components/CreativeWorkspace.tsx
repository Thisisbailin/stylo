import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  ReactFlow,
  MiniMap,
  useReactFlow,
  PanOnScrollMode,
  ReactFlowProvider,
  ConnectionMode,
  XYPosition,
  ConnectionLineType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../styles/nodeflow.css";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { NodeFlowFile, NodeType, VideoGenNodeData } from "../types";
import { FloatingActionBar } from "./FloatingActionBar";
import { AgentSettingsPanel, type AgentSettingsPanelKey } from "./AgentSettingsPanel";
import { QalamAgent } from "./QalamAgent";
import { useFlowSurface } from "./FlowSurface";
import { CanvasBackgroundField, type CanvasBackgroundFieldHandle } from "./CanvasBackgroundField";
import { EdgeAlignmentGuides } from "./EdgeAlignmentGuides";
import { ViewportControls } from "./ViewportControls";
import { WritingPanel } from "./WritingPanel";
import { Toast } from "./Toast";
import { AnnotationModal } from "./AnnotationModal";
import { AppConfig, ProjectData, SyncState } from "../../types";
import type { ModuleKey } from "./ModuleBar";
import { FileText, List } from "lucide-react";
import type { EdgeAlignmentGuide } from "../utils/edgeAlignment";
import type { SharedCanvasControls, SharedCanvasViewport } from "./canvas/types";

interface CreativeWorkspaceProps {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  isSignedIn?: boolean;
  getAuthToken?: (options?: { skipCache?: boolean }) => Promise<string | null>;
  syncState?: SyncState;
  syncRollout?: { enabled: boolean; percent: number; bucket?: number | null; allowlisted?: boolean };
  onForceSync?: () => void;
  onOpenLanding?: () => void;
  externalAgentSettingsRequest?: { panel: AgentSettingsPanelKey; nonce: number } | null;
  onAssetLoad?: (type: "script", content: string, fileName?: string) => void;
  onOpenModule?: (key: ModuleKey) => void;
  syncIndicator?: { label: string; color: string } | null;
  onResetProject?: () => void;
  onSignOut?: () => void;
  accountInfo?: {
    isLoaded: boolean;
    isSignedIn: boolean;
    name?: string;
    email?: string;
    avatarUrl?: string;
    onSignIn?: () => void;
    onSignOut?: () => void;
    onUploadAvatar?: () => void;
  };
}

type ThemeKey = "dark" | "light" | "sand" | "creative" | "calm" | "lively";
type PatternKey = "dots" | "grid" | "cross" | "lines" | "diagonal" | "none";

type ThemePreset = {
  label: string;
  description: string;
  bg: string;
  panel: string;
  panelStrong: string;
  panelMuted: string;
  panelSoft: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  panelShadow: string;
  panelShadowStrong: string;
  nodeShadow: string;
  nodeShadowStrong: string;
  pattern: string;
  patternSoft: string;
  nodeBgGradient: string;
  nodeHeaderBg: string;
  scheme: "light" | "dark";
};

const THEME_PRESETS: Record<ThemeKey, ThemePreset> = {
  dark: {
    label: "Dark",
    description: "System dark neutrals in graphite and charcoal.",
    bg: "#1c1c1e",
    panel: "rgba(28, 28, 30, 0.92)",
    panelStrong: "rgba(44, 44, 46, 0.96)",
    panelMuted: "rgba(255, 255, 255, 0.05)",
    panelSoft: "rgba(255, 255, 255, 0.08)",
    border: "rgba(255, 255, 255, 0.1)",
    borderStrong: "rgba(255, 255, 255, 0.18)",
    textPrimary: "#f5f5f7",
    textSecondary: "rgba(245, 245, 247, 0.68)",
    textMuted: "rgba(245, 245, 247, 0.44)",
    accent: "#8e8e93",
    accentStrong: "#aeaeb2",
    accentSoft: "rgba(142, 142, 147, 0.12)",
    panelShadow: "0 12px 28px rgba(8, 8, 10, 0.2)",
    panelShadowStrong: "0 16px 36px rgba(8, 8, 10, 0.24)",
    nodeShadow: "0 18px 40px rgba(8, 8, 10, 0.3)",
    nodeShadowStrong: "0 22px 52px rgba(8, 8, 10, 0.36)",
    pattern: "rgba(255, 255, 255, 0.045)",
    patternSoft: "rgba(255, 255, 255, 0.022)",
    nodeBgGradient: "linear-gradient(160deg, rgba(44, 44, 46, 0.97), rgba(28, 28, 30, 0.98))",
    nodeHeaderBg: "rgba(255, 255, 255, 0.02)",
    scheme: "dark",
  },
  light: {
    label: "Light",
    description: "System light neutrals in soft white and cool gray.",
    bg: "#f5f5f7",
    panel: "rgba(255, 255, 255, 0.92)",
    panelStrong: "#ffffff",
    panelMuted: "rgba(60, 60, 67, 0.05)",
    panelSoft: "rgba(60, 60, 67, 0.08)",
    border: "rgba(60, 60, 67, 0.12)",
    borderStrong: "rgba(60, 60, 67, 0.18)",
    textPrimary: "#1c1c1e",
    textSecondary: "rgba(28, 28, 30, 0.68)",
    textMuted: "rgba(28, 28, 30, 0.42)",
    accent: "#8e8e93",
    accentStrong: "#636366",
    accentSoft: "rgba(99, 99, 102, 0.1)",
    panelShadow: "0 10px 24px rgba(28, 28, 30, 0.08)",
    panelShadowStrong: "0 14px 32px rgba(28, 28, 30, 0.1)",
    nodeShadow: "0 14px 30px rgba(28, 28, 30, 0.1)",
    nodeShadowStrong: "0 18px 40px rgba(28, 28, 30, 0.13)",
    pattern: "rgba(60, 60, 67, 0.055)",
    patternSoft: "rgba(60, 60, 67, 0.025)",
    nodeBgGradient: "linear-gradient(160deg, rgba(255, 255, 255, 0.99), rgba(245, 245, 247, 0.97))",
    nodeHeaderBg: "rgba(60, 60, 67, 0.03)",
    scheme: "light",
  },
  sand: {
    label: "Amber",
    description: "Sunlit amber paper with honey glass layers and cleaner warmth.",
    bg: "#ffe7b8",
    panel: "rgba(255, 247, 228, 0.84)",
    panelStrong: "rgba(255, 251, 242, 0.96)",
    panelMuted: "rgba(230, 150, 12, 0.1)",
    panelSoft: "rgba(230, 150, 12, 0.17)",
    border: "rgba(201, 118, 0, 0.18)",
    borderStrong: "rgba(201, 118, 0, 0.3)",
    textPrimary: "#4b2d02",
    textSecondary: "rgba(75, 45, 2, 0.7)",
    textMuted: "rgba(75, 45, 2, 0.46)",
    accent: "#e6960c",
    accentStrong: "#c97600",
    accentSoft: "rgba(230, 150, 12, 0.18)",
    panelShadow: "0 12px 28px rgba(126, 72, 0, 0.1)",
    panelShadowStrong: "0 18px 40px rgba(126, 72, 0, 0.14)",
    nodeShadow: "0 16px 36px rgba(126, 72, 0, 0.12)",
    nodeShadowStrong: "0 22px 48px rgba(126, 72, 0, 0.16)",
    pattern: "rgba(201, 118, 0, 0.12)",
    patternSoft: "rgba(230, 150, 12, 0.055)",
    nodeBgGradient: "linear-gradient(160deg, rgba(255, 251, 242, 0.99), rgba(255, 234, 193, 0.96))",
    nodeHeaderBg: "rgba(230, 150, 12, 0.05)",
    scheme: "light",
  },
  creative: {
    label: "Green",
    description: "Fresh translucent green with clearer mint glass and less haze.",
    bg: "#d7ffe5",
    panel: "rgba(244, 255, 248, 0.84)",
    panelStrong: "rgba(250, 255, 252, 0.96)",
    panelMuted: "rgba(18, 196, 102, 0.1)",
    panelSoft: "rgba(18, 196, 102, 0.17)",
    border: "rgba(0, 151, 74, 0.18)",
    borderStrong: "rgba(0, 151, 74, 0.3)",
    textPrimary: "#0c3821",
    textSecondary: "rgba(12, 56, 33, 0.7)",
    textMuted: "rgba(12, 56, 33, 0.46)",
    accent: "#12c466",
    accentStrong: "#00974a",
    accentSoft: "rgba(18, 196, 102, 0.18)",
    panelShadow: "0 12px 28px rgba(8, 88, 48, 0.08)",
    panelShadowStrong: "0 18px 40px rgba(8, 88, 48, 0.12)",
    nodeShadow: "0 16px 36px rgba(8, 88, 48, 0.1)",
    nodeShadowStrong: "0 22px 48px rgba(8, 88, 48, 0.14)",
    pattern: "rgba(0, 151, 74, 0.12)",
    patternSoft: "rgba(18, 196, 102, 0.055)",
    nodeBgGradient: "linear-gradient(160deg, rgba(250, 255, 252, 0.99), rgba(223, 255, 235, 0.96))",
    nodeHeaderBg: "rgba(18, 196, 102, 0.05)",
    scheme: "light",
  },
  calm: {
    label: "Blue",
    description: "Clear sky blue with brighter water-glass surfaces and more lift.",
    bg: "#d9efff",
    panel: "rgba(243, 250, 255, 0.84)",
    panelStrong: "rgba(250, 253, 255, 0.96)",
    panelMuted: "rgba(34, 149, 255, 0.1)",
    panelSoft: "rgba(34, 149, 255, 0.17)",
    border: "rgba(0, 107, 204, 0.18)",
    borderStrong: "rgba(0, 107, 204, 0.3)",
    textPrimary: "#0b3156",
    textSecondary: "rgba(11, 49, 86, 0.7)",
    textMuted: "rgba(11, 49, 86, 0.46)",
    accent: "#2295ff",
    accentStrong: "#006bcc",
    accentSoft: "rgba(34, 149, 255, 0.18)",
    panelShadow: "0 12px 28px rgba(0, 73, 143, 0.08)",
    panelShadowStrong: "0 18px 40px rgba(0, 73, 143, 0.12)",
    nodeShadow: "0 16px 36px rgba(0, 73, 143, 0.1)",
    nodeShadowStrong: "0 22px 48px rgba(0, 73, 143, 0.14)",
    pattern: "rgba(0, 107, 204, 0.12)",
    patternSoft: "rgba(34, 149, 255, 0.055)",
    nodeBgGradient: "linear-gradient(160deg, rgba(250, 253, 255, 0.99), rgba(220, 241, 255, 0.96))",
    nodeHeaderBg: "rgba(34, 149, 255, 0.05)",
    scheme: "light",
  },
  lively: {
    label: "Pink",
    description: "Clean pink bloom with brighter rose glass and less dustiness.",
    bg: "#ffe0ef",
    panel: "rgba(255, 244, 249, 0.84)",
    panelStrong: "rgba(255, 250, 252, 0.96)",
    panelMuted: "rgba(255, 96, 156, 0.1)",
    panelSoft: "rgba(255, 96, 156, 0.17)",
    border: "rgba(214, 56, 120, 0.18)",
    borderStrong: "rgba(214, 56, 120, 0.3)",
    textPrimary: "#4a1830",
    textSecondary: "rgba(74, 24, 48, 0.7)",
    textMuted: "rgba(74, 24, 48, 0.46)",
    accent: "#ff609c",
    accentStrong: "#d63878",
    accentSoft: "rgba(255, 96, 156, 0.18)",
    panelShadow: "0 12px 28px rgba(140, 28, 79, 0.08)",
    panelShadowStrong: "0 18px 40px rgba(140, 28, 79, 0.12)",
    nodeShadow: "0 16px 36px rgba(140, 28, 79, 0.1)",
    nodeShadowStrong: "0 22px 48px rgba(140, 28, 79, 0.14)",
    pattern: "rgba(214, 56, 120, 0.12)",
    patternSoft: "rgba(255, 96, 156, 0.055)",
    nodeBgGradient: "linear-gradient(160deg, rgba(255, 250, 252, 0.99), rgba(255, 226, 238, 0.96))",
    nodeHeaderBg: "rgba(255, 96, 156, 0.05)",
    scheme: "light",
  },
};

const boostAlpha = (color: string, multiplier: number) => {
  const match = color.match(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i);
  if (!match) return color;
  const [, r, g, b, a] = match;
  const nextAlpha = Math.min(1, Number.parseFloat(a) * multiplier);
  return `rgba(${r}, ${g}, ${b}, ${nextAlpha})`;
};

const toSvgDataUri = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

const getPatternDefinitions = (
  theme: ThemePreset,
  intensity = 1
): Record<Exclude<PatternKey, "none">, { image: string; size: (scale: number) => string; position?: string }> => {
  const primary = boostAlpha(theme.pattern, intensity);
  const secondary = boostAlpha(theme.patternSoft, intensity);

  return ({
  dots: {
    image:
      `radial-gradient(circle at 1.6px 1.6px, ${primary} 1.6px, transparent 0), radial-gradient(circle at 1px 1px, ${secondary} 1px, transparent 0)`,
    size: (scale) => `${28 * scale}px ${28 * scale}px, ${28 * scale}px ${28 * scale}px`,
    position: "0 0, 14px 14px",
  },
  grid: {
    image:
      `linear-gradient(${secondary} 1px, transparent 1px), linear-gradient(90deg, ${secondary} 1px, transparent 1px), linear-gradient(${primary} 1px, transparent 1px), linear-gradient(90deg, ${primary} 1px, transparent 1px)`,
    size: (scale) =>
      `${22 * scale}px ${22 * scale}px, ${22 * scale}px ${22 * scale}px, ${110 * scale}px ${110 * scale}px, ${110 * scale}px ${110 * scale}px`,
  },
  cross: {
    image: toSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44" fill="none">
        <path d="M22 16.5V27.5" stroke="${primary}" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M16.5 22H27.5" stroke="${primary}" stroke-width="1.2" stroke-linecap="round"/>
        <circle cx="22" cy="22" r="1.05" fill="${secondary}"/>
      </svg>
    `),
    size: (scale) =>
      `${44 * scale}px ${44 * scale}px`,
    position: "0 0",
  },
  lines: {
    image:
      `linear-gradient(0deg, ${secondary} 1px, transparent 1px), linear-gradient(0deg, ${primary} 2px, transparent 2px)`,
    size: (scale) => `${26 * scale}px ${26 * scale}px, ${104 * scale}px ${104 * scale}px`,
  },
  diagonal: {
    image:
      `linear-gradient(135deg, transparent 0 43%, ${secondary} 43% 46%, transparent 46% 54%, ${primary} 54% 58%, transparent 58% 100%)`,
    size: (scale) => `${34 * scale}px ${34 * scale}px`,
  },
  });
};

const CreativeWorkspaceInner: React.FC<CreativeWorkspaceProps> = ({
  projectData,
  setProjectData,
  config,
  setConfig,
  isSignedIn,
  getAuthToken,
  syncState,
  syncRollout,
  onForceSync,
  onOpenLanding,
  externalAgentSettingsRequest,
  onAssetLoad,
  onOpenModule,
  syncIndicator,
  onResetProject,
  onSignOut,
  accountInfo,
}) => {
  const [bgTheme, setBgTheme] = useState<ThemeKey>("dark");
  const [bgPattern, setBgPattern] = useState<PatternKey>("grid");
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [editingScriptEpisodeId, setEditingScriptEpisodeId] = useState<number | null>(null);
  const [themeAnchor, setThemeAnchor] = useState<DOMRect | null>(null);
  const [showAgentSettings, setShowAgentSettings] = useState(false);
  const [agentSettingsPanel, setAgentSettingsPanel] = useState<AgentSettingsPanelKey>("provider");
  const [agentDockWidth, setAgentDockWidth] = useState(0);
  const [isQalamCollapsed, setIsQalamCollapsed] = useState(true);
  const [isQalamSending, setIsQalamSending] = useState(false);
  const [qalamOpenRequest, setQalamOpenRequest] = useState(0);
  const [qalamCloseRequest, setQalamCloseRequest] = useState(0);
  const [qalamSubmitRequest, setQalamSubmitRequest] = useState<{ id: number; text: string } | null>(null);
  const [qalamCancelRequest, setQalamCancelRequest] = useState(0);
  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1440));
  const [isQalamFirstManual, setIsQalamFirstManual] = useState(false);
  const [dismissedAutoQalamFirst, setDismissedAutoQalamFirst] = useState(false);
  const [composerInput, setComposerInput] = useState("");
  const qalamFirstBreakpoint = 920;
  const isAutoQalamFirst = windowWidth <= qalamFirstBreakpoint;
  const isQalamFirstMode = isAutoQalamFirst ? !dismissedAutoQalamFirst : isQalamFirstManual;
  const openAgentSettingsPanel = useCallback(
    (panel: AgentSettingsPanelKey = "provider") => {
      setAgentSettingsPanel(panel);
      setShowAgentSettings(true);
    },
    []
  );
  useEffect(() => {
    if (!externalAgentSettingsRequest) return;
    openAgentSettingsPanel(externalAgentSettingsRequest.panel);
  }, [externalAgentSettingsRequest, openAgentSettingsPanel]);
  const {
    nodes,
    setNodeFlowContext,
    setAppConfig,
    setProjectRoleUpdater,
    setViewportState,
    readingMode,
    setReadingMode,
    viewport,
    currentNodeId,
    setCurrentNode,
    addToGlobalHistory,
    globalAssetHistory,
  } = useNodeFlowStore();
  const { setViewport, screenToFlowPosition, getViewport, fitView } = useReactFlow();

  const minZoom = 0.25;
  const maxZoom = 4;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const keepPeripheralWidgetsOpen = showMiniMap;
  const [isLocked, setIsLocked] = useState(false);
  const [snapToGrid] = useState(true);
  const [snapGuide, setSnapGuide] = useState<EdgeAlignmentGuide | null>(null);
  const initialCanvasViewport = projectData.canvas?.viewport || null;
  const [zoomValue, setZoomValue] = useState(() => initialCanvasViewport?.zoom ?? getViewport().zoom ?? 1);
  const [liveViewport, setLiveViewport] = useState(() => initialCanvasViewport || getViewport());
  const liveViewportRef = useRef(liveViewport);
  const viewportCommitTimeoutRef = useRef<number | null>(null);
  const backgroundFieldRef = useRef<CanvasBackgroundFieldHandle | null>(null);

  useEffect(() => {
    setAppConfig(config);
  }, [config, setAppConfig]);

  useEffect(() => {
    if (!snapToGrid) setSnapGuide(null);
  }, [snapToGrid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const wasAutoQalamFirstRef = useRef(isAutoQalamFirst);
  useEffect(() => {
    if (isAutoQalamFirst && !wasAutoQalamFirstRef.current) {
      setDismissedAutoQalamFirst(false);
    }
    wasAutoQalamFirstRef.current = isAutoQalamFirst;
  }, [isAutoQalamFirst]);

  const toggleQalamFirstMode = useCallback(() => {
    if (isAutoQalamFirst) {
      setDismissedAutoQalamFirst((prev) => {
        const next = !prev;
        if (next) {
          setQalamCloseRequest((count) => count + 1);
        } else {
          setQalamOpenRequest((count) => count + 1);
        }
        return next;
      });
      return;
    }
    setIsQalamFirstManual((prev) => {
      const next = !prev;
      if (next) {
        setQalamOpenRequest((count) => count + 1);
      } else {
        setQalamCloseRequest((count) => count + 1);
      }
      return next;
    });
  }, [isAutoQalamFirst]);

  useEffect(() => {
  setNodeFlowContext({
      rawScript: projectData.rawScript || "",
      episodes: projectData.episodes || [],
      designAssets: projectData.designAssets || [],
      roles: projectData.roles || [],
    });
  }, [projectData, setNodeFlowContext]);

  useEffect(() => {
    setProjectRoleUpdater((roleId, updater) => {
      setProjectData((prev) => ({
        ...prev,
        roles: (prev.roles || []).map((role) => (role.id === roleId ? updater(role) : role)),
      }));
    });
    return () => setProjectRoleUpdater(null);
  }, [setProjectData, setProjectRoleUpdater]);

  useEffect(() => {
    setViewportState(getViewport());
  }, [getViewport, setViewportState]);

  const persistCanvasViewport = useCallback(
    (nextViewport: SharedCanvasViewport) => {
      setProjectData((previous) => ({
        ...previous,
        canvas: {
          ...(previous.canvas || {}),
          viewport: nextViewport,
        },
      }));
    },
    [setProjectData]
  );

  const lastViewportRef = useRef<string>("");
  const didInitFitRef = useRef(false);
  const didHydrateCanvasViewportRef = useRef(false);
  useEffect(() => {
    if (didHydrateCanvasViewportRef.current) return;
    const savedViewport = projectData.canvas?.viewport;
    if (!savedViewport) return;
    didHydrateCanvasViewportRef.current = true;
    liveViewportRef.current = savedViewport;
    setLiveViewport(savedViewport);
    setZoomValue(savedViewport.zoom);
    setViewport(savedViewport, { duration: 0 });
    setViewportState(savedViewport);
  }, [projectData.canvas?.viewport, setViewport, setViewportState]);

  useEffect(() => {
    if (!viewport) return;
    const key = `${viewport.x}:${viewport.y}:${viewport.zoom}`;
    if (lastViewportRef.current === key) return;
    lastViewportRef.current = key;
    setViewport(viewport, { duration: 0 });
  }, [setViewport, viewport]);

  useEffect(() => {
    if (!viewport) return;
    liveViewportRef.current = viewport;
    setLiveViewport(viewport);
  }, [viewport]);

  useEffect(() => {
    if (!liveViewport) return;
    setZoomValue(liveViewport.zoom);
  }, [liveViewport]);

  useEffect(() => {
    return () => {
      if (viewportCommitTimeoutRef.current != null) {
        window.clearTimeout(viewportCommitTimeoutRef.current);
        viewportCommitTimeoutRef.current = null;
      }
    };
  }, []);

  const handleQalamComposerAction = useCallback(() => {
    const text = composerInput.trim();
    if (isQalamSending && !text) {
      setQalamCancelRequest((prev) => prev + 1);
      return;
    }
    if (!text) {
      toggleQalamFirstMode();
      return;
    }
    setComposerInput("");
    setQalamSubmitRequest({ id: Date.now(), text });
  }, [composerInput, isQalamSending, toggleQalamFirstMode]);

  useEffect(() => {
    if (didInitFitRef.current) return;
    if (viewport) return;
    if (!nodes.length) return;
    fitView({ padding: 0.2, duration: 0 });
    didInitFitRef.current = true;
  }, [fitView, nodes.length, viewport]);

  useEffect(() => {
    const videoNodes = nodes.filter(
      (node) =>
        node.type === "wanReferenceVideoGen" ||
        node.type === "seedanceVideoGen"
    );
    videoNodes.forEach((node) => {
      const data = node.data as VideoGenNodeData & { ratio?: string };
      if (!data?.videoUrl) return;
      const alreadyAdded = globalAssetHistory.some(
        (item) => item.type === "video" && (item.sourceId === node.id || item.src === data.videoUrl)
      );
      if (alreadyAdded) return;
      addToGlobalHistory({
        type: "video",
        src: data.videoUrl,
        prompt: "Video Output",
        model: data.model,
        aspectRatio: data.aspectRatio || data.ratio,
        sourceId: node.id,
      });
    });
  }, [addToGlobalHistory, globalAssetHistory, nodes]);

  useEffect(() => {
    const selectedNode = nodes.find((node) => node.selected) || null;
    const nextCurrentNodeId = selectedNode?.id || null;
    if (nextCurrentNodeId !== currentNodeId) {
      setCurrentNode(nextCurrentNodeId);
    }
  }, [currentNodeId, nodes, setCurrentNode]);

  const handleZoomChange = useCallback(
    (value: number) => {
      const nextZoom = Math.min(maxZoom, Math.max(minZoom, value));
      const current = liveViewportRef.current || getViewport();
      const nextViewport = { ...current, zoom: nextZoom };
      liveViewportRef.current = nextViewport;
      setLiveViewport(nextViewport);
      setZoomValue(nextZoom);
      setViewport(nextViewport, { duration: 120 });
      setViewportState(nextViewport);
      persistCanvasViewport(nextViewport);
    },
    [getViewport, maxZoom, minZoom, persistCanvasViewport, setViewport, setViewportState]
  );

  const handleSharedViewportChange = useCallback(
    (nextViewport: SharedCanvasViewport, options?: { commit?: boolean }) => {
      liveViewportRef.current = nextViewport;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("qalam:viewport-frame", { detail: nextViewport }));
      }
      backgroundFieldRef.current?.requestDraw();
      if (options?.commit) {
        setLiveViewport(nextViewport);
        setZoomValue(nextViewport.zoom);
        setViewportState(nextViewport);
        persistCanvasViewport(nextViewport);
      }
    },
    [persistCanvasViewport, setViewportState]
  );

  const handleCanvasWheelCapture = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (isLocked || !event.ctrlKey) return;

      event.preventDefault();
      event.stopPropagation();

      const rect = event.currentTarget.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const current = liveViewportRef.current || getViewport();
      const normalizedDelta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const zoomFactor = Math.exp(-normalizedDelta * 0.002);
      const nextZoom = Math.min(maxZoom, Math.max(minZoom, current.zoom * zoomFactor));
      if (!Number.isFinite(nextZoom) || Math.abs(nextZoom - current.zoom) < 0.0001) return;

      const flowX = (pointerX - current.x) / current.zoom;
      const flowY = (pointerY - current.y) / current.zoom;
      const nextViewport = {
        x: pointerX - flowX * nextZoom,
        y: pointerY - flowY * nextZoom,
        zoom: nextZoom,
      };

      setViewport(nextViewport, { duration: 0 });
      handleSharedViewportChange(nextViewport);
      if (viewportCommitTimeoutRef.current != null) {
        window.clearTimeout(viewportCommitTimeoutRef.current);
      }
      viewportCommitTimeoutRef.current = window.setTimeout(() => {
        viewportCommitTimeoutRef.current = null;
        const committed = liveViewportRef.current;
        setLiveViewport(committed);
        setZoomValue(committed.zoom);
        setViewportState(committed);
        persistCanvasViewport(committed);
      }, 120);
    },
    [getViewport, handleSharedViewportChange, isLocked, maxZoom, minZoom, persistCanvasViewport, setViewport, setViewportState]
  );

  const handleToggleLock = useCallback(() => {
    setIsLocked((prev) => !prev);
  }, []);

  const handleToggleReadingMode = useCallback(() => {
    setReadingMode(readingMode === "identity" ? "full" : "identity");
  }, [readingMode, setReadingMode]);

  const handleCollapseCanvasCards = useCallback(() => {
    setReadingMode("identity");
  }, [setReadingMode]);

  const handleRestoreCanvasCards = useCallback(() => {
    setReadingMode("full");
  }, [setReadingMode]);

  const sharedCanvasControls = useMemo<SharedCanvasControls>(
    () => ({
      viewport: liveViewport,
      minZoom,
      maxZoom,
      isLocked,
      snapToGrid,
      showMiniMap,
      onViewportChange: handleSharedViewportChange,
      onViewportApiChange: () => {},
      onAlignmentGuideChange: setSnapGuide,
    }),
    [handleSharedViewportChange, isLocked, liveViewport, maxZoom, minZoom, showMiniMap, snapToGrid]
  );

  const flowSurface = useFlowSurface({
    projectData,
    setProjectData,
    onOpenEpisode: (episodeId) => setEditingScriptEpisodeId(episodeId),
    canvasControls: sharedCanvasControls,
    screenToFlowPosition,
    isActive: true,
    isWritingEditorOpen: editingScriptEpisodeId !== null,
    onCollapseCanvasCards: handleCollapseCanvasCards,
    onRestoreCanvasCards: handleRestoreCanvasCards,
    onOpenAgent: () => setQalamOpenRequest((count) => count + 1),
    onSubmitAgentMessage: (text) => setQalamSubmitRequest({ id: Date.now(), text }),
    agentComposerValue: composerInput,
    onAgentComposerChange: setComposerInput,
    onAgentComposerAction: handleQalamComposerAction,
    isAgentSending: isQalamSending,
    isAgentFirstMode: isQalamFirstMode,
  });

  const getToolbarNodePosition = useCallback(
    (fallback: XYPosition): XYPosition => {
      if (typeof window === "undefined") return fallback;
      return screenToFlowPosition({
        x: window.innerWidth / 2,
        y: Math.max(120, window.innerHeight / 2 - 160),
      });
    },
    [screenToFlowPosition]
  );

  const handleFlowAddNode = useCallback(
    (type: NodeType, fallback: XYPosition) => {
      const position = getToolbarNodePosition(fallback);
      return flowSurface.actions?.addNode?.(type, position) ?? null;
    },
    [getToolbarNodePosition, flowSurface.actions]
  );

  const handleFlowExport = useCallback(() => {
    flowSurface.actions?.exportNodeFlow?.();
  }, [flowSurface.actions]);

  const handleFlowRunAll = useCallback(() => {
    void flowSurface.actions?.runAll?.();
  }, [flowSurface.actions]);

  const handleFileImport = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target?.result as string) as NodeFlowFile;
          flowSurface.actions?.importNodeFlow?.(data);
        } catch (err) {
          alert("Failed to import Flow JSON");
        }
      };
      reader.readAsText(file);
      event.target.value = "";
    },
    [flowSurface.actions]
  );

  const activeTheme = useMemo(() => THEME_PRESETS[bgTheme], [bgTheme]);
  const patternDefinitions = useMemo(
    () => getPatternDefinitions(activeTheme, activeTheme.scheme === "light" ? 1.45 : 1),
    [activeTheme]
  );
  const patternPreviewDefinitions = useMemo(
    () => getPatternDefinitions(activeTheme, activeTheme.scheme === "light" ? 2.2 : 1.2),
    [activeTheme]
  );
  const patternOptions: { key: PatternKey; label: string }[] = [
    { key: "dots", label: "Dots" },
    { key: "grid", label: "Grid" },
    { key: "cross", label: "Cross" },
    { key: "lines", label: "Lines" },
    { key: "diagonal", label: "Diagonal" },
    { key: "none", label: "None" },
  ];

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const mapping: Record<string, string> = {
      "bg-base": activeTheme.bg,
      "bg-panel": activeTheme.panel,
      "bg-elevated": activeTheme.panelStrong,
      "bg-overlay": activeTheme.panelMuted,
      "bg-muted": activeTheme.panelSoft,
      "border-subtle": activeTheme.border,
      "border-strong": activeTheme.borderStrong,
      "text-primary": activeTheme.textPrimary,
      "text-secondary": activeTheme.textSecondary,
      "accent-blue": activeTheme.accent,
      "accent-green": "#10b981",
      "shadow-soft": activeTheme.panelShadow,
      "shadow-strong": activeTheme.panelShadowStrong,
      "dot-weak": activeTheme.patternSoft,
      "dot-strong": activeTheme.pattern,
      "app-bg": activeTheme.bg,
      "app-panel": activeTheme.panel,
      "app-panel-strong": activeTheme.panelStrong,
      "app-panel-muted": activeTheme.panelMuted,
      "app-panel-soft": activeTheme.panelSoft,
      "app-border": activeTheme.border,
      "app-border-strong": activeTheme.borderStrong,
      "app-text-primary": activeTheme.textPrimary,
      "app-text-secondary": activeTheme.textSecondary,
      "app-text-muted": activeTheme.textMuted,
      "app-accent": activeTheme.accent,
      "app-accent-strong": activeTheme.accentStrong,
      "app-accent-soft": activeTheme.accentSoft,
      "app-shadow": activeTheme.panelShadow,
      "app-shadow-strong": activeTheme.panelShadowStrong,
      "app-pattern": activeTheme.pattern,
      "node-bg": activeTheme.panel,
      "node-bg-selected": activeTheme.panelStrong,
      "node-bg-gradient": activeTheme.nodeBgGradient,
      "node-accent": activeTheme.accent,
      "node-text-primary": activeTheme.textPrimary,
      "node-text-secondary": activeTheme.textSecondary,
      "node-textarea-bg": activeTheme.panelMuted,
      "node-border": activeTheme.border,
      "node-border-strong": activeTheme.borderStrong,
      "node-surface": activeTheme.panelMuted,
      "node-surface-strong": activeTheme.panelSoft,
      "node-shadow": activeTheme.nodeShadow,
      "node-shadow-strong": activeTheme.nodeShadowStrong,
      "node-header-bg": activeTheme.nodeHeaderBg,
      "qalam-wordmark-glow": activeTheme.accentSoft,
    };
    Object.entries(mapping).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
    root.style.colorScheme = activeTheme.scheme;
  }, [activeTheme]);

  const backgroundStyle = useMemo(() => {
    const base = activeTheme.bg;
    return {
      backgroundColor: base,
      backgroundImage: "none",
      backgroundSize: "auto",
      backgroundPosition: "0 0",
      baseColor: base,
    };
  }, [activeTheme.bg]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      const base = (backgroundStyle as any).baseColor || activeTheme.bg;
      document.body.style.background = base;
      document.documentElement.style.background = base;
    }
  }, [activeTheme.bg, backgroundStyle]);

  useEffect(() => {
    if (!showThemeModal) return;

    const updateAnchor = () => {
      if (typeof document === "undefined") return;
      const anchor = document.querySelector("[data-theme-trigger]") as HTMLElement | null;
      if (anchor) {
        setThemeAnchor(anchor.getBoundingClientRect());
      }
    };

    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);

    return () => {
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
    };
  }, [showThemeModal]);

  const themeModalStyle = useMemo<React.CSSProperties>(() => {
    if (typeof window === "undefined" || !themeAnchor) {
      return {
        right: 24,
        bottom: 80,
        width: "min(360px,calc(100vw-24px))",
      };
    }

    const viewportPadding = 12;
    const width = Math.min(360, window.innerWidth - viewportPadding * 2);
    const left = Math.max(
      viewportPadding,
      Math.min(themeAnchor.left + themeAnchor.width / 2 - width / 2, window.innerWidth - viewportPadding - width)
    );
    const bottom = Math.max(16, window.innerHeight - themeAnchor.top + 12);

    return {
      left,
      bottom,
      width,
      maxWidth: `calc(100vw - ${viewportPadding * 2}px)`,
    };
  }, [themeAnchor]);

  const accountThemeControls = useMemo(
    () => (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--app-text-muted)]">Theme</span>
          <span className="truncate text-[10px] font-semibold text-[var(--app-text-secondary)]">{activeTheme.label}</span>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {(Object.keys(THEME_PRESETS) as ThemeKey[]).map((key) => {
            const theme = THEME_PRESETS[key];
            const isActive = bgTheme === key;
            return (
              <button
                key={key}
                type="button"
                title={theme.label}
                aria-label={theme.label}
                data-active={isActive}
                onClick={() => setBgTheme(key)}
                className="theme-account-swatch"
                style={{
                  borderColor: isActive ? theme.accentStrong : undefined,
                  background: `linear-gradient(135deg, ${theme.bg} 0 34%, ${theme.panel} 34% 67%, ${theme.accent} 67%)`,
                }}
              />
            );
          })}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {patternOptions.map((item) => (
            <button
              key={item.key}
              type="button"
              title={item.label}
              data-active={bgPattern === item.key}
              onClick={() => setBgPattern(item.key)}
              className="theme-account-pattern"
              style={
                item.key === "none"
                  ? {
                      background: `linear-gradient(180deg, ${activeTheme.panelStrong}, ${activeTheme.panelMuted})`,
                    }
                  : {
                      backgroundColor: activeTheme.panelStrong,
                      backgroundImage: `linear-gradient(180deg, ${activeTheme.accentSoft}, transparent 70%), ${patternPreviewDefinitions[item.key as Exclude<PatternKey, "none">].image}`,
                      backgroundSize: `100% 100%, ${patternPreviewDefinitions[item.key as Exclude<PatternKey, "none">].size(0.58)}`,
                      backgroundPosition: `0 0, ${patternPreviewDefinitions[item.key as Exclude<PatternKey, "none">].position ?? "0 0"}`,
                    }
              }
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    ),
    [activeTheme, bgPattern, bgTheme, patternOptions, patternPreviewDefinitions]
  );

  const qalamGlobalHeader = (
    <QalamAgent
      projectData={projectData}
      setProjectData={setProjectData}
      getAuthToken={getAuthToken}
      onOpenStats={() => openAgentSettingsPanel("provider")}
      settingsOpen={showAgentSettings}
      openRequest={qalamOpenRequest}
      closeRequest={qalamCloseRequest}
      submitRequest={qalamSubmitRequest}
      cancelRequest={qalamCancelRequest}
      onCollapsedChange={(collapsed) => {
        setIsQalamCollapsed(collapsed);
        if (collapsed) {
          if (isAutoQalamFirst) {
            setDismissedAutoQalamFirst(true);
          } else if (isQalamFirstMode) {
            setIsQalamFirstManual(false);
          }
          return;
        }
        if (isAutoQalamFirst) {
          setDismissedAutoQalamFirst(false);
        }
      }}
      onDockFrameChange={({ dockWidth }) => setAgentDockWidth(dockWidth)}
      onSendingChange={setIsQalamSending}
      renderCollapsedTrigger
      agentFirstMode={isQalamFirstMode}
    />
  );

  return (
    <div className="h-full w-full flex flex-col app-text-primary" style={backgroundStyle}>
      <div
        className="flex-1 relative node-flow-canvas"
        data-zoomed={zoomValue > 1}
        data-connecting={false}
        style={backgroundStyle}
        onWheelCapture={handleCanvasWheelCapture}
      >
        <CanvasBackgroundField
          ref={backgroundFieldRef}
          pattern={bgPattern}
          baseColor={activeTheme.bg}
          primaryColor={activeTheme.pattern}
          secondaryColor={activeTheme.patternSoft}
          accentColor={activeTheme.accentSoft}
          viewport={liveViewport}
          viewportRef={liveViewportRef}
          alignmentGuide={snapGuide}
          active={!showThemeModal}
        />
        {flowSurface.underlays}
        <ReactFlow
          nodes={flowSurface.nodes}
          edges={flowSurface.edges}
          onNodesChange={flowSurface.onNodesChange}
          onEdgesChange={flowSurface.onEdgesChange}
          onConnect={flowSurface.onConnect}
          onConnectStart={flowSurface.onConnectStart}
          onConnectEnd={flowSurface.onConnectEnd}
          onNodeClick={flowSurface.onNodeClick}
          onNodeDragStart={flowSurface.onNodeDragStart}
          onNodeDrag={flowSurface.onNodeDrag}
          onNodeDragStop={flowSurface.onNodeDragStop}
          onMove={(_, vp) => handleSharedViewportChange(vp)}
          onMoveEnd={(_, vp) => {
            handleSharedViewportChange(vp, { commit: true });
          }}
          minZoom={minZoom}
          maxZoom={maxZoom}
          nodesDraggable={flowSurface.nodesDraggable ?? !isLocked}
          nodesConnectable={flowSurface.nodesConnectable ?? !isLocked}
          elementsSelectable={flowSurface.elementsSelectable ?? !isLocked}
          panOnDrag={!isLocked}
          panOnScroll={!isLocked}
          panOnScrollMode={flowSurface.panOnScrollMode ?? PanOnScrollMode.Free}
          zoomOnScroll={false}
          zoomOnPinch={!isLocked}
          zoomOnDoubleClick={!isLocked}
          nodeTypes={flowSurface.nodeTypes}
          edgeTypes={flowSurface.edgeTypes}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={flowSurface.connectionLineType ?? ConnectionLineType.Bezier}
          defaultViewport={liveViewport}
          connectionLineStyle={flowSurface.connectionLineStyle}
          onlyRenderVisibleElements={flowSurface.onlyRenderVisibleElements}
          proOptions={{ hideAttribution: true }}
          data-canvas-surface="flow"
        >
          {showMiniMap && (
            <div
              className="nodeflow-minimap-drawer"
              data-open={showMiniMap}
              style={{ position: "absolute", right: 24, bottom: 76, pointerEvents: "auto" }}
            >
              <MiniMap
                className="nodeflow-minimap"
                style={{ height: 130, width: 180, background: "#0b0d10", borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 18px 40px rgba(0,0,0,0.35)" }}
                maskColor="rgba(255,255,255,0.04)"
                nodeStrokeColor="#38bdf8"
                nodeColor="#0ea5e9"
              />
            </div>
          )}
          {flowSurface.miniMap}
        </ReactFlow>
        {flowSurface.overlays}

        {snapToGrid ? (
          <EdgeAlignmentGuides guide={snapGuide} viewport={liveViewport} />
        ) : null}

      </div>

      {qalamGlobalHeader}

      <FloatingActionBar
        onAddText={() => handleFlowAddNode("text", { x: 100, y: 100 })}
        onAddIdentityCard={() => handleFlowAddNode("identityCard", { x: 220, y: 160 })}
        onAddImage={() => handleFlowAddNode("imageInput", { x: 200, y: 100 })}
        onAddAudio={() => handleFlowAddNode("audioInput", { x: 220, y: 120 })}
        onAddVideo={() => handleFlowAddNode("videoInput", { x: 240, y: 140 })}
        onAddNanoBananaImageGen={() => handleFlowAddNode("nanoBananaImageGen", { x: 410, y: 110 })}
        onAddWanImageGen={() => handleFlowAddNode("wanImageGen", { x: 420, y: 120 })}
        onAddViduVideoGen={() => handleFlowAddNode("viduVideoGen", { x: 510, y: 110 })}
        onAddWanReferenceVideoGen={() => handleFlowAddNode("wanReferenceVideoGen", { x: 540, y: 140 })}
        onAddSeedanceVideoGen={() => handleFlowAddNode("seedanceVideoGen", { x: 560, y: 160 })}
        onImport={() => fileInputRef.current?.click()}
        onExport={handleFlowExport}
        onRun={handleFlowRunAll}
        floating={false}
        syncIndicator={syncIndicator}
        onResetProject={onResetProject}
        onSignOut={onSignOut}
        onAssetLoad={onAssetLoad}
        accountInfo={accountInfo}
        accountThemeControls={accountThemeControls}
        showGlobalAccountTrigger
        showToolbar={false}
        variant="embedded"
      />

      <AgentSettingsPanel
        isOpen={showAgentSettings}
        onClose={() => setShowAgentSettings(false)}
        leftOffset={agentDockWidth}
        projectData={projectData}
        setProjectData={setProjectData}
        config={config}
        setConfig={setConfig}
        isSignedIn={isSignedIn}
        getAuthToken={getAuthToken ? async () => getAuthToken() : undefined}
        syncState={syncState}
        syncRollout={syncRollout}
        onForceSync={onForceSync}
        onOpenLanding={onOpenLanding}
        onResetProject={onResetProject}
        requestedPanel={agentSettingsPanel}
        onOpenVisualLab={(key = "glassLab") => onOpenModule?.(key)}
      />
      {editingScriptEpisodeId !== null ? (
        <WritingPanel
          projectData={projectData}
          setProjectData={setProjectData}
          getAuthToken={getAuthToken}
          initialEpisodeId={editingScriptEpisodeId}
          isQalamOpen={!isQalamCollapsed}
          onOpenQalam={() => setQalamOpenRequest((count) => count + 1)}
          onSubmitToQalam={(text) => setQalamSubmitRequest({ id: Date.now(), text })}
          onClose={() => setEditingScriptEpisodeId(null)}
        />
      ) : null}
      <div
        className="qalam-viewport-control-zone fixed bottom-0 left-0 z-[80] h-64 w-28 pointer-events-auto"
        data-keep-open={keepPeripheralWidgetsOpen && !isQalamFirstMode}
        data-qalam-first={isQalamFirstMode}
      >
        <div className="absolute bottom-4 left-4 pointer-events-none">
          <div className="pointer-events-auto flex items-end gap-3 qalam-bottom-agent">
            <div
              className={`qalam-bottom-controls transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                keepPeripheralWidgetsOpen && !isQalamFirstMode
                  ? "opacity-100"
                  : !isQalamFirstMode
                    ? "opacity-0"
                    : "opacity-0"
              }`}
            >
              <ViewportControls
                zoom={zoomValue}
                minZoom={minZoom}
                maxZoom={maxZoom}
                onZoomChange={handleZoomChange}
                isLocked={isLocked}
                onToggleLock={handleToggleLock}
                showMiniMap={showMiniMap}
                onToggleMiniMap={() => setShowMiniMap((prev) => !prev)}
                readingMode={readingMode}
                onToggleReadingMode={handleToggleReadingMode}
              />
            </div>
          </div>
        </div>
      </div>
      <Toast />
      <AnnotationModal />
      {showThemeModal && (
        <>
          <div className="theme-modal-backdrop fixed inset-0 z-50" onClick={() => setShowThemeModal(false)} />
          <div
            className="theme-modal fixed z-50 max-h-[min(58dvh,520px)] overflow-x-hidden overflow-y-auto rounded-[24px] p-3"
            style={themeModalStyle}
          >
            <div className="flex items-start gap-4">
              <div>
                <div className="theme-modal-eyebrow">Workspace Styling</div>
                <div className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-[var(--app-text-primary)]">主题与样式</div>
                <p className="mt-1 max-w-[30ch] text-[11px] leading-5 text-[var(--app-text-secondary)]">
                  调整底色、表面层次和背景纹理。
                </p>
              </div>
            </div>
            <div className="mt-4">
              <div className="mb-2 text-[10px] uppercase tracking-[0.24em] app-text-muted">颜色主题</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(Object.keys(THEME_PRESETS) as ThemeKey[]).map((key) => {
                  const theme = THEME_PRESETS[key];
                  const isActive = bgTheme === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setBgTheme(key)}
                      className="theme-preset-card flex min-h-[146px] flex-col rounded-[16px] border px-2.5 py-2.5 text-left transition"
                      data-active={isActive}
                      style={isActive ? {
                        borderColor: theme.accentStrong,
                        boxShadow: `0 8px 20px ${theme.accentSoft}`,
                        background: `linear-gradient(180deg, ${theme.panelSoft}, ${theme.panelMuted})`,
                      } : undefined}
                    >
                      <div className="relative min-h-[48px]">
                        <div className={isActive ? "pr-16" : undefined}>
                          <div className="text-[13px] font-semibold tracking-[-0.02em] text-[var(--app-text-primary)]">{theme.label}</div>
                          <div className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-[var(--app-text-muted)]">{theme.description}</div>
                        </div>
                        {isActive && (
                          <span
                            className="absolute right-0 top-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.16em]"
                            style={{ color: theme.accentStrong, background: theme.accentSoft }}
                          >
                            Active
                          </span>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-1.5">
                        <span className="h-6 rounded-[10px] border border-white/5" style={{ background: theme.bg }} />
                        <span className="h-6 rounded-[10px] border border-white/5" style={{ background: theme.panel }} />
                        <span className="h-6 rounded-[10px] border border-white/5" style={{ background: theme.accent }} />
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[8px] uppercase tracking-[0.14em] app-text-muted">
                        <span>Base</span>
                        <span>Surface</span>
                        <span style={{ color: isActive ? theme.accentStrong : undefined }}>Accent</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4">
              <div className="mb-2 text-[10px] uppercase tracking-[0.24em] app-text-muted">图案</div>
              <div className="grid grid-cols-2 gap-2">
                {patternOptions.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setBgPattern(item.key)}
                    className="theme-pattern-card flex flex-col gap-1.5 rounded-[14px] border px-2.5 py-2 text-left transition"
                    data-active={bgPattern === item.key}
                    style={bgPattern === item.key ? {
                      borderColor: activeTheme.accentStrong,
                      boxShadow: `0 6px 16px ${activeTheme.accentSoft}`,
                    } : undefined}
                  >
                    <span
                      className="theme-pattern-preview h-7 rounded-[10px] border border-white/5"
                      style={item.key === "none"
                        ? {
                            background: `linear-gradient(180deg, ${activeTheme.panelStrong}, ${activeTheme.panelMuted})`,
                          }
                        : {
                            backgroundColor: activeTheme.panelStrong,
                            backgroundImage: `linear-gradient(180deg, ${activeTheme.accentSoft}, transparent 70%), ${patternPreviewDefinitions[item.key as Exclude<PatternKey, "none">].image}`,
                            backgroundSize: `100% 100%, ${patternPreviewDefinitions[item.key as Exclude<PatternKey, "none">].size(0.62)}`,
                            backgroundPosition: `0 0, ${patternPreviewDefinitions[item.key as Exclude<PatternKey, "none">].position ?? "0 0"}`,
                          }}
                    />
                    <span className="text-[12px] font-medium text-[var(--app-text-primary)]">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
      <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleFileImport} />
    </div>
  );
};

export const CreativeWorkspace: React.FC<CreativeWorkspaceProps> = (props) => {
  return (
    <ReactFlowProvider>
      <CreativeWorkspaceInner {...props} />
    </ReactFlowProvider>
  );
};
