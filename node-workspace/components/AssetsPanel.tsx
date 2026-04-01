import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Film,
  Image as ImageIcon,
  Trash2,
  X,
} from "lucide-react";
import { useNodeFlowStore } from "../store/nodeFlowStore";

type AssetTab =
  | "images"
  | "videos";

type Props = {
  floating?: boolean;
  inlineAnchor?: boolean;
};

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const AssetsPanel: React.FC<Props> = ({ floating = true, inlineAnchor = false }) => {
  const { globalAssetHistory, removeGlobalHistoryItem, clearGlobalHistory } = useNodeFlowStore();
  const [collapsed, setCollapsed] = useState(true);
  const [activeTab, setActiveTab] = useState<AssetTab>("images");

  const imageAssets = useMemo(
    () => globalAssetHistory.filter((item) => item.type === "image"),
    [globalAssetHistory]
  );
  const videoAssets = useMemo(
    () => globalAssetHistory.filter((item) => item.type === "video"),
    [globalAssetHistory]
  );

  const tabs = [
    { key: "images" as const, label: "Images", count: imageAssets.length },
    { key: "videos" as const, label: "Videos", count: videoAssets.length },
  ];

  const totalCount = tabs.reduce((sum, tab) => sum + tab.count, 0);

  const showClear = activeTab === "images" ? imageAssets.length > 0 : activeTab === "videos" && videoAssets.length > 0;
  const clearType = activeTab === "images" ? "image" : "video";

  const anchorClass = inlineAnchor ? "relative h-12 flex items-center" : floating ? "fixed bottom-4 right-4 z-30" : "";

  if (collapsed) {
    return (
      <div className={anchorClass}>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="qalam-surface flex h-11 items-center gap-2 rounded-full px-3.5"
          title={`Assets (${totalCount})`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] text-[var(--app-text-secondary)]">
            <ImageIcon size={14} />
          </span>
          <span className="text-[12px] font-semibold tracking-[0.01em] text-[var(--app-text-primary)]">
            Assets
          </span>
          <span className="text-[11px] text-[var(--app-text-muted)]">{totalCount}</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--app-border)] bg-[var(--app-panel)]">
            <ChevronUp size={13} className="text-[var(--app-text-secondary)]" />
          </span>
        </button>
      </div>
    );
  }

  const panelCore = (
    <div className="qalam-surface flex max-h-[calc(100vh-140px)] w-[380px] flex-col overflow-hidden rounded-[26px]">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--app-border)]">
        <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[var(--app-accent-soft)] via-transparent to-transparent border border-[var(--app-border)] flex items-center justify-center">
              <ImageIcon size={16} className="text-[var(--app-accent-strong)]" />
            </div>
            <div>
              <div className="text-sm font-semibold">Assets</div>
              <div className="text-[11px] text-[var(--app-text-muted)]">{totalCount} items</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showClear && (
              <button
                type="button"
                onClick={() => clearGlobalHistory(clearType)}
                className="h-8 w-8 rounded-full border border-[var(--app-border)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-muted)] transition"
                title="Clear"
              >
                <Trash2 size={14} className="mx-auto text-[var(--app-text-secondary)]" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="h-8 w-8 rounded-full border border-[var(--app-border)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-muted)] transition"
              title="Collapse"
            >
              <ChevronDown size={14} className="mx-auto text-[var(--app-text-secondary)]" />
            </button>
          </div>
        </div>

      <div className="px-4 pt-3 pb-3 flex items-center gap-2 overflow-x-auto assets-tabs">
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-full text-[11px] uppercase tracking-wide border transition whitespace-nowrap ${
                isActive
                  ? "bg-[var(--app-panel-soft)] border-[var(--app-border-strong)] text-[var(--app-text-primary)]"
                  : "border-[var(--app-border)] text-[var(--app-text-muted)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)]"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          );
        })}
      </div>

      <div className="px-4 pb-4 flex-1 overflow-y-auto space-y-3">
        {activeTab === "images" && (
          <>
            {imageAssets.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-[var(--app-border)] text-center text-xs text-[var(--app-text-muted)]">
                No images yet.
              </div>
            ) : (
              imageAssets.map((item) => (
                <div
                  key={item.id}
                  className="group flex gap-3 p-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] hover:bg-[var(--app-panel-soft)] hover:border-[var(--app-border-strong)] transition"
                >
                  <div className="relative w-20 h-16 rounded-lg overflow-hidden border border-[var(--app-border)] bg-[var(--app-panel)] shrink-0">
                    <img src={item.src} alt={item.prompt} className="w-full h-full object-cover" />
                    <div className="absolute left-1 top-1 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] uppercase tracking-widest">
                      <ImageIcon size={10} />
                      image
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-xs font-semibold text-[var(--app-text-primary)] truncate">
                      {item.prompt || "Untitled prompt"}
                    </div>
                    <div className="text-[10px] text-[var(--app-text-muted)] flex flex-wrap gap-2">
                      {item.model && <span>{item.model.split("/").pop()}</span>}
                      {item.aspectRatio && <span>{item.aspectRatio}</span>}
                      <span>{formatTime(item.timestamp)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeGlobalHistoryItem(item.id)}
                    className="h-7 w-7 rounded-full border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text-primary)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)] transition opacity-0 group-hover:opacity-100"
                    title="Remove"
                  >
                    <X size={12} className="mx-auto" />
                  </button>
                </div>
              ))
            )}
          </>
        )}

        {activeTab === "videos" && (
          <>
            {videoAssets.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-[var(--app-border)] text-center text-xs text-[var(--app-text-muted)]">
                No videos yet.
              </div>
            ) : (
              videoAssets.map((item) => (
                <div
                  key={item.id}
                  className="group flex gap-3 p-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] hover:bg-[var(--app-panel-soft)] hover:border-[var(--app-border-strong)] transition"
                >
                  <div className="relative w-20 h-16 rounded-lg overflow-hidden border border-[var(--app-border)] bg-[var(--app-panel)] shrink-0">
                    <video className="w-full h-full object-cover" muted preload="metadata" playsInline>
                      <source src={item.src} />
                    </video>
                    <div className="absolute left-1 top-1 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] uppercase tracking-widest">
                      <Film size={10} />
                      video
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-xs font-semibold text-[var(--app-text-primary)] truncate">
                      {item.prompt || "Untitled prompt"}
                    </div>
                    <div className="text-[10px] text-[var(--app-text-muted)] flex flex-wrap gap-2">
                      {item.model && <span>{item.model.split("/").pop()}</span>}
                      {item.aspectRatio && <span>{item.aspectRatio}</span>}
                      <span>{formatTime(item.timestamp)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeGlobalHistoryItem(item.id)}
                    className="h-7 w-7 rounded-full border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text-primary)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)] transition opacity-0 group-hover:opacity-100"
                    title="Remove"
                  >
                    <X size={12} className="mx-auto" />
                  </button>
                </div>
              ))
            )}
          </>
        )}

      </div>
    </div>
  );

  if (inlineAnchor) {
    return (
      <div className={anchorClass}>
        <div className="absolute bottom-0 right-0 z-40">{panelCore}</div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="sr-only"
        >
          Close assets
        </button>
      </div>
    );
  }

  return <div className={anchorClass}>{panelCore}</div>;
};
