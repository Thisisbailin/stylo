import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  ReactFlow,
  MiniMap,
  Connection,
  NodeTypes,
  EdgeTypes,
  useReactFlow,
  OnConnectEnd,
  PanOnScrollMode,
  ReactFlowProvider,
  ConnectionMode,
  XYPosition,
  ConnectionLineType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../styles/nodeflow.css";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { useKnowledgeStore } from "../store/knowledgeStore";
import { getNodeHandles, inferHandleTypeFromNodeType, isTypedHandle, isValidConnection, nodeSupportsHandle } from "../utils/handles";
import { NodeFlowFile, NodeType, VideoGenNodeData } from "../types";
import { EditableEdge } from "../edges/EditableEdge";
import {
  AudioInputNode,
  VideoInputNode,
  ImageInputNode, AnnotationNode, TextNode,
  KnowledgeNode,
  ScriptBoardNode,
  StoryboardBoardNode,
  IdentityCardNode,
  ImageGenNode,
  NanoBananaImageGenNode,
  WanImageGenNode,
  SoraVideoGenNode,
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
import { ScriptCanvas } from "./ScriptCanvas";
import { CanvasBackgroundField } from "./CanvasBackgroundField";
import { EdgeAlignmentGuides } from "./EdgeAlignmentGuides";
import { ViewportControls } from "./ViewportControls";
import { WritingPanel } from "./WritingPanel";
import { Toast, useToast } from "./Toast";
import { AnnotationModal } from "./AnnotationModal";
import { ProjectData } from "../../types";
import type { ModuleKey } from "./ModuleBar";
import { FolderOpen, FileText, List } from "lucide-react";
import { ArrowUp, CircleNotch } from "@phosphor-icons/react";
import { toNodeFlowCanvasLink, toNodeFlowCanvasNode } from "../nodeflow/reactflow";
import { KnowledgeCanvasSurface, type KnowledgeCanvasSection } from "../knowledge/surface/KnowledgeCanvasSurface";
import {
  deriveKnowledgeSurfaceFocusFromFlowNode,
  type KnowledgeSurfaceFocusRequest,
} from "../knowledge/surface/focus";
import {
  alignPositionChangesToNodeEdges,
  getEdgeAlignedPosition,
  type EdgeAlignmentGuide,
} from "../utils/edgeAlignment";

const nodeTypes: NodeTypes = {
  imageInput: ImageInputNode,
  audioInput: AudioInputNode,
  videoInput: VideoInputNode,
  annotation: AnnotationNode,
  knowledge: KnowledgeNode,
  text: TextNode,
  scriptBoard: ScriptBoardNode,
  storyboardBoard: StoryboardBoardNode,
  identityCard: IdentityCardNode,
  imageGen: ImageGenNode,
  nanoBananaImageGen: NanoBananaImageGenNode,
  wanImageGen: WanImageGenNode,
  soraVideoGen: SoraVideoGenNode,
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
  handleType: "image" | "text" | "audio" | "video" | null;
  connectionType: "source" | "target";
  sourceNodeId: string | null;
  sourceHandleId: string | null;
}

const pickOutputHandle = (handles: string[], preferred?: "image" | "text" | "audio" | "video" | null) => {
  if (preferred && handles.includes(preferred)) return preferred;
  if (preferred && handles.includes("multi")) return "multi";
  return handles.find((handle) => handle !== "multi") || handles[0] || null;
};

const pickInputHandle = (
  handles: string[],
  preferred?: "image" | "text" | "audio" | "video" | null,
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

const getNodeHitAtPoint = (clientX: number, clientY: number, excludedNodeId?: string | null) => {
  if (typeof document === "undefined") return null;
  const magneticPadding = 46;
  let closest: { nodeId: string; side: "left" | "right"; distance: number } | null = null;

  document.querySelectorAll<HTMLElement>(".react-flow__node").forEach((nodeElement) => {
    const nodeId = nodeElement.getAttribute("data-id");
    if (!nodeId || nodeId === excludedNodeId) return;
    const rect = nodeElement.getBoundingClientRect();

    const insideMagneticBounds =
      clientX >= rect.left - magneticPadding &&
      clientX <= rect.right + magneticPadding &&
      clientY >= rect.top - magneticPadding &&
      clientY <= rect.bottom + magneticPadding;

    if (!insideMagneticBounds) return;

    const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
    const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
    const distance = Math.hypot(dx, dy);

    if (!closest || distance < closest.distance) {
      closest = {
      nodeId,
      side: clientX < rect.left + rect.width / 2 ? "left" : "right",
        distance,
      };
    }
  });

  return closest ? { nodeId: closest.nodeId, side: closest.side } : null;
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
  knowledgeSurfaceRequest?: {
    section: KnowledgeCanvasSection;
    nonce: number;
  };
}

type ConnectionTargetGlow = {
  nodeId: string;
  side: "left" | "right";
};

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
  knowledgeSurfaceRequest,
}) => {
  const [bgTheme, setBgTheme] = useState<ThemeKey>("dark");
  const [bgPattern, setBgPattern] = useState<PatternKey>("grid");
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [surfacePlane, setSurfacePlane] = useState<"flow" | "script" | "knowledge">("flow");
  const [editingScriptEpisodeId, setEditingScriptEpisodeId] = useState<number | null>(null);
  const [knowledgeSection, setKnowledgeSection] = useState<KnowledgeCanvasSection>("overview");
  const [knowledgeFocusRequest, setKnowledgeFocusRequest] = useState<KnowledgeSurfaceFocusRequest | null>(null);
  const [themeAnchor, setThemeAnchor] = useState<DOMRect | null>(null);
  const [isAssetsDockHovered, setIsAssetsDockHovered] = useState(false);
  const [isAssetsPanelCollapsed, setIsAssetsPanelCollapsed] = useState(true);
  const [showAgentSettings, setShowAgentSettings] = useState(false);
  const [agentSettingsPanel, setAgentSettingsPanel] = useState<"provider" | "tools" | "skills" | "dashboard" | "history">("provider");
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
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const qalamFirstBreakpoint = 920;
  const isAutoQalamFirst = windowWidth <= qalamFirstBreakpoint;
  const isQalamFirstMode = isAutoQalamFirst ? !dismissedAutoQalamFirst : isQalamFirstManual;
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
    viewport,
    currentNodeId,
    setCurrentNode,
    addToGlobalHistory,
    globalAssetHistory,
  } = useNodeFlowStore();
  const { setViewport, screenToFlowPosition, getViewport, fitView } = useReactFlow();
  const { show: showToast } = useToast();
  const syncKnowledgeCanonicalSource = useKnowledgeStore((state) => state.syncCanonicalSource);
  const { runImageGen, runVideoGen } = useNodeFlowExecutor();

  const minZoom = 0.25;
  const maxZoom = 4;
  const [connectionDrop, setConnectionDrop] = useState<ConnectionDropState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const keepPeripheralWidgetsOpen = showMiniMap;
  const [isLocked, setIsLocked] = useState(false);
  const [snapToGrid] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionTargetGlow, setConnectionTargetGlow] = useState<ConnectionTargetGlow | null>(null);
  const connectionSourceNodeIdRef = useRef<string | null>(null);
  const previousConnectionTargetGlowRef = useRef<ConnectionTargetGlow | null>(null);
  const [snapGuide, setSnapGuide] = useState<EdgeAlignmentGuide | null>(null);
  const [zoomValue, setZoomValue] = useState(() => getViewport().zoom ?? 1);
  const [liveViewport, setLiveViewport] = useState(() => getViewport());
  const showAssetsDock = isAssetsDockHovered || !isAssetsPanelCollapsed;
  const selectedFlowNode = useMemo(
    () => nodes.find((node) => node.selected) || nodes.find((node) => node.id === currentNodeId) || null,
    [currentNodeId, nodes]
  );
  const selectedKnowledgeFocus = useMemo(
    () => deriveKnowledgeSurfaceFocusFromFlowNode(selectedFlowNode),
    [selectedFlowNode]
  );

  useEffect(() => {
    syncKnowledgeCanonicalSource(projectData);
  }, [projectData, syncKnowledgeCanonicalSource]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!isValidConnection(connection)) return;
      connectNodes(connection, { expectedRevision: revision });
      setIsConnecting(false);
    },
    [connectNodes, revision]
  );

  const handleConnectStart = useCallback((_: unknown, params?: { nodeId?: string | null }) => {
    connectionSourceNodeIdRef.current = params?.nodeId || null;
    setIsConnecting(true);
  }, []);

  useEffect(() => {
    if (!isConnecting) {
      setConnectionTargetGlow(null);
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const hitNode = getNodeHitAtPoint(event.clientX, event.clientY, connectionSourceNodeIdRef.current);
      setConnectionTargetGlow((current) => {
        if (!hitNode) return current ? null : current;
        if (current?.nodeId === hitNode.nodeId && current.side === hitNode.side) return current;
        return hitNode;
      });
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [isConnecting]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const previous = previousConnectionTargetGlowRef.current;
    if (previous && previous.nodeId !== connectionTargetGlow?.nodeId) {
      const previousNode = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(previous.nodeId)}"]`);
      previousNode?.removeAttribute("data-connection-target-side");
    }

    if (connectionTargetGlow) {
      const nextNode = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(connectionTargetGlow.nodeId)}"]`);
      nextNode?.setAttribute("data-connection-target-side", connectionTargetGlow.side);
    }

    previousConnectionTargetGlowRef.current = connectionTargetGlow;

    return () => {
      if (!connectionTargetGlow) return;
      const node = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(connectionTargetGlow.nodeId)}"]`);
      node?.removeAttribute("data-connection-target-side");
    };
  }, [connectionTargetGlow]);

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

  const handleConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      setIsConnecting(false);
      connectionSourceNodeIdRef.current = null;
      setConnectionTargetGlow(null);
      if (connectionState.isValid || !connectionState.fromNode) return;
      // Extract clientX/clientY from the event correctly (it can be MouseEvent or TouchEvent)
      const e = event as any;
      const clientX = e.clientX || e.touches?.[0]?.clientX;
      const clientY = e.clientY || e.touches?.[0]?.clientY;
      if (typeof clientX !== "number" || typeof clientY !== "number") return;

      const fromHandleId = connectionState.fromHandle?.id || null;
      const fromHandleType =
        fromHandleId === "image" || fromHandleId === "text" || fromHandleId === "audio" || fromHandleId === "video"
          ? fromHandleId
          : null;
      const isFromSource = connectionState.fromHandle?.type === "source";
      const hitNode = getNodeHitAtPoint(clientX, clientY, connectionState.fromNode.id);
      if (hitNode) {
        const fromNode = nodes.find((node) => node.id === connectionState.fromNode?.id);
        const hitFlowNode = nodes.find((node) => node.id === hitNode.nodeId);
        if (fromNode && hitFlowNode) {
          const preferredHandleType = fromHandleType || inferHandleTypeFromNodeType(fromNode.type) || inferHandleTypeFromNodeType(hitFlowNode.type);

          const buildConnection = (
            sourceNode: typeof fromNode,
            targetNode: typeof hitFlowNode
          ): Connection | null => {
            if (sourceNode.id === targetNode.id) return null;

            const sourceHandles = getNodeHandles(sourceNode.type);
            const targetHandles = getNodeHandles(targetNode.type);
            const sourceHandle =
              sourceNode.id === fromNode.id && isFromSource && isTypedHandle(fromHandleId)
                ? fromHandleId
                : pickOutputHandle(sourceHandles.outputs, preferredHandleType);
            const targetHandle =
              targetNode.id === fromNode.id && !isFromSource && isTypedHandle(fromHandleId)
                ? fromHandleId
                : pickInputHandle(targetHandles.inputs, preferredHandleType);

            if (!sourceHandle || !targetHandle) return null;
            return {
              source: sourceNode.id,
              sourceHandle,
              target: targetNode.id,
              targetHandle,
            };
          };

          const sidePreferredConnections =
            hitNode.side === "right"
              ? [buildConnection(hitFlowNode, fromNode), buildConnection(fromNode, hitFlowNode)]
              : [buildConnection(fromNode, hitFlowNode), buildConnection(hitFlowNode, fromNode)];

          for (const connection of sidePreferredConnections) {
            if (connection && isValidConnection(connection)) {
              connectNodes(connection, { expectedRevision: useNodeFlowStore.getState().revision });
              return;
            }
          }
        }
        return;
      }
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
    [connectNodes, nodes, screenToFlowPosition]
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

  const runAll = async () => {
    let started = 0;
    for (const n of nodes) {
      if (n.type === "imageGen" || n.type === "nanoBananaImageGen" || n.type === "wanImageGen") {
        started += 1;
        await runImageGen(n.id);
      }
      if (
        n.type === "soraVideoGen" ||
        n.type === "wanReferenceVideoGen" ||
        n.type === "viduVideoGen" ||
        n.type === "seedanceVideoGen"
      ) {
        started += 1;
        await runVideoGen(n.id);
      }
    }
    alert(started > 0 ? `已启动 ${started} 个生成节点。` : "当前没有可执行的生成节点。");
  };

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

  const openKnowledgePlane = useCallback(
    (section: KnowledgeCanvasSection) => {
      setKnowledgeSection(section);
      if (selectedKnowledgeFocus) {
        setKnowledgeFocusRequest({
          ...selectedKnowledgeFocus,
          section: selectedKnowledgeFocus.section === "overview" ? section : selectedKnowledgeFocus.section,
          nonce: Date.now(),
        });
      } else {
        setKnowledgeFocusRequest(null);
      }
      setSurfacePlane("knowledge");
    },
    [selectedKnowledgeFocus]
  );

  const handleOpenKnowledgeSurface = useCallback(
    (
      section:
        | "knowledge:overview"
        | "knowledge:nodes"
        | "knowledge:links"
        | "knowledge:maps" = "knowledge:overview"
    ) => {
      openKnowledgePlane(section.replace("knowledge:", "") as KnowledgeCanvasSection);
    },
    [openKnowledgePlane]
  );

  useEffect(() => {
    if (!knowledgeSurfaceRequest) return;
    openKnowledgePlane(knowledgeSurfaceRequest.section);
  }, [knowledgeSurfaceRequest, openKnowledgePlane]);

  const displayNodes = useMemo(() => nodes.map(toNodeFlowCanvasNode), [nodes]);
  const displayEdges = useMemo(() => links.map(toNodeFlowCanvasLink), [links]);
  const updateSnapGuide = useCallback(
    (nodeId: string, position: XYPosition) => {
      if (!snapToGrid || isLocked) {
        setSnapGuide(null);
        return;
      }
      const node = displayNodes.find((item) => item.id === nodeId);
      if (!node) {
        setSnapGuide(null);
        return;
      }
      const result = getEdgeAlignedPosition(node, displayNodes, position);
      setSnapGuide(result.guide);
    },
    [displayNodes, isLocked, snapToGrid]
  );
  const handleFlowNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      const aligned = alignPositionChangesToNodeEdges(changes, displayNodes, snapToGrid && !isLocked);
      setSnapGuide(aligned.guide);
      onNodesChange(aligned.changes);
    },
    [displayNodes, isLocked, onNodesChange, snapToGrid]
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

  const qalamComposer = (
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
              toggleQalamFirstMode();
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
          title={
            isQalamSending
              ? "Stop Qalam"
              : composerInput.trim()
              ? "Send to Qalam"
              : isQalamFirstMode
              ? "Close Qalam First"
              : "Open Qalam First"
          }
          aria-label={
            isQalamSending
              ? "Stop Qalam"
              : composerInput.trim()
              ? "Send to Qalam"
              : isQalamFirstMode
              ? "Close Qalam First"
              : "Open Qalam First"
          }
        >
          {isQalamSending ? (
            <CircleNotch size={16} weight="bold" className="animate-spin" />
          ) : (
            <ArrowUp size={16} weight="bold" />
          )}
        </button>
      </div>
    </div>
  );

  const qalamAgentSlot = (
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
        data-connecting={isConnecting}
        style={backgroundStyle}
      >
        <CanvasBackgroundField
          pattern={bgPattern}
          baseColor={activeTheme.bg}
          primaryColor={activeTheme.pattern}
          secondaryColor={activeTheme.patternSoft}
          accentColor={activeTheme.accentSoft}
          viewport={liveViewport}
          alignmentGuide={surfacePlane === "flow" ? snapGuide : null}
          active={!showThemeModal}
        />
        {surfacePlane === "flow" ? (
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={handleFlowNodesChange}
            onEdgesChange={onLinksChange}
            onConnect={handleConnect}
            onConnectStart={handleConnectStart}
            onConnectEnd={handleConnectEnd}
            onNodeDragStart={(_, node) => updateSnapGuide(node.id, node.position)}
            onNodeDrag={(_, node) => updateSnapGuide(node.id, node.position)}
            onNodeDragStop={() => setSnapGuide(null)}
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
            panOnScrollMode={PanOnScrollMode.Free}
            zoomOnScroll={false}
            zoomOnPinch={!isLocked}
            zoomOnDoubleClick={!isLocked}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            connectionLineType={ConnectionLineType.Bezier}
            connectionLineStyle={{
              stroke: "rgba(74, 222, 128, 0.88)",
              strokeWidth: 2.6,
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
        ) : surfacePlane === "script" ? (
          <ScriptCanvas
            projectData={projectData}
            setProjectData={setProjectData}
            onOpenEpisode={(episodeId) => setEditingScriptEpisodeId(episodeId)}
            agentSlot={qalamAgentSlot}
          />
        ) : (
          <KnowledgeCanvasSurface
            section={knowledgeSection}
            onSectionChange={setKnowledgeSection}
            focusRequest={knowledgeFocusRequest}
            agentSlot={qalamAgentSlot}
          />
        )}

        {surfacePlane === "flow" && snapToGrid ? (
          <EdgeAlignmentGuides guide={snapGuide} viewport={liveViewport} />
        ) : null}

        {surfacePlane === "flow" && connectionDrop && (
          <ConnectionDropMenu
            position={connectionDrop.position}
            onCreate={(t) => handleDropCreate(t)}
            onClose={() => setConnectionDrop(null)}
          />
        )}

        <div className="pointer-events-none absolute left-1/2 top-4 z-[12] -translate-x-1/2">
          <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-[var(--app-border)] bg-[var(--app-panel)]/92 p-1 shadow-[var(--app-shadow)] backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setSurfacePlane("script")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
                surfacePlane === "script"
                  ? "bg-[var(--app-panel-strong)] text-[var(--app-text-primary)]"
                  : "text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
              }`}
              title="Script"
              aria-label="Script"
            >
              <FileText size={12} strokeWidth={2.2} />
              Script
            </button>
            <button
              type="button"
              onClick={() => setSurfacePlane("flow")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
                surfacePlane === "flow"
                  ? "bg-[var(--app-panel-strong)] text-[var(--app-text-primary)]"
                  : "text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
              }`}
            >
              <List size={12} strokeWidth={2.2} />
              Flow
            </button>
            <button
              type="button"
              onClick={() => openKnowledgePlane(knowledgeSection)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
                surfacePlane === "knowledge"
                  ? "bg-[var(--app-panel-strong)] text-[var(--app-text-primary)]"
                  : "text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
              }`}
            >
              <FolderOpen size={12} strokeWidth={2.2} />
              Knowledge
            </button>
          </div>
        </div>
      </div>

      {surfacePlane === "flow" ? <MultiSelectToolbar /> : null}
      <AgentSettingsPanel
        isOpen={showAgentSettings}
        onClose={() => setShowAgentSettings(false)}
        leftOffset={agentDockWidth}
        projectData={projectData}
        isDarkMode={isDarkMode}
        requestedPanel={agentSettingsPanel}
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
      {surfacePlane === "flow" ? (
        <>
          <div
            className="qalam-viewport-control-zone fixed bottom-0 left-0 z-[80] h-64 w-28 pointer-events-auto"
            data-keep-open={keepPeripheralWidgetsOpen && !isQalamFirstMode}
            data-qalam-first={isQalamFirstMode}
          >
            <div className="absolute bottom-4 left-4 pointer-events-none">
              <div className="pointer-events-auto flex items-end gap-3 qalam-bottom-agent">
              {qalamAgentSlot}
              <div
                className={`qalam-bottom-controls transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  keepPeripheralWidgetsOpen && !isQalamFirstMode
                    ? "opacity-100"
                    : !isQalamFirstMode
                      ? "pointer-events-none opacity-0"
                      : "pointer-events-none opacity-0"
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
          {surfacePlane === "flow" ? (
            <>
          <div
            className={`fixed inset-x-0 bottom-4 z-40 flex justify-center pointer-events-none transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] qalam-bottom-toolbar ${
              isQalamFirstMode ? "px-4" : ""
            }`}
          >
            <div className={`flex flex-col items-center gap-2 ${isQalamFirstMode ? "w-[min(1120px,calc(100vw-32px))]" : "w-[min(560px,calc(100vw-48px))]"}`}>
              <div
                className={`pointer-events-auto w-full transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  isQalamFirstMode ? "pointer-events-none hidden opacity-0" : "opacity-100 translate-y-0"
                }`}
              >
                <FloatingActionBar
                  onAddText={() => handleAddNode("text", { x: 100, y: 100 })}
                  onAddScriptBoard={() => handleAddNode("scriptBoard", { x: 140, y: 120 })}
                  onAddStoryboardBoard={() => handleAddNode("storyboardBoard", { x: 180, y: 140 })}
                  onAddIdentityCard={() => handleAddNode("identityCard", { x: 220, y: 160 })}
                  onAddImage={() => handleAddNode("imageInput", { x: 200, y: 100 })}
                  onAddAudio={() => handleAddNode("audioInput", { x: 220, y: 120 })}
                  onAddVideo={() => handleAddNode("videoInput", { x: 240, y: 140 })}
                  onAddImageGen={() => handleAddNode("imageGen", { x: 400, y: 100 })}
                  onAddNanoBananaImageGen={() => handleAddNode("nanoBananaImageGen", { x: 410, y: 110 })}
                  onAddWanImageGen={() => handleAddNode("wanImageGen", { x: 420, y: 120 })}
                  onAddVideoGen={() => handleAddNode("soraVideoGen", { x: 500, y: 100 })}
                  onAddViduVideoGen={() => handleAddNode("viduVideoGen", { x: 510, y: 110 })}
                  onAddWanReferenceVideoGen={() => handleAddNode("wanReferenceVideoGen", { x: 540, y: 140 })}
                  onAddSeedanceVideoGen={() => handleAddNode("seedanceVideoGen", { x: 560, y: 160 })}
                  onImport={() => fileInputRef.current?.click()}
                  onExport={() => exportNodeFlow()}
                  onRun={runAll}
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
                  onOpenKnowledgePanel={handleOpenKnowledgeSurface}
                  onResetProject={onResetProject}
                  onSignOut={onSignOut}
                  onAssetLoad={onAssetLoad}
                  accountInfo={accountInfo}
                  onToggleWorkflow={onToggleWorkflow}
                  onOpenQalam={() => {
                    if (isAutoQalamFirst) {
                      setDismissedAutoQalamFirst(false);
                      setQalamOpenRequest((prev) => prev + 1);
                      return;
                    }
                    setIsQalamFirstManual(true);
                    setQalamOpenRequest((prev) => prev + 1);
                  }}
                  variant="embedded"
                />
              </div>
              {qalamComposer}
            </div>
          </div>
          <div
            className="fixed bottom-0 right-0 z-[29] h-44 w-44 pointer-events-auto"
            onMouseEnter={() => setIsAssetsDockHovered(true)}
            onMouseLeave={() => {
              if (isAssetsPanelCollapsed) setIsAssetsDockHovered(false);
            }}
          />
          <div
            className={`fixed bottom-4 right-4 z-30 pointer-events-none transition duration-200 ${
              showAssetsDock ? "opacity-100" : "opacity-0"
            }`}
            onMouseEnter={() => setIsAssetsDockHovered(true)}
            onMouseLeave={() => {
              if (isAssetsPanelCollapsed) setIsAssetsDockHovered(false);
            }}
          >
            <div className={`pointer-events-auto qalam-bottom-assets ${showAssetsDock ? "" : "pointer-events-none"}`}>
              <div className="relative flex h-12 items-center">
                <AssetsPanel
                  floating={false}
                  inlineAnchor
                  onCollapsedChange={(collapsed) => {
                    setIsAssetsPanelCollapsed(collapsed);
                    setIsAssetsDockHovered(!collapsed);
                  }}
                />
              </div>
            </div>
          </div>
            </>
          ) : null}
        </>
      ) : null}
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

export const NodeFlow: React.FC<NodeFlowProps> = (props) => {
  return (
    <ReactFlowProvider>
      <NodeFlowInner {...props} />
    </ReactFlowProvider>
  );
};
