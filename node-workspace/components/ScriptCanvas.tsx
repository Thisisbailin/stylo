import React, { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  NodeTypes,
  OnConnectEnd,
  OnConnectStart,
  XYPosition,
} from "@xyflow/react";
import {
  AudioLines,
  Bot,
  BookOpen,
  GripVertical,
  Image as ImageIcon,
  Layers,
  MessageSquare,
  Network,
  PenTool,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import { ArrowUp, CircleNotch } from "@phosphor-icons/react";
import type {
  Episode,
  ProjectData,
  ScriptCanvasState,
  ScriptCanvasMeasuredSize,
  ScriptCanvasTextNode,
  ScriptSpatialBlock,
  ScriptTimelineBlock,
  ScriptTimelineHead,
  ScriptTimelineState,
} from "../../types";
import type { NodeFlowContextSnapshot, NodeFlowFile, NodeFlowLink, NodeFlowNode, NodeFlowNodeData, NodeType } from "../types";
import { BaseNode } from "../nodes/BaseNode";
import {
  AudioInputNode,
  VideoInputNode,
  ImageInputNode,
  AnnotationNode,
  TextNode,
  ScriptBoardNode,
  IdentityCardNode,
  ImageGenNode,
  NanoBananaImageGenNode,
  WanImageGenNode,
  SoraVideoGenNode,
  WanReferenceVideoGenNode,
  ViduVideoGenNode,
  SeedanceVideoGenNode,
} from "../nodes";
import { createDefaultNodeFlowNodeData } from "../nodeflow/defaults";
import { buildNodeFlowFile, downloadNodeFlowFile, hydrateImportedNodeFlow } from "../nodeflow/serialization";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { useNodeFlowExecutor } from "../store/useNodeFlowExecutor";
import {
  alignPositionChangesToNodeEdges,
  getEdgeAlignedPosition,
} from "../utils/edgeAlignment";
import { getNodeHandles, inferHandleTypeFromNodeType, isTypedHandle, isValidConnection } from "../utils/handles";
import { createNodeFlowNodeCommand } from "../nodeflow/commands";
import { ConnectionDropMenu, type ConnectionDropMenuOption } from "./ConnectionDropMenu";
import type { CanvasSurfaceConfig, SharedCanvasControls } from "./canvas/types";

type ScriptPageData = {
  title: string;
  episodeId: number;
  preview: string;
};

type MarkdownTextData = {
  title: string;
  content: string;
  preview: string;
  documentId: string;
  onTitleChange: (documentId: string, title: string) => void;
  onContentChange: (documentId: string, content: string) => void;
};

type ScriptCanvasNode =
  | Node<ScriptPageData, "scriptPage">
  | Node<MarkdownTextData, "mdText">
  | Node<NodeFlowNodeData, NodeType>;

type ScriptCanvasEdge = Edge<Record<string, never>>;
type ScriptCanvasCreateType = "scriptPage" | "mdText" | NodeType;
type ScriptHandleType = "image" | "text" | "audio" | "video" | "multi";

type ScriptConnectionDropState = {
  position: { x: number; y: number };
  flowPosition: { x: number; y: number };
  handleType: ScriptHandleType | null;
  connectionType: "source" | "target";
  sourceNodeId: string | null;
  sourceHandleId: string | null;
};

type ScriptFoundationGuideLine = {
  id: string;
  targetId: string;
  nodeId: string;
  path: string;
  color: string;
  isActive: boolean;
};

type ScriptFoundationNodeSummary = {
  id: string;
  title: string;
  kind: "剧本" | "图片" | "档案" | "节点";
};

type ScriptFoundationTargetPosition = {
  x: number;
  y: number;
};

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  onOpenEpisode: (episodeId: number) => void;
  canvasControls: SharedCanvasControls;
  screenToFlowPosition: (position: { x: number; y: number }) => XYPosition;
  isActive?: boolean;
  isWritingEditorOpen?: boolean;
  onCollapseCanvasCards?: () => void;
  onRestoreCanvasCards?: () => void;
  onOpenAgent?: () => void;
  onSubmitAgentMessage?: (text: string) => void;
  agentComposerValue?: string;
  onAgentComposerChange?: (value: string) => void;
  onAgentComposerAction?: () => void;
  isAgentSending?: boolean;
  isAgentFirstMode?: boolean;
};

const ensureCanvas = (canvas?: ScriptCanvasState): ScriptCanvasState => ({
  revision: typeof canvas?.revision === "number" ? canvas.revision : 0,
  pages: Array.isArray(canvas?.pages) ? canvas.pages : [],
  images: Array.isArray(canvas?.images) ? canvas.images : [],
  textNodes: Array.isArray(canvas?.textNodes) ? canvas.textNodes : [],
  flowNodes: Array.isArray(canvas?.flowNodes) ? canvas.flowNodes : [],
  graphLinks: Array.isArray(canvas?.graphLinks) ? canvas.graphLinks : [],
  globalAssetHistory: Array.isArray(canvas?.globalAssetHistory) ? canvas.globalAssetHistory : [],
  linkStyle: canvas?.linkStyle || "curved",
  activeView: canvas?.activeView ?? null,
  links: Array.isArray(canvas?.links) ? canvas.links : [],
  timeline: canvas?.timeline,
});

const scriptNodeId = (episodeId: number) => `script-${episodeId}`;
const imageNodeId = (imageId: string) => `image-${imageId}`;
const markdownNodeId = (documentId: string) => `md-${documentId}`;

const isImageNodeId = (id?: string | null) => !!id && id.startsWith("image-");
const isScriptPageNodeId = (id?: string | null) => !!id && id.startsWith("script-");
const isMarkdownNodeId = (id?: string | null) => !!id && id.startsWith("md-");
const isTextNodeId = (id?: string | null) => isScriptPageNodeId(id) || isMarkdownNodeId(id);
type ScriptCreateGroup = "script" | "library" | "input" | "generation" | "motion" | "edit";
type ScriptCreateOption = ConnectionDropMenuOption<ScriptCanvasCreateType> & {
  group: ScriptCreateGroup;
  meta: string;
  tone: string;
  surface: string;
};

const scriptCreateGroups: { key: ScriptCreateGroup; label: string }[] = [
  { key: "script", label: "Script" },
  { key: "library", label: "Library" },
  { key: "input", label: "Input" },
  { key: "generation", label: "Generate" },
  { key: "motion", label: "Motion" },
  { key: "edit", label: "Edit" },
];

const scriptCreateOptions: ScriptCreateOption[] = [
  { label: "剧本文档", hint: "创建一个新的分集稿纸", type: "scriptPage", Icon: Plus, group: "script", meta: "Fountain", tone: "is-slate", surface: "paper" },
  { label: "档案文档", hint: "连接空间轴的全局 Markdown 档案", type: "mdText", Icon: Plus, group: "script", meta: "Markdown", tone: "is-slate", surface: "paper" },
  { label: "Script Panel", hint: "Episode and scene browser", type: "scriptBoard", Icon: BookOpen, group: "script", meta: "Panel", tone: "is-blue", surface: "glass" },
  { label: "Identity Card", hint: "Character and scene cards", type: "identityCard", Icon: Layers, group: "library", meta: "Library", tone: "is-moss", surface: "card" },
  { label: "Text", hint: "Draft prompts, notes, and structure", type: "text", Icon: MessageSquare, group: "library", meta: "Writing", tone: "is-slate", surface: "card" },
  { label: "Image", hint: "Upload a reference image or still", type: "imageInput", Icon: ImageIcon, group: "input", meta: "Input", tone: "is-moss", surface: "media" },
  { label: "Audio", hint: "Upload a reference audio clip", type: "audioInput", Icon: AudioLines, group: "input", meta: "Input", tone: "is-blue", surface: "media" },
  { label: "Video", hint: "Upload a reference video clip", type: "videoInput", Icon: Video, group: "input", meta: "Input", tone: "is-rose", surface: "media" },
  { label: "Image Gen", hint: "Create images", type: "imageGen", Icon: Sparkles, group: "generation", meta: "Image", tone: "is-amber", surface: "gen" },
  { label: "Nano Banana", hint: "Nano Banana Pro image", type: "nanoBananaImageGen", Icon: Sparkles, group: "generation", meta: "Image", tone: "is-amber", surface: "gen" },
  { label: "WAN Img", hint: "Wan 2.6 image workflow", type: "wanImageGen", Icon: Sparkles, group: "generation", meta: "Image", tone: "is-moss", surface: "gen" },
  { label: "Sora Video", hint: "Generate Sora clips", type: "soraVideoGen", Icon: Video, group: "motion", meta: "Video", tone: "is-blue", surface: "motion" },
  { label: "Vidu", hint: "Vidu reference-to-video", type: "viduVideoGen", Icon: Video, group: "motion", meta: "Video", tone: "is-blue", surface: "motion" },
  { label: "WAN Ref Vid", hint: "Wan 2.6 reference-to-video", type: "wanReferenceVideoGen", Icon: Video, group: "motion", meta: "Video", tone: "is-rose", surface: "motion" },
  { label: "Seedance", hint: "Multimodal reference-to-video", type: "seedanceVideoGen", Icon: Video, group: "motion", meta: "Video", tone: "is-blue", surface: "motion" },
  { label: "Annotation", hint: "Markup image", type: "annotation", Icon: PenTool, group: "edit", meta: "Edit", tone: "is-amber", surface: "edit" },
];

const TIMELINE_COLORS = [
  { name: "墨", value: "slate" },
  { name: "琥珀", value: "amber" },
  { name: "苔绿", value: "moss" },
  { name: "海蓝", value: "blue" },
  { name: "胭脂", value: "rose" },
  { name: "紫藤", value: "violet" },
];

const MIN_TIMELINE_BLOCK_MINUTES = 3;
const DEFAULT_TIMELINE_DURATION = 120;
const DEFAULT_TIMELINE_HEAD: ScriptTimelineHead = {
  title: "项目索引",
  content: "项目根文档，组织空间轴与时间轴的文件树。",
  linkedNodeIds: [],
};

const createTimelineBlock = (
  id: string,
  title: string,
  durationMin: number,
  order: number,
  color: string,
  content = ""
): ScriptTimelineBlock => ({
  id,
  title,
  content,
  startMin: 0,
  durationMin,
  color,
  order,
  linkedNodeIds: [],
});

const createSpaceBlock = (
  id: string,
  title: string,
  order: number,
  width: number,
  color: string,
  content = ""
): ScriptSpatialBlock => ({
  id,
  title,
  content,
  color,
  order,
  width,
  linkedNodeIds: [],
});

const createDefaultSpaceBlocks = (): ScriptSpatialBlock[] => [
  createSpaceBlock("space-spec", "规格", 0, 0.72, "slate", "项目类型、画幅、总时长、作者、版本时间戳与基础制作规格。"),
  createSpaceBlock("space-world", "世界观", 1, 1, "moss", "影片整体背景、规则与设定。"),
  createSpaceBlock("space-characters", "角色档案", 2, 1.15, "amber", "主要角色、动机、关系与小传。"),
  createSpaceBlock("space-locations", "场景地图", 3, 0.9, "blue", "空间、地点、动线与场景关系。"),
  createSpaceBlock("space-style", "风格备忘录", 4, 0.95, "rose", "影像、语气、对白、节奏和参考。"),
];

const distributeRemainder = (blocks: ScriptTimelineBlock[], targetDuration: number) => {
  const next = blocks.map((block) => ({ ...block, durationMin: Math.max(MIN_TIMELINE_BLOCK_MINUTES, Math.round(block.durationMin)) }));
  let total = next.reduce((sum, block) => sum + block.durationMin, 0);
  let guard = 0;

  while (total < targetDuration && next.length && guard < 1000) {
    next[guard % next.length].durationMin += 1;
    total += 1;
    guard += 1;
  }

  guard = 0;
  while (total > targetDuration && next.length && guard < 1000) {
    const block = next[guard % next.length];
    if (block.durationMin > MIN_TIMELINE_BLOCK_MINUTES) {
      block.durationMin -= 1;
      total -= 1;
    }
    guard += 1;
  }

  return next;
};

const recalculateTimelineBlocks = (blocks: ScriptTimelineBlock[], durationMin: number) => {
  const ordered = distributeRemainder(
    blocks
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((block, index) => ({
        ...block,
        order: index,
        linkedNodeIds: Array.isArray(block.linkedNodeIds) ? Array.from(new Set(block.linkedNodeIds)) : [],
      })),
    durationMin
  );
  let cursor = 0;
  return ordered.map((block, index) => {
    const next = { ...block, order: index, startMin: cursor };
    cursor += next.durationMin;
    return next;
  });
};

const normalizeSpaceBlocks = (blocks?: ScriptSpatialBlock[]) =>
  (() => {
    const base = Array.isArray(blocks) && blocks.length ? blocks : createDefaultSpaceBlocks();
    const hasSpec = base.some((block) => block.id === "space-spec" || block.title === "规格");
    return hasSpec ? base : [createDefaultSpaceBlocks()[0], ...base];
  })()
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((block, index) => ({
      id: block.id || `space-block-${index + 1}`,
      title: block.title || `全局视角 ${index + 1}`,
      content: block.content || "",
      color: block.color || TIMELINE_COLORS[index % TIMELINE_COLORS.length].value,
      order: index,
      width: Math.max(0.45, Number(block.width) || 1),
      linkedNodeIds: Array.isArray(block.linkedNodeIds) ? Array.from(new Set(block.linkedNodeIds)) : [],
    }));

const createDefaultTimeline = (): ScriptTimelineState => ({
  id: "film-structure",
  title: "影片时间轴",
  durationMin: DEFAULT_TIMELINE_DURATION,
  head: DEFAULT_TIMELINE_HEAD,
  spaceBlocks: createDefaultSpaceBlocks(),
  blocks: recalculateTimelineBlocks(
    [
      createTimelineBlock("timeline-opening", "开场设定", 15, 0, "amber", "建立世界、语气和主人公最初的缺口。"),
      createTimelineBlock("timeline-turn", "第一转折", 25, 1, "moss", "让人物做出无法回头的选择，故事进入真正的推进。"),
      createTimelineBlock("timeline-pressure", "中段压力", 50, 2, "blue", "关系、目标和代价持续升级，核心问题被逼到台前。"),
      createTimelineBlock("timeline-finale", "结尾回收", 30, 3, "rose", "完成选择、代价和主题回声。"),
    ],
    DEFAULT_TIMELINE_DURATION
  ),
});

const ensureTimeline = (timeline?: ScriptTimelineState): ScriptTimelineState => {
  if (!timeline || !Array.isArray(timeline.blocks) || !timeline.blocks.length) return createDefaultTimeline();
  const durationMin = Math.max(30, Math.min(300, Math.round(Number(timeline.durationMin) || DEFAULT_TIMELINE_DURATION)));
  const head = timeline.head || DEFAULT_TIMELINE_HEAD;
  return {
    id: timeline.id || "film-structure",
    title: timeline.title || "影片时间轴",
    durationMin,
    head: {
      title: head.title || DEFAULT_TIMELINE_HEAD.title,
      content: head.content || "",
      linkedNodeIds: [],
    },
    spaceBlocks: normalizeSpaceBlocks(timeline.spaceBlocks),
    blocks: recalculateTimelineBlocks(
      timeline.blocks.map((block, index) => ({
        id: block.id || `timeline-block-${index + 1}`,
        title: block.title || `时间区块 ${index + 1}`,
        content: block.content || "",
        startMin: Number(block.startMin) || 0,
        durationMin: Math.max(MIN_TIMELINE_BLOCK_MINUTES, Math.round(Number(block.durationMin) || 12)),
        color: block.color || TIMELINE_COLORS[index % TIMELINE_COLORS.length].value,
        order: Number.isFinite(block.order) ? block.order : index,
        linkedNodeIds: Array.isArray(block.linkedNodeIds) ? block.linkedNodeIds : [],
      })),
      durationMin
    ),
  };
};

const formatTimelineTime = (minute: number) => {
  const safe = Math.max(0, Math.round(minute));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const getNodeLine = (nodeId: string, nodeById: Map<string, ScriptFoundationNodeSummary>) => {
  const node = nodeById.get(nodeId);
  return `${node?.kind || "文档"}：${node?.title || nodeId}`;
};

const buildTimelineMarkdown = (timeline: ScriptTimelineState, nodeSummaries: ScriptFoundationNodeSummary[]) => {
  const nodeById = new Map(nodeSummaries.map((node) => [node.id, node]));
  const spaceBlocks = normalizeSpaceBlocks(timeline.spaceBlocks);
  const head = timeline.head || DEFAULT_TIMELINE_HEAD;
  const linkedNodeIds = new Set([
    ...spaceBlocks.flatMap((block) => block.linkedNodeIds),
    ...timeline.blocks.flatMap((block) => block.linkedNodeIds),
  ]);
  const unlinkedNodes = nodeSummaries.filter((node) => !linkedNodeIds.has(node.id));

  return [
    `# 项目`,
    "",
    `- 根：${head.title}`,
    `- 总时长：${timeline.durationMin} min`,
    `- 空间区块：${spaceBlocks.length}`,
    `- 时间区块：${timeline.blocks.length}`,
    `- 已建立父子关系：${linkedNodeIds.size}`,
    "",
    `## ${head.title} / 全局层`,
    "",
    ...spaceBlocks.flatMap((block) => [
      `### ${block.title}`,
      "",
      ...(block.linkedNodeIds.length
        ? block.linkedNodeIds.map((nodeId) => `- ${getNodeLine(nodeId, nodeById)}`)
        : ["- 未连接子文档"]),
      "",
    ]),
    `## 时间轴`,
    "",
    ...timeline.blocks.flatMap((block) => [
      `### ${formatTimelineTime(block.startMin)}-${formatTimelineTime(block.startMin + block.durationMin)} ${block.title}`,
      "",
      ...(block.linkedNodeIds.length
        ? block.linkedNodeIds.map((nodeId) => `- ${getNodeLine(nodeId, nodeById)}`)
        : ["- 未连接子文档"]),
      "",
    ]),
    ...(unlinkedNodes.length
      ? [
          "## 未归入时间轴",
          "",
          ...unlinkedNodes.map((node) => `- ${node.kind}：${node.title}`),
          "",
        ]
      : []),
  ].join("\n");
};

const pickOutputHandle = (handles: ScriptHandleType[], preferred?: ScriptHandleType | null) => {
  if (preferred && handles.includes(preferred)) return preferred;
  return handles[0] || null;
};

const pickInputHandle = (
  handles: ScriptHandleType[],
  preferred?: ScriptHandleType | null,
  existingHandleId?: string | null
) => {
  if (existingHandleId === "image" || existingHandleId === "text") {
    if (handles.includes(existingHandleId) && (!preferred || existingHandleId === preferred)) return existingHandleId;
  }
  if (preferred && handles.includes(preferred)) return preferred;
  return handles[0] || null;
};

const getScriptNodeHitAtPoint = (clientX: number, clientY: number, excludedNodeId?: string | null) => {
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

type ScriptAxisTarget =
  | { type: "head"; id: "head" }
  | { type: "time"; id: string }
  | { type: "space"; id: string };

const getScriptAxisTargetHitAtPoint = (clientX: number, clientY: number): ScriptAxisTarget | null => {
  if (typeof document === "undefined") return null;
  const magneticPadding = 18;
  let closest: { target: ScriptAxisTarget; distance: number } | null = null;

  document.querySelectorAll<HTMLElement>("[data-axis-target-type]").forEach((element) => {
    const type = element.getAttribute("data-axis-target-type");
    const id = element.getAttribute("data-axis-target-id");
    if (!id || (type !== "head" && type !== "time" && type !== "space")) return;
    const rect = element.getBoundingClientRect();
    const inside =
      clientX >= rect.left - magneticPadding &&
      clientX <= rect.right + magneticPadding &&
      clientY >= rect.top - magneticPadding &&
      clientY <= rect.bottom + magneticPadding;
    if (!inside) return;

    const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
    const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
    const distance = Math.hypot(dx, dy);
    if (!closest || distance < closest.distance) {
      closest = { target: { type, id } as ScriptAxisTarget, distance };
    }
  });

  return closest?.target || null;
};

const getDefaultScriptPosition = (index: number) => ({
  x: (index % 3) * 380,
  y: Math.floor(index / 3) * 330,
});

const getDefaultImagePosition = (index: number) => ({
  x: -420,
  y: index * 330,
});

const getDefaultMarkdownPosition = (index: number) => ({
  x: 420 + (index % 2) * 360,
  y: 120 + Math.floor(index / 2) * 300,
});

const getDefaultFlowNodePosition = (index: number) => ({
  x: (index % 3) * 340 - 340,
  y: 420 + Math.floor(index / 3) * 280,
});

const createScriptFlowNodeId = (type: NodeType) => `script-flow-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const createScriptNodeFlowContext = (projectData: ProjectData): NodeFlowContextSnapshot => ({
  rawScript: projectData.rawScript || "",
  episodes: projectData.episodes || [],
  designAssets: projectData.designAssets || [],
  roles: projectData.roles || [],
});

const toRuntimeScriptTextNode = (
  episode: Episode,
  index: number,
  page?: ScriptCanvasState["pages"][number]
): NodeFlowNode => ({
  id: scriptNodeId(episode.id),
  type: "text",
  position: page?.position || getDefaultScriptPosition(index),
  measured: sanitizeScriptMeasured(page?.measured),
  data: {
    ...createDefaultNodeFlowNodeData("text"),
    title: episode.title || `第${episode.id}集`,
    text: episode.content || compactScriptPreview(episode),
  },
});

const toRuntimeMarkdownTextNode = (
  textNode: ScriptCanvasTextNode,
  index: number,
  position?: { x: number; y: number }
): NodeFlowNode => ({
  id: markdownNodeId(textNode.id),
  type: "text",
  position: position || getDefaultMarkdownPosition(index),
  measured: sanitizeScriptMeasured(textNode.measured),
  data: {
    ...createDefaultNodeFlowNodeData("text"),
    title: textNode.title || "档案文档",
    text: textNode.content || "",
  },
});

const toRuntimeImageNode = (
  image: ScriptCanvasState["images"][number],
  index: number
): NodeFlowNode => ({
  id: imageNodeId(image.id),
  type: "imageInput",
  position: image.position || getDefaultImagePosition(index),
  measured: sanitizeScriptMeasured(image.measured),
  data: {
    ...createDefaultNodeFlowNodeData("imageInput"),
    image: image.imageUrl,
    dimensions: null,
    title: image.filename || "Image",
    label: image.filename || "",
    filename: image.filename,
  },
});

const toRuntimeFlowNode = (node: NodeFlowNode, index: number): NodeFlowNode => ({
  ...node,
  position: node.position || getDefaultFlowNodePosition(index),
  measured: sanitizeScriptMeasured(node.measured),
  selected: false,
  data: {
    ...createDefaultNodeFlowNodeData(node.type),
    ...(node.data || {}),
  },
});

const isScriptRuntimeHandle = (handle?: string | null): handle is ScriptHandleType =>
  isTypedHandle(handle) || handle === "multi";

const toRuntimeScriptLink = (link: ScriptCanvasState["links"][number]): NodeFlowLink => ({
  id: link.id,
  source: link.source,
  target: link.target,
  sourceHandle: isScriptRuntimeHandle(link.sourceHandle) ? link.sourceHandle : null,
  targetHandle: isScriptRuntimeHandle(link.targetHandle) ? link.targetHandle : null,
});

const getScriptNodeHandlesForType = (type?: ScriptCanvasNode["type"] | null) => {
  if (!type || type === "scriptPage" || type === "mdText") {
    return { inputs: ["image", "text"] as ScriptHandleType[], outputs: ["text"] as ScriptHandleType[] };
  }
  const handles = getNodeHandles(type as NodeType);
  return {
    inputs: handles.inputs as ScriptHandleType[],
    outputs: handles.outputs as ScriptHandleType[],
  };
};

const createEmptyEpisode = (id: number): Episode => ({
  id,
  title: `第${id}集`,
  content: "",
  scenes: [],
  status: "pending",
});

const compactScriptPreview = (episode: Episode) => {
  const source =
    episode.content ||
    episode.scenes?.map((scene) => [scene.title, scene.content].filter(Boolean).join("\n")).find((value) => value.trim()) ||
    "";
  const clean = source.replace(/\s+/g, " ").trim();
  if (!clean) return "打开全屏编辑器开始写作。";
  return clean.length > 180 ? `${clean.slice(0, 180)}...` : clean;
};

const compactMarkdownPreview = (content: string) => {
  const clean = content.replace(/\s+/g, " ").trim();
  if (!clean) return "写下角色、场景、风格、规格或任何全局档案。";
  return clean.length > 180 ? `${clean.slice(0, 180)}...` : clean;
};

const ScriptPageNode: React.FC<any> = ({ data, selected }) => (
  <BaseNode
    title={data.title || `第${data.episodeId}集`}
    inputs={["image", "text"]}
    outputs={["text"]}
    selected={selected}
    variant="text"
    nodeType="text"
  >
    <div className="text-node-shell relative flex-1" data-has-content={data.preview ? "true" : "false"}>
      <div
        className="text-node-editor pointer-events-none text-[12px] leading-6 text-[var(--node-text-primary)]"
        style={{
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 7,
          minHeight: 0,
          maxHeight: 168,
          overflow: "hidden",
        }}
      >
        {data.preview}
      </div>
      <div className="mt-3 rounded-2xl border border-[var(--node-border)] bg-[var(--node-panel-muted)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--node-text-secondary)]">
        打开全屏编辑器
      </div>
    </div>
  </BaseNode>
);

const MarkdownTextNode: React.FC<any> = ({ data, selected }) => (
  <BaseNode
    title={data.title || "档案文档"}
    onTitleChange={(title) => data.onTitleChange?.(data.documentId, title)}
    inputs={["image", "text"]}
    outputs={["text"]}
    selected={selected}
    variant="text"
    nodeType="text"
  >
    <div className="text-node-shell script-md-node-shell relative flex-1">
      <textarea
        className="text-node-editor script-md-node-editor nodrag"
        value={data.content || ""}
        placeholder="Markdown"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => data.onContentChange?.(data.documentId, event.target.value)}
      />
    </div>
  </BaseNode>
);

const nodeTypes: NodeTypes = {
  scriptPage: ScriptPageNode,
  text: TextNode,
  mdText: MarkdownTextNode,
  imageInput: ImageInputNode,
  audioInput: AudioInputNode,
  videoInput: VideoInputNode,
  annotation: AnnotationNode,
  scriptBoard: ScriptBoardNode,
  identityCard: IdentityCardNode,
  imageGen: ImageGenNode,
  nanoBananaImageGen: NanoBananaImageGenNode,
  wanImageGen: WanImageGenNode,
  soraVideoGen: SoraVideoGenNode,
  wanReferenceVideoGen: WanReferenceVideoGenNode,
  viduVideoGen: ViduVideoGenNode,
  seedanceVideoGen: SeedanceVideoGenNode,
};

type ScriptFoundationProps = {
  timeline: ScriptTimelineState;
  nodeSummaries: ScriptFoundationNodeSummary[];
  activeBlockId: string;
  onActiveBlockChange: (blockId: string) => void;
  onUpdateHead: (patch: Partial<ScriptTimelineHead>) => void;
  onUpdateBlock: (blockId: string, patch: Partial<ScriptTimelineBlock>) => void;
  onUpdateSpaceBlock: (blockId: string, patch: Partial<ScriptSpatialBlock>) => void;
  onAddSpaceBlock: (afterBlockId?: string) => void;
  onSplitBlock: (blockId: string) => void;
  onSplitSpaceBlock: (blockId: string) => void;
  onDeleteBlock: (blockId: string) => void;
  onDeleteSpaceBlock: (blockId: string) => void;
  onReorderBlock: (sourceBlockId: string, targetBlockId: string) => void;
  onReorderSpaceBlock: (sourceBlockId: string, targetBlockId: string) => void;
  onResizeStart: (blockId: string, edge: "left" | "right", clientX: number, trackWidth: number) => void;
  onSpaceResizeStart: (blockId: string, edge: "left" | "right", clientX: number, trackWidth: number) => void;
  axisRevealRequest: number;
  onCreateArchiveNode: () => void;
  onCreateScriptNode: () => void;
  onCreateFlowNode: (type: NodeType) => void;
  onOpenAgent?: () => void;
  onSubmitAgentMessage?: (text: string) => void;
  agentComposerValue?: string;
  onAgentComposerChange?: (value: string) => void;
  onAgentComposerAction?: () => void;
  isAgentSending?: boolean;
  isAgentFirstMode?: boolean;
  onOpenMarkdownCard?: () => void;
  onCloseMarkdownCard?: () => void;
  nodes: ScriptCanvasNode[];
  viewport: SharedCanvasControls["viewport"];
};

type ScriptAxisMode = "time" | "space";

type ScriptFoundationMenuState =
  | { type: "head"; x: number; y: number }
  | { type: "block"; blockId: string; x: number; y: number };

type ScriptFoundationCreateMenuState = { x: number; y: number } | null;

type ScriptFoundationEditTarget =
  | { type: "head" }
  | { type: "time"; id: string }
  | { type: "space"; id: string };

const getFoundationMenuStyle = (x: number, y: number, menuWidth = 390): CSSProperties => {
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 720 : window.innerHeight;
  return {
    "--timeline-menu-x": `${Math.min(Math.max(x, menuWidth / 2 + 12), viewportWidth - menuWidth / 2 - 12)}px`,
    "--timeline-menu-y": `${Math.min(Math.max(y, 180), viewportHeight - 104)}px`,
  } as CSSProperties;
};

const sanitizeScriptMeasured = (measured?: { width?: unknown; height?: unknown } | null): ScriptCanvasMeasuredSize | undefined => {
  if (!measured) return undefined;
  const width = typeof measured.width === "number" && Number.isFinite(measured.width) && measured.width > 0 ? measured.width : undefined;
  const height = typeof measured.height === "number" && Number.isFinite(measured.height) && measured.height > 0 ? measured.height : undefined;
  return width || height ? { width, height } : undefined;
};

const getScriptCanvasNodeSize = (node: ScriptCanvasNode) => {
  const measured = sanitizeScriptMeasured(node.measured);
  const style = node.style || {};
  const styleWidth = typeof style.width === "number" ? style.width : undefined;
  const styleHeight = typeof style.height === "number" ? style.height : undefined;
  const width = measured?.width || styleWidth || 320;
  const fallbackHeight =
    node.type === "scriptPage"
      ? 249
      : node.type === "mdText"
        ? 252
        : node.type === "imageInput"
          ? 440
          : node.type === "text"
            ? 256
            : 180;
  return {
    width,
    height: measured?.height || styleHeight || fallbackHeight,
  };
};

const ScriptFoundation: React.FC<ScriptFoundationProps> = ({
  timeline,
  nodeSummaries,
  activeBlockId,
  onActiveBlockChange,
  onUpdateHead,
  onUpdateBlock,
  onUpdateSpaceBlock,
  onAddSpaceBlock,
  onSplitBlock,
  onSplitSpaceBlock,
  onDeleteBlock,
  onDeleteSpaceBlock,
  onReorderBlock,
  onReorderSpaceBlock,
  onResizeStart,
  onSpaceResizeStart,
  axisRevealRequest,
  onCreateArchiveNode,
  onCreateScriptNode,
  onCreateFlowNode,
  onOpenAgent,
  onSubmitAgentMessage,
  agentComposerValue = "",
  onAgentComposerChange,
  onAgentComposerAction,
  isAgentSending = false,
  isAgentFirstMode = false,
  onOpenMarkdownCard,
  onCloseMarkdownCard,
  nodes,
  viewport,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const agentComposerRef = useRef<HTMLTextAreaElement>(null);
  const clickTimerRef = useRef<number | null>(null);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [activeAxis, setActiveAxis] = useState<ScriptAxisMode>("time");
  const [menuState, setMenuState] = useState<ScriptFoundationMenuState | null>(null);
  const [editingTarget, setEditingTarget] = useState<ScriptFoundationEditTarget | null>(null);
  const [isTimelineDocumentOpen, setIsTimelineDocumentOpen] = useState(false);
  const [liveViewport, setLiveViewport] = useState(viewport);
  const [targetPositions, setTargetPositions] = useState<Record<string, ScriptFoundationTargetPosition>>({});
  const [isAgentTailOpen, setIsAgentTailOpen] = useState(false);
  const [nodeCreateMenu, setNodeCreateMenu] = useState<ScriptFoundationCreateMenuState>(null);
  const head = timeline.head || DEFAULT_TIMELINE_HEAD;
  const spaceBlocks = useMemo(() => normalizeSpaceBlocks(timeline.spaceBlocks), [timeline.spaceBlocks]);
  const activeBlock = timeline.blocks.find((block) => block.id === activeBlockId) || timeline.blocks[0];
  const actionBlock =
    menuState?.type === "block"
      ? activeAxis === "time"
        ? timeline.blocks.find((block) => block.id === menuState.blockId) || null
        : spaceBlocks.find((block) => block.id === menuState.blockId) || null
      : null;
  const editingBlock =
    editingTarget?.type === "time"
      ? timeline.blocks.find((block) => block.id === editingTarget.id) || null
      : editingTarget?.type === "space"
        ? spaceBlocks.find((block) => block.id === editingTarget.id) || null
        : null;
  const timelineMarkdown = useMemo(() => buildTimelineMarkdown(timeline, nodeSummaries), [nodeSummaries, timeline]);

  const closeMarkdownCard = useCallback(() => {
    setEditingTarget(null);
    setIsTimelineDocumentOpen(false);
    onCloseMarkdownCard?.();
  }, [onCloseMarkdownCard]);

  useEffect(
    () => () => {
      if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    },
    []
  );

  useEffect(() => {
    const textarea = agentComposerRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 44), 118)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 118 ? "auto" : "hidden";
  }, [agentComposerValue, isAgentTailOpen]);

  useEffect(() => {
    if (!axisRevealRequest) return;
    setIsAgentTailOpen(false);
    setActiveAxis((current) => (current === "time" ? "space" : "time"));
    setMenuState(null);
    setEditingTarget(null);
    setIsTimelineDocumentOpen(false);
  }, [axisRevealRequest]);

  useEffect(() => {
    if (!menuState && !nodeCreateMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          ".script-foundation-floating-menu, .script-foundation-block-menu-wrap, .script-foundation-node-popover, .script-foundation-block, .script-foundation-head-block, .script-foundation-tail"
        )
      ) {
        return;
      }
      setMenuState(null);
      setNodeCreateMenu(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuState, nodeCreateMenu]);

  useEffect(() => {
    if (!editingBlock && !isTimelineDocumentOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".script-foundation-md-card")) return;
      closeMarkdownCard();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMarkdownCard();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMarkdownCard, editingBlock, isTimelineDocumentOpen]);

  useEffect(() => setLiveViewport(viewport), [viewport]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let animationFrame = 0;
    let nextViewport = viewport;
    const handleViewportFrame = (event: Event) => {
      const detail = (event as CustomEvent<SharedCanvasControls["viewport"]>).detail;
      if (!detail) return;
      nextViewport = detail;
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        setLiveViewport(nextViewport);
      });
    };
    window.addEventListener("qalam:viewport-frame", handleViewportFrame);
    return () => {
      window.removeEventListener("qalam:viewport-frame", handleViewportFrame);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [viewport]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let animationFrame = 0;
    let isMounted = true;
    const measureTargets = () => {
      if (!isMounted) return;
      const next: Record<string, ScriptFoundationTargetPosition> = {};
      document.querySelectorAll<HTMLElement>("[data-axis-target-type][data-axis-target-id]").forEach((element) => {
        const type = element.dataset.axisTargetType;
        const id = element.dataset.axisTargetId;
        if (!type || !id) return;
        const rect = element.getBoundingClientRect();
        next[`${type}:${id}`] = {
          x: Math.round((rect.left + rect.width / 2) * 2) / 2,
          y: Math.round((rect.top + 5) * 2) / 2,
        };
      });
      setTargetPositions((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    const scheduleMeasure = () => {
      if (!isMounted) return;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(measureTargets);
    };
    scheduleMeasure();
    const timeouts = [window.setTimeout(scheduleMeasure, 140), window.setTimeout(scheduleMeasure, 320)];
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    document.addEventListener("transitionend", scheduleMeasure, true);
    return () => {
      isMounted = false;
      window.cancelAnimationFrame(animationFrame);
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      document.removeEventListener("transitionend", scheduleMeasure, true);
    };
  }, [activeAxis, isAgentTailOpen, spaceBlocks, timeline.blocks]);

  const foundationGuideLines = useMemo<ScriptFoundationGuideLine[]>(() => {
    if (typeof window === "undefined") return [];
    const targets = [
      ...timeline.blocks.map((block) => ({ type: "time" as const, id: block.id, color: block.color, linkedNodeIds: block.linkedNodeIds })),
      ...spaceBlocks.map((block) => ({ type: "space" as const, id: block.id, color: block.color, linkedNodeIds: block.linkedNodeIds })),
    ].filter((target) => target.linkedNodeIds.length);
    if (!targets.length) return [];

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const headTarget = targetPositions["head:head"];
    const stableCoord = (value: number) => Math.round(value * 2) / 2;
    const nextLines: ScriptFoundationGuideLine[] = [];

    targets.forEach((target) => {
      const targetPosition =
        (target.type === activeAxis ? targetPositions[`${target.type}:${target.id}`] : undefined) || headTarget;
      if (!targetPosition) return;
      target.linkedNodeIds.forEach((nodeId) => {
        const node = nodeById.get(nodeId);
        if (!node) return;
        const size = getScriptCanvasNodeSize(node);
        const zoom = liveViewport.zoom || 1;
        const nodeLeft = node.position.x * zoom + liveViewport.x;
        const nodeTop = node.position.y * zoom + liveViewport.y;
        const nodeWidth = size.width * zoom;
        const nodeHeight = size.height * zoom;
        const nodeCenterX = nodeLeft + nodeWidth / 2;
        const nodeCenterY = nodeTop + nodeHeight / 2;
        const nodeBottom = nodeTop + nodeHeight;

        if (
          nodeWidth < 24 ||
          nodeHeight < 24 ||
          nodeLeft + nodeWidth <= 0 ||
          nodeLeft >= window.innerWidth ||
          nodeBottom <= 0 ||
          nodeTop >= targetPosition.y - 18 ||
          nodeCenterX <= 0 ||
          nodeCenterX >= window.innerWidth ||
          nodeCenterY <= 0 ||
          nodeCenterY >= window.innerHeight
        ) {
          return;
        }

        const nodeX = stableCoord(nodeCenterX);
        const nodeY = stableCoord(Math.min(nodeBottom, targetPosition.y - 24));
        const targetX = stableCoord(targetPosition.x);
        const targetY = stableCoord(targetPosition.y);
        const midY = stableCoord(nodeY + (targetY - nodeY) * 0.56);
        nextLines.push({
          id: `${target.type}-${target.id}-${nodeId}`,
          targetId: `${target.type}:${target.id}`,
          nodeId,
          color: target.color,
          isActive: target.type === "time" && target.id === activeBlockId,
          path: `M ${nodeX.toFixed(1)} ${nodeY.toFixed(1)} C ${nodeX.toFixed(1)} ${midY.toFixed(1)}, ${targetX.toFixed(1)} ${midY.toFixed(1)}, ${targetX.toFixed(1)} ${targetY.toFixed(1)}`,
        });
      });
    });

    return nextLines;
  }, [activeAxis, activeBlockId, liveViewport, nodes, spaceBlocks, targetPositions, timeline.blocks]);

  const handleResizePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    blockId: string,
    edge: "left" | "right"
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const trackWidth = trackRef.current?.getBoundingClientRect().width || 1;
    onResizeStart(blockId, edge, event.clientX, trackWidth);
  };

  const handleSpaceResizePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    blockId: string,
    edge: "left" | "right"
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const trackWidth = trackRef.current?.getBoundingClientRect().width || 1;
    onSpaceResizeStart(blockId, edge, event.clientX, trackWidth);
  };

  const handleHeadClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    event.preventDefault();
    clickTimerRef.current = window.setTimeout(() => {
      setIsAgentTailOpen(false);
      setActiveAxis((current) => (current === "time" ? "space" : "time"));
      setMenuState(null);
      setEditingTarget(null);
      setIsTimelineDocumentOpen(false);
    }, 170);
  };

  const handleHeadDoubleClick = () => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    onOpenMarkdownCard?.();
    setMenuState(null);
    setEditingTarget(null);
    setIsTimelineDocumentOpen(true);
  };

  const handleBlockClick = (event: React.MouseEvent<HTMLDivElement>, blockId: string) => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    const { clientX, clientY } = event;
    clickTimerRef.current = window.setTimeout(() => {
      onActiveBlockChange(blockId);
      setMenuState((current) =>
        current?.type === "block" && current.blockId === blockId ? null : { type: "block", blockId, x: clientX, y: clientY }
      );
      setEditingTarget(null);
    }, 170);
  };

  const handleBlockDoubleClick = (blockId: string) => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    onOpenMarkdownCard?.();
    if (activeAxis === "time") onActiveBlockChange(blockId);
    setMenuState(null);
    setIsTimelineDocumentOpen(false);
    setEditingTarget({ type: activeAxis, id: blockId });
  };

  const handleTailNodeClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setNodeCreateMenu((current) =>
      current ? null : { x: event.clientX, y: event.clientY }
    );
    setMenuState(null);
    setEditingTarget(null);
    setIsTimelineDocumentOpen(false);
  };

  const runNodeCreateAction = (action: () => void) => {
    action();
    setNodeCreateMenu(null);
  };

  const handleAgentTailSend = () => {
    const text = agentComposerValue.trim();
    if (text) {
      if (onAgentComposerAction) {
        onAgentComposerAction();
        return;
      }
      onSubmitAgentMessage?.(text);
      onAgentComposerChange?.("");
      return;
    }
    if (onAgentComposerAction) {
      onAgentComposerAction();
      return;
    }
    onOpenAgent?.();
  };

  return (
    <div className="script-foundation-dock">
      {foundationGuideLines.length ? (
        <svg className="script-foundation-connection-layer" aria-hidden="true">
          {foundationGuideLines.map((line) => (
            <path
              key={line.id}
              className={`script-foundation-connection is-${line.color} ${line.isActive ? "is-active" : ""}`}
              d={line.path}
            />
          ))}
        </svg>
      ) : null}

      <div className="script-foundation-filmstrip" aria-label="剧本基地">
        <div className={`script-foundation-axis-body ${isAgentTailOpen ? "is-axis-collapsed" : ""}`}>
          <button
            type="button"
            className="script-foundation-head-block"
            data-axis-target-type="head"
            data-axis-target-id="head"
            data-axis-active={activeAxis}
            onClick={handleHeadClick}
            onDoubleClick={handleHeadDoubleClick}
            title={activeAxis === "time" ? "切换到空间轴" : "切换到时间轴"}
          >
            <svg className="script-foundation-head-icon" viewBox="0 0 56 100" aria-hidden="true">
              <path
                className="script-foundation-head-icon__fill"
                d="M10 9H41C45.4 9 48 11.9 48 16.3V84.2C48 88.8 45 91 40.8 91H25.5C21.7 91 19.7 89.2 19 85.5L16 69.8H10.2C6 69.8 4 67.4 4 63.5V16.2C4 11.8 6.5 9 10 9Z"
              />
              <path
                className="script-foundation-head-icon__line"
                d="M10 9H41C45.4 9 48 11.9 48 16.3V84.2C48 88.8 45 91 40.8 91H25.5C21.7 91 19.7 89.2 19 85.5L16 69.8H10.2C6 69.8 4 67.4 4 63.5V16.2C4 11.8 6.5 9 10 9Z"
              />
              <g className="script-foundation-head-icon__perfs">
                <rect x="13" y="20" width="5" height="13" rx="2.5" />
                <rect x="24" y="19" width="5" height="14" rx="2.5" />
                <rect x="35" y="20" width="5" height="13" rx="2.5" />
                <rect x="25" y="72" width="5" height="14" rx="2.5" />
                <rect x="36" y="72" width="5" height="14" rx="2.5" />
              </g>
            </svg>
          </button>

          {!isAgentTailOpen ? (
            <div ref={trackRef} className="script-foundation-track">
              {(activeAxis === "time" ? timeline.blocks : spaceBlocks).map((block, axisIndex, axisBlocks) => {
                const spaceWidthTotal = spaceBlocks.reduce((sum, item) => sum + Math.max(0.45, item.width), 0) || 1;
                const width =
                  activeAxis === "time"
                    ? Math.max(6, ((block as ScriptTimelineBlock).durationMin / timeline.durationMin) * 100)
                    : Math.max(8, ((block as ScriptSpatialBlock).width / spaceWidthTotal) * 100);
                const timeBlock = block as ScriptTimelineBlock;
                const previousBlock = axisBlocks[axisIndex - 1];
                const nextBlock = axisBlocks[axisIndex + 1];
                const joinsPrev = previousBlock?.color === block.color;
                const joinsNext = nextBlock?.color === block.color;
                const isActive = activeAxis === "time" && block.id === activeBlock?.id;
                const linkedCount = block.linkedNodeIds.length;
                return (
                  <React.Fragment key={block.id}>
                    <div
                      data-axis-target-type={activeAxis}
                      data-axis-target-id={block.id}
                      draggable
                      onDragStart={(event) => {
                        setDraggingBlockId(block.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", block.id);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceId = event.dataTransfer.getData("text/plain") || draggingBlockId;
                        if (sourceId && sourceId !== block.id) {
                          if (activeAxis === "time") onReorderBlock(sourceId, block.id);
                          else onReorderSpaceBlock(sourceId, block.id);
                        }
                        setDraggingBlockId(null);
                      }}
                      onDragEnd={() => setDraggingBlockId(null)}
                      onClick={(event) => handleBlockClick(event, block.id)}
                      onDoubleClick={() => handleBlockDoubleClick(block.id)}
                      className={`script-foundation-block is-${block.color} ${joinsPrev || joinsNext ? "is-segment" : "is-block"} ${joinsPrev ? "joins-prev" : ""} ${joinsNext ? "joins-next" : ""} ${isActive ? "is-active" : ""} ${draggingBlockId === block.id ? "is-dragging" : ""}`}
                      style={{ flexBasis: `${width}%`, "--axis-index": axisIndex } as CSSProperties}
                    >
                      <div className="script-foundation-block__inner">
                        <div className="script-foundation-block__meta">
                          <GripVertical size={13} strokeWidth={1.8} />
                          <span>
                            {activeAxis === "time"
                              ? `${formatTimelineTime(timeBlock.startMin)}-${formatTimelineTime(timeBlock.startMin + timeBlock.durationMin)}`
                              : "全局视角"}
                          </span>
                        </div>
                        <strong>{block.title}</strong>
                        <div className="script-foundation-block__foot">
                          <span>{activeAxis === "time" ? `${timeBlock.durationMin}min` : "space"}</span>
                          <span>{linkedCount ? `${linkedCount} 个节点` : "可连线"}</span>
                        </div>
                      </div>
                    </div>
                    {axisIndex < axisBlocks.length - 1 ? (
                      <span
                        className={`script-foundation-boundary is-${block.color} ${nextBlock?.color === block.color ? "is-segment-boundary" : ""}`}
                      >
                        <button
                          type="button"
                          className="script-foundation-resize"
                          aria-label={activeAxis === "time" ? "调整相邻区间边界" : "调整相邻空间块边界"}
                          onPointerDown={(event) =>
                            activeAxis === "time"
                              ? handleResizePointerDown(event, block.id, "right")
                              : handleSpaceResizePointerDown(event, block.id, "right")
                          }
                        />
                      </span>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className={`script-foundation-tail ${isAgentTailOpen ? "is-agent-open" : ""}`}>
          {isAgentTailOpen ? (
            <div className="script-foundation-tail-composer qalam-surface">
              <textarea
                ref={agentComposerRef}
                value={agentComposerValue}
                rows={1}
                placeholder="Ask Qalam about this script axis..."
                onChange={(event) => onAgentComposerChange?.(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleAgentTailSend();
                  }
                  if (event.key === "Escape") {
                    setIsAgentTailOpen(false);
                  }
                }}
              />
              <button
                type="button"
                className={`script-foundation-tail-send ${agentComposerValue.trim() ? "has-input" : ""} ${isAgentSending ? "is-sending" : ""}`}
                onClick={handleAgentTailSend}
                title={
                  isAgentSending
                    ? "Stop Qalam"
                    : agentComposerValue.trim()
                      ? "Send to Qalam"
                      : isAgentFirstMode
                        ? "Close Qalam First"
                        : "Open Qalam First"
                }
                aria-label={
                  isAgentSending
                    ? "Stop Qalam"
                    : agentComposerValue.trim()
                      ? "Send to Qalam"
                      : isAgentFirstMode
                        ? "Close Qalam First"
                        : "Open Qalam First"
                }
              >
                {isAgentSending ? (
                  <CircleNotch size={16} weight="bold" className="animate-spin" />
                ) : (
                  <ArrowUp size={16} weight="bold" />
                )}
              </button>
            </div>
          ) : (
            <div className="script-foundation-tail-labels">
              <button type="button" onClick={handleTailNodeClick} title="新增节点" aria-label="新增节点">
                <Network size={15} strokeWidth={1.85} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAgentTailOpen(true);
                  setMenuState(null);
                  setNodeCreateMenu(null);
                  setEditingTarget(null);
                  setIsTimelineDocumentOpen(false);
                }}
                title="打开轴尾 Agent"
                aria-label="打开轴尾 Agent"
              >
                <Bot size={15} strokeWidth={1.85} />
              </button>
            </div>
          )}
        </div>

      </div>

      {nodeCreateMenu ? (
        <div className="script-foundation-node-menu-wrap" style={getFoundationMenuStyle(nodeCreateMenu.x, nodeCreateMenu.y, 620)}>
          <section className="script-foundation-floating-menu script-foundation-node-popover script-foundation-node-palette">
            <header className="script-foundation-node-palette__head">
              <span>Add Nodes</span>
              <strong>Script canvas now uses the Flow node system.</strong>
            </header>
            <div className="script-foundation-node-palette__groups">
              {scriptCreateGroups.map((group) => {
                const options = scriptCreateOptions.filter((option) => option.group === group.key);
                if (!options.length) return null;
                return (
                  <div key={group.key} className="script-foundation-node-group">
                    <p>{group.label}</p>
                    <div className="script-foundation-node-grid">
                      {options.map(({ label, hint, type, Icon, meta, tone, surface }) => (
                        <button
                          key={type}
                          type="button"
                          className={`script-foundation-node-card ${tone}`}
                          data-surface={surface}
                          onClick={() =>
                            runNodeCreateAction(() => {
                              if (type === "scriptPage") {
                                onCreateScriptNode();
                                return;
                              }
                              if (type === "mdText") {
                                onCreateArchiveNode();
                                return;
                              }
                              onCreateFlowNode(type);
                            })
                          }
                        >
                          <span className="script-foundation-node-card__icon">
                            <Icon size={16} strokeWidth={1.85} />
                          </span>
                          <span className="script-foundation-node-card__body">
                            <span className="script-foundation-node-card__meta">{meta}</span>
                            <strong>{label}</strong>
                            <small>{hint}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      {actionBlock && menuState?.type === "block" ? (
        <div className="script-foundation-block-menu-wrap" style={getFoundationMenuStyle(menuState.x, menuState.y, 230)}>
          <section className="script-foundation-floating-menu script-foundation-action-popover">
            <div className="script-foundation-action-row">
              {activeAxis === "space" ? (
                <button
                  type="button"
                  onClick={() => onAddSpaceBlock(actionBlock.id)}
                  title="新增全局块"
                >
                  <Plus size={14} strokeWidth={1.8} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => (activeAxis === "time" ? onSplitBlock(actionBlock.id) : onSplitSpaceBlock(actionBlock.id))}
                disabled={activeAxis === "time" && (actionBlock as ScriptTimelineBlock).durationMin < MIN_TIMELINE_BLOCK_MINUTES * 2}
                title={activeAxis === "time" ? "拆分区间" : "拆分全局块"}
              >
                <Scissors size={14} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={() => (activeAxis === "time" ? onDeleteBlock(actionBlock.id) : onDeleteSpaceBlock(actionBlock.id))}
                disabled={activeAxis === "time" ? timeline.blocks.length <= 1 : spaceBlocks.length <= 1}
                className="is-danger"
                title={activeAxis === "time" ? "删除区间" : "删除全局块"}
              >
                <Trash2 size={14} strokeWidth={1.8} />
              </button>
            </div>
            <div className="script-foundation-color-list">
              {TIMELINE_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  className={`script-foundation-color is-${color.value} ${actionBlock.color === color.value ? "is-active" : ""}`}
                  onClick={() =>
                    activeAxis === "time"
                      ? onUpdateBlock(actionBlock.id, { color: color.value })
                      : onUpdateSpaceBlock(actionBlock.id, { color: color.value })
                  }
                  title={color.name}
                />
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {isTimelineDocumentOpen ? (
        <section className="script-foundation-md-card script-foundation-md-card--readonly" role="dialog" aria-label="时间轴原始文档">
          <input className="script-foundation-md-title" value={head.title} readOnly />
          <div className="script-foundation-md-body">
            <textarea value={timelineMarkdown} readOnly />
          </div>
        </section>
      ) : null}

      {editingBlock ? (
        <section className="script-foundation-md-card" role="dialog" aria-label="编辑时间区块">
            <input
              className="script-foundation-md-title"
              value={editingBlock.title}
              onChange={(event) =>
                editingTarget?.type === "time"
                  ? onUpdateBlock(editingBlock.id, { title: event.target.value })
                  : onUpdateSpaceBlock(editingBlock.id, { title: event.target.value })
              }
            />
          <div className="script-foundation-md-body">
            <textarea
              value={editingBlock.content}
              onChange={(event) =>
                editingTarget?.type === "time"
                  ? onUpdateBlock(editingBlock.id, { content: event.target.value })
                  : onUpdateSpaceBlock(editingBlock.id, { content: event.target.value })
              }
              placeholder="Markdown"
            />
          </div>
        </section>
      ) : null}
    </div>
  );
};

export const useScriptCanvasSurface = ({
  projectData,
  setProjectData,
  onOpenEpisode,
  canvasControls,
  screenToFlowPosition,
  isActive = false,
  isWritingEditorOpen,
  onCollapseCanvasCards,
  onRestoreCanvasCards,
  onOpenAgent,
  onSubmitAgentMessage,
  agentComposerValue,
  onAgentComposerChange,
  onAgentComposerAction,
  isAgentSending,
  isAgentFirstMode,
}: Props): CanvasSurfaceConfig => {
  const {
    isLocked,
    snapToGrid,
    onAlignmentGuideChange,
  } = canvasControls;
  const [connectionDrop, setConnectionDrop] = useState<ScriptConnectionDropState | null>(null);
  const [activeTimelineBlockId, setActiveTimelineBlockId] = useState("");
  const [axisRevealRequest, setAxisRevealRequest] = useState(0);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(() => new Set());
  const axisRevealTriggeredRef = useRef(false);
  const applyingScriptRuntimeRef = useRef(false);
  const { runImageGen, runVideoGen } = useNodeFlowExecutor();
  const canvas = useMemo(() => ensureCanvas(projectData.scriptCanvas), [projectData.scriptCanvas]);
  const timeline = useMemo(() => ensureTimeline(canvas.timeline), [canvas.timeline]);
  const scriptNodeFlowContext = useMemo(() => createScriptNodeFlowContext(projectData), [projectData]);

  const handleMarkdownTitleChange = useCallback(
    (documentId: string, title: string) => {
      setProjectData((previous) => {
        const currentCanvas = ensureCanvas(previous.scriptCanvas);
        return {
          ...previous,
          scriptCanvas: {
            ...currentCanvas,
            textNodes: (currentCanvas.textNodes || []).map((node) =>
              node.id === documentId ? { ...node, title: title.trim() || node.title } : node
            ),
          },
        };
      });
    },
    [setProjectData]
  );

  const handleMarkdownContentChange = useCallback(
    (documentId: string, content: string) => {
      setProjectData((previous) => {
        const currentCanvas = ensureCanvas(previous.scriptCanvas);
        return {
          ...previous,
          scriptCanvas: {
            ...currentCanvas,
            textNodes: (currentCanvas.textNodes || []).map((node) =>
              node.id === documentId ? { ...node, content } : node
            ),
          },
        };
      });
    },
    [setProjectData]
  );

  const nodes = useMemo<ScriptCanvasNode[]>(() => {
    const pagePositionById = new Map(canvas.pages.map((page) => [page.episodeId, page.position]));
    const pageNodeById = new Map(canvas.pages.map((page) => [page.episodeId, page]));
    const pageNodes: ScriptCanvasNode[] = (projectData.episodes || []).map((episode, index) => ({
      id: scriptNodeId(episode.id),
      type: "scriptPage",
      position: pagePositionById.get(episode.id) || getDefaultScriptPosition(index),
      measured: sanitizeScriptMeasured(pageNodeById.get(episode.id)?.measured),
      selected: selectedNodeIds.has(scriptNodeId(episode.id)),
      data: {
        episodeId: episode.id,
        title: episode.title || `第${episode.id}集`,
        preview: compactScriptPreview(episode),
      },
    }));

    const imageNodes: ScriptCanvasNode[] = canvas.images.map((image, index) => ({
      id: imageNodeId(image.id),
      type: "imageInput",
      position: image.position || getDefaultImagePosition(index),
      measured: sanitizeScriptMeasured(image.measured),
      selected: selectedNodeIds.has(imageNodeId(image.id)),
      data: {
        ...createDefaultNodeFlowNodeData("imageInput"),
        image: image.imageUrl,
        dimensions: null,
        title: image.filename || "Image",
        label: image.filename || "",
        filename: image.filename,
      },
    }));

    const markdownNodes: ScriptCanvasNode[] = (canvas.textNodes || []).map((textNode, index) => ({
      id: markdownNodeId(textNode.id),
      type: "mdText",
      position: textNode.position || getDefaultMarkdownPosition(index),
      measured: sanitizeScriptMeasured(textNode.measured),
      selected: selectedNodeIds.has(markdownNodeId(textNode.id)),
      data: {
        documentId: textNode.id,
        title: textNode.title || "档案文档",
        content: textNode.content || "",
        preview: compactMarkdownPreview(textNode.content || ""),
        onTitleChange: handleMarkdownTitleChange,
        onContentChange: handleMarkdownContentChange,
      },
    }));

    const flowNodes: ScriptCanvasNode[] = (canvas.flowNodes || []).map((node, index) => ({
      ...node,
      position: node.position || getDefaultFlowNodePosition(index),
      selected: selectedNodeIds.has(node.id),
      data: {
        ...createDefaultNodeFlowNodeData(node.type),
        ...(node.data || {}),
      },
    }));

    return [...pageNodes, ...imageNodes, ...markdownNodes, ...flowNodes];
  }, [
    canvas.flowNodes,
    canvas.images,
    canvas.pages,
    canvas.textNodes,
    handleMarkdownContentChange,
    handleMarkdownTitleChange,
    projectData.episodes,
    selectedNodeIds,
  ]);

  const nodeIdSet = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const nodeTypeById = useMemo(() => new Map(nodes.map((node) => [node.id, node.type])), [nodes]);
  const scriptRuntimeFlowNodes = useMemo<NodeFlowNode[]>(() => {
    const pageById = new Map(canvas.pages.map((page) => [page.episodeId, page]));
    const runtimeScriptNodes = (projectData.episodes || []).map((episode, index) =>
      toRuntimeScriptTextNode(episode, index, pageById.get(episode.id))
    );
    const runtimeImageNodes = canvas.images.map((image, index) => toRuntimeImageNode(image, index));
    const runtimeMarkdownNodes = (canvas.textNodes || []).map((textNode, index) =>
      toRuntimeMarkdownTextNode(textNode, index, textNode.position)
    );
    const runtimeFlowNodes = (canvas.flowNodes || []).map((node, index) => toRuntimeFlowNode(node, index));
    return [...runtimeScriptNodes, ...runtimeImageNodes, ...runtimeMarkdownNodes, ...runtimeFlowNodes];
  }, [canvas.flowNodes, canvas.images, canvas.pages, canvas.textNodes, projectData.episodes]);
  const scriptRuntimeNodeIdSet = useMemo(
    () => new Set(scriptRuntimeFlowNodes.map((node) => node.id)),
    [scriptRuntimeFlowNodes]
  );
  const scriptRuntimeLinks = useMemo<NodeFlowLink[]>(
    () =>
      canvas.links
        .filter((link) => scriptRuntimeNodeIdSet.has(link.source) && scriptRuntimeNodeIdSet.has(link.target))
        .map(toRuntimeScriptLink),
    [canvas.links, scriptRuntimeNodeIdSet]
  );
  const nodeSummaries = useMemo<ScriptFoundationNodeSummary[]>(
    () =>
      nodes.map((node) => ({
        id: node.id,
        title:
          node.type === "imageInput"
            ? ((node.data as { filename?: string | null; title?: string; label?: string }).filename ||
              (node.data as { title?: string; label?: string }).title ||
              (node.data as { label?: string }).label ||
              "Image")
            : node.type === "mdText"
              ? ((node.data as MarkdownTextData).title || "档案文档")
            : node.type === "scriptPage"
              ? ((node.data as ScriptPageData).title || `第${(node.data as ScriptPageData).episodeId}集`)
              : ((node.data as { title?: string; label?: string }).title || (node.data as { label?: string }).label || node.type),
        kind:
          node.type === "imageInput"
            ? "图片"
            : node.type === "mdText"
              ? "档案"
              : node.type === "scriptPage"
                ? "剧本"
                : "节点",
      })),
    [nodes]
  );
  const edges = useMemo<ScriptCanvasEdge[]>(
    () =>
      canvas.links
        .filter((link) => nodeIdSet.has(link.source) && nodeIdSet.has(link.target))
        .map((link) => ({
          id: link.id,
          source: link.source,
          target: link.target,
          sourceHandle: link.sourceHandle || (isImageNodeId(link.source) ? "image" : "text"),
          targetHandle: link.targetHandle || (isImageNodeId(link.source) ? "image" : "text"),
          type: "default",
          animated: false,
          style: { stroke: "var(--app-accent-strong)", strokeWidth: 1.8 },
        })),
    [canvas.links, nodeIdSet]
  );

  const persistCanvas = useCallback(
    (updater: (canvas: ScriptCanvasState, previous: ProjectData) => ScriptCanvasState) => {
      setProjectData((previous) => ({
        ...previous,
        scriptCanvas: updater(ensureCanvas(previous.scriptCanvas), previous),
      }));
    },
    [setProjectData]
  );

  useEffect(() => {
    if (!isActive) return;
    applyingScriptRuntimeRef.current = true;
    try {
      useNodeFlowStore.setState((state) => ({
        ...state,
        revision: canvas.revision || 0,
        nodes: scriptRuntimeFlowNodes,
        links: scriptRuntimeLinks,
        graphLinks: canvas.graphLinks || [],
        globalAssetHistory: canvas.globalAssetHistory || [],
        linkStyle: canvas.linkStyle || "curved",
        activeView: canvas.activeView ?? null,
        nodeFlowContext: scriptNodeFlowContext,
      }));
    } finally {
      applyingScriptRuntimeRef.current = false;
    }
  }, [canvas.activeView, canvas.globalAssetHistory, canvas.graphLinks, canvas.linkStyle, canvas.revision, isActive, scriptNodeFlowContext, scriptRuntimeFlowNodes, scriptRuntimeLinks]);

  useEffect(() => {
    if (!isActive) return undefined;
    return useNodeFlowStore.subscribe((state, previousState) => {
      if (applyingScriptRuntimeRef.current) return;
      if (
        state.nodes === previousState.nodes &&
        state.links === previousState.links &&
        state.graphLinks === previousState.graphLinks &&
        state.globalAssetHistory === previousState.globalAssetHistory &&
        state.revision === previousState.revision &&
        state.linkStyle === previousState.linkStyle &&
        state.activeView === previousState.activeView
      ) return;

      const storeNodeById = new Map(state.nodes.map((node) => [node.id, node]));
      const storeNodeIds = new Set(storeNodeById.keys());
      const storeLinks = state.links;

      persistCanvas((currentCanvas, previousProject) => {
        const episodeNodeIds = new Set((previousProject.episodes || []).map((episode) => scriptNodeId(episode.id)));
        const imageNodeIds = new Set(currentCanvas.images.map((image) => imageNodeId(image.id)));
        const markdownNodeIds = new Set((currentCanvas.textNodes || []).map((node) => markdownNodeId(node.id)));
        const flowNodeIds = new Set((currentCanvas.flowNodes || []).map((node) => node.id));
        const protectedNodeIds = [
          ...episodeNodeIds,
          ...imageNodeIds,
          ...markdownNodeIds,
          ...flowNodeIds,
        ];
        const missingProtectedNodeIds = protectedNodeIds.filter((id) => !storeNodeIds.has(id));
        if (missingProtectedNodeIds.length > 0) return currentCanvas;

        const currentFlowNodes = (currentCanvas.flowNodes || [])
          .map((node, index) => {
            const storeNode = storeNodeById.get(node.id);
            if (!storeNode) {
              return {
                ...node,
                position: node.position || getDefaultFlowNodePosition(index),
                data: {
                  ...createDefaultNodeFlowNodeData(node.type),
                  ...(node.data || {}),
                },
              };
            }
            return {
              ...node,
              type: storeNode.type,
              position: storeNode.position || node.position || getDefaultFlowNodePosition(index),
              data: {
                ...createDefaultNodeFlowNodeData(storeNode.type),
                ...(storeNode.data || {}),
              },
              parentId: storeNode.parentId,
              extent: storeNode.extent,
              style: storeNode.style,
              measured: sanitizeScriptMeasured(storeNode.measured),
            };
          });
        const newStoreFlowNodes = state.nodes
          .filter((node) => !episodeNodeIds.has(node.id))
          .filter((node) => !imageNodeIds.has(node.id))
          .filter((node) => !markdownNodeIds.has(node.id))
          .filter((node) => !flowNodeIds.has(node.id))
          .map((node) => ({
            ...node,
            measured: sanitizeScriptMeasured(node.measured),
            selected: false,
            data: {
              ...createDefaultNodeFlowNodeData(node.type),
              ...(node.data || {}),
            },
          }));
        const nextFlowNodes = [...currentFlowNodes, ...newStoreFlowNodes];
        const allowedNodeIds = new Set([
          ...episodeNodeIds,
          ...imageNodeIds,
          ...markdownNodeIds,
          ...nextFlowNodes.map((node) => node.id),
        ]);

        return {
          ...currentCanvas,
          revision: state.revision,
          graphLinks: state.graphLinks,
          globalAssetHistory: state.globalAssetHistory,
          linkStyle: state.linkStyle,
          activeView: state.activeView,
          images: currentCanvas.images.map((image, index) => {
            const storeNode = storeNodeById.get(imageNodeId(image.id));
            if (!storeNode || storeNode.type !== "imageInput") return image;
            const data = storeNode.data as { image?: string | null; filename?: string | null };
            return {
              ...image,
              imageUrl: typeof data.image === "string" ? data.image : image.imageUrl,
              filename: typeof data.filename === "string" ? data.filename : image.filename,
              position: storeNode.position || image.position || getDefaultImagePosition(index),
            };
          }),
          textNodes: currentCanvas.textNodes || [],
          flowNodes: nextFlowNodes,
          links: storeLinks
            .filter((link) => allowedNodeIds.has(link.source) && allowedNodeIds.has(link.target))
            .map((link) => ({
              id: link.id,
              source: link.source,
              target: link.target,
              sourceHandle: isScriptRuntimeHandle(link.sourceHandle) ? link.sourceHandle : undefined,
              targetHandle: isScriptRuntimeHandle(link.targetHandle) ? link.targetHandle : undefined,
            })),
        };
      });
    });
  }, [isActive, persistCanvas]);

  useEffect(() => {
    if (!timeline.blocks.length) return;
    if (!activeTimelineBlockId || !timeline.blocks.some((block) => block.id === activeTimelineBlockId)) {
      setActiveTimelineBlockId(timeline.blocks[0].id);
    }
  }, [activeTimelineBlockId, timeline.blocks]);

  const persistTimeline = useCallback(
    (updater: (timeline: ScriptTimelineState) => ScriptTimelineState) => {
      persistCanvas((currentCanvas) => {
        const nextTimeline = updater(ensureTimeline(currentCanvas.timeline));
        return {
          ...currentCanvas,
          timeline: {
            ...nextTimeline,
            blocks: recalculateTimelineBlocks(nextTimeline.blocks, nextTimeline.durationMin),
          },
        };
      });
    },
    [persistCanvas]
  );

  const handleTimelineBlockUpdate = useCallback(
    (blockId: string, patch: Partial<ScriptTimelineBlock>) => {
      persistTimeline((current) => ({
        ...current,
        blocks: current.blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
      }));
    },
    [persistTimeline]
  );

  const handleTimelineHeadUpdate = useCallback(
    (patch: Partial<ScriptTimelineHead>) => {
      persistTimeline((current) => ({
        ...current,
        head: {
          ...(current.head || DEFAULT_TIMELINE_HEAD),
          ...patch,
          linkedNodeIds: Array.isArray(patch.linkedNodeIds)
            ? Array.from(new Set(patch.linkedNodeIds))
            : current.head?.linkedNodeIds || DEFAULT_TIMELINE_HEAD.linkedNodeIds,
        },
      }));
    },
    [persistTimeline]
  );

  const handleSpaceBlockUpdate = useCallback(
    (blockId: string, patch: Partial<ScriptSpatialBlock>) => {
      persistTimeline((current) => ({
        ...current,
        spaceBlocks: normalizeSpaceBlocks(current.spaceBlocks).map((block) =>
          block.id === blockId ? { ...block, ...patch } : block
        ),
      }));
    },
    [persistTimeline]
  );

  const handleSpaceBlockAdd = useCallback(
    (afterBlockId?: string) => {
      persistTimeline((current) => {
        const blocks = normalizeSpaceBlocks(current.spaceBlocks);
        const insertIndex = afterBlockId ? blocks.findIndex((block) => block.id === afterBlockId) + 1 : blocks.length;
        const safeIndex = insertIndex > 0 ? insertIndex : blocks.length;
        const nextBlock = createSpaceBlock(
          `space-block-${Date.now()}`,
          "新的全局视角",
          safeIndex,
          0.9,
          TIMELINE_COLORS[blocks.length % TIMELINE_COLORS.length].value,
          ""
        );
        const nextBlocks = blocks.slice();
        nextBlocks.splice(safeIndex, 0, nextBlock);
        return { ...current, spaceBlocks: nextBlocks.map((block, order) => ({ ...block, order })) };
      });
    },
    [persistTimeline]
  );

  const handleTimelineBlockSplit = useCallback(
    (blockId: string) => {
      persistTimeline((current) => {
        const index = current.blocks.findIndex((block) => block.id === blockId);
        if (index < 0) return current;
        const block = current.blocks[index];
        if (block.durationMin < MIN_TIMELINE_BLOCK_MINUTES * 2) return current;
        const firstDuration = Math.ceil(block.durationMin / 2);
        const secondDuration = block.durationMin - firstDuration;
        const nextBlock: ScriptTimelineBlock = {
          ...block,
          id: `timeline-block-${Date.now()}`,
          title: `${block.title} · 延展`,
          content: "",
          durationMin: secondDuration,
          linkedNodeIds: [],
          order: block.order + 0.5,
        };
        const blocks = current.blocks.map((item) =>
          item.id === blockId ? { ...item, durationMin: firstDuration } : item
        );
        blocks.splice(index + 1, 0, nextBlock);
        return { ...current, blocks };
      });
    },
    [persistTimeline]
  );

  const handleSpaceBlockSplit = useCallback(
    (blockId: string) => {
      persistTimeline((current) => {
        const blocks = normalizeSpaceBlocks(current.spaceBlocks);
        const index = blocks.findIndex((block) => block.id === blockId);
        if (index < 0) return current;
        const block = blocks[index];
        const firstWidth = Math.max(0.45, block.width / 2);
        const nextBlock: ScriptSpatialBlock = {
          ...block,
          id: `space-block-${Date.now()}`,
          title: `${block.title} · 延展`,
          content: "",
          width: firstWidth,
          linkedNodeIds: [],
          order: block.order + 0.5,
        };
        blocks[index] = { ...block, width: firstWidth };
        blocks.splice(index + 1, 0, nextBlock);
        return { ...current, spaceBlocks: blocks.map((item, order) => ({ ...item, order })) };
      });
    },
    [persistTimeline]
  );

  const handleTimelineBlockDelete = useCallback(
    (blockId: string) => {
      persistTimeline((current) => {
        if (current.blocks.length <= 1) return current;
        const removed = current.blocks.find((block) => block.id === blockId);
        const blocks = current.blocks.filter((block) => block.id !== blockId);
        if (removed && blocks.length) {
          blocks[blocks.length - 1] = {
            ...blocks[blocks.length - 1],
            durationMin: blocks[blocks.length - 1].durationMin + removed.durationMin,
          };
        }
        return { ...current, blocks };
      });
    },
    [persistTimeline]
  );

  const handleSpaceBlockDelete = useCallback(
    (blockId: string) => {
      persistTimeline((current) => {
        const blocks = normalizeSpaceBlocks(current.spaceBlocks);
        if (blocks.length <= 1) return current;
        const removed = blocks.find((block) => block.id === blockId);
        const nextBlocks = blocks.filter((block) => block.id !== blockId);
        if (removed && nextBlocks.length) {
          nextBlocks[nextBlocks.length - 1] = {
            ...nextBlocks[nextBlocks.length - 1],
            width: nextBlocks[nextBlocks.length - 1].width + removed.width,
          };
        }
        return { ...current, spaceBlocks: nextBlocks.map((block, order) => ({ ...block, order })) };
      });
    },
    [persistTimeline]
  );

  const commitAxisTargetConnection = useCallback(
    (target: ScriptAxisTarget, nodeId: string) => {
      if (!nodeIdSet.has(nodeId)) return false;
      if (target.type === "head") {
        setAxisRevealRequest(Date.now());
        return true;
      }
      persistTimeline((current) => ({
        ...current,
        head: current.head || DEFAULT_TIMELINE_HEAD,
        blocks:
          target.type === "time"
            ? current.blocks.map((block) => {
                if (block.id !== target.id) return block;
                if (block.linkedNodeIds.includes(nodeId)) return block;
                return { ...block, linkedNodeIds: [...block.linkedNodeIds, nodeId] };
              })
            : current.blocks,
        spaceBlocks:
          target.type === "space"
            ? normalizeSpaceBlocks(current.spaceBlocks).map((block) => {
                if (block.id !== target.id) return block;
                if (block.linkedNodeIds.includes(nodeId)) return block;
                return { ...block, linkedNodeIds: [...block.linkedNodeIds, nodeId] };
              })
            : normalizeSpaceBlocks(current.spaceBlocks),
      }));
      if (target.type === "time") setActiveTimelineBlockId(target.id);
      return true;
    },
    [nodeIdSet, persistTimeline]
  );

  const handleTimelineBlockReorder = useCallback(
    (sourceBlockId: string, targetBlockId: string) => {
      persistTimeline((current) => {
        const blocks = current.blocks.slice().sort((a, b) => a.order - b.order);
        const sourceIndex = blocks.findIndex((block) => block.id === sourceBlockId);
        const targetIndex = blocks.findIndex((block) => block.id === targetBlockId);
        if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current;
        const [moved] = blocks.splice(sourceIndex, 1);
        blocks.splice(targetIndex, 0, moved);
        return {
          ...current,
          blocks: blocks.map((block, index) => ({ ...block, order: index })),
        };
      });
    },
    [persistTimeline]
  );

  const handleSpaceBlockReorder = useCallback(
    (sourceBlockId: string, targetBlockId: string) => {
      persistTimeline((current) => {
        const blocks = normalizeSpaceBlocks(current.spaceBlocks);
        const sourceIndex = blocks.findIndex((block) => block.id === sourceBlockId);
        const targetIndex = blocks.findIndex((block) => block.id === targetBlockId);
        if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current;
        const [moved] = blocks.splice(sourceIndex, 1);
        blocks.splice(targetIndex, 0, moved);
        return { ...current, spaceBlocks: blocks.map((block, order) => ({ ...block, order })) };
      });
    },
    [persistTimeline]
  );

  const handleTimelineResizeStart = useCallback(
    (blockId: string, edge: "left" | "right", startX: number, trackWidth: number) => {
      const originalTimeline = timeline;
      const originalBlocks = timeline.blocks.map((block) => ({ ...block }));
      const blockIndex = originalBlocks.findIndex((block) => block.id === blockId);
      const neighborIndex = edge === "left" ? blockIndex - 1 : blockIndex + 1;
      if (blockIndex < 0) return;

      if (edge === "right" && neighborIndex >= originalBlocks.length) {
        const handlePointerMove = (event: PointerEvent) => {
          const deltaMinutes = Math.round(((event.clientX - startX) / Math.max(1, trackWidth)) * originalTimeline.durationMin);
          const blocks = originalBlocks.map((block) => ({ ...block }));
          const nextLastDuration = Math.max(
            MIN_TIMELINE_BLOCK_MINUTES,
            originalBlocks[blockIndex].durationMin + deltaMinutes
          );
          const nextDuration = Math.max(
            30,
            originalTimeline.durationMin + (nextLastDuration - originalBlocks[blockIndex].durationMin)
          );
          blocks[blockIndex].durationMin = nextLastDuration;
          persistCanvas((currentCanvas) => ({
            ...currentCanvas,
            timeline: {
              ...originalTimeline,
              durationMin: nextDuration,
              blocks: recalculateTimelineBlocks(blocks, nextDuration),
            },
          }));
        };

        const stopPointerMove = () => {
          document.removeEventListener("pointermove", handlePointerMove);
          document.removeEventListener("pointerup", stopPointerMove);
        };

        document.addEventListener("pointermove", handlePointerMove);
        document.addEventListener("pointerup", stopPointerMove, { once: true });
        return;
      }

      if (neighborIndex < 0 || neighborIndex >= originalBlocks.length) return;
      const pairTotal = originalBlocks[blockIndex].durationMin + originalBlocks[neighborIndex].durationMin;

      const handlePointerMove = (event: PointerEvent) => {
        const deltaMinutes = Math.round(((event.clientX - startX) / Math.max(1, trackWidth)) * originalTimeline.durationMin);
        const blocks = originalBlocks.map((block) => ({ ...block }));

        if (edge === "right") {
          const nextDuration = Math.max(
            MIN_TIMELINE_BLOCK_MINUTES,
            Math.min(pairTotal - MIN_TIMELINE_BLOCK_MINUTES, originalBlocks[blockIndex].durationMin + deltaMinutes)
          );
          blocks[blockIndex].durationMin = nextDuration;
          blocks[neighborIndex].durationMin = pairTotal - nextDuration;
        } else {
          const nextDuration = Math.max(
            MIN_TIMELINE_BLOCK_MINUTES,
            Math.min(pairTotal - MIN_TIMELINE_BLOCK_MINUTES, originalBlocks[blockIndex].durationMin - deltaMinutes)
          );
          blocks[blockIndex].durationMin = nextDuration;
          blocks[neighborIndex].durationMin = pairTotal - nextDuration;
        }

        persistTimeline((current) => ({
          ...current,
          durationMin: originalTimeline.durationMin,
          blocks,
        }));
      };

      const stopPointerMove = () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", stopPointerMove);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", stopPointerMove, { once: true });
    },
    [persistCanvas, persistTimeline, timeline]
  );

  const handleSpaceResizeStart = useCallback(
    (blockId: string, edge: "left" | "right", startX: number, trackWidth: number) => {
      const originalBlocks = normalizeSpaceBlocks(timeline.spaceBlocks).map((block) => ({ ...block }));
      const blockIndex = originalBlocks.findIndex((block) => block.id === blockId);
      const neighborIndex = edge === "left" ? blockIndex - 1 : blockIndex + 1;
      if (blockIndex < 0 || neighborIndex < 0 || neighborIndex >= originalBlocks.length) return;
      const pairTotal = originalBlocks[blockIndex].width + originalBlocks[neighborIndex].width;

      const handlePointerMove = (event: PointerEvent) => {
        const deltaWeight = ((event.clientX - startX) / Math.max(1, trackWidth)) * originalBlocks.length;
        const blocks = originalBlocks.map((block) => ({ ...block }));
        if (edge === "right") {
          const nextWidth = Math.max(0.45, Math.min(pairTotal - 0.45, originalBlocks[blockIndex].width + deltaWeight));
          blocks[blockIndex].width = nextWidth;
          blocks[neighborIndex].width = pairTotal - nextWidth;
        } else {
          const nextWidth = Math.max(0.45, Math.min(pairTotal - 0.45, originalBlocks[blockIndex].width - deltaWeight));
          blocks[blockIndex].width = nextWidth;
          blocks[neighborIndex].width = pairTotal - nextWidth;
        }
        persistTimeline((current) => ({ ...current, spaceBlocks: blocks }));
      };

      const stopPointerMove = () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", stopPointerMove);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", stopPointerMove, { once: true });
    },
    [persistTimeline, timeline.spaceBlocks]
  );

  const buildLinkForCreatedNode = useCallback(
    (
      currentLinks: ScriptCanvasState["links"],
      createdNodeId: string,
      createdNodeType: ScriptCanvasNode["type"],
      dropState: ScriptConnectionDropState | null
    ) => {
      if (!dropState?.sourceNodeId) return currentLinks;

      const existingNodeType = nodeTypeById.get(dropState.sourceNodeId);
      const existingNodeHandles = getScriptNodeHandlesForType(existingNodeType);
      const createdNodeHandles = getScriptNodeHandlesForType(createdNodeType);
      const existingTypedHandle = isTypedHandle(dropState.sourceHandleId) ? dropState.sourceHandleId : null;
      const preferredHandleType = dropState.handleType || existingTypedHandle;
      let source: string | null = null;
      let target: string | null = null;
      let sourceHandle: ScriptHandleType | null = null;
      let targetHandle: ScriptHandleType | null = null;

      if (dropState.connectionType === "source") {
        source = dropState.sourceNodeId;
        target = createdNodeId;
        sourceHandle = existingTypedHandle || pickOutputHandle(existingNodeHandles.outputs, preferredHandleType);
        targetHandle = pickInputHandle(createdNodeHandles.inputs, preferredHandleType || sourceHandle);
      } else {
        source = createdNodeId;
        target = dropState.sourceNodeId;
        sourceHandle = pickOutputHandle(createdNodeHandles.outputs, preferredHandleType);
        targetHandle =
          existingTypedHandle ||
          pickInputHandle(existingNodeHandles.inputs, preferredHandleType || sourceHandle, dropState.sourceHandleId);
      }

      if (!source || !target || !sourceHandle || !targetHandle) return currentLinks;

      const sourceNodeType = source === createdNodeId ? createdNodeType : existingNodeType;
      const targetNodeType = target === createdNodeId ? createdNodeType : existingNodeType;
      const sourceIsScriptNode = sourceNodeType === "scriptPage" || sourceNodeType === "mdText";
      const targetIsScriptNode = targetNodeType === "scriptPage" || targetNodeType === "mdText";
      if (!sourceIsScriptNode && !targetIsScriptNode && !isValidConnection({ sourceHandle, targetHandle })) {
        return currentLinks;
      }

      const id = `link-${source}-${target}-${sourceHandle}-${targetHandle}`;
      return [
        ...currentLinks.filter((link) => link.id !== id),
        {
          id,
          source,
          target,
          sourceHandle,
          targetHandle,
        },
      ];
    },
    [nodeTypeById]
  );

  const handleAddScriptPage = useCallback((position?: { x: number; y: number }, dropState: ScriptConnectionDropState | null = null) => {
    let createdNodeId: string | null = null;
    setProjectData((previous) => {
      const nextId = previous.episodes.length
        ? Math.max(...previous.episodes.map((episode) => episode.id)) + 1
        : 1;
      const nextEpisode = createEmptyEpisode(nextId);
      const nextCanvas = ensureCanvas(previous.scriptCanvas);
      createdNodeId = scriptNodeId(nextId);
      return {
        ...previous,
        episodes: [...previous.episodes, nextEpisode],
        scriptCanvas: {
          ...nextCanvas,
          pages: [
            ...nextCanvas.pages,
            {
              episodeId: nextId,
              position: position || getDefaultScriptPosition(previous.episodes.length),
            },
          ],
          links: buildLinkForCreatedNode(nextCanvas.links, createdNodeId, "scriptPage", dropState),
        },
      };
    });
    return createdNodeId;
  }, [buildLinkForCreatedNode, setProjectData]);

  const handleAddMarkdownNode = useCallback(
    (position?: { x: number; y: number }, dropState: ScriptConnectionDropState | null = null) => {
      const id = `text-${Date.now()}`;
      const createdNodeId = markdownNodeId(id);
      const now = Date.now();
      setProjectData((previous) => {
        const nextCanvas = ensureCanvas(previous.scriptCanvas);
        const nextNode: ScriptCanvasTextNode = {
          id,
          title: "档案文档",
          content: "",
          position: position || getDefaultMarkdownPosition(nextCanvas.textNodes?.length || 0),
          createdAt: now,
        };
        return {
          ...previous,
          scriptCanvas: {
            ...nextCanvas,
            textNodes: [...(nextCanvas.textNodes || []), nextNode],
            links: buildLinkForCreatedNode(nextCanvas.links, createdNodeId, "mdText", dropState),
          },
        };
      });
      return createdNodeId;
    },
    [buildLinkForCreatedNode, setProjectData]
  );

  const handleAddFlowNode = useCallback(
    (type: NodeType, position?: { x: number; y: number }, dropState: ScriptConnectionDropState | null = null) => {
      const requestedPosition = position || getDefaultFlowNodePosition(canvas.flowNodes?.length || 0);
      const storeState = useNodeFlowStore.getState();
      const commandState = {
        ...storeState,
        revision: canvas.revision || 0,
        nodes: scriptRuntimeFlowNodes,
        links: scriptRuntimeLinks,
        graphLinks: canvas.graphLinks || [],
        globalAssetHistory: canvas.globalAssetHistory || [],
        linkStyle: canvas.linkStyle || "curved",
        activeView: canvas.activeView ?? null,
        nodeFlowContext: scriptNodeFlowContext,
      };
      const createResult = createNodeFlowNodeCommand({
        state: commandState,
        type,
        position: requestedPosition,
        extraData: {
          ...(storeState.nodeDefaults[type] || {}),
        },
        allocateNodeId: createScriptFlowNodeId,
      });
      const createdNode = createResult.state.nodes.find((node) => !commandState.nodes.some((existing) => existing.id === node.id));
      const createdNodeId = createdNode?.id || createScriptFlowNodeId(type);
      const nodeToPersist: NodeFlowNode =
        createdNode || {
          id: createdNodeId,
          type,
          position: requestedPosition,
          data: createDefaultNodeFlowNodeData(type),
        };
      setProjectData((previous) => {
        const nextCanvas = ensureCanvas(previous.scriptCanvas);
        const hasExistingNode = (nextCanvas.flowNodes || []).some((node) => node.id === createdNodeId);
        const revision = Math.max((nextCanvas.revision || 0) + 1, createResult.state.revision);
        return {
          ...previous,
          scriptCanvas: {
            ...nextCanvas,
            revision,
            flowNodes: hasExistingNode
              ? (nextCanvas.flowNodes || []).map((node) => (node.id === createdNodeId ? { ...node, ...nodeToPersist, selected: false } : node))
              : [...(nextCanvas.flowNodes || []), { ...nodeToPersist, selected: false }],
            links: buildLinkForCreatedNode(nextCanvas.links, createdNodeId, type, dropState),
          },
        };
      });
      setSelectedNodeIds(new Set([createdNodeId]));
      return createdNodeId;
    },
    [
      buildLinkForCreatedNode,
      canvas.activeView,
      canvas.flowNodes?.length,
      canvas.globalAssetHistory,
      canvas.graphLinks,
      canvas.linkStyle,
      canvas.revision,
      scriptNodeFlowContext,
      scriptRuntimeFlowNodes,
      scriptRuntimeLinks,
      setProjectData,
    ]
  );

  const handleAddMarkdownNodeFromTail = useCallback(() => {
    const position =
      typeof window === "undefined"
        ? undefined
        : screenToFlowPosition({
            x: window.innerWidth / 2,
            y: Math.max(120, window.innerHeight / 2 - 120),
          });
    handleAddMarkdownNode(position);
  }, [handleAddMarkdownNode, screenToFlowPosition]);

  const handleAddScriptPageFromTail = useCallback(() => {
    const position =
      typeof window === "undefined"
        ? undefined
        : screenToFlowPosition({
            x: window.innerWidth / 2,
            y: Math.max(120, window.innerHeight / 2 - 120),
          });
    handleAddScriptPage(position);
  }, [handleAddScriptPage, screenToFlowPosition]);

  const handleImportScriptNodeFlow = useCallback(
    (nodeFlow: NodeFlowFile) => {
      const hydrated = hydrateImportedNodeFlow(nodeFlow, scriptNodeFlowContext);
      setProjectData((previous) => {
        const currentCanvas = ensureCanvas(previous.scriptCanvas);
        const existingIds = new Set<string>([
          ...(previous.episodes || []).map((episode) => scriptNodeId(episode.id)),
          ...currentCanvas.images.map((image) => imageNodeId(image.id)),
          ...(currentCanvas.textNodes || []).map((node) => markdownNodeId(node.id)),
          ...(currentCanvas.flowNodes || []).map((node) => node.id),
        ]);
        const idMap = new Map<string, string>();
        const now = Date.now();
        const importedNodes = hydrated.nodes.map((node, index) => {
          let nextId = node.id;
          if (existingIds.has(nextId) || isScriptPageNodeId(nextId) || isMarkdownNodeId(nextId)) {
            nextId = `script-flow-${node.type}-${now}-${index}`;
          }
          existingIds.add(nextId);
          idMap.set(node.id, nextId);
          return {
            ...node,
            id: nextId,
            measured: sanitizeScriptMeasured(node.measured),
            position: {
              x: (node.position?.x || 0) + 80,
              y: (node.position?.y || 0) + 80,
            },
            selected: false,
            data: {
              ...createDefaultNodeFlowNodeData(node.type),
              ...(node.data || {}),
            },
          };
        });
        const importedNodeIds = new Set(importedNodes.map((node) => node.id));
        const importedLinks = hydrated.links
          .map((link, index) => {
            const source = idMap.get(link.source);
            const target = idMap.get(link.target);
            if (!source || !target) return null;
            return {
              id: `link-${source}-${target}-${link.sourceHandle || "out"}-${link.targetHandle || "in"}-${index}`,
              source,
              target,
              sourceHandle: isScriptRuntimeHandle(link.sourceHandle) ? link.sourceHandle : undefined,
              targetHandle: isScriptRuntimeHandle(link.targetHandle) ? link.targetHandle : undefined,
            };
          })
          .filter((link): link is ScriptCanvasState["links"][number] => {
            if (!link) return false;
            return importedNodeIds.has(link.source) && importedNodeIds.has(link.target);
          });

        return {
          ...previous,
          scriptCanvas: {
            ...currentCanvas,
            revision: Math.max((currentCanvas.revision || 0) + 1, hydrated.revision || 1),
            flowNodes: [...(currentCanvas.flowNodes || []), ...importedNodes],
            links: [...currentCanvas.links, ...importedLinks],
            graphLinks: [...(currentCanvas.graphLinks || []), ...(hydrated.graphLinks || [])],
            globalAssetHistory: [
              ...(currentCanvas.globalAssetHistory || []),
              ...(hydrated.globalAssetHistory || []),
            ],
            linkStyle: hydrated.linkStyle || currentCanvas.linkStyle || "curved",
            activeView: hydrated.activeView ?? currentCanvas.activeView ?? null,
          },
        };
      });
    },
    [scriptNodeFlowContext, setProjectData]
  );

  const handleExportScriptNodeFlow = useCallback(() => {
    downloadNodeFlowFile(
      buildNodeFlowFile({
        revision: canvas.revision || 0,
        nodes: scriptRuntimeFlowNodes,
        links: scriptRuntimeLinks,
        graphLinks: canvas.graphLinks || [],
        linkStyle: canvas.linkStyle || "curved",
        globalAssetHistory: canvas.globalAssetHistory || [],
        nodeFlowContext: scriptNodeFlowContext,
        activeView: canvas.activeView ?? null,
        name: `${projectData.fileName || "qalam-script"}-script`,
      })
    );
  }, [
    canvas.activeView,
    canvas.globalAssetHistory,
    canvas.graphLinks,
    canvas.linkStyle,
    canvas.revision,
    projectData.fileName,
    scriptNodeFlowContext,
    scriptRuntimeFlowNodes,
    scriptRuntimeLinks,
  ]);

  const handleRunScriptAll = useCallback(async () => {
    let started = 0;
    for (const node of scriptRuntimeFlowNodes) {
      if (node.type === "imageGen" || node.type === "nanoBananaImageGen" || node.type === "wanImageGen") {
        started += 1;
        await runImageGen(node.id);
      }
      if (
        node.type === "soraVideoGen" ||
        node.type === "wanReferenceVideoGen" ||
        node.type === "viduVideoGen" ||
        node.type === "seedanceVideoGen"
      ) {
        started += 1;
        await runVideoGen(node.id);
      }
    }
    alert(started > 0 ? `已启动 ${started} 个生成节点。` : "当前没有可执行的生成节点。");
  }, [runImageGen, runVideoGen, scriptRuntimeFlowNodes]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<ScriptCanvasNode>[]) => {
      const aligned = alignPositionChangesToNodeEdges(changes, nodes, snapToGrid && !isLocked);
      onAlignmentGuideChange(aligned.guide);
      const effectiveChanges = aligned.changes;
      const hasPositionChange = effectiveChanges.some((change) => change.type === "position" && change.position);
      const hasDimensionChange = effectiveChanges.some((change) => change.type === "dimensions");
      const selectionChanges = effectiveChanges.filter(
        (change): change is Extract<NodeChange<ScriptCanvasNode>, { type: "select" }> => change.type === "select"
      );
      if (selectionChanges.length) {
        setSelectedNodeIds((current) => {
          const next = new Set(current);
          selectionChanges.forEach((change) => {
            if (change.selected) next.add(change.id);
            else next.delete(change.id);
          });
          return next;
        });
      }
      const removedEpisodeIds = changes
        .filter((change): change is Extract<NodeChange<ScriptCanvasNode>, { type: "remove" }> => change.type === "remove")
        .filter((change) => change.id.startsWith("script-"))
        .map((change) => Number(change.id.replace(/^script-/, "")))
        .filter((id) => Number.isFinite(id));
      const removedImageIds = changes
        .filter((change): change is Extract<NodeChange<ScriptCanvasNode>, { type: "remove" }> => change.type === "remove")
        .filter((change) => change.id.startsWith("image-"))
        .map((change) => change.id.replace(/^image-/, ""));
      const removedMarkdownIds = changes
        .filter((change): change is Extract<NodeChange<ScriptCanvasNode>, { type: "remove" }> => change.type === "remove")
        .filter((change) => change.id.startsWith("md-"))
        .map((change) => change.id.replace(/^md-/, ""));
      const removedFlowNodeIds = changes
        .filter((change): change is Extract<NodeChange<ScriptCanvasNode>, { type: "remove" }> => change.type === "remove")
        .map((change) => change.id)
        .filter((id) => !isImageNodeId(id) && !isScriptPageNodeId(id) && !isMarkdownNodeId(id));
      const removedNodeIds = new Set([
        ...removedImageIds.map((id) => imageNodeId(id)),
        ...removedEpisodeIds.map((id) => scriptNodeId(id)),
        ...removedMarkdownIds.map((id) => markdownNodeId(id)),
        ...removedFlowNodeIds,
      ]);
      if (removedNodeIds.size) {
        setSelectedNodeIds((current) => {
          const next = new Set(current);
          removedNodeIds.forEach((nodeId) => next.delete(nodeId));
          return next;
        });
      }

      if (
        !hasPositionChange &&
        !hasDimensionChange &&
        removedImageIds.length === 0 &&
        removedEpisodeIds.length === 0 &&
        removedMarkdownIds.length === 0 &&
        removedFlowNodeIds.length === 0
      ) return;

      const nextNodes = applyNodeChanges(effectiveChanges, nodes);
      const positionById = new Map(nextNodes.map((node) => [node.id, node.position]));
      const nextNodeById = new Map(nextNodes.map((node) => [node.id, node]));

      persistCanvas((currentCanvas, previous) => {
        const removedImageSet = new Set(removedImageIds);
        const removedEpisodeSet = new Set(removedEpisodeIds);
        const removedMarkdownSet = new Set(removedMarkdownIds);
        const removedFlowNodeSet = new Set(removedFlowNodeIds);
        const nextEpisodes = previous.episodes.filter((episode) => !removedEpisodeSet.has(episode.id));
        const images = currentCanvas.images
          .filter((image) => !removedImageSet.has(image.id))
          .map((image) => ({
            ...image,
            position: positionById.get(imageNodeId(image.id)) || image.position,
            measured: sanitizeScriptMeasured(nextNodeById.get(imageNodeId(image.id))?.measured) || sanitizeScriptMeasured(image.measured),
          }));
        const textNodes = (currentCanvas.textNodes || [])
          .filter((node) => !removedMarkdownSet.has(node.id))
          .map((node, index) => ({
            ...node,
            position: positionById.get(markdownNodeId(node.id)) || node.position || getDefaultMarkdownPosition(index),
            measured: sanitizeScriptMeasured(nextNodeById.get(markdownNodeId(node.id))?.measured) || sanitizeScriptMeasured(node.measured),
          }));

        return {
          ...currentCanvas,
          pages: nextEpisodes.map((episode, index) => ({
            episodeId: episode.id,
            position:
              positionById.get(scriptNodeId(episode.id)) ||
              currentCanvas.pages.find((page) => page.episodeId === episode.id)?.position ||
              getDefaultScriptPosition(index),
            measured:
              sanitizeScriptMeasured(nextNodeById.get(scriptNodeId(episode.id))?.measured) ||
              sanitizeScriptMeasured(currentCanvas.pages.find((page) => page.episodeId === episode.id)?.measured),
          })),
          flowNodes: (currentCanvas.flowNodes || [])
            .filter((node) => !removedFlowNodeSet.has(node.id))
            .map((node, index) => ({
              ...node,
              position: positionById.get(node.id) || node.position || getDefaultFlowNodePosition(index),
              measured: sanitizeScriptMeasured(nextNodeById.get(node.id)?.measured) || sanitizeScriptMeasured(node.measured),
            })),
          images,
          textNodes,
          links: currentCanvas.links.filter((link) => {
            if (removedImageIds.some((id) => link.source === imageNodeId(id) || link.target === imageNodeId(id))) return false;
            if (removedEpisodeIds.some((id) => link.source === scriptNodeId(id) || link.target === scriptNodeId(id))) return false;
            if (removedMarkdownIds.some((id) => link.source === markdownNodeId(id) || link.target === markdownNodeId(id))) return false;
            return !removedFlowNodeSet.has(link.source) && !removedFlowNodeSet.has(link.target);
          }),
          timeline: currentCanvas.timeline
            ? {
                ...ensureTimeline(currentCanvas.timeline),
                head: {
                  ...(ensureTimeline(currentCanvas.timeline).head || DEFAULT_TIMELINE_HEAD),
                  linkedNodeIds: (ensureTimeline(currentCanvas.timeline).head?.linkedNodeIds || []).filter(
                    (nodeId) => !removedNodeIds.has(nodeId)
                  ),
                },
                spaceBlocks: normalizeSpaceBlocks(ensureTimeline(currentCanvas.timeline).spaceBlocks).map((block) => ({
                  ...block,
                  linkedNodeIds: block.linkedNodeIds.filter((nodeId) => !removedNodeIds.has(nodeId)),
                })),
                blocks: ensureTimeline(currentCanvas.timeline).blocks.map((block) => ({
                  ...block,
                  linkedNodeIds: block.linkedNodeIds.filter((nodeId) => !removedNodeIds.has(nodeId)),
                })),
              }
            : currentCanvas.timeline,
        };
      });

      if (removedEpisodeIds.length) {
        setProjectData((previous) => {
          const removedEpisodeSet = new Set(removedEpisodeIds);
          return {
            ...previous,
            episodes: previous.episodes.filter((episode) => !removedEpisodeSet.has(episode.id)),
          };
        });
      }
    },
    [isLocked, nodes, onAlignmentGuideChange, persistCanvas, setProjectData, snapToGrid]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<ScriptCanvasEdge>[]) => {
      const nextEdges = applyEdgeChanges(changes, edges);
      persistCanvas((currentCanvas) => ({
        ...currentCanvas,
        links: nextEdges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: isTypedHandle(edge.sourceHandle) || edge.sourceHandle === "multi" ? edge.sourceHandle : undefined,
          targetHandle: isTypedHandle(edge.targetHandle) || edge.targetHandle === "multi" ? edge.targetHandle : undefined,
        })),
      }));
    },
    [edges, persistCanvas]
  );

  const commitScriptConnection = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return false;
      const sourceType = nodeTypeById.get(connection.source);
      const targetType = nodeTypeById.get(connection.target);
      if (!sourceType || !targetType) return false;

      const sourceHandles = getScriptNodeHandlesForType(sourceType);
      const targetHandles = getScriptNodeHandlesForType(targetType);
      const inferredSourceHandle =
        sourceType === "scriptPage" || sourceType === "mdText" ? "text" : inferHandleTypeFromNodeType(sourceType as NodeType);
      const sourceHandle =
        isTypedHandle(connection.sourceHandle) || connection.sourceHandle === "multi"
          ? connection.sourceHandle
          : pickOutputHandle(sourceHandles.outputs, inferredSourceHandle as ScriptHandleType);
      const targetHandle =
        isTypedHandle(connection.targetHandle) || connection.targetHandle === "multi"
          ? connection.targetHandle
          : pickInputHandle(targetHandles.inputs, sourceHandle as ScriptHandleType);
      if (!sourceHandle || !targetHandle) return false;
      const sourceIsScriptNode = sourceType === "scriptPage" || sourceType === "mdText";
      const targetIsScriptNode = targetType === "scriptPage" || targetType === "mdText";
      if (
        !sourceIsScriptNode &&
        !targetIsScriptNode &&
        !isValidConnection({ sourceHandle, targetHandle })
      ) {
        return false;
      }
      const id = `link-${connection.source}-${connection.target}-${sourceHandle}-${targetHandle}`;
      const nextEdges = addEdge(
        {
          ...connection,
          id,
          sourceHandle,
          targetHandle,
        },
        edges.filter((edge) => edge.id !== id)
      );

      persistCanvas((currentCanvas) => ({
        ...currentCanvas,
        links: nextEdges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: isTypedHandle(edge.sourceHandle) || edge.sourceHandle === "multi" ? edge.sourceHandle : undefined,
          targetHandle: isTypedHandle(edge.targetHandle) || edge.targetHandle === "multi" ? edge.targetHandle : undefined,
        })),
      }));
      return true;
    },
    [edges, nodeTypeById, persistCanvas]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      commitScriptConnection(connection);
    },
    [commitScriptConnection]
  );

  const updateSnapGuide = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (!snapToGrid || isLocked) {
        onAlignmentGuideChange(null);
        return;
      }
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) {
        onAlignmentGuideChange(null);
        return;
      }
      onAlignmentGuideChange(getEdgeAlignedPosition(node, nodes, position).guide);
    },
    [isLocked, nodes, onAlignmentGuideChange, snapToGrid]
  );

  useEffect(() => {
    if (!snapToGrid) onAlignmentGuideChange(null);
  }, [onAlignmentGuideChange, snapToGrid]);

  const revealAxisFromHead = useCallback(() => {
    if (axisRevealTriggeredRef.current) return;
    axisRevealTriggeredRef.current = true;
    setAxisRevealRequest(Date.now());
  }, []);

  const handleConnectStart: OnConnectStart = useCallback(() => {
    axisRevealTriggeredRef.current = false;

    const handlePointerMove = (event: PointerEvent) => {
      if (axisRevealTriggeredRef.current) return;
      const hitAxisTarget = getScriptAxisTargetHitAtPoint(event.clientX, event.clientY);
      if (hitAxisTarget?.type === "head") revealAxisFromHead();
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (axisRevealTriggeredRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;
      const hitAxisTarget = getScriptAxisTargetHitAtPoint(touch.clientX, touch.clientY);
      if (hitAxisTarget?.type === "head") revealAxisFromHead();
    };
    const cleanup = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", cleanup);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", cleanup);
      document.removeEventListener("touchcancel", cleanup);
      window.setTimeout(() => {
        axisRevealTriggeredRef.current = false;
      }, 0);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", cleanup, { once: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", cleanup, { once: true });
    document.addEventListener("touchcancel", cleanup, { once: true });
  }, [revealAxisFromHead]);

  const handleConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      if (connectionState.isValid || !connectionState.fromNode) return;
      const e = event as MouseEvent | TouchEvent;
      const clientX = "clientX" in e ? e.clientX : e.touches?.[0]?.clientX;
      const clientY = "clientY" in e ? e.clientY : e.touches?.[0]?.clientY;
      if (typeof clientX !== "number" || typeof clientY !== "number") return;

      const fromHandleId = connectionState.fromHandle?.id || null;
      const fromHandleType =
        isTypedHandle(fromHandleId) || fromHandleId === "multi" ? (fromHandleId as ScriptHandleType) : null;
      const isFromSource = connectionState.fromHandle?.type === "source";
      const hitAxisTarget = getScriptAxisTargetHitAtPoint(clientX, clientY);
      if (hitAxisTarget?.type === "head") {
        revealAxisFromHead();
        return;
      }
      if (hitAxisTarget && commitAxisTargetConnection(hitAxisTarget, connectionState.fromNode.id)) {
        return;
      }

      const hitNode = getScriptNodeHitAtPoint(clientX, clientY, connectionState.fromNode.id);
      if (hitNode) {
        const fromNodeId = connectionState.fromNode.id;
        const fromNodeType = nodeTypeById.get(fromNodeId);
        const preferred =
          fromHandleType ||
          (fromNodeType === "scriptPage" || fromNodeType === "mdText"
            ? "text"
            : (inferHandleTypeFromNodeType(fromNodeType as NodeType) as ScriptHandleType | null)) ||
          "text";

        const buildConnection = (sourceNodeId: string, targetNodeId: string): Connection | null => {
          if (sourceNodeId === targetNodeId) return null;
          const sourceHandles = getScriptNodeHandlesForType(nodeTypeById.get(sourceNodeId));
          const targetHandles = getScriptNodeHandlesForType(nodeTypeById.get(targetNodeId));
          const sourceHandle =
            sourceNodeId === fromNodeId && isFromSource && (isTypedHandle(fromHandleId) || fromHandleId === "multi")
              ? (fromHandleId as ScriptHandleType)
              : pickOutputHandle(sourceHandles.outputs, preferred);
          const targetHandle =
            targetNodeId === fromNodeId && !isFromSource
              ? pickInputHandle(targetHandles.inputs, preferred, fromHandleType)
              : pickInputHandle(targetHandles.inputs, preferred);

          if (!sourceHandle || !targetHandle) return null;
          return {
            source: sourceNodeId,
            sourceHandle,
            target: targetNodeId,
            targetHandle,
          };
        };

        const sidePreferredConnections =
          hitNode.side === "right"
            ? [buildConnection(hitNode.nodeId, fromNodeId), buildConnection(fromNodeId, hitNode.nodeId)]
            : [buildConnection(fromNodeId, hitNode.nodeId), buildConnection(hitNode.nodeId, fromNodeId)];

        for (const connection of sidePreferredConnections) {
          if (connection && commitScriptConnection(connection)) return;
        }
        return;
      }
      setConnectionDrop({
        position: { x: clientX, y: clientY },
        flowPosition: screenToFlowPosition({ x: clientX, y: clientY }),
        handleType: fromHandleType,
        connectionType: isFromSource ? "source" : "target",
        sourceNodeId: connectionState.fromNode.id,
        sourceHandleId: fromHandleId,
      });
    },
    [commitAxisTargetConnection, commitScriptConnection, nodeTypeById, revealAxisFromHead, screenToFlowPosition]
  );

  const handleDropCreate = useCallback(
    (type: ScriptCanvasCreateType) => {
      if (!connectionDrop) return;
      if (type === "scriptPage") {
        handleAddScriptPage(connectionDrop.flowPosition, connectionDrop);
        setConnectionDrop(null);
        return;
      }
      if (type === "mdText") {
        handleAddMarkdownNode(connectionDrop.flowPosition, connectionDrop);
        setConnectionDrop(null);
        return;
      }

      handleAddFlowNode(type, connectionDrop.flowPosition, connectionDrop);
      setConnectionDrop(null);
    },
    [connectionDrop, handleAddFlowNode, handleAddMarkdownNode, handleAddScriptPage]
  );

  const handleScriptNodeClick = useCallback(
    (node: ScriptCanvasNode) => {
      const linkedBlock = timeline.blocks.find((block) => block.linkedNodeIds.includes(node.id));
      if (linkedBlock) setActiveTimelineBlockId(linkedBlock.id);
      if (node.type === "scriptPage") onOpenEpisode((node.data as ScriptPageData).episodeId);
    },
    [onOpenEpisode, timeline.blocks]
  );

  const overlays = (
    <>
      {connectionDrop ? (
        <ConnectionDropMenu
          position={connectionDrop.position}
          options={scriptCreateOptions}
          subtitle="创建剧本画布节点"
          onCreate={handleDropCreate}
          onClose={() => setConnectionDrop(null)}
        />
      ) : null}

      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            onClick={() => handleAddScriptPage()}
            className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-panel)] px-4 text-[13px] font-semibold text-[var(--app-text-primary)] shadow-[var(--app-shadow)] transition hover:border-[var(--app-border-strong)]"
          >
            <Plus size={16} />
            Script
          </button>
        </div>
      ) : null}

      {!isWritingEditorOpen ? (
        <ScriptFoundation
          timeline={timeline}
          nodeSummaries={nodeSummaries}
          activeBlockId={activeTimelineBlockId}
          onActiveBlockChange={setActiveTimelineBlockId}
          onUpdateHead={handleTimelineHeadUpdate}
          onUpdateBlock={handleTimelineBlockUpdate}
          onUpdateSpaceBlock={handleSpaceBlockUpdate}
          onAddSpaceBlock={handleSpaceBlockAdd}
          onSplitBlock={handleTimelineBlockSplit}
          onSplitSpaceBlock={handleSpaceBlockSplit}
          onDeleteBlock={handleTimelineBlockDelete}
          onDeleteSpaceBlock={handleSpaceBlockDelete}
          onReorderBlock={handleTimelineBlockReorder}
          onReorderSpaceBlock={handleSpaceBlockReorder}
          onResizeStart={handleTimelineResizeStart}
          onSpaceResizeStart={handleSpaceResizeStart}
          axisRevealRequest={axisRevealRequest}
          onCreateArchiveNode={handleAddMarkdownNodeFromTail}
          onCreateScriptNode={handleAddScriptPageFromTail}
          onCreateFlowNode={(type) => {
            const position =
              typeof window === "undefined"
                ? undefined
                : screenToFlowPosition({
                    x: window.innerWidth / 2,
                    y: Math.max(120, window.innerHeight / 2 - 120),
                  });
            handleAddFlowNode(type, position);
          }}
          onOpenAgent={onOpenAgent}
          onSubmitAgentMessage={onSubmitAgentMessage}
          agentComposerValue={agentComposerValue}
          onAgentComposerChange={onAgentComposerChange}
          onAgentComposerAction={onAgentComposerAction}
          isAgentSending={isAgentSending}
          isAgentFirstMode={isAgentFirstMode}
          onOpenMarkdownCard={onCollapseCanvasCards}
          onCloseMarkdownCard={onRestoreCanvasCards}
          nodes={nodes}
          viewport={canvasControls.viewport}
        />
      ) : null}
    </>
  );

  return {
    key: "script",
    nodes,
    edges,
    nodeTypes,
    onNodesChange: handleNodesChange as CanvasSurfaceConfig["onNodesChange"],
    onEdgesChange: handleEdgesChange as CanvasSurfaceConfig["onEdgesChange"],
    onConnect: handleConnect,
    onConnectStart: handleConnectStart,
    onConnectEnd: handleConnectEnd,
    onNodeClick: (_, node) => handleScriptNodeClick(node as ScriptCanvasNode),
    onNodeDragStart: (_, node) => updateSnapGuide(node.id, node.position),
    onNodeDrag: (_, node) => updateSnapGuide(node.id, node.position),
    onNodeDragStop: () => onAlignmentGuideChange(null),
    nodesDraggable: !isLocked,
    nodesConnectable: !isLocked,
    elementsSelectable: !isLocked,
    overlays,
    actions: {
      addNode: handleAddFlowNode,
      importNodeFlow: handleImportScriptNodeFlow,
      exportNodeFlow: handleExportScriptNodeFlow,
      runAll: handleRunScriptAll,
    },
  };
};
