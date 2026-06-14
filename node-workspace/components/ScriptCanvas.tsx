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
import { Bot, FileText, Film, GripVertical, Image as ImageIcon, Network, Plus, Scissors, SendHorizontal, Trash2, Upload } from "lucide-react";
import type {
  Episode,
  ProjectData,
  ScriptCanvasState,
  ScriptCanvasTextNode,
  ScriptSpatialBlock,
  ScriptTimelineBlock,
  ScriptTimelineHead,
  ScriptTimelineState,
} from "../../types";
import { BaseNode } from "../nodes/BaseNode";
import {
  alignPositionChangesToNodeEdges,
  getEdgeAlignedPosition,
} from "../utils/edgeAlignment";
import { ConnectionDropMenu, type ConnectionDropMenuOption } from "./ConnectionDropMenu";
import type { CanvasSurfaceConfig, SharedCanvasControls } from "./canvas/types";

type ScriptPageData = {
  title: string;
  episodeId: number;
  preview: string;
};

type InspirationImageData = {
  title: string;
  imageUrl: string;
  filename?: string;
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
  | Node<ScriptPageData, "text">
  | Node<InspirationImageData, "imageInput">
  | Node<MarkdownTextData, "mdText">;

type ScriptCanvasEdge = Edge<Record<string, never>>;
type ScriptCanvasCreateType = "scriptPage" | "scriptImage" | "mdText";
type ScriptHandleType = "image" | "text";

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
  kind: "剧本" | "图片" | "档案";
};

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  onOpenEpisode: (episodeId: number) => void;
  canvasControls: SharedCanvasControls;
  screenToFlowPosition: (position: { x: number; y: number }) => XYPosition;
  isWritingEditorOpen?: boolean;
  onCollapseCanvasCards?: () => void;
  onRestoreCanvasCards?: () => void;
  onOpenAgent?: () => void;
  onSubmitAgentMessage?: (text: string) => void;
};

const ensureCanvas = (canvas?: ScriptCanvasState): ScriptCanvasState => ({
  pages: Array.isArray(canvas?.pages) ? canvas.pages : [],
  images: Array.isArray(canvas?.images) ? canvas.images : [],
  textNodes: Array.isArray(canvas?.textNodes) ? canvas.textNodes : [],
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
const scriptCreateOptions: ConnectionDropMenuOption<ScriptCanvasCreateType>[] = [
  { label: "剧本文档", hint: "创建一个新的分集稿纸", type: "scriptPage", Icon: Plus },
  { label: "档案文档", hint: "连接空间轴的全局 Markdown 档案", type: "mdText", Icon: Plus },
  { label: "灵感图片", hint: "上传写作参考图", type: "scriptImage", Icon: Upload },
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

const getScriptNodeHandles = (nodeId: string) => {
  if (isImageNodeId(nodeId)) return { inputs: [] as ScriptHandleType[], outputs: ["image"] as ScriptHandleType[] };
  return { inputs: ["image", "text"] as ScriptHandleType[], outputs: ["text"] as ScriptHandleType[] };
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

const getLegacyScriptPosition = (index: number) => ({
  x: (index % 4) * 240,
  y: Math.floor(index / 4) * 170,
});

const isLegacyScriptPosition = (position: { x: number; y: number } | undefined, index: number) => {
  if (!position) return false;
  const legacy = getLegacyScriptPosition(index);
  return Math.abs(position.x - legacy.x) < 2 && Math.abs(position.y - legacy.y) < 2;
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

const InspirationImageNode: React.FC<any> = ({ data, selected }) => (
  <BaseNode title={data.title || "image"} outputs={["image"]} selected={selected} variant="media" nodeType="imageInput">
    <div className="image-input-shell relative h-full w-full">
      <div className="image-input-frame">
        <div className="image-input-media">
          <img src={data.imageUrl} alt={data.filename || "preview"} className="image-input-img" />
        </div>
        <div className="image-input-caption">
          <div className="image-input-label">
            <div className="image-input-editor pointer-events-none">
              {data.filename || "Inspiration image"}
            </div>
          </div>
        </div>
      </div>
    </div>
  </BaseNode>
);

const nodeTypes: NodeTypes = {
  text: ScriptPageNode,
  mdText: MarkdownTextNode,
  imageInput: InspirationImageNode,
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
  onCreateImageNode: () => void;
  onOpenAgent?: () => void;
  onSubmitAgentMessage?: (text: string) => void;
  onOpenMarkdownCard?: () => void;
  onCloseMarkdownCard?: () => void;
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
  onCreateImageNode,
  onOpenAgent,
  onSubmitAgentMessage,
  onOpenMarkdownCard,
  onCloseMarkdownCard,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const clickTimerRef = useRef<number | null>(null);
  const foundationLineSignatureRef = useRef("");
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [activeAxis, setActiveAxis] = useState<ScriptAxisMode>("time");
  const [menuState, setMenuState] = useState<ScriptFoundationMenuState | null>(null);
  const [editingTarget, setEditingTarget] = useState<ScriptFoundationEditTarget | null>(null);
  const [isTimelineDocumentOpen, setIsTimelineDocumentOpen] = useState(false);
  const [foundationGuideLines, setFoundationGuideLines] = useState<ScriptFoundationGuideLine[]>([]);
  const [isAgentTailOpen, setIsAgentTailOpen] = useState(false);
  const [agentTailInput, setAgentTailInput] = useState("");
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

  useEffect(() => {
    const targets = [
      ...timeline.blocks.map((block) => ({ type: "time" as const, id: block.id, color: block.color, linkedNodeIds: block.linkedNodeIds })),
      ...spaceBlocks.map((block) => ({ type: "space" as const, id: block.id, color: block.color, linkedNodeIds: block.linkedNodeIds })),
    ].filter((target) => target.linkedNodeIds.length);

    if (!targets.length) {
      foundationLineSignatureRef.current = "";
      setFoundationGuideLines([]);
      return;
    }

    let animationFrame = 0;
    let isMounted = true;

    const measureLines = () => {
      if (!isMounted) return;
      const nextLines: ScriptFoundationGuideLine[] = [];
      targets.forEach((target) => {
        const targetElement =
          (target.type === activeAxis
            ? document.querySelector<HTMLElement>(`[data-axis-target-type="${target.type}"][data-axis-target-id="${target.id}"]`)
            : null) ||
          document.querySelector<HTMLElement>('[data-axis-target-type="head"][data-axis-target-id="head"]');
        if (!targetElement) return;
        const targetRect = targetElement.getBoundingClientRect();
        const targetX = targetRect.left + targetRect.width / 2;
        const targetY = targetRect.top + 5;

        target.linkedNodeIds.forEach((nodeId) => {
          const nodeElement = Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node")).find(
            (element) => element.getAttribute("data-id") === nodeId
          );
          if (!nodeElement) return;
          const nodeRect = nodeElement.getBoundingClientRect();
          const nodeCenterX = nodeRect.left + nodeRect.width / 2;
          const nodeCenterY = nodeRect.top + nodeRect.height / 2;
          if (
            nodeRect.width < 48 ||
            nodeRect.height < 40 ||
            nodeRect.right <= 0 ||
            nodeRect.left >= window.innerWidth ||
            nodeRect.bottom <= 0 ||
            nodeRect.top >= targetY - 18 ||
            nodeCenterX <= 0 ||
            nodeCenterX >= window.innerWidth ||
            nodeCenterY <= 0 ||
            nodeCenterY >= window.innerHeight
          ) {
            return;
          }
          const topElement = document.elementFromPoint(nodeCenterX, nodeCenterY);
          const visibleNodeElement = topElement?.closest(".react-flow__node");
          if (visibleNodeElement && visibleNodeElement.getAttribute("data-id") !== nodeId) return;
          if (!visibleNodeElement && topElement && !nodeElement.contains(topElement)) return;
          const nodeX = nodeCenterX;
          const nodeY = Math.min(nodeRect.bottom, targetY - 24);
          const midY = nodeY + (targetY - nodeY) * 0.56;
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

      const signature = JSON.stringify(nextLines);
      if (signature !== foundationLineSignatureRef.current) {
        foundationLineSignatureRef.current = signature;
        setFoundationGuideLines(nextLines);
      }
      animationFrame = window.requestAnimationFrame(measureLines);
    };

    animationFrame = window.requestAnimationFrame(measureLines);
    return () => {
      isMounted = false;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [activeAxis, activeBlockId, head.linkedNodeIds, spaceBlocks, timeline.blocks]);

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
    const text = agentTailInput.trim();
    if (text) {
      onSubmitAgentMessage?.(text);
      setAgentTailInput("");
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
              {(activeAxis === "time" ? timeline.blocks : spaceBlocks).map((block, axisIndex) => {
            const spaceWidthTotal = spaceBlocks.reduce((sum, item) => sum + Math.max(0.45, item.width), 0) || 1;
            const width =
              activeAxis === "time"
                ? Math.max(6, ((block as ScriptTimelineBlock).durationMin / timeline.durationMin) * 100)
                : Math.max(8, ((block as ScriptSpatialBlock).width / spaceWidthTotal) * 100);
            const timeBlock = block as ScriptTimelineBlock;
            const isActive = activeAxis === "time" && block.id === activeBlock?.id;
            const linkedCount = block.linkedNodeIds.length;
            return (
              <div
                key={block.id}
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
                className={`script-foundation-block is-${block.color} ${isActive ? "is-active" : ""} ${draggingBlockId === block.id ? "is-dragging" : ""}`}
                style={{ flexBasis: `${width}%`, "--axis-index": axisIndex } as CSSProperties}
              >
                <button
                  type="button"
                  className="script-foundation-resize script-foundation-resize--left"
                  aria-label={activeAxis === "time" ? "调整区间起点" : "调整空间块宽度"}
                  onPointerDown={(event) =>
                    activeAxis === "time"
                      ? handleResizePointerDown(event, block.id, "left")
                      : handleSpaceResizePointerDown(event, block.id, "left")
                  }
                />
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
                <button
                  type="button"
                  className="script-foundation-resize script-foundation-resize--right"
                  aria-label={activeAxis === "time" ? "调整区间终点" : "调整空间块宽度"}
                  onPointerDown={(event) =>
                    activeAxis === "time"
                      ? handleResizePointerDown(event, block.id, "right")
                      : handleSpaceResizePointerDown(event, block.id, "right")
                  }
                />
              </div>
            );
              })}
            </div>
          ) : null}
        </div>

        <div className={`script-foundation-tail ${isAgentTailOpen ? "is-agent-open" : ""}`}>
          {isAgentTailOpen ? (
            <div className="script-foundation-tail-composer">
              <textarea
                value={agentTailInput}
                rows={1}
                placeholder="询问 Qalam"
                onChange={(event) => setAgentTailInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleAgentTailSend();
                  }
                  if (event.key === "Escape") {
                    setIsAgentTailOpen(false);
                    setAgentTailInput("");
                  }
                }}
              />
              <button
                type="button"
                className="script-foundation-tail-send"
                onClick={handleAgentTailSend}
                title={agentTailInput.trim() ? "发送给 Qalam" : "打开 Qalam"}
                aria-label={agentTailInput.trim() ? "发送给 Qalam" : "打开 Qalam"}
              >
                <SendHorizontal size={15} strokeWidth={1.9} />
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
        <div className="script-foundation-node-menu-wrap" style={getFoundationMenuStyle(nodeCreateMenu.x, nodeCreateMenu.y, 250)}>
          <section className="script-foundation-floating-menu script-foundation-node-popover">
            <button type="button" onClick={() => runNodeCreateAction(onCreateArchiveNode)}>
              <FileText size={15} strokeWidth={1.85} />
              <span>
                <strong>档案文档</strong>
                <small>空间轴全局 Markdown</small>
              </span>
            </button>
            <button type="button" onClick={() => runNodeCreateAction(onCreateScriptNode)}>
              <Film size={15} strokeWidth={1.85} />
              <span>
                <strong>剧本文档</strong>
                <small>进入剧本写作节点</small>
              </span>
            </button>
            <button type="button" onClick={() => runNodeCreateAction(onCreateImageNode)}>
              <ImageIcon size={15} strokeWidth={1.85} />
              <span>
                <strong>灵感图片</strong>
                <small>上传画布参考图</small>
              </span>
            </button>
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
  isWritingEditorOpen,
  onCollapseCanvasCards,
  onRestoreCanvasCards,
  onOpenAgent,
  onSubmitAgentMessage,
}: Props): CanvasSurfaceConfig => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePositionRef = useRef<{ x: number; y: number } | null>(null);
  const pendingImageConnectionRef = useRef<ScriptConnectionDropState | null>(null);
  const {
    isLocked,
    snapToGrid,
    onAlignmentGuideChange,
  } = canvasControls;
  const [connectionDrop, setConnectionDrop] = useState<ScriptConnectionDropState | null>(null);
  const [activeTimelineBlockId, setActiveTimelineBlockId] = useState("");
  const [axisRevealRequest, setAxisRevealRequest] = useState(0);
  const axisRevealTriggeredRef = useRef(false);
  const canvas = useMemo(() => ensureCanvas(projectData.scriptCanvas), [projectData.scriptCanvas]);
  const timeline = useMemo(() => ensureTimeline(canvas.timeline), [canvas.timeline]);

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
    const pageNodes: ScriptCanvasNode[] = (projectData.episodes || []).map((episode, index) => ({
      id: scriptNodeId(episode.id),
      type: "text",
      position:
        !pagePositionById.get(episode.id) || isLegacyScriptPosition(pagePositionById.get(episode.id), index)
          ? getDefaultScriptPosition(index)
          : pagePositionById.get(episode.id)!,
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
      data: {
        title: "image",
        imageUrl: image.imageUrl,
        filename: image.filename,
      },
    }));

    const markdownNodes: ScriptCanvasNode[] = (canvas.textNodes || []).map((textNode, index) => ({
      id: markdownNodeId(textNode.id),
      type: "mdText",
      position: textNode.position || getDefaultMarkdownPosition(index),
      data: {
        documentId: textNode.id,
        title: textNode.title || "档案文档",
        content: textNode.content || "",
        preview: compactMarkdownPreview(textNode.content || ""),
        onTitleChange: handleMarkdownTitleChange,
        onContentChange: handleMarkdownContentChange,
      },
    }));

    return [...pageNodes, ...imageNodes, ...markdownNodes];
  }, [
    canvas.images,
    canvas.pages,
    canvas.textNodes,
    handleMarkdownContentChange,
    handleMarkdownTitleChange,
    projectData.episodes,
  ]);

  const nodeIdSet = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const nodeSummaries = useMemo<ScriptFoundationNodeSummary[]>(
    () =>
      nodes.map((node) => ({
        id: node.id,
        title:
          node.type === "imageInput"
            ? ((node.data as InspirationImageData).filename || (node.data as InspirationImageData).title || "灵感图片")
            : node.type === "mdText"
              ? ((node.data as MarkdownTextData).title || "档案文档")
            : ((node.data as ScriptPageData).title || `第${(node.data as ScriptPageData).episodeId}集`),
        kind: node.type === "imageInput" ? "图片" : node.type === "mdText" ? "档案" : "剧本",
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
          animated: true,
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
      dropState: ScriptConnectionDropState | null
    ) => {
      if (!dropState?.sourceNodeId) return currentLinks;

      const existingNodeHandles = getScriptNodeHandles(dropState.sourceNodeId);
      const createdNodeHandles = getScriptNodeHandles(createdNodeId);
      const existingTypedHandle =
        dropState.sourceHandleId === "image" || dropState.sourceHandleId === "text" ? dropState.sourceHandleId : null;
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

      const id = `link-${source}-${target}`;
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
    []
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
          links: buildLinkForCreatedNode(nextCanvas.links, createdNodeId, dropState),
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
            links: buildLinkForCreatedNode(nextCanvas.links, createdNodeId, dropState),
          },
        };
      });
      return createdNodeId;
    },
    [buildLinkForCreatedNode, setProjectData]
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

  const handleAddImageFromTail = useCallback(() => {
    pendingImagePositionRef.current =
      typeof window === "undefined"
        ? null
        : screenToFlowPosition({
            x: window.innerWidth / 2,
            y: Math.max(120, window.innerHeight / 2 - 120),
          });
    pendingImageConnectionRef.current = null;
    fileInputRef.current?.click();
  }, [screenToFlowPosition]);

  const handleImageInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const imageUrl = typeof reader.result === "string" ? reader.result : "";
        if (!imageUrl) return;

        setProjectData((previous) => {
          const nextCanvas = ensureCanvas(previous.scriptCanvas);
          const id = `inspiration-${Date.now()}`;
          const createdNodeId = imageNodeId(id);
          const position = pendingImagePositionRef.current || getDefaultImagePosition(nextCanvas.images.length);
          const dropState = pendingImageConnectionRef.current;
          pendingImagePositionRef.current = null;
          pendingImageConnectionRef.current = null;
          return {
            ...previous,
            scriptCanvas: {
              ...nextCanvas,
              images: [
                ...nextCanvas.images,
                {
                  id,
                  imageUrl,
                  filename: file.name,
                  position,
                  createdAt: Date.now(),
                },
              ],
              links: buildLinkForCreatedNode(nextCanvas.links, createdNodeId, dropState),
            },
          };
        });
      };
      reader.readAsDataURL(file);
      event.target.value = "";
    },
    [buildLinkForCreatedNode, setProjectData]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<ScriptCanvasNode>[]) => {
      const aligned = alignPositionChangesToNodeEdges(changes, nodes, snapToGrid && !isLocked);
      onAlignmentGuideChange(aligned.guide);
      const effectiveChanges = aligned.changes;
      const hasPositionChange = effectiveChanges.some((change) => change.type === "position" && change.position);
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

      if (!hasPositionChange && removedImageIds.length === 0 && removedEpisodeIds.length === 0 && removedMarkdownIds.length === 0) return;

      const nextNodes = applyNodeChanges(effectiveChanges, nodes);
      const positionById = new Map(nextNodes.map((node) => [node.id, node.position]));

      persistCanvas((currentCanvas, previous) => {
        const removedImageSet = new Set(removedImageIds);
        const removedEpisodeSet = new Set(removedEpisodeIds);
        const removedMarkdownSet = new Set(removedMarkdownIds);
        const nextEpisodes = previous.episodes.filter((episode) => !removedEpisodeSet.has(episode.id));
        const images = currentCanvas.images
          .filter((image) => !removedImageSet.has(image.id))
          .map((image) => ({
            ...image,
            position: positionById.get(imageNodeId(image.id)) || image.position,
          }));
        const textNodes = (currentCanvas.textNodes || [])
          .filter((node) => !removedMarkdownSet.has(node.id))
          .map((node, index) => ({
            ...node,
            position: positionById.get(markdownNodeId(node.id)) || node.position || getDefaultMarkdownPosition(index),
          }));
        const removedNodeIds = new Set([
          ...removedImageIds.map((id) => imageNodeId(id)),
          ...removedEpisodeIds.map((id) => scriptNodeId(id)),
          ...removedMarkdownIds.map((id) => markdownNodeId(id)),
        ]);

        return {
          ...currentCanvas,
          pages: nextEpisodes.map((episode, index) => ({
            episodeId: episode.id,
            position:
              positionById.get(scriptNodeId(episode.id)) ||
              currentCanvas.pages.find((page) => page.episodeId === episode.id)?.position ||
              getDefaultScriptPosition(index),
          })),
          images,
          textNodes,
          links: currentCanvas.links.filter((link) => {
            if (removedImageIds.some((id) => link.source === imageNodeId(id) || link.target === imageNodeId(id))) return false;
            if (removedEpisodeIds.some((id) => link.source === scriptNodeId(id) || link.target === scriptNodeId(id))) return false;
            return !removedMarkdownIds.some((id) => link.source === markdownNodeId(id) || link.target === markdownNodeId(id));
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
          sourceHandle: edge.sourceHandle === "image" || edge.sourceHandle === "text" ? edge.sourceHandle : undefined,
          targetHandle: edge.targetHandle === "image" || edge.targetHandle === "text" ? edge.targetHandle : undefined,
        })),
      }));
    },
    [edges, persistCanvas]
  );

  const commitScriptConnection = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return false;
      if (!isTextNodeId(connection.target)) return false;
      if (!isImageNodeId(connection.source) && !isTextNodeId(connection.source)) return false;

      const sourceHandle =
        connection.sourceHandle === "image" || connection.sourceHandle === "text"
          ? connection.sourceHandle
          : isImageNodeId(connection.source)
            ? "image"
            : "text";
      const targetHandle =
        connection.targetHandle === "image" || connection.targetHandle === "text"
          ? connection.targetHandle
          : isImageNodeId(connection.source)
            ? "image"
            : "text";
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
          sourceHandle: (edge.sourceHandle === "image" || edge.sourceHandle === "text" ? edge.sourceHandle : undefined),
          targetHandle: (edge.targetHandle === "image" || edge.targetHandle === "text" ? edge.targetHandle : undefined),
        })),
      }));
      return true;
    },
    [edges, persistCanvas]
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
      const fromHandleType = fromHandleId === "image" || fromHandleId === "text" ? fromHandleId : null;
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
        const preferred = fromHandleType || (isImageNodeId(fromNodeId) ? "image" : "text");

        const buildConnection = (sourceNodeId: string, targetNodeId: string): Connection | null => {
          if (sourceNodeId === targetNodeId) return null;
          const sourceHandles = getScriptNodeHandles(sourceNodeId);
          const targetHandles = getScriptNodeHandles(targetNodeId);
          const sourceHandle =
            sourceNodeId === fromNodeId && isFromSource && (fromHandleId === "image" || fromHandleId === "text")
              ? fromHandleId
              : pickOutputHandle(sourceHandles.outputs, preferred);
          const targetHandle =
            targetNodeId === fromNodeId && !isFromSource
              ? pickInputHandle(targetHandles.inputs, preferred, fromHandleId)
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
    [commitAxisTargetConnection, commitScriptConnection, revealAxisFromHead, screenToFlowPosition]
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

      pendingImagePositionRef.current = connectionDrop.flowPosition;
      pendingImageConnectionRef.current = connectionDrop;
      setConnectionDrop(null);
      fileInputRef.current?.click();
    },
    [connectionDrop, handleAddMarkdownNode, handleAddScriptPage]
  );

  const handleScriptNodeClick = useCallback(
    (node: ScriptCanvasNode) => {
      const linkedBlock = timeline.blocks.find((block) => block.linkedNodeIds.includes(node.id));
      if (linkedBlock) setActiveTimelineBlockId(linkedBlock.id);
      if (node.type === "text") onOpenEpisode((node.data as ScriptPageData).episodeId);
    },
    [onOpenEpisode, timeline.blocks]
  );

  const overlays = (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageInput} />

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
          onCreateImageNode={handleAddImageFromTail}
          onOpenAgent={onOpenAgent}
          onSubmitAgentMessage={onSubmitAgentMessage}
          onOpenMarkdownCard={onCollapseCanvasCards}
          onCloseMarkdownCard={onRestoreCanvasCards}
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
  };
};
