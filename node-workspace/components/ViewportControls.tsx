import React from "react";
import { LibraryBig, LockKeyhole, Map, Minus, Plus, Rows3, UnlockKeyhole } from "lucide-react";
import type { NodeFlowReadingMode } from "../nodeflow/sessionState";

type Props = {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  onZoomChange: (value: number) => void;
  isLocked: boolean;
  onToggleLock: () => void;
  showMiniMap: boolean;
  onToggleMiniMap: () => void;
  readingMode: NodeFlowReadingMode;
  onToggleReadingMode: () => void;
};

export const ViewportControls: React.FC<Props> = ({
  zoom,
  minZoom,
  maxZoom,
  onZoomChange,
  isLocked,
  onToggleLock,
  showMiniMap,
  onToggleMiniMap,
  readingMode,
  onToggleReadingMode,
}) => {
  const step = 0.25;

  const clamp = (value: number) => Math.min(maxZoom, Math.max(minZoom, value));
  const handleMinus = () => onZoomChange(clamp(zoom - step));
  const handlePlus = () => onZoomChange(clamp(zoom + step));

  return (
    <div className="qalam-surface inline-flex h-11 items-center gap-1 rounded-full p-1">
      <button
        type="button"
        onClick={handleMinus}
        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--app-text-secondary)] transition hover:bg-[var(--app-panel-soft)] hover:text-[var(--app-text-primary)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
        title="缩小"
        disabled={isLocked}
      >
        <Minus size={14} className="text-[var(--app-text-secondary)]" />
      </button>
      <button
        type="button"
        onClick={handlePlus}
        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--app-text-secondary)] transition hover:bg-[var(--app-panel-soft)] hover:text-[var(--app-text-primary)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
        title="放大"
        disabled={isLocked}
      >
        <Plus size={14} className="text-[var(--app-text-secondary)]" />
      </button>
      <span className="mx-0.5 h-5 w-px rounded-full bg-[var(--app-border)]" />
      <button
        type="button"
        onClick={onToggleLock}
        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--app-text-secondary)] transition hover:bg-[var(--app-panel-soft)] hover:text-[var(--app-text-primary)] active:translate-y-px"
        title={isLocked ? "解锁画布" : "锁定画布"}
      >
        {isLocked ? (
          <LockKeyhole size={14} className="text-[var(--app-accent-strong)]" />
        ) : (
          <UnlockKeyhole size={14} className="text-[var(--app-accent-strong)]" />
        )}
      </button>
      <button
        type="button"
        onClick={onToggleReadingMode}
        className="flex h-9 items-center justify-center gap-1 rounded-full px-3 text-[11px] font-medium text-[var(--app-text-secondary)] transition hover:bg-[var(--app-panel-soft)] hover:text-[var(--app-text-primary)] active:translate-y-px"
        title={readingMode === "identity" ? "切换到完整节点视图" : "切换到统一读取视图"}
      >
        {readingMode === "identity" ? (
          <>
            <Rows3 size={14} className="text-[var(--app-accent-strong)]" />
            <span>读取</span>
          </>
        ) : (
          <>
            <LibraryBig size={14} className="text-[var(--app-text-secondary)]" />
            <span>完整</span>
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onToggleMiniMap}
        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--app-text-secondary)] transition hover:bg-[var(--app-panel-soft)] hover:text-[var(--app-text-primary)] active:translate-y-px"
        title={showMiniMap ? "隐藏地图" : "显示地图"}
      >
        <Map size={14} className={showMiniMap ? "text-[var(--app-accent-strong)]" : "text-[var(--app-text-secondary)]"} />
      </button>
    </div>
  );
};
