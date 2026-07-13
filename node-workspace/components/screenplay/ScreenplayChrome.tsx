import React, { useMemo, useState } from "react";
import {
  ArrowsInSimple,
  Check,
  CheckCircle,
  DownloadSimple,
  FilmSlate,
  Crosshair,
  Info,
  MagnifyingGlass,
  Robot,
  SidebarSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  SCREENPLAY_FORMAT_LABELS,
  type ScreenplayAnalysis,
  type ScreenplayLine,
} from "../../screenplay/fountainEngine";

export type SaveState = "idle" | "saving" | "saved" | "conflict" | "error";

type HeaderProps = {
  saveState: SaveState;
  isFocusMode: boolean;
  isNavigatorOpen: boolean;
  isInspectorOpen: boolean;
  isQalamOpen: boolean;
  onToggleFocus: () => void;
  onToggleNavigator: () => void;
  onToggleInspector: () => void;
  onToggleQalam: () => void;
  onExport: () => void;
  onClose: () => void;
};

const SAVE_LABELS: Record<SaveState, string> = {
  idle: "未保存",
  saving: "正在保存",
  saved: "已保存",
  conflict: "检测到外部修改",
  error: "保存失败",
};

export const ScreenplayHeader: React.FC<HeaderProps> = ({
  saveState,
  isFocusMode,
  isNavigatorOpen,
  isInspectorOpen,
  isQalamOpen,
  onToggleFocus,
  onToggleNavigator,
  onToggleInspector,
  onToggleQalam,
  onExport,
  onClose,
}) => (
  <header className="screenplay-header">
    <div className="screenplay-header__leading">
      <div className="screenplay-header__app-title">Qalam</div>
    </div>

    <div className="screenplay-header__actions">
      <div className={`screenplay-save-state is-${saveState}`} role="status" aria-live="polite">
        {saveState === "saved" ? <CheckCircle size={14} weight="fill" /> : null}
        <span>{SAVE_LABELS[saveState]}</span>
      </div>
      <span className="screenplay-header__divider" />
      <button type="button" className={isNavigatorOpen ? "is-active" : ""} onClick={onToggleNavigator} title="场景导航">
        <SidebarSimple size={18} />
      </button>
      <button type="button" className={isQalamOpen ? "is-active" : ""} onClick={onToggleQalam} title="Qalam 助手">
        <Robot size={18} />
      </button>
      <button type="button" className={isFocusMode ? "is-active" : ""} onClick={onToggleFocus} title="专注模式">
        <Crosshair size={18} />
      </button>
      <button type="button" className={isInspectorOpen ? "is-active" : ""} onClick={onToggleInspector} title="剧本检查器">
        <Info size={18} />
      </button>
      <button type="button" onClick={onExport} title="导出 Fountain">
        <DownloadSimple size={18} />
      </button>
      <span className="screenplay-header__divider" />
      <button type="button" onClick={onClose} title="退出全屏编辑">
        <ArrowsInSimple size={18} />
      </button>
    </div>
  </header>
);

type NavigatorProps = {
  analysis: ScreenplayAnalysis;
  activeLineIndex: number;
  onNavigate: (lineIndex: number) => void;
  onClose: () => void;
};

export const ScreenplayNavigator: React.FC<NavigatorProps> = ({ analysis, activeLineIndex, onNavigate, onClose }) => {
  const [query, setQuery] = useState("");
  const filteredScenes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return analysis.scenes;
    return analysis.scenes.filter((scene) =>
      [scene.location, scene.boundary, scene.time, scene.synopsis, ...scene.characterNames]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [analysis.scenes, query]);
  const activeScene = [...analysis.scenes].reverse().find((scene) => scene.lineIndex <= activeLineIndex);

  return (
    <aside className="screenplay-navigator" aria-label="场景导航">
      <div className="screenplay-panel-heading">
        <div>
          <span>OUTLINE</span>
          <strong>场景导航</strong>
        </div>
        <div className="screenplay-panel-heading__actions">
          <small>{analysis.scenes.length}</small>
          <button type="button" onClick={onClose} aria-label="关闭场景导航"><X size={13} /></button>
        </div>
      </div>
      <label className="screenplay-search">
        <MagnifyingGlass size={14} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索地点、角色或梗概" />
        {query ? <button type="button" onClick={() => setQuery("")} aria-label="清空搜索"><X size={12} /></button> : null}
      </label>
      <div className="screenplay-scene-list">
        {filteredScenes.map((scene) => (
          <button
            key={scene.id}
            type="button"
            className={activeScene?.id === scene.id ? "is-active" : ""}
            onClick={() => onNavigate(scene.lineIndex)}
          >
            <span className="screenplay-scene-list__number">{String(scene.ordinal).padStart(2, "0")}</span>
            <span className="screenplay-scene-list__copy">
              <strong>{scene.location}</strong>
              <small>{scene.boundary} · {scene.time}</small>
              <em>{scene.synopsis}</em>
            </span>
          </button>
        ))}
        {!filteredScenes.length ? (
          <div className="screenplay-panel-empty">
            <FilmSlate size={22} />
            <strong>{query ? "没有匹配场景" : "还没有场景"}</strong>
            <span>{query ? "换一个关键词试试。" : "把任意一行切换为“场景”，它会出现在这里。"}</span>
          </div>
        ) : null}
      </div>
    </aside>
  );
};

type InspectorProps = {
  analysis: ScreenplayAnalysis;
  activeLine: ScreenplayLine;
  onNavigate: (lineIndex: number) => void;
};

export const ScreenplayInspector: React.FC<InspectorProps> = ({ analysis, activeLine, onNavigate }) => {
  const activeScene = [...analysis.scenes].reverse().find((scene) => scene.lineIndex <= activeLine.index);
  return (
    <aside className="screenplay-inspector" aria-label="剧本检查器">
      <div className="screenplay-panel-heading">
        <div>
          <span>INSPECTOR</span>
          <strong>剧本检查器</strong>
        </div>
        <small>L{activeLine.index + 1}</small>
      </div>

      <section className="screenplay-inspector__section">
        <span className="screenplay-inspector__label">当前段落</span>
        <div className="screenplay-current-format">
          <strong>{SCREENPLAY_FORMAT_LABELS[activeLine.kind]}</strong>
          <span>{activeScene ? `场景 ${activeScene.ordinal} · ${activeScene.location}` : "场景前置内容"}</span>
        </div>
      </section>

      <section className="screenplay-inspector__section">
        <span className="screenplay-inspector__label">篇幅</span>
        <div className="screenplay-metrics">
          <div><strong>{analysis.stats.estimatedPages}</strong><span>估算页</span></div>
          <div><strong>{analysis.stats.estimatedMinutes}</strong><span>估算分钟</span></div>
          <div><strong>{analysis.stats.glyphs}</strong><span>有效字数</span></div>
          <div><strong>{analysis.stats.dialoguePercent}%</strong><span>对白占比</span></div>
        </div>
      </section>

      <section className="screenplay-inspector__section">
        <span className="screenplay-inspector__label">连续性检查</span>
        <div className="screenplay-diagnostics">
          {analysis.diagnostics.slice(0, 12).map((diagnostic) => (
            <button key={diagnostic.id} type="button" onClick={() => onNavigate(diagnostic.lineIndex)}>
              <WarningCircle size={15} />
              <span>{diagnostic.message}</span>
              <small>L{diagnostic.lineIndex + 1}</small>
            </button>
          ))}
          {!analysis.diagnostics.length ? (
            <div className="screenplay-diagnostics__clear">
              <Check size={16} />
              <span>未发现结构问题</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="screenplay-inspector__section">
        <span className="screenplay-inspector__label">角色索引</span>
        <div className="screenplay-character-index">
          {analysis.characterNames.map((name) => <span key={name}>{name}</span>)}
          {!analysis.characterNames.length ? <em>角色提示行会自动汇总到这里。</em> : null}
        </div>
      </section>
    </aside>
  );
};
