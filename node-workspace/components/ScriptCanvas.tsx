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
  XYPosition,
} from "@xyflow/react";
import { BookOpenText, Clock3, GripVertical, Link2, Palette, Plus, Scissors, Trash2, Upload, X } from "lucide-react";
import type { Episode, ProjectData, ScriptCanvasState, ScriptTimelineBlock, ScriptTimelineState } from "../../types";
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

type ScriptCanvasNode =
  | Node<ScriptPageData, "text">
  | Node<InspirationImageData, "imageInput">;

type ScriptCanvasEdge = Edge<Record<string, never>>;
type ScriptCanvasCreateType = "scriptPage" | "scriptImage";
type ScriptHandleType = "image" | "text";

type ScriptConnectionDropState = {
  position: { x: number; y: number };
  flowPosition: { x: number; y: number };
  handleType: ScriptHandleType | null;
  connectionType: "source" | "target";
  sourceNodeId: string | null;
  sourceHandleId: string | null;
};

type ScriptTimelineNodeSummary = {
  id: string;
  title: string;
  kind: "剧本" | "图片";
};

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  onOpenEpisode: (episodeId: number) => void;
  canvasControls: SharedCanvasControls;
  screenToFlowPosition: (position: { x: number; y: number }) => XYPosition;
};

const ensureCanvas = (canvas?: ScriptCanvasState): ScriptCanvasState => ({
  pages: Array.isArray(canvas?.pages) ? canvas.pages : [],
  images: Array.isArray(canvas?.images) ? canvas.images : [],
  links: Array.isArray(canvas?.links) ? canvas.links : [],
  timeline: canvas?.timeline,
});

const scriptNodeId = (episodeId: number) => `script-${episodeId}`;
const imageNodeId = (imageId: string) => `image-${imageId}`;

const isImageNodeId = (id?: string | null) => !!id && id.startsWith("image-");
const isTextNodeId = (id?: string | null) => !!id && id.startsWith("script-");
const scriptCreateOptions: ConnectionDropMenuOption<ScriptCanvasCreateType>[] = [
  { label: "剧本文档", hint: "创建一个新的分集稿纸", type: "scriptPage", Icon: Plus },
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

const createDefaultTimeline = (): ScriptTimelineState => ({
  id: "film-structure",
  title: "影片时间轴",
  durationMin: DEFAULT_TIMELINE_DURATION,
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
  return {
    id: timeline.id || "film-structure",
    title: timeline.title || "影片时间轴",
    durationMin,
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

const getTimelineBlockHitAtPoint = (clientX: number, clientY: number) => {
  if (typeof document === "undefined") return null;
  const magneticPadding = 18;
  let closest: { blockId: string; distance: number } | null = null;

  document.querySelectorAll<HTMLElement>("[data-timeline-block-id]").forEach((blockElement) => {
    const blockId = blockElement.getAttribute("data-timeline-block-id");
    if (!blockId) return;
    const rect = blockElement.getBoundingClientRect();
    const inside =
      clientX >= rect.left - magneticPadding &&
      clientX <= rect.right + magneticPadding &&
      clientY >= rect.top - magneticPadding &&
      clientY <= rect.bottom + magneticPadding;
    if (!inside) return;

    const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
    const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
    const distance = Math.hypot(dx, dy);
    if (!closest || distance < closest.distance) closest = { blockId, distance };
  });

  return closest?.blockId || null;
};

const getDefaultScriptPosition = (index: number) => ({
  x: (index % 3) * 380,
  y: Math.floor(index / 3) * 330,
});

const getDefaultImagePosition = (index: number) => ({
  x: -420,
  y: index * 330,
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
  shots: [],
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
  imageInput: InspirationImageNode,
};

type ScriptTimelineDockProps = {
  timeline: ScriptTimelineState;
  nodeSummaries: ScriptTimelineNodeSummary[];
  activeBlockId: string;
  onActiveBlockChange: (blockId: string) => void;
  onDurationChange: (durationMin: number) => void;
  onUpdateBlock: (blockId: string, patch: Partial<ScriptTimelineBlock>) => void;
  onSplitBlock: (blockId: string) => void;
  onDeleteBlock: (blockId: string) => void;
  onToggleNodeLink: (blockId: string, nodeId: string) => void;
  onReorderBlock: (sourceBlockId: string, targetBlockId: string) => void;
  onResizeStart: (blockId: string, edge: "left" | "right", clientX: number, trackWidth: number) => void;
};

type ScriptTimelineMenuState =
  | { type: "head"; x: number; y: number }
  | { type: "block"; blockId: string; x: number; y: number };

const getTimelineMenuStyle = (x: number, y: number, menuWidth = 390): CSSProperties => {
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 720 : window.innerHeight;
  return {
    "--timeline-menu-x": `${Math.min(Math.max(x, menuWidth / 2 + 12), viewportWidth - menuWidth / 2 - 12)}px`,
    "--timeline-menu-y": `${Math.min(Math.max(y, 180), viewportHeight - 104)}px`,
  } as CSSProperties;
};

const ScriptTimelineDock: React.FC<ScriptTimelineDockProps> = ({
  timeline,
  nodeSummaries,
  activeBlockId,
  onActiveBlockChange,
  onDurationChange,
  onUpdateBlock,
  onSplitBlock,
  onDeleteBlock,
  onToggleNodeLink,
  onReorderBlock,
  onResizeStart,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const clickTimerRef = useRef<number | null>(null);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [menuState, setMenuState] = useState<ScriptTimelineMenuState | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const activeBlock = timeline.blocks.find((block) => block.id === activeBlockId) || timeline.blocks[0];
  const actionBlock =
    menuState?.type === "block" ? timeline.blocks.find((block) => block.id === menuState.blockId) || null : null;
  const editingBlock = timeline.blocks.find((block) => block.id === editingBlockId) || null;
  const linkedNodes = useMemo(
    () => (actionBlock?.linkedNodeIds || []).map((nodeId) => nodeSummaries.find((node) => node.id === nodeId)).filter(Boolean) as ScriptTimelineNodeSummary[],
    [actionBlock?.linkedNodeIds, nodeSummaries]
  );

  useEffect(
    () => () => {
      if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    },
    []
  );

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

  const handleHeadClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setMenuState({ type: "head", x: event.clientX, y: event.clientY });
    setEditingBlockId(null);
  };

  const handleBlockClick = (event: React.MouseEvent<HTMLDivElement>, blockId: string) => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    const { clientX, clientY } = event;
    clickTimerRef.current = window.setTimeout(() => {
      onActiveBlockChange(blockId);
      setMenuState((current) =>
        current?.type === "block" && current.blockId === blockId ? null : { type: "block", blockId, x: clientX, y: clientY }
      );
      setEditingBlockId(null);
    }, 170);
  };

  const handleBlockDoubleClick = (blockId: string) => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    onActiveBlockChange(blockId);
    setMenuState(null);
    setEditingBlockId(blockId);
  };

  return (
    <div className="script-timeline-dock">
      <div className="script-timeline-filmstrip" aria-label="影片时间轴">
        <button type="button" className="script-timeline-head-block" onClick={handleHeadClick} title="查看时间轴索引与总时长">
          <span className="script-timeline-head-block__mark">
            <BookOpenText size={15} strokeWidth={1.8} />
          </span>
          <span className="script-timeline-head-block__text">
            <small>INDEX</small>
            <strong>{timeline.durationMin}min</strong>
          </span>
          <em>{timeline.blocks.length}段</em>
        </button>

        <div ref={trackRef} className="script-timeline-track">
          {timeline.blocks.map((block) => {
            const width = Math.max(6, (block.durationMin / timeline.durationMin) * 100);
            const isActive = block.id === activeBlock?.id;
            const linkedCount = block.linkedNodeIds.length;
            return (
              <div
                key={block.id}
                data-timeline-block-id={block.id}
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
                  if (sourceId && sourceId !== block.id) onReorderBlock(sourceId, block.id);
                  setDraggingBlockId(null);
                }}
                onDragEnd={() => setDraggingBlockId(null)}
                onClick={(event) => handleBlockClick(event, block.id)}
                onDoubleClick={() => handleBlockDoubleClick(block.id)}
                className={`script-timeline-block is-${block.color} ${isActive ? "is-active" : ""} ${draggingBlockId === block.id ? "is-dragging" : ""}`}
                style={{ flexBasis: `${width}%` }}
              >
                <button
                  type="button"
                  className="script-timeline-resize script-timeline-resize--left"
                  aria-label="调整区间起点"
                  onPointerDown={(event) => handleResizePointerDown(event, block.id, "left")}
                />
                <div className="script-timeline-block__inner">
                  <div className="script-timeline-block__meta">
                    <GripVertical size={13} strokeWidth={1.8} />
                    <span>
                      {formatTimelineTime(block.startMin)}-{formatTimelineTime(block.startMin + block.durationMin)}
                    </span>
                  </div>
                  <strong>{block.title}</strong>
                  <div className="script-timeline-block__foot">
                    <span>{block.durationMin}min</span>
                    <span>{linkedCount ? `${linkedCount} 个节点` : "可连线"}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="script-timeline-resize script-timeline-resize--right"
                  aria-label="调整区间终点"
                  onPointerDown={(event) => handleResizePointerDown(event, block.id, "right")}
                />
              </div>
            );
          })}
        </div>

        <div className="script-timeline-end-cap" aria-hidden="true" />
      </div>

      {menuState?.type === "head" ? (
        <section className="script-timeline-floating-menu script-timeline-head-menu" style={getTimelineMenuStyle(menuState.x, menuState.y, 390)} aria-label="时间轴索引">
          <header>
            <div>
              <p>胶片头</p>
              <h3>{timeline.title}</h3>
            </div>
            <button type="button" onClick={() => setMenuState(null)} title="关闭">
              <X size={14} strokeWidth={1.8} />
            </button>
          </header>
          <div className="script-timeline-duration-field">
            <label>
              <span>总时长</span>
              <input
                type="number"
                min={30}
                max={300}
                step={5}
                value={timeline.durationMin}
                onChange={(event) => onDurationChange(Number(event.target.value))}
              />
            </label>
            <em>{timeline.blocks.length} 个结构区间</em>
          </div>
          <div className="script-timeline-index-list">
            {timeline.blocks.map((block) => (
              <button
                key={block.id}
                type="button"
                onClick={() => onActiveBlockChange(block.id)}
                className={`is-${block.color} ${block.id === activeBlock?.id ? "is-active" : ""}`}
              >
                <span>{formatTimelineTime(block.startMin)}-{formatTimelineTime(block.startMin + block.durationMin)}</span>
                <strong>{block.title}</strong>
                <em>{block.linkedNodeIds.length ? `${block.linkedNodeIds.length} 个节点` : "未连接"}</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {actionBlock && menuState?.type === "block" ? (
        <div className="script-timeline-block-menu-wrap" style={getTimelineMenuStyle(menuState.x, menuState.y, 650)}>
          <section className="script-timeline-floating-menu script-timeline-action-popover">
            <header>
              <div>
                <p>{formatTimelineTime(actionBlock.startMin)}-{formatTimelineTime(actionBlock.startMin + actionBlock.durationMin)}</p>
                <h3>{actionBlock.title}</h3>
              </div>
              <button type="button" onClick={() => setMenuState(null)} title="关闭">
                <X size={14} strokeWidth={1.8} />
              </button>
            </header>
            <div className="script-timeline-action-row">
              <button type="button" onClick={() => onSplitBlock(actionBlock.id)} disabled={actionBlock.durationMin < MIN_TIMELINE_BLOCK_MINUTES * 2}>
                <Scissors size={14} strokeWidth={1.8} />
                <span>拆分区间</span>
              </button>
              <button type="button" onClick={() => setEditingBlockId(actionBlock.id)}>
                <BookOpenText size={14} strokeWidth={1.8} />
                <span>编辑卡片</span>
              </button>
              <button type="button" onClick={() => onDeleteBlock(actionBlock.id)} disabled={timeline.blocks.length <= 1} className="is-danger">
                <Trash2 size={14} strokeWidth={1.8} />
                <span>删除区间</span>
              </button>
            </div>
            <div className="script-timeline-side-title">
              <Palette size={14} strokeWidth={1.8} />
              <span>标记颜色</span>
            </div>
            <div className="script-timeline-color-list">
              {TIMELINE_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  className={`script-timeline-color is-${color.value} ${actionBlock.color === color.value ? "is-active" : ""}`}
                  onClick={() => onUpdateBlock(actionBlock.id, { color: color.value })}
                  title={color.name}
                />
              ))}
            </div>
            <div className="script-timeline-side-title">
              <Link2 size={14} strokeWidth={1.8} />
              <span>连接节点</span>
            </div>
            <div className="script-timeline-linked-list">
              {linkedNodes.length ? (
                linkedNodes.map((node) => (
                  <button key={node.id} type="button" onClick={() => onToggleNodeLink(actionBlock.id, node.id)} title="点击移除连接">
                    <span>{node.kind}</span>
                    {node.title}
                  </button>
                ))
              ) : (
                <p>从画布节点端口拖出连线，放到这个时间块上。</p>
              )}
            </div>
          </section>
          <aside className="script-timeline-note-card">
            <p>结构笔记</p>
            <div>{actionBlock.content.trim() || "这一段还没有结构笔记。双击时间块打开编辑卡片。"}</div>
          </aside>
        </div>
      ) : null}

      {editingBlock ? (
        <section className="script-timeline-edit-card" role="dialog" aria-label="编辑时间区块">
          <header>
            <div>
              <p>编辑时间区块</p>
              <h3>{formatTimelineTime(editingBlock.startMin)}-{formatTimelineTime(editingBlock.startMin + editingBlock.durationMin)}</h3>
            </div>
            <button type="button" onClick={() => setEditingBlockId(null)} title="关闭编辑">
              <X size={15} strokeWidth={1.8} />
            </button>
          </header>
          <div className="script-timeline-field">
            <label>区间标题</label>
            <input
              value={editingBlock.title}
              onChange={(event) => onUpdateBlock(editingBlock.id, { title: event.target.value })}
            />
          </div>
          <div className="script-timeline-field">
            <label>结构笔记</label>
            <textarea
              value={editingBlock.content}
              onChange={(event) => onUpdateBlock(editingBlock.id, { content: event.target.value })}
              placeholder="写下这一段影片承担的主题、人物状态、冲突和视觉方向。支持 Markdown。"
            />
          </div>
          <footer>
            <span>这张卡片来自当前时间块，关闭后仍回到胶片条。</span>
          </footer>
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
  const canvas = useMemo(() => ensureCanvas(projectData.scriptCanvas), [projectData.scriptCanvas]);
  const timeline = useMemo(() => ensureTimeline(canvas.timeline), [canvas.timeline]);

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

    return [...pageNodes, ...imageNodes];
  }, [canvas.images, canvas.pages, projectData.episodes]);

  const nodeIdSet = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const nodeSummaries = useMemo<ScriptTimelineNodeSummary[]>(
    () =>
      nodes.map((node) => ({
        id: node.id,
        title:
          node.type === "imageInput"
            ? ((node.data as InspirationImageData).filename || (node.data as InspirationImageData).title || "灵感图片")
            : ((node.data as ScriptPageData).title || `第${(node.data as ScriptPageData).episodeId}集`),
        kind: node.type === "imageInput" ? "图片" : "剧本",
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

  const handleTimelineDurationChange = useCallback(
    (durationMin: number) => {
      const nextDuration = Math.max(30, Math.min(300, Math.round(durationMin || DEFAULT_TIMELINE_DURATION)));
      persistTimeline((current) => {
        const ratio = nextDuration / current.durationMin;
        return {
          ...current,
          durationMin: nextDuration,
          blocks: current.blocks.map((block) => ({
            ...block,
            durationMin: Math.max(MIN_TIMELINE_BLOCK_MINUTES, Math.round(block.durationMin * ratio)),
          })),
        };
      });
    },
    [persistTimeline]
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

  const handleTimelineNodeToggle = useCallback(
    (blockId: string, nodeId: string) => {
      persistTimeline((current) => ({
        ...current,
        blocks: current.blocks.map((block) => {
          if (block.id !== blockId) return block;
          const currentIds = new Set(block.linkedNodeIds || []);
          if (currentIds.has(nodeId)) currentIds.delete(nodeId);
          else currentIds.add(nodeId);
          return { ...block, linkedNodeIds: Array.from(currentIds) };
        }),
      }));
    },
    [persistTimeline]
  );

  const commitTimelineBlockConnection = useCallback(
    (blockId: string, nodeId: string) => {
      if (!nodeIdSet.has(nodeId)) return false;
      persistTimeline((current) => ({
        ...current,
        blocks: current.blocks.map((block) => {
          if (block.id !== blockId) return block;
          if (block.linkedNodeIds.includes(nodeId)) return block;
          return { ...block, linkedNodeIds: [...block.linkedNodeIds, nodeId] };
        }),
      }));
      setActiveTimelineBlockId(blockId);
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

  const handleTimelineResizeStart = useCallback(
    (blockId: string, edge: "left" | "right", startX: number, trackWidth: number) => {
      const originalTimeline = timeline;
      const originalBlocks = timeline.blocks.map((block) => ({ ...block }));
      const blockIndex = originalBlocks.findIndex((block) => block.id === blockId);
      const neighborIndex = edge === "left" ? blockIndex - 1 : blockIndex + 1;
      if (blockIndex < 0 || neighborIndex < 0 || neighborIndex >= originalBlocks.length) return;
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
    [persistTimeline, timeline]
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

      if (!hasPositionChange && removedImageIds.length === 0 && removedEpisodeIds.length === 0) return;

      const nextNodes = applyNodeChanges(effectiveChanges, nodes);
      const positionById = new Map(nextNodes.map((node) => [node.id, node.position]));

      persistCanvas((currentCanvas, previous) => {
        const removedImageSet = new Set(removedImageIds);
        const removedEpisodeSet = new Set(removedEpisodeIds);
        const nextEpisodes = previous.episodes.filter((episode) => !removedEpisodeSet.has(episode.id));
        const images = currentCanvas.images
          .filter((image) => !removedImageSet.has(image.id))
          .map((image) => ({
            ...image,
            position: positionById.get(imageNodeId(image.id)) || image.position,
          }));
        const removedNodeIds = new Set([
          ...removedImageIds.map((id) => imageNodeId(id)),
          ...removedEpisodeIds.map((id) => scriptNodeId(id)),
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
          links: currentCanvas.links.filter((link) => {
            if (removedImageIds.some((id) => link.source === imageNodeId(id) || link.target === imageNodeId(id))) return false;
            return !removedEpisodeIds.some((id) => link.source === scriptNodeId(id) || link.target === scriptNodeId(id));
          }),
          timeline: currentCanvas.timeline
            ? {
                ...ensureTimeline(currentCanvas.timeline),
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
      const hitTimelineBlockId = getTimelineBlockHitAtPoint(clientX, clientY);
      if (hitTimelineBlockId && commitTimelineBlockConnection(hitTimelineBlockId, connectionState.fromNode.id)) {
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
    [commitScriptConnection, commitTimelineBlockConnection, screenToFlowPosition]
  );

  const handleDropCreate = useCallback(
    (type: ScriptCanvasCreateType) => {
      if (!connectionDrop) return;
      if (type === "scriptPage") {
        handleAddScriptPage(connectionDrop.flowPosition, connectionDrop);
        setConnectionDrop(null);
        return;
      }

      pendingImagePositionRef.current = connectionDrop.flowPosition;
      pendingImageConnectionRef.current = connectionDrop;
      setConnectionDrop(null);
      fileInputRef.current?.click();
    },
    [connectionDrop, handleAddScriptPage]
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

      <ScriptTimelineDock
        timeline={timeline}
        nodeSummaries={nodeSummaries}
        activeBlockId={activeTimelineBlockId}
        onActiveBlockChange={setActiveTimelineBlockId}
        onDurationChange={handleTimelineDurationChange}
        onUpdateBlock={handleTimelineBlockUpdate}
        onSplitBlock={handleTimelineBlockSplit}
        onDeleteBlock={handleTimelineBlockDelete}
        onToggleNodeLink={handleTimelineNodeToggle}
        onReorderBlock={handleTimelineBlockReorder}
        onResizeStart={handleTimelineResizeStart}
      />
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
    onConnectEnd: handleConnectEnd,
    onNodeClick: (_, node) => {
      if (node.type === "text") onOpenEpisode((node.data as ScriptPageData).episodeId);
    },
    onNodeDragStart: (_, node) => updateSnapGuide(node.id, node.position),
    onNodeDrag: (_, node) => updateSnapGuide(node.id, node.position),
    onNodeDragStop: () => onAlignmentGuideChange(null),
    nodesDraggable: !isLocked,
    nodesConnectable: !isLocked,
    elementsSelectable: !isLocked,
    overlays,
  };
};
