import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  ReactFlow,
  MiniMap,
  Connection,
  NodeTypes,
  EdgeTypes,
  useReactFlow,
  OnConnectEnd,
  ReactFlowProvider,
  ConnectionMode,
  XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../styles/nodeflow.css";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { getNodeHandles, inferHandleTypeFromNodeType, isTypedHandle, isValidConnection, nodeSupportsHandle } from "../utils/handles";
import { NodeFlowFile, NodeType, GroupNodeData, VideoGenNodeData } from "../types";
import { EditableEdge } from "../edges/EditableEdge";
import {
  AudioInputNode,
  ImageInputNode, AnnotationNode, TextNode,
  KnowledgeNode,
  ScriptBoardNode,
  StoryboardBoardNode,
  IdentityCardNode,
  GroupNode,
  ImageGenNode,
  NanoBananaImageGenNode,
  WanImageGenNode,
  SoraVideoGenNode,
  WanVideoGenNode,
  WanReferenceVideoGenNode,
  ViduVideoGenNode,
  SeedanceVideoGenNode,
  ShotNode,
} from "../nodes";
import { useNodeFlowExecutor } from "../store/useNodeFlowExecutor";
import { MultiSelectToolbar } from "./MultiSelectToolbar";
import { FloatingActionBar } from "./FloatingActionBar";
import { ConnectionDropMenu } from "./ConnectionDropMenu";
import { AssetsPanel } from "./AssetsPanel";
import { AgentSettingsPanel } from "./AgentSettingsPanel";
import { QalamAgent } from "./QalamAgent";
import { ViewportControls } from "./ViewportControls";
import { Toast, useToast } from "./Toast";
import { AnnotationModal } from "./AnnotationModal";
import { ProjectData } from "../../types";
import type { ModuleKey } from "./ModuleBar";
import { FolderOpen, FileText, List } from "lucide-react";
import { ArrowUp, CircleNotch } from "@phosphor-icons/react";
import { getSuggestedCanvasOrigin } from "../utils/episodeShotWorkflow";
import { toNodeFlowCanvasLink, toNodeFlowCanvasNode } from "../nodeflow/reactflow";

const nodeTypes: NodeTypes = {
  imageInput: ImageInputNode,
  audioInput: AudioInputNode,
  annotation: AnnotationNode,
  knowledge: KnowledgeNode,
  text: TextNode,
  scriptBoard: ScriptBoardNode,
  storyboardBoard: StoryboardBoardNode,
  identityCard: IdentityCardNode,
  group: GroupNode,
  imageGen: ImageGenNode,
  nanoBananaImageGen: NanoBananaImageGenNode,
  wanImageGen: WanImageGenNode,
  soraVideoGen: SoraVideoGenNode,
  wanVideoGen: WanVideoGenNode,
  wanReferenceVideoGen: WanReferenceVideoGenNode,
  viduVideoGen: ViduVideoGenNode,
  seedanceVideoGen: SeedanceVideoGenNode,
  shot: ShotNode,
};

const edgeTypes: EdgeTypes = {
  editable: EditableEdge,
};

interface ConnectionDropState {
  position: { x: number; y: number };
  flowPosition: { x: number; y: number };
  handleType: "image" | "text" | "audio" | null;
  connectionType: "source" | "target";
  sourceNodeId: string | null;
  sourceHandleId: string | null;
}

const pickOutputHandle = (handles: string[], preferred?: "image" | "text" | "audio" | null) => {
  if (preferred && handles.includes(preferred)) return preferred;
  if (preferred && handles.includes("multi")) return "multi";
  return handles.find((handle) => handle !== "multi") || handles[0] || null;
};

const pickInputHandle = (
  handles: string[],
  preferred?: "image" | "text" | "audio" | null,
  existingHandleId?: string | null
) => {
  if (existingHandleId && handles.includes(existingHandleId)) {
    if (existingHandleId === "multi") return "multi";
    if (!preferred || existingHandleId === preferred) return existingHandleId;
  }
  if (preferred && handles.includes(preferred)) return preferred;
  if (preferred && handles.includes("multi")) return "multi";
  return handles[0] || null;
};

interface NodeFlowProps {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  getAuthToken?: (options?: { skipCache?: boolean }) => Promise<string | null>;
  onAssetLoad?: (
    type:
      | "script"
      | "globalStyleGuide"
      | "shotGuide"
      | "soraGuide"
      | "storyboardGuide"
      | "dramaGuide"
      | "csvShots"
      | "understandingJson",
    content: string,
    fileName?: string
  ) => void;
  onOpenModule?: (key: ModuleKey) => void;
  syncIndicator?: { label: string; color: string } | null;
  onExportCsv?: () => void;
  onExportXls?: () => void;
  onExportUnderstandingJson?: () => void;
  onOpenStats?: () => void;
  onToggleTheme?: () => void;
  isDarkMode?: boolean;
  onOpenSyncPanel?: () => void;
  onOpenInfoPanel?: () => void;
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
  onToggleWorkflow?: (anchorRect?: DOMRect) => void;
  onTryMe?: () => void;
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
  groupBg: string;
  groupBgSelected: string;
  groupBorder: string;
  groupBorderStrong: string;
  groupHighlight: string;
  groupShadow: string;
  scheme: "light" | "dark";
};

const THEME_PRESETS: Record<ThemeKey, ThemePreset> = {
  dark: {
    label: "Midnight",
    description: "Deep ink glass with electric cyan accents and cleaner contrast.",
    bg: "#07141d",
    panel: "rgba(8, 23, 33, 0.84)",
    panelStrong: "rgba(13, 31, 45, 0.94)",
    panelMuted: "rgba(83, 211, 255, 0.1)",
    panelSoft: "rgba(83, 211, 255, 0.16)",
    border: "rgba(125, 224, 255, 0.18)",
    borderStrong: "rgba(125, 224, 255, 0.32)",
    textPrimary: "#effaff",
    textSecondary: "rgba(239, 250, 255, 0.72)",
    textMuted: "rgba(239, 250, 255, 0.46)",
    accent: "#53d3ff",
    accentStrong: "#8cecff",
    accentSoft: "rgba(83, 211, 255, 0.18)",
    panelShadow: "0 16px 40px rgba(1, 10, 18, 0.34)",
    panelShadowStrong: "0 24px 56px rgba(1, 10, 18, 0.44)",
    nodeShadow: "0 24px 54px rgba(1, 10, 18, 0.38)",
    nodeShadowStrong: "0 30px 68px rgba(1, 10, 18, 0.48)",
    pattern: "rgba(140, 236, 255, 0.12)",
    patternSoft: "rgba(140, 236, 255, 0.055)",
    nodeBgGradient: "linear-gradient(160deg, rgba(16, 40, 56, 0.96), rgba(6, 20, 30, 0.98))",
    nodeHeaderBg: "rgba(83, 211, 255, 0.08)",
    groupBg: "rgba(15, 39, 54, 0.62)",
    groupBgSelected: "rgba(18, 50, 68, 0.78)",
    groupBorder: "rgba(125, 224, 255, 0.16)",
    groupBorderStrong: "rgba(125, 224, 255, 0.3)",
    groupHighlight: "rgba(255, 255, 255, 0.08)",
    groupShadow: "0 30px 70px rgba(1, 10, 18, 0.38)",
    scheme: "dark",
  },
  light: {
    label: "Cloud",
    description: "Crisp porcelain surfaces with a sharper cobalt edge.",
    bg: "#eef5ff",
    panel: "rgba(255, 255, 255, 0.82)",
    panelStrong: "rgba(255, 255, 255, 0.94)",
    panelMuted: "rgba(50, 118, 255, 0.08)",
    panelSoft: "rgba(50, 118, 255, 0.14)",
    border: "rgba(43, 95, 214, 0.14)",
    borderStrong: "rgba(43, 95, 214, 0.24)",
    textPrimary: "#14233a",
    textSecondary: "rgba(20, 35, 58, 0.7)",
    textMuted: "rgba(20, 35, 58, 0.44)",
    accent: "#3276ff",
    accentStrong: "#2157cb",
    accentSoft: "rgba(50, 118, 255, 0.16)",
    panelShadow: "0 14px 36px rgba(20, 35, 58, 0.08)",
    panelShadowStrong: "0 20px 48px rgba(20, 35, 58, 0.1)",
    nodeShadow: "0 18px 40px rgba(20, 35, 58, 0.12)",
    nodeShadowStrong: "0 24px 52px rgba(20, 35, 58, 0.14)",
    pattern: "rgba(50, 118, 255, 0.1)",
    patternSoft: "rgba(50, 118, 255, 0.04)",
    nodeBgGradient: "linear-gradient(160deg, rgba(255, 255, 255, 0.98), rgba(236, 244, 255, 0.96))",
    nodeHeaderBg: "rgba(50, 118, 255, 0.05)",
    groupBg: "rgba(50, 118, 255, 0.05)",
    groupBgSelected: "rgba(50, 118, 255, 0.1)",
    groupBorder: "rgba(43, 95, 214, 0.12)",
    groupBorderStrong: "rgba(43, 95, 214, 0.2)",
    groupHighlight: "rgba(255, 255, 255, 0.88)",
    groupShadow: "0 20px 44px rgba(20, 35, 58, 0.08)",
    scheme: "light",
  },
  sand: {
    label: "Amber",
    description: "Warm sunlit paper with cleaner caramel contrast.",
    bg: "#f8ecdc",
    panel: "rgba(255, 249, 241, 0.84)",
    panelStrong: "rgba(255, 252, 247, 0.94)",
    panelMuted: "rgba(214, 123, 28, 0.09)",
    panelSoft: "rgba(214, 123, 28, 0.15)",
    border: "rgba(185, 90, 20, 0.16)",
    borderStrong: "rgba(185, 90, 20, 0.26)",
    textPrimary: "#402311",
    textSecondary: "rgba(64, 35, 17, 0.68)",
    textMuted: "rgba(64, 35, 17, 0.44)",
    accent: "#d67b1c",
    accentStrong: "#b95a14",
    accentSoft: "rgba(214, 123, 28, 0.17)",
    panelShadow: "0 14px 34px rgba(99, 51, 16, 0.08)",
    panelShadowStrong: "0 18px 46px rgba(99, 51, 16, 0.11)",
    nodeShadow: "0 18px 42px rgba(99, 51, 16, 0.12)",
    nodeShadowStrong: "0 22px 54px rgba(99, 51, 16, 0.14)",
    pattern: "rgba(214, 123, 28, 0.1)",
    patternSoft: "rgba(214, 123, 28, 0.045)",
    nodeBgGradient: "linear-gradient(160deg, rgba(255, 252, 247, 0.98), rgba(246, 234, 217, 0.96))",
    nodeHeaderBg: "rgba(214, 123, 28, 0.05)",
    groupBg: "rgba(214, 123, 28, 0.05)",
    groupBgSelected: "rgba(214, 123, 28, 0.1)",
    groupBorder: "rgba(185, 90, 20, 0.12)",
    groupBorderStrong: "rgba(185, 90, 20, 0.22)",
    groupHighlight: "rgba(255, 255, 255, 0.72)",
    groupShadow: "0 20px 44px rgba(99, 51, 16, 0.08)",
    scheme: "light",
  },
  creative: {
    label: "Jade",
    description: "Clear botanical green with brighter glass layers and less haze.",
    bg: "#e8fbef",
    panel: "rgba(250, 255, 252, 0.82)",
    panelStrong: "rgba(252, 255, 253, 0.94)",
    panelMuted: "rgba(7, 182, 108, 0.09)",
    panelSoft: "rgba(7, 182, 108, 0.16)",
    border: "rgba(7, 182, 108, 0.16)",
    borderStrong: "rgba(7, 182, 108, 0.28)",
    textPrimary: "#113424",
    textSecondary: "rgba(17, 52, 36, 0.68)",
    textMuted: "rgba(17, 52, 36, 0.44)",
    accent: "#07b66c",
    accentStrong: "#058f56",
    accentSoft: "rgba(7, 182, 108, 0.18)",
    panelShadow: "0 14px 34px rgba(11, 66, 42, 0.08)",
    panelShadowStrong: "0 18px 46px rgba(11, 66, 42, 0.1)",
    nodeShadow: "0 18px 42px rgba(11, 66, 42, 0.11)",
    nodeShadowStrong: "0 22px 54px rgba(11, 66, 42, 0.14)",
    pattern: "rgba(7, 182, 108, 0.1)",
    patternSoft: "rgba(7, 182, 108, 0.045)",
    nodeBgGradient: "linear-gradient(160deg, rgba(252, 255, 253, 0.98), rgba(233, 250, 239, 0.96))",
    nodeHeaderBg: "rgba(7, 182, 108, 0.05)",
    groupBg: "rgba(7, 182, 108, 0.05)",
    groupBgSelected: "rgba(7, 182, 108, 0.1)",
    groupBorder: "rgba(7, 182, 108, 0.12)",
    groupBorderStrong: "rgba(7, 182, 108, 0.22)",
    groupHighlight: "rgba(255, 255, 255, 0.74)",
    groupShadow: "0 20px 44px rgba(11, 66, 42, 0.08)",
    scheme: "light",
  },
  calm: {
    label: "Azure",
    description: "Airy blue glass with cooler depth and clearer separation.",
    bg: "#e9f5ff",
    panel: "rgba(248, 252, 255, 0.82)",
    panelStrong: "rgba(255, 255, 255, 0.94)",
    panelMuted: "rgba(31, 148, 255, 0.08)",
    panelSoft: "rgba(31, 148, 255, 0.15)",
    border: "rgba(11, 99, 216, 0.15)",
    borderStrong: "rgba(11, 99, 216, 0.26)",
    textPrimary: "#102e46",
    textSecondary: "rgba(16, 46, 70, 0.68)",
    textMuted: "rgba(16, 46, 70, 0.44)",
    accent: "#1f94ff",
    accentStrong: "#0b63d8",
    accentSoft: "rgba(31, 148, 255, 0.17)",
    panelShadow: "0 14px 34px rgba(14, 48, 88, 0.08)",
    panelShadowStrong: "0 18px 46px rgba(14, 48, 88, 0.1)",
    nodeShadow: "0 18px 42px rgba(14, 48, 88, 0.11)",
    nodeShadowStrong: "0 22px 54px rgba(14, 48, 88, 0.14)",
    pattern: "rgba(31, 148, 255, 0.1)",
    patternSoft: "rgba(31, 148, 255, 0.045)",
    nodeBgGradient: "linear-gradient(160deg, rgba(255, 255, 255, 0.98), rgba(232, 245, 255, 0.96))",
    nodeHeaderBg: "rgba(31, 148, 255, 0.05)",
    groupBg: "rgba(31, 148, 255, 0.05)",
    groupBgSelected: "rgba(31, 148, 255, 0.1)",
    groupBorder: "rgba(11, 99, 216, 0.12)",
    groupBorderStrong: "rgba(11, 99, 216, 0.22)",
    groupHighlight: "rgba(255, 255, 255, 0.78)",
    groupShadow: "0 20px 44px rgba(14, 48, 88, 0.08)",
    scheme: "light",
  },
  lively: {
    label: "Coral",
    description: "Bright coral warmth with cleaner blush highlights.",
    bg: "#fff0ec",
    panel: "rgba(255, 248, 246, 0.84)",
    panelStrong: "rgba(255, 252, 251, 0.94)",
    panelMuted: "rgba(255, 106, 77, 0.08)",
    panelSoft: "rgba(255, 106, 77, 0.15)",
    border: "rgba(219, 77, 50, 0.15)",
    borderStrong: "rgba(219, 77, 50, 0.26)",
    textPrimary: "#452019",
    textSecondary: "rgba(69, 32, 25, 0.68)",
    textMuted: "rgba(69, 32, 25, 0.44)",
    accent: "#ff6a4d",
    accentStrong: "#db4d32",
    accentSoft: "rgba(255, 106, 77, 0.18)",
    panelShadow: "0 14px 34px rgba(105, 38, 26, 0.08)",
    panelShadowStrong: "0 18px 46px rgba(105, 38, 26, 0.1)",
    nodeShadow: "0 18px 42px rgba(105, 38, 26, 0.11)",
    nodeShadowStrong: "0 22px 54px rgba(105, 38, 26, 0.14)",
    pattern: "rgba(255, 106, 77, 0.1)",
    patternSoft: "rgba(255, 106, 77, 0.045)",
    nodeBgGradient: "linear-gradient(160deg, rgba(255, 252, 251, 0.98), rgba(255, 235, 229, 0.96))",
    nodeHeaderBg: "rgba(255, 106, 77, 0.05)",
    groupBg: "rgba(255, 106, 77, 0.05)",
    groupBgSelected: "rgba(255, 106, 77, 0.1)",
    groupBorder: "rgba(219, 77, 50, 0.12)",
    groupBorderStrong: "rgba(219, 77, 50, 0.22)",
    groupHighlight: "rgba(255, 255, 255, 0.76)",
    groupShadow: "0 20px 44px rgba(105, 38, 26, 0.08)",
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

const getPatternDefinitions = (
  theme: ThemePreset,
  intensity = 1
): Record<Exclude<PatternKey, "none">, { image: string; size: (scale: number) => string; position?: string }> => {
  const primary = boostAlpha(theme.pattern, intensity);
  const secondary = boostAlpha(theme.patternSoft, intensity);

  return ({
  dots: {
    image:
      `radial-gradient(circle at 1px 1px, ${primary} 1px, transparent 0), radial-gradient(circle at 1px 1px, ${secondary} 1px, transparent 0)`,
    size: (scale) => `${30 * scale}px ${30 * scale}px, ${30 * scale}px ${30 * scale}px`,
    position: "0 0, 15px 15px",
  },
  grid: {
    image: `linear-gradient(${secondary} 1px, transparent 1px), linear-gradient(90deg, ${secondary} 1px, transparent 1px)`,
    size: (scale) => `${38 * scale}px ${38 * scale}px`,
  },
  cross: {
    image:
      `linear-gradient(${secondary} 1px, transparent 1px), linear-gradient(90deg, ${secondary} 1px, transparent 1px), radial-gradient(circle, ${secondary} 1px, transparent 1px)`,
    size: (scale) => `${36 * scale}px ${36 * scale}px, ${36 * scale}px ${36 * scale}px, ${36 * scale}px ${36 * scale}px`,
    position: "0 0, 0 0, 18px 18px",
  },
  lines: {
    image: `linear-gradient(0deg, ${secondary} 1px, transparent 1px)`,
    size: (scale) => `${34 * scale}px ${34 * scale}px`,
  },
  diagonal: {
    image:
      `linear-gradient(135deg, ${secondary} 12.5%, transparent 12.5%, transparent 50%, ${secondary} 50%, ${secondary} 62.5%, transparent 62.5%, transparent)`,
    size: (scale) => `${32 * scale}px ${32 * scale}px`,
  },
  });
};

const NodeFlowInner: React.FC<NodeFlowProps> = ({
  projectData,
  setProjectData,
  getAuthToken,
  onAssetLoad,
  onOpenModule,
  syncIndicator,
  onExportCsv,
  onExportXls,
  onExportUnderstandingJson,
  onOpenStats,
  onToggleTheme,
  isDarkMode,
  onOpenSyncPanel,
  onOpenInfoPanel,
  onResetProject,
  onSignOut,
  accountInfo,
  onToggleWorkflow,
}) => {
  const [bgTheme, setBgTheme] = useState<ThemeKey>("dark");
  const [bgPattern, setBgPattern] = useState<PatternKey>("grid");
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [themeAnchor, setThemeAnchor] = useState<DOMRect | null>(null);
  const showPeripheralWidgets = false;
  const [showAgentSettings, setShowAgentSettings] = useState(false);
  const [agentSettingsPanel, setAgentSettingsPanel] = useState<"provider" | "tools" | "skills" | "dashboard" | "history">("provider");
  const [agentDockWidth, setAgentDockWidth] = useState(0);
  const [isQalamCollapsed, setIsQalamCollapsed] = useState(true);
  const [isQalamSending, setIsQalamSending] = useState(false);
  const [qalamOpenRequest, setQalamOpenRequest] = useState(0);
  const [qalamSubmitRequest, setQalamSubmitRequest] = useState<{ id: number; text: string } | null>(null);
  const [qalamCancelRequest, setQalamCancelRequest] = useState(0);
  const [composerInput, setComposerInput] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const openAgentSettingsPanel = useCallback(
    (panel: "provider" | "tools" | "skills" | "dashboard" | "history" = "provider") => {
      setAgentSettingsPanel(panel);
      setShowAgentSettings(true);
    },
    []
  );
  const {
    nodes,
    links,
    revision,
    addNode,
    addNodesAndLinks,
    updateNodeData,
    onNodesChange,
    onLinksChange,
    connectNodes,
    exportNodeFlow,
    importNodeFlow,
    setGlobalStyleGuide,
    setNodeFlowContext,
    setProjectRoleUpdater,
    setViewportState,
    readingMode,
    setReadingMode,
    saveGroupTemplate,
    applyGroupTemplate,
    deleteGroupTemplate,
    groupTemplates,
    viewport,
    addToGlobalHistory,
    globalAssetHistory,
  } = useNodeFlowStore();
  const { setViewport, screenToFlowPosition, getViewport, fitView } = useReactFlow();
  const { show: showToast } = useToast();
  const { runImageGen, runVideoGen } = useNodeFlowExecutor();

  const minZoom = 0.25;
  const maxZoom = 4;
  const [connectionDrop, setConnectionDrop] = useState<ConnectionDropState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [zoomValue, setZoomValue] = useState(() => getViewport().zoom ?? 1);
  const [liveViewport, setLiveViewport] = useState(() => getViewport());

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!isValidConnection(connection)) return;
      connectNodes(connection, { expectedRevision: revision });
      setIsConnecting(false);
    },
    [connectNodes, revision]
  );

  const handleConnectStart = useCallback(() => {
    setIsConnecting(true);
  }, []);

  /* New: Sync global style guide to store so executors can use it */
  useEffect(() => {
    if (projectData.globalStyleGuide) {
      setGlobalStyleGuide(projectData.globalStyleGuide);
    }
  }, [projectData.globalStyleGuide, setGlobalStyleGuide]);

  useEffect(() => {
  setNodeFlowContext({
      rawScript: projectData.rawScript || "",
      episodes: projectData.episodes || [],
      designAssets: projectData.designAssets || [],
      globalStyleGuide: projectData.globalStyleGuide || "",
      shotGuide: projectData.shotGuide || "",
      soraGuide: projectData.soraGuide || "",
      storyboardGuide: projectData.storyboardGuide || "",
      dramaGuide: projectData.dramaGuide || "",
      context: projectData.context,
    });
  }, [projectData, setNodeFlowContext]);

  useEffect(() => {
    setProjectRoleUpdater((roleId, updater) => {
      setProjectData((prev) => ({
        ...prev,
        context: {
          ...prev.context,
          roles: (prev.context.roles || []).map((role) => (role.id === roleId ? updater(role) : role)),
        },
      }));
    });
    return () => setProjectRoleUpdater(null);
  }, [setProjectData, setProjectRoleUpdater]);

  useEffect(() => {
    setViewportState(getViewport());
  }, [getViewport, setViewportState]);

  const lastViewportRef = useRef<string>("");
  const didInitFitRef = useRef(false);
  useEffect(() => {
    if (!viewport) return;
    const key = `${viewport.x}:${viewport.y}:${viewport.zoom}`;
    if (lastViewportRef.current === key) return;
    lastViewportRef.current = key;
    setViewport(viewport, { duration: 0 });
  }, [setViewport, viewport]);

  useEffect(() => {
    if (!viewport) return;
    setLiveViewport(viewport);
  }, [viewport]);

  useEffect(() => {
    if (!liveViewport) return;
    setZoomValue(liveViewport.zoom);
  }, [liveViewport]);

  const resizeComposer = useCallback((el?: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 46), 132)}px`;
    el.style.overflowY = el.scrollHeight > 132 ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    resizeComposer(composerRef.current);
  }, [composerInput, resizeComposer]);

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
        node.type === "soraVideoGen" ||
        node.type === "wanVideoGen" ||
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

  const handleConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      setIsConnecting(false);
      if (connectionState.isValid || !connectionState.fromNode) return;
      // Extract clientX/clientY from the event correctly (it can be MouseEvent or TouchEvent)
      const e = event as any;
      const clientX = e.clientX || e.touches?.[0]?.clientX;
      const clientY = e.clientY || e.touches?.[0]?.clientY;

      const fromHandleId = connectionState.fromHandle?.id || null;
      const fromHandleType =
        fromHandleId === "image" || fromHandleId === "text" || fromHandleId === "audio"
          ? fromHandleId
          : null;
      const isFromSource = connectionState.fromHandle?.type === "source";
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
      setConnectionDrop({
        position: { x: clientX, y: clientY },
        flowPosition: flowPos,
        handleType: fromHandleType,
        connectionType: isFromSource ? "source" : "target",
        sourceNodeId: connectionState.fromNode.id,
        sourceHandleId: connectionState.fromHandle?.id || null,
      });
    },
    [screenToFlowPosition]
  );

  const handleAddNode = useCallback((type: NodeType, position: XYPosition) => {
    return addNode(type, position, undefined, undefined, { expectedRevision: revision });
  }, [addNode, revision]);

  const handleDropCreate = (type: NodeType) => {
    if (!connectionDrop) return;

    const position = connectionDrop.flowPosition;
    const existingNode = connectionDrop.sourceNodeId
      ? useNodeFlowStore.getState().nodes.find((node) => node.id === connectionDrop.sourceNodeId)
      : null;
    const existingNodeHandles = existingNode ? getNodeHandles(existingNode.type) : { inputs: [], outputs: [] };
    const newNodeHandles = getNodeHandles(type);
    const existingTypedHandle =
      isTypedHandle(connectionDrop.sourceHandleId) ? connectionDrop.sourceHandleId : null;
    const inferredExistingType = existingNode ? inferHandleTypeFromNodeType(existingNode.type) : null;
    const preferredHandleType = connectionDrop.handleType || existingTypedHandle || inferredExistingType;

    const canAttach =
      connectionDrop.connectionType === "source"
        ? Boolean(pickInputHandle(newNodeHandles.inputs, preferredHandleType))
        : Boolean(pickOutputHandle(newNodeHandles.outputs, preferredHandleType));

    if (!canAttach) {
      showToast(
        preferredHandleType
          ? `该节点不支持 ${preferredHandleType} 类型素材连接`
          : "该节点没有可用于自动连接的端口",
        "warning"
      );
      setConnectionDrop(null);
      return;
    }

    const newId = handleAddNode(type, position);
    const latestRevision = useNodeFlowStore.getState().revision;

    if (connectionDrop.connectionType === "source") {
      const resolvedSourceHandle =
        (isTypedHandle(connectionDrop.sourceHandleId) ? connectionDrop.sourceHandleId : null) ||
        pickOutputHandle(existingNodeHandles.outputs, preferredHandleType);
      const resolvedTargetHandle = pickInputHandle(newNodeHandles.inputs, preferredHandleType);

      if (!resolvedSourceHandle || !resolvedTargetHandle || !connectionDrop.sourceNodeId) {
        showToast("新节点已创建，但未能推断出有效连接端口", "warning");
        setConnectionDrop(null);
        return;
      }

      connectNodes(
        {
          source: connectionDrop.sourceNodeId,
          sourceHandle: resolvedSourceHandle,
          target: newId,
          targetHandle: resolvedTargetHandle,
        },
        { expectedRevision: latestRevision }
      );
    } else {
      const resolvedSourceHandle = pickOutputHandle(
        newNodeHandles.outputs,
        preferredHandleType || inferHandleTypeFromNodeType(type)
      );
      const resolvedTargetHandle = pickInputHandle(
        existingNodeHandles.inputs,
        preferredHandleType || (isTypedHandle(resolvedSourceHandle) ? resolvedSourceHandle : inferHandleTypeFromNodeType(type)),
        connectionDrop.sourceHandleId
      );

      if (!resolvedSourceHandle || !resolvedTargetHandle || !connectionDrop.sourceNodeId) {
        showToast("新节点已创建，但未能推断出有效连接端口", "warning");
        setConnectionDrop(null);
        return;
      }

      connectNodes(
        {
          source: newId,
          sourceHandle: resolvedSourceHandle,
          target: connectionDrop.sourceNodeId,
          targetHandle: resolvedTargetHandle,
        },
        { expectedRevision: latestRevision }
      );
    }

    setConnectionDrop(null);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string) as NodeFlowFile;
        importNodeFlow(data);
      } catch (err) {
        alert("Failed to import NodeFlow JSON");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const getSelectedGroup = useCallback(
    () => nodes.find((node) => node.selected && node.type === "group"),
    [nodes]
  );

  const handleCreateTemplate = useCallback(() => {
    const selectedGroup = getSelectedGroup();
    if (!selectedGroup) {
      showToast("请先选中一个 Group", "warning");
      return;
    }
    const defaultName = (selectedGroup.data as GroupNodeData).title || "Group Template";
    const name = window.prompt("模板名称", defaultName);
    if (!name || !name.trim()) return;
    const result = saveGroupTemplate(selectedGroup.id, name.trim());
    if (!result.ok) {
      showToast(result.error || "创建模板失败", "error");
      return;
    }
    showToast("已保存为模板", "success");
  }, [getSelectedGroup, saveGroupTemplate, showToast]);

  const handleLoadTemplate = useCallback(
    (templateId: string) => {
      const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const flowPos = screenToFlowPosition(center);
      const result = applyGroupTemplate(templateId, flowPos, { expectedRevision: revision });
      if (!result.ok) {
        showToast(result.error || "加载模板失败", "error");
        return;
      }
      showToast("模板已加载", "success");
    },
    [applyGroupTemplate, revision, screenToFlowPosition, showToast]
  );

  const handleDeleteTemplate = useCallback(
    (templateId: string) => {
      const confirmed = window.confirm("确认删除该模板？");
      if (!confirmed) return;
      deleteGroupTemplate(templateId);
      showToast("模板已删除", "success");
    },
    [deleteGroupTemplate, showToast]
  );

  const runAll = async () => {
    for (const n of nodes) {
      if (n.type === "imageGen" || n.type === "nanoBananaImageGen" || n.type === "wanImageGen") await runImageGen(n.id);
      if (
        n.type === "soraVideoGen" ||
        n.type === "wanVideoGen" ||
        n.type === "wanReferenceVideoGen" ||
        n.type === "viduVideoGen" ||
        n.type === "seedanceVideoGen"
      ) await runVideoGen(n.id);
    }
    alert("Run triggered");
  };

  const getTemplateOrigin = useCallback(() => {
    return getSuggestedCanvasOrigin(nodes);
  }, [nodes]);

  const focusTemplate = useCallback((origin: XYPosition, zoom = 0.7) => {
    setViewport({ x: -origin.x + 80, y: -origin.y + 80, zoom }, { duration: 800 });
  }, [setViewport]);

  const handleZoomChange = useCallback(
    (value: number) => {
      const nextZoom = Math.min(maxZoom, Math.max(minZoom, value));
      setZoomValue(nextZoom);
      const current = getViewport();
      const nextViewport = { ...current, zoom: nextZoom };
      setViewport(nextViewport, { duration: 120 });
      setViewportState(nextViewport);
    },
    [getViewport, maxZoom, minZoom, setViewport, setViewportState]
  );

  const handleToggleLock = useCallback(() => {
    setIsLocked((prev) => !prev);
  }, []);

  const handleToggleReadingMode = useCallback(() => {
    setReadingMode(readingMode === "identity" ? "full" : "identity");
  }, [readingMode, setReadingMode]);

  const displayNodes = useMemo(() => nodes.map(toNodeFlowCanvasNode), [nodes]);
  const displayEdges = useMemo(() => links.map(toNodeFlowCanvasLink), [links]);
  const selectedGroup = getSelectedGroup();

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
      "accent-green": activeTheme.accent,
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
      "group-bg": activeTheme.groupBg,
      "group-bg-selected": activeTheme.groupBgSelected,
      "group-border": activeTheme.groupBorder,
      "group-border-strong": activeTheme.groupBorderStrong,
      "group-highlight": activeTheme.groupHighlight,
      "group-shadow": activeTheme.groupShadow,
    };
    Object.entries(mapping).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
    root.style.colorScheme = activeTheme.scheme;
  }, [activeTheme]);

  const backgroundStyle = useMemo(() => {
    const base = activeTheme.bg;
    const currentViewport = liveViewport ?? { x: 0, y: 0, zoom: 1 };
    const scale = currentViewport.zoom > 0 ? currentViewport.zoom : 1;
    const offsetX = currentViewport.x ?? 0;
    const offsetY = currentViewport.y ?? 0;
    const applyOffset = (token: string, offset: number) => {
      const trimmed = token.trim();
      const value = Number.parseFloat(trimmed);
      if (Number.isNaN(value)) return trimmed;
      const unit = trimmed.replace(String(value), "") || "px";
      return `${value + offset}${unit}`;
    };
    const buildPosition = (position: string | undefined) => {
      const basePosition = position ?? "0 0";
      return basePosition
        .split(",")
        .map((chunk) => {
          const parts = chunk.trim().split(/\s+/);
          const x = parts[0] ?? "0";
          const y = parts[1] ?? "0";
          return `${applyOffset(x, offsetX)} ${applyOffset(y, offsetY)}`;
        })
        .join(", ");
    };
    if (bgPattern === "none") {
      return {
        backgroundColor: base,
        backgroundImage: "none",
        backgroundSize: "auto",
        backgroundPosition: "0 0",
        baseColor: base,
      };
    }
    const pat = patternDefinitions[bgPattern as Exclude<PatternKey, "none">] || patternDefinitions.dots;
    return {
      backgroundColor: base,
      backgroundImage: pat.image,
      backgroundSize: pat.size(scale),
      backgroundPosition: buildPosition(pat.position),
      baseColor: base,
    };
  }, [activeTheme, bgPattern, liveViewport, patternDefinitions]);

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
        width: "min(420px,calc(100vw-24px))",
      };
    }

    const viewportPadding = 12;
    const width = Math.min(420, window.innerWidth - viewportPadding * 2);
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

  return (
    <div className="h-full w-full flex flex-col app-text-primary" style={backgroundStyle}>
      <div
        className="flex-1 relative node-flow-canvas"
        data-zoomed={zoomValue > 1}
        data-connecting={isConnecting}
        style={backgroundStyle}
      >
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onLinksChange}
          onConnect={handleConnect}
          onConnectStart={handleConnectStart}
          onConnectEnd={handleConnectEnd}
          onMove={(_, vp) => setLiveViewport(vp)}
          onMoveEnd={(_, vp) => {
            setLiveViewport(vp);
            setViewportState(vp);
          }}
          minZoom={minZoom}
          maxZoom={maxZoom}
          nodesDraggable={!isLocked}
          nodesConnectable={!isLocked}
          elementsSelectable={!isLocked}
          panOnDrag={!isLocked}
          panOnScroll={!isLocked}
          panOnScrollMode="free"
          zoomOnScroll={false}
          zoomOnPinch={!isLocked}
          zoomOnDoubleClick={!isLocked}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          connectionLineStyle={{
            stroke: activeTheme.accentStrong,
            strokeWidth: 3,
            strokeLinecap: "round",
            strokeLinejoin: "round",
          }}
          proOptions={{ hideAttribution: true }}
          data-active-mode="default"
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
        </ReactFlow>

        {connectionDrop && (
          <ConnectionDropMenu
            position={connectionDrop.position}
            onCreate={(t) => handleDropCreate(t)}
            onClose={() => setConnectionDrop(null)}
          />
        )}
      </div>

      <MultiSelectToolbar />
      <AgentSettingsPanel
        isOpen={showAgentSettings}
        onClose={() => setShowAgentSettings(false)}
        leftOffset={agentDockWidth}
        projectData={projectData}
        isDarkMode={isDarkMode}
        requestedPanel={agentSettingsPanel}
      />
      <div className="fixed bottom-4 left-4 z-[80] pointer-events-none">
        <div className="pointer-events-auto flex items-end gap-3 qalam-bottom-agent">
          <QalamAgent
            projectData={projectData}
            setProjectData={setProjectData}
            getAuthToken={getAuthToken}
            onOpenStats={() => openAgentSettingsPanel("provider")}
            settingsOpen={showAgentSettings}
            openRequest={qalamOpenRequest}
            submitRequest={qalamSubmitRequest}
            cancelRequest={qalamCancelRequest}
            onCollapsedChange={setIsQalamCollapsed}
            onDockFrameChange={({ dockWidth }) => setAgentDockWidth(dockWidth)}
            onSendingChange={setIsQalamSending}
            renderCollapsedTrigger
          />
          <div
            className={`qalam-bottom-controls transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              showPeripheralWidgets ? "opacity-100" : "pointer-events-none opacity-0"
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
      <div
        className="fixed inset-x-0 bottom-4 z-40 flex justify-center pointer-events-none transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] qalam-bottom-toolbar"
      >
        <div className="flex w-[min(560px,calc(100vw-48px))] flex-col items-center gap-2">
          <div
            className="pointer-events-auto w-full transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] opacity-100 translate-y-0"
          >
            <FloatingActionBar
              onAddText={() => handleAddNode("text", { x: 100, y: 100 })}
              onAddScriptBoard={() => handleAddNode("scriptBoard", { x: 140, y: 120 })}
              onAddStoryboardBoard={() => handleAddNode("storyboardBoard", { x: 180, y: 140 })}
              onAddIdentityCard={() => handleAddNode("identityCard", { x: 220, y: 160 })}
              onAddImage={() => handleAddNode("imageInput", { x: 200, y: 100 })}
              onAddAudio={() => handleAddNode("audioInput", { x: 220, y: 120 })}
              onAddImageGen={() => handleAddNode("imageGen", { x: 400, y: 100 })}
              onAddNanoBananaImageGen={() => handleAddNode("nanoBananaImageGen", { x: 410, y: 110 })}
              onAddWanImageGen={() => handleAddNode("wanImageGen", { x: 420, y: 120 })}
              onAddVideoGen={() => handleAddNode("soraVideoGen", { x: 500, y: 100 })}
              onAddViduVideoGen={() => handleAddNode("viduVideoGen", { x: 510, y: 110 })}
              onAddWanVideoGen={() => handleAddNode("wanVideoGen", { x: 520, y: 120 })}
              onAddWanReferenceVideoGen={() => handleAddNode("wanReferenceVideoGen", { x: 540, y: 140 })}
              onAddSeedanceVideoGen={() => handleAddNode("seedanceVideoGen", { x: 560, y: 160 })}
              onAddGroup={() => handleAddNode("group", { x: 100, y: 100 })}
              onImport={() => fileInputRef.current?.click()}
              onExport={() => exportNodeFlow()}
              onRun={runAll}
              templates={groupTemplates}
              canCreateTemplate={!!selectedGroup}
              onCreateTemplate={handleCreateTemplate}
              onLoadTemplate={handleLoadTemplate}
              onDeleteTemplate={handleDeleteTemplate}
              floating={false}
              onOpenModule={onOpenModule}
              onExportCsv={onExportCsv}
              onExportXls={onExportXls}
              onExportUnderstandingJson={onExportUnderstandingJson}
              onOpenStats={() => openAgentSettingsPanel("provider")}
              onToggleTheme={onToggleTheme}
              onOpenTheme={(anchorRect) => {
                if (anchorRect) {
                  setThemeAnchor(anchorRect);
                }
                setShowThemeModal(true);
              }}
              isDarkMode={isDarkMode}
              onOpenSyncPanel={onOpenSyncPanel}
              syncIndicator={syncIndicator}
              onOpenInfoPanel={onOpenInfoPanel}
              onResetProject={onResetProject}
              onSignOut={onSignOut}
              onAssetLoad={onAssetLoad}
              accountInfo={accountInfo}
              onToggleWorkflow={onToggleWorkflow}
              onOpenQalam={() => setQalamOpenRequest((prev) => prev + 1)}
              variant="embedded"
            />
          </div>
          <div
            className="qalam-surface pointer-events-auto w-full rounded-[40px] px-6 py-4"
            style={{ fontFamily: '"Geist", "Avenir Next", "SF Pro Display", "Segoe UI", sans-serif' }}
          >
            <div className="flex items-end gap-3">
              <textarea
                ref={composerRef}
                value={composerInput}
                onChange={(e) => {
                  setComposerInput(e.target.value);
                  resizeComposer(e.currentTarget);
                }}
                rows={1}
                className="min-h-[48px] flex-1 resize-none bg-transparent py-2 text-[13px] leading-6 text-[var(--app-text-primary)] placeholder:text-[var(--app-text-secondary)] focus:outline-none"
                placeholder="Ask Qalam about scenes, roles, nodes, assets, or NodeFlow changes."
              />
              <button
                type="button"
                onClick={() => {
                  const text = composerInput.trim();
                  if (isQalamSending && !text) {
                    setQalamCancelRequest((prev) => prev + 1);
                    return;
                  }
                  if (!text) {
                    setQalamOpenRequest((prev) => prev + 1);
                    return;
                  }
                  setComposerInput("");
                  setQalamSubmitRequest({ id: Date.now(), text });
                }}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition active:translate-y-px ${
                  isQalamSending
                    ? "bg-[var(--app-accent)]/78 hover:bg-[var(--app-accent)]"
                    : composerInput.trim()
                    ? "bg-[var(--app-accent-strong)] hover:brightness-105"
                    : "bg-[var(--app-accent)]/55 hover:bg-[var(--app-accent)]/72"
                }`}
                title={isQalamSending ? "Stop Qalam" : composerInput.trim() ? "Send to Qalam" : isQalamCollapsed ? "Open Qalam" : "Focus Qalam"}
                aria-label={isQalamSending ? "Stop Qalam" : composerInput.trim() ? "Send to Qalam" : isQalamCollapsed ? "Open Qalam" : "Focus Qalam"}
              >
                {isQalamSending ? (
                  <CircleNotch size={16} weight="bold" className="animate-spin" />
                ) : (
                  <ArrowUp size={16} weight="bold" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className={`fixed bottom-4 right-4 z-30 pointer-events-none transition duration-200 ${showPeripheralWidgets ? "opacity-100" : "opacity-0"}`}>
        <div className={`pointer-events-auto qalam-bottom-assets ${showPeripheralWidgets ? "" : "pointer-events-none"}`}>
          <div className="relative flex h-12 items-center">
            <AssetsPanel floating={false} inlineAnchor />
          </div>
        </div>
      </div>
      <Toast />
      <AnnotationModal />
      {showThemeModal && (
        <>
          <div className="theme-modal-backdrop fixed inset-0 z-50" onClick={() => setShowThemeModal(false)} />
          <div
            className="theme-modal fixed z-50 max-h-[min(72dvh,720px)] overflow-x-hidden overflow-y-auto rounded-[28px] p-4 sm:p-4.5"
            style={themeModalStyle}
          >
            <div className="flex items-start gap-4">
              <div>
                <div className="theme-modal-eyebrow">Workspace Styling</div>
                <div className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em] text-[var(--app-text-primary)]">主题与样式</div>
                <p className="mt-1.5 max-w-[30ch] text-[12px] leading-5 text-[var(--app-text-secondary)]">
                  调整底色、表面层次和背景纹理。
                </p>
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-2.5 text-[10px] uppercase tracking-[0.26em] app-text-muted">颜色主题</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                {(Object.keys(THEME_PRESETS) as ThemeKey[]).map((key) => {
                  const theme = THEME_PRESETS[key];
                  const isActive = bgTheme === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setBgTheme(key)}
                      className="theme-preset-card flex min-h-[208px] flex-col rounded-[20px] border px-3 py-3 text-left transition"
                      data-active={isActive}
                      style={isActive ? {
                        borderColor: theme.accentStrong,
                        boxShadow: `0 8px 20px ${theme.accentSoft}`,
                        background: `linear-gradient(180deg, ${theme.panelSoft}, ${theme.panelMuted})`,
                      } : undefined}
                    >
                      <div className="relative min-h-[58px]">
                        <div className={isActive ? "pr-16" : undefined}>
                          <div className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--app-text-primary)]">{theme.label}</div>
                          <div className="mt-1 line-clamp-3 text-[10px] leading-4 text-[var(--app-text-muted)]">{theme.description}</div>
                        </div>
                        {isActive && (
                          <span
                            className="absolute right-0 top-0 rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em]"
                            style={{ color: theme.accentStrong, background: theme.accentSoft }}
                          >
                            Active
                          </span>
                        )}
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-1.5">
                        <span className="h-8 rounded-[12px] border border-white/5" style={{ background: theme.bg }} />
                        <span className="h-8 rounded-[12px] border border-white/5" style={{ background: theme.panel }} />
                        <span className="h-8 rounded-[12px] border border-white/5" style={{ background: theme.accent }} />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-1.5 text-[9px] uppercase tracking-[0.16em] app-text-muted">
                        <span>Base</span>
                        <span>Surface</span>
                        <span style={{ color: isActive ? theme.accentStrong : undefined }}>Accent</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-2.5 text-[10px] uppercase tracking-[0.26em] app-text-muted">图案</div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {patternOptions.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setBgPattern(item.key)}
                    className="theme-pattern-card flex flex-col gap-2 rounded-[18px] border px-3 py-2.5 text-left transition"
                    data-active={bgPattern === item.key}
                    style={bgPattern === item.key ? {
                      borderColor: activeTheme.accentStrong,
                      boxShadow: `0 6px 16px ${activeTheme.accentSoft}`,
                    } : undefined}
                  >
                    <span
                      className="theme-pattern-preview h-10 rounded-[12px] border border-white/5"
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
                    <span className="text-[13px] font-medium text-[var(--app-text-primary)]">{item.label}</span>
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

export const NodeFlow: React.FC<NodeFlowProps> = (props) => {
  return (
    <ReactFlowProvider>
      <NodeFlowInner {...props} />
    </ReactFlowProvider>
  );
};
