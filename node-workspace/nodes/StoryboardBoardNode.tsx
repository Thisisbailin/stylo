import React, { useMemo, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { GripVertical, LayoutPanelTop, Play, TableProperties } from "lucide-react";
import { BaseNode } from "./BaseNode";
import { StoryboardBoardNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { buildEpisodeShotNodeFlow, getSuggestedCanvasOrigin } from "../utils/episodeShotWorkflow";
import { SHOT_TABLE_COLUMNS } from "../../utils/shotSchema";
import { resolveStoryboardBoardNodeTitle } from "../nodeflow/titles";

type Props = {
  id: string;
  data: StoryboardBoardNodeData;
};

const COLUMNS = [
  { label: "镜号", width: 110 },
  { label: "时长", width: 90 },
  { label: "景别", width: 110 },
  { label: "焦段", width: 120 },
  { label: "运镜", width: 120 },
  { label: "机位/构图", width: 260 },
  { label: "调度/表演", width: 240 },
  { label: "台词/OS", width: 220 },
  { label: "声音", width: 180 },
  { label: "光色/VFX", width: 220 },
  { label: "剪辑", width: 180 },
  { label: "备注（氛围/情绪）", width: 220 },
  { label: "Sora Prompt", width: 320 },
  { label: "Storyboard Prompt", width: 340 },
] as const;

const MIN_COLUMN_WIDTH = 88;
const MIN_ROW_HEIGHT = 92;

const ValueStack: React.FC<{ primary?: string; secondary?: string; tertiary?: string }> = ({
  primary,
  secondary,
  tertiary,
}) => (
  <div className="space-y-1">
    <div className="text-[12px] leading-6 text-[var(--node-text-primary)]">{primary?.trim() || "-"}</div>
    {secondary?.trim() ? <div className="text-[11px] leading-5 text-[var(--node-text-secondary)]">{secondary}</div> : null}
    {tertiary?.trim() ? <div className="text-[11px] leading-5 text-[var(--node-text-secondary)]">{tertiary}</div> : null}
  </div>
);

export const StoryboardBoardNode: React.FC<Props & { selected?: boolean }> = ({ id, data, selected }) => {
  const { updateNodeData, nodeFlowContext, addNodesAndLinks, nodes, revision } = useNodeFlowStore();
  const { setViewport } = useReactFlow();
  const nodeTitle = useMemo(() => resolveStoryboardBoardNodeTitle(data, nodeFlowContext), [data, nodeFlowContext]);
  const episodes = nodeFlowContext.episodes || [];

  const episode = useMemo(() => {
    if (!episodes.length) return null;
    return episodes.find((item) => item.id === data.episodeId) ?? episodes[0];
  }, [data.episodeId, episodes]);

  const columnWidths = useMemo(() => {
    const widths = COLUMNS.map((column) => column.width);
    (data.columnWidths || []).forEach((value, index) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        widths[index] = Math.max(MIN_COLUMN_WIDTH, value);
      }
    });
    return widths;
  }, [data.columnWidths]);

  const sections = useMemo(() => {
    if (!episode) return [];
    return (episode.scenes || []).map((scene, index) => ({
      scene,
      index,
      shots: episode.shots.filter((shot) => shot.id.startsWith(`${scene.id}-`)),
    }));
  }, [episode]);

  const rowHeights = data.rowHeights || {};
  const gridTemplateColumns = columnWidths.map((value) => `${value}px`).join(" ");
  const displayMode = data.displayMode || "table";

  const updateColumnWidth = useCallback(
    (index: number, nextWidth: number) => {
      const next = [...columnWidths];
      next[index] = Math.max(MIN_COLUMN_WIDTH, Math.round(nextWidth));
      updateNodeData(id, { columnWidths: next });
    },
    [columnWidths, id, updateNodeData]
  );

  const startColumnResize = useCallback(
    (index: number, event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = columnWidths[index];
      const handleMove = (moveEvent: PointerEvent) => {
        updateColumnWidth(index, startWidth + moveEvent.clientX - startX);
      };
      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [columnWidths, updateColumnWidth]
  );

  const startRowResize = useCallback(
    (rowKey: string, event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const startY = event.clientY;
      const startHeight = rowHeights[rowKey] || 116;
      const handleMove = (moveEvent: PointerEvent) => {
        updateNodeData(id, {
          rowHeights: {
            ...rowHeights,
            [rowKey]: Math.max(MIN_ROW_HEIGHT, Math.round(startHeight + moveEvent.clientY - startY)),
          },
        });
      };
      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [id, rowHeights, updateNodeData]
  );

  const handleLoadWorkflow = useCallback(() => {
    if (!episode) return;
    const origin = getSuggestedCanvasOrigin(nodes);
    const nodeFlowMap = buildEpisodeShotNodeFlow({ episode, origin });
    addNodesAndLinks(nodeFlowMap.nodes, nodeFlowMap.links, { expectedRevision: revision });
    updateNodeData(id, { nodeFlowLoadedAt: Date.now() });
    setViewport({ x: -origin.x + 80, y: -origin.y + 80, zoom: 0.7 }, { duration: 800 });
  }, [addNodesAndLinks, episode, id, nodes, revision, setViewport, updateNodeData]);

  return (
    <BaseNode title={nodeTitle} outputs={["text"]} selected={selected}>
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--node-border)] pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] text-[var(--node-accent)]">
              <LayoutPanelTop size={18} />
            </div>
            <div className="flex min-w-0 items-center gap-3">
              {episode ? (
                <select
                  value={episode.id}
                  onChange={(event) =>
                    updateNodeData(id, {
                      episodeId: Number(event.target.value),
                      sceneId: undefined,
                    })
                  }
                  className="rounded-full border border-[var(--node-border)] bg-[var(--node-surface)] px-3 py-1.5 text-[11px] font-medium text-[var(--node-text-secondary)] outline-none transition hover:border-[var(--node-border-strong)]"
                >
                  {episodes.map((item) => (
                    <option key={item.id} value={item.id}>
                      第 {item.id} 集
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border border-[var(--node-border)] bg-[var(--node-surface)]/80 p-1">
              {[
                { key: "table", label: "表格", Icon: TableProperties },
                { key: "workflow", label: "NodeFlow", Icon: Play },
              ].map(({ key, label, Icon }) => {
                const active = displayMode === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => updateNodeData(id, { displayMode: key as "table" | "workflow" })}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                      active
                        ? "bg-[var(--node-surface-strong)] text-[var(--node-text-primary)]"
                        : "text-[var(--node-text-secondary)] hover:text-[var(--node-text-primary)]"
                    }`}
                  >
                    <Icon size={12} />
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleLoadWorkflow}
              disabled={displayMode !== "workflow"}
              className="rounded-full border border-[var(--node-border)] px-3 py-1.5 text-[11px] font-medium text-[var(--node-text-primary)] transition enabled:hover:border-[var(--node-accent)] enabled:hover:bg-[var(--node-surface)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              加载 NodeFlow
            </button>
          </div>
        </div>

        {episode ? (
          <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-[24px] border border-[var(--node-border)] bg-[var(--node-surface)]/70">
            <div className="min-w-max">
              <div
                className="sticky top-0 z-20 grid border-b border-[var(--node-border)] bg-[var(--node-surface-strong)] text-[10px] font-black uppercase tracking-[0.18em] text-[var(--node-text-secondary)]"
                style={{ gridTemplateColumns }}
              >
                {COLUMNS.map((column, index) => (
                  <div key={column.label} className="relative px-4 py-3">
                    {column.label}
                    <div
                      onPointerDown={(event) => startColumnResize(index, event)}
                      className="absolute right-0 top-0 h-full w-3 cursor-col-resize touch-none"
                      title="拖动调整列宽"
                    >
                      <div className="absolute bottom-2 right-1 top-2 w-px bg-[var(--node-border-strong)]/80" />
                    </div>
                  </div>
                ))}
              </div>

              {sections.length ? (
                sections.map(({ scene, index, shots }) => (
                  <section key={scene.id} className="border-b border-[var(--node-border)] last:border-b-0">
                    <div className="border-b border-[var(--node-border)] bg-[var(--app-panel-muted)]/20 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--node-text-secondary)]">
                        <span>Scene {index + 1}</span>
                        <span>{scene.id}</span>
                      </div>
                      <div className="mt-2 text-[15px] font-semibold tracking-[-0.02em] text-[var(--node-text-primary)]">
                        {scene.title || "未命名场景"}
                      </div>
                    </div>

                    {shots.length ? (
                      shots.map((shot) => {
                        const rowKey = shot.id;
                        const rowHeight = rowHeights[rowKey] || 116;
                        return (
                          <div
                            key={shot.id}
                            className="relative border-b border-[var(--node-border)] last:border-b-0"
                            style={{ minHeight: rowHeight }}
                          >
                            <div className="grid h-full" style={{ gridTemplateColumns }}>
                              {SHOT_TABLE_COLUMNS.map((column) => (
                                <div key={`${shot.id}-${column.key}`} className="px-4 py-3">
                                  <ValueStack primary={shot[column.key]} />
                                </div>
                              ))}
                            </div>
                            <div
                              onPointerDown={(event) => startRowResize(rowKey, event)}
                              className="absolute bottom-0 left-0 flex h-3 w-full cursor-row-resize items-center justify-center touch-none"
                              title="拖动调整行高"
                            >
                              <div className="rounded-full border border-[var(--node-border)] bg-[var(--node-surface)] px-2 py-0.5 text-[var(--node-text-secondary)]">
                                <GripVertical size={11} />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="px-4 py-8 text-center text-[12px] text-[var(--node-text-secondary)]">
                        当前场景还没有分镜数据。
                      </div>
                    )}
                  </section>
                ))
              ) : (
                <div className="px-4 py-10 text-center text-[12px] text-[var(--node-text-secondary)]">
                  当前剧集还没有分镜表数据。
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-1 items-center justify-center rounded-[24px] border border-dashed border-[var(--node-border)] text-[12px] text-[var(--node-text-secondary)]">
            当前项目还没有可展示的分镜表。
          </div>
        )}
      </div>
    </BaseNode>
  );
};
