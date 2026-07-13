import React, { useMemo, useState } from "react";
import {
  ArrowsInSimple,
  Check,
  CheckCircle,
  CircleNotch,
  FilmSlate,
  Crosshair,
  Info,
  MagnifyingGlass,
  ShareNetwork,
  UserCircle,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type { ProjectRoleIdentity } from "../../../types";
import {
  SCREENPLAY_FORMAT_LABELS,
  type ScreenplayAnalysis,
  type ScreenplayLine,
} from "../../screenplay/fountainEngine";

export type SaveState = "idle" | "saving" | "saved" | "conflict" | "error";

type HeaderProps = {
  saveState: SaveState;
  isFocusMode: boolean;
  isInspectorOpen: boolean;
  onToggleFocus: () => void;
  onToggleInspector: () => void;
  onShare: () => void;
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
  isInspectorOpen,
  onToggleFocus,
  onToggleInspector,
  onShare,
  onClose,
}) => (
  <header className="screenplay-header">
    <div className="screenplay-header__actions">
      <div
        className={`screenplay-save-state is-${saveState}`}
        role="status"
        aria-live="polite"
        aria-label={SAVE_LABELS[saveState]}
        title={SAVE_LABELS[saveState]}
      >
        {saveState === "saved" ? <CheckCircle size={14} weight="fill" /> : null}
        {saveState === "saving" || saveState === "idle" ? <CircleNotch size={14} /> : null}
        {saveState === "conflict" || saveState === "error" ? <WarningCircle size={14} weight="fill" /> : null}
      </div>
      <span className="screenplay-header__divider" />
      <button type="button" className={isFocusMode ? "is-active" : ""} onClick={onToggleFocus} title="专注模式">
        <Crosshair size={18} />
      </button>
      <button type="button" className={isInspectorOpen ? "is-active" : ""} onClick={onToggleInspector} title="稿纸信息">
        <Info size={18} />
      </button>
      <button type="button" onClick={onShare} title="分享 Fountain">
        <ShareNetwork size={18} />
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
  onClose?: () => void;
  embedded?: boolean;
};

export const ScreenplayNavigator: React.FC<NavigatorProps> = ({ analysis, activeLineIndex, onNavigate, onClose, embedded = false }) => {
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
    <aside className={`screenplay-navigator ${embedded ? "is-embedded" : ""}`} aria-label="场景导航">
      <div className="screenplay-panel-heading">
        <div>
          <span>OUTLINE</span>
          <strong>场景导航</strong>
        </div>
        <div className="screenplay-panel-heading__actions">
          <small>{analysis.scenes.length}</small>
          {onClose ? <button type="button" onClick={onClose} aria-label="关闭场景导航"><X size={13} /></button> : null}
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
  characterRoles: ProjectRoleIdentity[];
  onUseCharacter: (role: ProjectRoleIdentity) => void;
  onNavigate: (lineIndex: number) => void;
};

export const ScreenplayInspector: React.FC<InspectorProps> = ({
  analysis,
  activeLine,
  characterRoles,
  onUseCharacter,
  onNavigate,
}) => {
  const activeScene = [...analysis.scenes].reverse().find((scene) => scene.lineIndex <= activeLine.index);
  return (
    <aside className="screenplay-inspector" aria-label="稿纸信息">
      <div className="screenplay-panel-heading">
        <div>
          <span>INFO</span>
          <strong>稿纸信息</strong>
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
        <span className="screenplay-inspector__label">角色库</span>
        <div className="screenplay-character-library">
          {characterRoles.map((role) => {
            const reference = analysis.characterReferences.find((item) =>
              item.roleId === role.id || item.name === (role.displayName || role.name)
            );
            return (
              <button key={role.id} type="button" onClick={() => onUseCharacter(role)}>
                <span className="screenplay-character-library__avatar">
                  {role.avatarUrl ? <img src={role.avatarUrl} alt="" /> : <UserCircle size={18} />}
                </span>
                <span className="screenplay-character-library__copy">
                  <strong>{role.displayName || role.name}</strong>
                  <small>@{role.mention || role.name} · {reference?.lineIndexes.length || 0} 处</small>
                </span>
                <em>{activeLine.kind === "character" || activeLine.kind === "dual_dialogue" ? "绑定" : "插入"}</em>
              </button>
            );
          })}
          {!characterRoles.length ? (
            <div className="screenplay-character-library__empty">
              <UserCircle size={18} />
              <span>角色库为空。把一行设为角色并输入名称，保存后会自动创建。</span>
            </div>
          ) : null}
          {analysis.characterReferences.filter((reference) => !reference.bound).map((reference) => (
            <button key={`unbound-${reference.name}`} type="button" onClick={() => onNavigate(reference.lineIndexes[0])} className="is-unbound">
              <span className="screenplay-character-library__avatar"><WarningCircle size={16} /></span>
              <span className="screenplay-character-library__copy">
                <strong>{reference.name}</strong>
                <small>尚未绑定 · {reference.lineIndexes.length} 处</small>
              </span>
              <em>定位</em>
            </button>
          ))}
        </div>
      </section>

      <ScreenplayNavigator
        analysis={analysis}
        activeLineIndex={activeLine.index}
        onNavigate={onNavigate}
        embedded
      />
    </aside>
  );
};
