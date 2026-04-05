import React, { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Video, Download, Sparkles, ChevronDown, ChevronUp, User, Shield, Upload, FolderOpen, FileText, BrainCircuit, List, Palette, MonitorPlay, Layers, Film } from "lucide-react";
import { ActiveTab, AnalysisSubStep, Episode, WorkflowStep, SyncState, SyncStatus } from "../../types";
import { isEpisodeSoraComplete, isEpisodeStoryboardComplete } from "../../utils/episodes";

const PixelSheepIcon: React.FC<{ size?: number }> = ({ size = 32 }) => {
  const outline = "#1a1a1a";
  const wool = "#f5e6d4";
  const woolShade = "#e4cdb2";
  const hoof = "#2d2d2d";
  const ground = "#3f9a3f";
  const flower = "#e54b8c";

  const px = (fill: string, coords: Array<[number, number, number?, number?]>) =>
    coords.map(([x, y, w = 1, h = 1], i) => (
      <rect key={`${fill}-${i}-${x}-${y}`} x={x} y={y} width={w} height={h} fill={fill} />
    ));

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
      className="shrink-0"
      shapeRendering="crispEdges"
    >
      {/* Wool fill */}
      {px(wool, [
        [19, 3, 2, 2],
        [18, 5, 4, 2],
        [17, 7, 5, 3],
        [16, 10, 6, 3],
        [15, 13, 7, 3],
        [14, 16, 8, 4],
        [13, 20, 8, 3],
        [12, 23, 8, 3],
        [11, 26, 9, 2],
        [11, 28, 4, 6],
        [16, 28, 3, 6],
        [20, 27, 3, 7],
        [24, 26, 3, 8],
        [10, 22, 2, 3], // tail root
        [9, 21, 1, 2],
      ])}

      {/* Wool shading */}
      {px(woolShade, [
        [20, 7, 2, 2],
        [19, 10, 3, 2],
        [18, 13, 4, 2],
        [17, 17, 4, 2],
        [16, 20, 4, 2],
        [15, 24, 3, 1],
        [21, 24, 3, 1],
        [12, 28, 2, 2],
        [21, 28, 2, 2],
      ])}

      {/* Hooves */}
      {px(hoof, [
        [11, 34, 3, 1],
        [16, 34, 3, 1],
        [20, 34, 3, 1],
        [24, 34, 3, 1],
      ])}

      {/* Face features */}
      {px(outline, [
        [21, 9, 1, 2], // eye
        [23, 9, 1, 2], // eye
        [22, 12, 1, 1], // nose
        [22, 13, 1, 1],
      ])}

      {/* Outline path */}
      <path
        d="M18 2h3v1h2v2h2v2h1v3h1v3h1v3h1v3h-1v2h-1v2h-2v3h-2v3h-2v3h-3v2h-3v-2h-2v-3h-2v-3h-2v-3h-1v-3h-1v-3l1-2h1v-2h1v-3h1v-3h2v-3h2v-2h2v-2h2Z"
        fill="none"
        stroke={outline}
        strokeWidth={1}
        shapeRendering="crispEdges"
      />

      {/* Tail outline */}
      <path
        d="M9 21h1v2h1v2h-2v-1H8v-2h1Z"
        fill="none"
        stroke={outline}
        strokeWidth={1}
        shapeRendering="crispEdges"
      />

      {/* Ground + small flower */}
      {px(ground, [[8, 35, 22, 2]])}
      {px(flower, [
        [10, 34, 1, 1],
        [26, 34, 1, 1],
      ])}
    </svg>
  );
};

type TabOption = {
  key: ActiveTab;
  label: string;
  icon: LucideIcon;
  hidden?: boolean;
};

type WorkflowProps = {
  step: WorkflowStep;
  analysisStep: AnalysisSubStep;
  analysisQueueLength: number;
  analysisTotal: number;
  isProcessing: boolean;
  analysisError: { step: AnalysisSubStep; message: string } | null;
  currentEpIndex: number;
  episodes: Episode[];
  setCurrentEpIndex: (idx: number) => void;
  setStep: (step: WorkflowStep) => void;
  setAnalysisStep: (step: AnalysisSubStep) => void;
  onStartAnalysis: () => void;
  onConfirmSummaryNext: () => void;
  onConfirmEpSummariesNext: () => void;
  onConfirmCharListNext: () => void;
  onConfirmCharDepthNext: () => void;
  onConfirmLocListNext: () => void;
  onFinishAnalysis: () => void;
  onRetryAnalysis: () => void;
  onStartPhase2: () => void;
  onConfirmEpisodeShots: () => void;
  onRetryEpisodeShots: () => void;
  onStartPhase3: () => void;
  onRetryEpisodeSora: () => void;
  onContinueNextEpisodeSora: () => void;
  onStartPhase4: () => void;
  onRetryEpisodeStoryboard: () => void;
  onContinueNextEpisodeStoryboard: () => void;
};

type HeaderProps = {
  activeTab: ActiveTab;
  tabs: TabOption[];
  onTabChange: (tab: ActiveTab) => void;
  activeModelLabel: string;
  sync: {
    state: SyncState;
    isOnline: boolean;
  };
  splitView: {
    currentSplitTab: ActiveTab | null;
    isOpen: boolean;
    onToggle: () => void;
    onSelect: (tab: ActiveTab | null) => void;
    onClose: () => void;
  };
  onTryMe: () => void;
  hasGeneratedShots: boolean;
  hasUnderstandingData: boolean;
  onExportCsv: () => void;
  onExportXls: () => void;
  onExportUnderstandingJson: () => void;
  onToggleExportMenu: () => void;
  isExportMenuOpen: boolean;
  onToggleTheme: () => void;
  isDarkMode: boolean;
  account: {
    isLoaded: boolean;
    isSignedIn: boolean;
    user?: any;
    onSignIn: () => void;
    onSignOut: () => void;
    onOpenSettings: () => void;
    onReset: () => void;
    isUserMenuOpen: boolean;
    setIsUserMenuOpen: (v: boolean) => void;
    onUploadAvatar?: () => void;
    avatarUrl?: string;
  };
  workflow: WorkflowProps;
};

const analysisProgressLabel = (analysisStep: AnalysisSubStep) => {
  switch (analysisStep) {
    case AnalysisSubStep.PROJECT_SUMMARY:
      return "1/6";
    case AnalysisSubStep.EPISODE_SUMMARIES:
      return "2/6";
    case AnalysisSubStep.CHAR_IDENTIFICATION:
      return "3/6";
    case AnalysisSubStep.CHAR_DEEP_DIVE:
      return "4/6";
    case AnalysisSubStep.LOC_IDENTIFICATION:
      return "5/6";
    case AnalysisSubStep.LOC_DEEP_DIVE:
      return "6/6";
    default:
      return "";
  }
};

const EpisodeList: React.FC<{
  episodes: Episode[];
  currentEpIndex: number;
  onSelect: (idx: number) => void;
}> = ({ episodes, currentEpIndex, onSelect }) => {
  if (!episodes.length) {
    return (
      <div className="px-3 py-4 text-xs text-[var(--text-secondary)]">
        暂无剧集，导入脚本后可生成。
      </div>
    );
  }

  return (
    <div className="max-h-72 overflow-auto p-2 space-y-1">
      {episodes.map((ep, idx) => (
        <button
          key={ep.id}
          onClick={() => onSelect(idx)}
          className={`w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${currentEpIndex === idx
            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200"
            : "bg-[var(--bg-overlay)] hover:bg-[var(--bg-muted)] text-[var(--text-primary)]"
            }`}
        >
          <div className="font-semibold truncate">
            {ep.title || `Episode ${idx + 1}`}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-2">
            <span>Shots: {ep.shots.length}</span>
            <span className="inline-flex items-center gap-1">
              <Layers size={12} /> {ep.status}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
};

export const WorkflowCard: React.FC<{ workflow: WorkflowProps; onClose?: () => void }> = ({
  workflow,
  onClose,
}) => {
  const {
    step,
    analysisStep,
    analysisQueueLength,
    analysisTotal,
    isProcessing,
    analysisError,
    currentEpIndex,
    episodes,
    setCurrentEpIndex,
    setStep,
    setAnalysisStep,
    onStartAnalysis,
    onConfirmSummaryNext,
    onConfirmEpSummariesNext,
    onConfirmCharListNext,
    onConfirmCharDepthNext,
    onConfirmLocListNext,
    onFinishAnalysis,
    onRetryAnalysis,
    onStartPhase2,
    onConfirmEpisodeShots,
    onRetryEpisodeShots,
    onStartPhase3,
    onRetryEpisodeSora,
    onContinueNextEpisodeSora,
    onStartPhase4,
    onRetryEpisodeStoryboard,
    onContinueNextEpisodeStoryboard,
  } = workflow;

  const [activePhase, setActivePhase] = useState<1 | 2 | 3 | 4>(1);

  const hasAnalysisError = analysisError?.step === analysisStep;
  const currentEpisode = episodes[currentEpIndex];
  const currentEpisodeError = currentEpisode?.status === "error";
  const totalEpisodes = episodes.length;

  const completedSora = useMemo(
    () => episodes.filter(isEpisodeSoraComplete).length,
    [episodes]
  );
  const completedStoryboard = useMemo(
    () => episodes.filter(isEpisodeStoryboardComplete).length,
    [episodes]
  );
  const completedShots = useMemo(
    () => episodes.filter((ep) => ep.shots.length > 0).length,
    [episodes]
  );
  const reviewShots = useMemo(
    () => episodes.filter((ep) => ep.status === "review_shots").length,
    [episodes]
  );
  const phase2Errors = useMemo(
    () => episodes.filter((ep) => ep.status === "error" && ep.shots.length === 0).length,
    [episodes]
  );
  const phase3Errors = useMemo(
    () => episodes.filter((ep) => ep.status === "error" && !isEpisodeSoraComplete(ep)).length,
    [episodes]
  );
  const phase4Errors = useMemo(
    () => episodes.filter((ep) => ep.status === "error" && !isEpisodeStoryboardComplete(ep)).length,
    [episodes]
  );

  const analysisItems = [
    { step: AnalysisSubStep.PROJECT_SUMMARY, label: "项目概览" },
    { step: AnalysisSubStep.EPISODE_SUMMARIES, label: "分集摘要" },
    { step: AnalysisSubStep.CHAR_IDENTIFICATION, label: "角色清单" },
    { step: AnalysisSubStep.CHAR_DEEP_DIVE, label: "角色深描" },
    { step: AnalysisSubStep.LOC_IDENTIFICATION, label: "场景清单" },
    { step: AnalysisSubStep.LOC_DEEP_DIVE, label: "场景深描" },
  ];

  const analysisIndex = analysisItems.findIndex((item) => item.step === analysisStep);
  const phase1Progress =
    analysisStep === AnalysisSubStep.COMPLETE
      ? "6/6"
      : analysisStep === AnalysisSubStep.IDLE
        ? "0/6"
        : analysisProgressLabel(analysisStep);
  const queueProgress =
    analysisTotal > 0 ? `${analysisTotal - analysisQueueLength}/${analysisTotal}` : null;

  type ItemStatus = "done" | "active" | "pending" | "error" | "ready";
  type PhaseStatus = "done" | "active" | "pending" | "error" | "partial";
  type ActionTone = "primary" | "secondary" | "ghost";
  type ActionButton = { label: string; onClick: () => void; disabled?: boolean; tone: ActionTone };

  const itemTone = (status: ItemStatus) => {
    switch (status) {
      case "done":
        return { dot: "bg-emerald-400", text: "已完成", tag: "text-emerald-200" };
      case "active":
        return { dot: "bg-sky-400", text: "进行中", tag: "text-sky-200" };
      case "ready":
        return { dot: "bg-amber-400", text: "待确认", tag: "text-amber-200" };
      case "error":
        return { dot: "bg-rose-400", text: "失败", tag: "text-rose-200" };
      default:
        return { dot: "bg-slate-400", text: "待开始", tag: "text-[var(--app-text-muted)]" };
    }
  };

  const itemRowClass = (status: ItemStatus) => {
    switch (status) {
      case "active":
        return "border-sky-400/40 bg-sky-500/10";
      case "ready":
        return "border-amber-400/40 bg-amber-500/10";
      case "error":
        return "border-rose-400/40 bg-rose-500/10";
      case "done":
        return "border-emerald-400/30 bg-emerald-500/10";
      default:
        return "border-[var(--app-border)] bg-[var(--app-panel-muted)]";
    }
  };

  const phaseTone = (status: PhaseStatus) => {
    switch (status) {
      case "done":
        return { dot: "bg-emerald-400", text: "已完成", tag: "text-emerald-200" };
      case "active":
        return { dot: "bg-sky-400", text: "进行中", tag: "text-sky-200" };
      case "partial":
        return { dot: "bg-amber-400", text: "进行中", tag: "text-amber-200" };
      case "error":
        return { dot: "bg-rose-400", text: "有错误", tag: "text-rose-200" };
      default:
        return { dot: "bg-slate-400", text: "未开始", tag: "text-[var(--app-text-muted)]" };
    }
  };

  const analysisStepLabel = (target: AnalysisSubStep) =>
    analysisItems.find((item) => item.step === target)?.label || "";

  const getAnalysisItemStatus = (target: AnalysisSubStep, index: number): ItemStatus => {
    if (analysisError?.step === target) return "error";
    if (analysisStep === AnalysisSubStep.COMPLETE) return "done";
    if (analysisStep === AnalysisSubStep.IDLE || analysisIndex === -1) return "pending";
    if (index < analysisIndex) return "done";
    if (index > analysisIndex) return "pending";
    if (isProcessing || analysisQueueLength > 0) return "active";
    return "ready";
  };

  const getAnalysisItemMeta = (target: AnalysisSubStep) => {
    if (target === AnalysisSubStep.EPISODE_SUMMARIES) {
      if (analysisStep === target && queueProgress) return queueProgress;
      if (totalEpisodes > 0) return `${totalEpisodes} 集`;
    }
    if (
      (target === AnalysisSubStep.CHAR_DEEP_DIVE || target === AnalysisSubStep.LOC_DEEP_DIVE) &&
      analysisStep === target &&
      queueProgress
    ) {
      return queueProgress;
    }
    return undefined;
  };

  const getPhase2ItemStatus = (episode: Episode, index: number): ItemStatus => {
    if (episode.status === "error") return "error";
    if (episode.status === "review_shots") return "ready";
    if (episode.status === "confirmed_shots" || episode.status === "completed") return "done";
    if (step === WorkflowStep.GENERATE_SHOTS && index === currentEpIndex) return "active";
    if (episode.shots.length > 0) return "ready";
    return "pending";
  };

  const getPhase3ItemStatus = (episode: Episode, index: number): ItemStatus => {
    if (episode.status === "error") return "error";
    if (isEpisodeSoraComplete(episode)) return "done";
    if (step === WorkflowStep.GENERATE_SORA && index === currentEpIndex) return "active";
    return "pending";
  };

  const getPhase4ItemStatus = (episode: Episode, index: number): ItemStatus => {
    if (episode.status === "error") return "error";
    if (isEpisodeStoryboardComplete(episode)) return "done";
    if (step === WorkflowStep.GENERATE_STORYBOARD && index === currentEpIndex) return "active";
    return "pending";
  };

  const phase1Status: PhaseStatus = analysisError
    ? "error"
    : analysisStep === AnalysisSubStep.COMPLETE
      ? "done"
      : analysisStep === AnalysisSubStep.IDLE
        ? "pending"
        : "active";

  const phase2Status: PhaseStatus =
    totalEpisodes === 0
      ? "pending"
      : phase2Errors > 0
        ? "error"
        : completedShots === totalEpisodes
          ? "done"
          : step === WorkflowStep.GENERATE_SHOTS || completedShots > 0 || reviewShots > 0
            ? "partial"
            : "pending";

  const phase3Status: PhaseStatus =
    totalEpisodes === 0
      ? "pending"
      : phase3Errors > 0
        ? "error"
        : completedSora === totalEpisodes
          ? "done"
          : step === WorkflowStep.GENERATE_SORA || completedSora > 0
            ? "partial"
            : "pending";

  const phase4Status: PhaseStatus =
    totalEpisodes === 0
      ? "pending"
      : phase4Errors > 0
        ? "error"
        : completedStoryboard === totalEpisodes
          ? "done"
          : step === WorkflowStep.GENERATE_STORYBOARD || completedStoryboard > 0
            ? "partial"
            : "pending";

  const phase2Progress = totalEpisodes ? `${completedShots}/${totalEpisodes}` : "0/0";
  const phase3Progress = totalEpisodes ? `${completedSora}/${totalEpisodes}` : "0/0";
  const phase4Progress = totalEpisodes ? `${completedStoryboard}/${totalEpisodes}` : "0/0";

  const analysisConfirmHandlers: Partial<Record<AnalysisSubStep, () => void>> = {
    [AnalysisSubStep.PROJECT_SUMMARY]: onConfirmSummaryNext,
    [AnalysisSubStep.EPISODE_SUMMARIES]: onConfirmEpSummariesNext,
    [AnalysisSubStep.CHAR_IDENTIFICATION]: onConfirmCharListNext,
    [AnalysisSubStep.CHAR_DEEP_DIVE]: onConfirmCharDepthNext,
    [AnalysisSubStep.LOC_IDENTIFICATION]: onConfirmLocListNext,
    [AnalysisSubStep.LOC_DEEP_DIVE]: onFinishAnalysis,
  };

  const usesQueue =
    analysisStep === AnalysisSubStep.EPISODE_SUMMARIES ||
    analysisStep === AnalysisSubStep.CHAR_DEEP_DIVE ||
    analysisStep === AnalysisSubStep.LOC_DEEP_DIVE;
  const confirmDisabled = isProcessing || hasAnalysisError || (usesQueue && analysisQueueLength > 0);

  const actionButtons: ActionButton[] = [];

  if (step === WorkflowStep.IDLE) {
    if (analysisStep === AnalysisSubStep.COMPLETE) {
      actionButtons.push({
        label: "开始 Phase 2",
        onClick: onStartPhase2,
        disabled: isProcessing,
        tone: "primary",
      });
    } else if (totalEpisodes > 0) {
      actionButtons.push({
        label: "开始 Phase 1",
        onClick: onStartAnalysis,
        disabled: isProcessing,
        tone: "primary",
      });
    }
  } else if (step === WorkflowStep.SETUP_CONTEXT) {
    if (analysisStep === AnalysisSubStep.COMPLETE) {
      actionButtons.push({
        label: "开始 Phase 2",
        onClick: onStartPhase2,
        disabled: isProcessing,
        tone: "primary",
      });
    } else {
      const confirmHandler = analysisConfirmHandlers[analysisStep];
      if (confirmHandler) {
        actionButtons.push({
          label: analysisStep === AnalysisSubStep.LOC_DEEP_DIVE ? "完成 Phase 1" : "确认并继续",
          onClick: confirmHandler,
          disabled: confirmDisabled,
          tone: "primary",
        });
      }
      actionButtons.push({
        label: "重试当前步骤",
        onClick: onRetryAnalysis,
        disabled: isProcessing,
        tone: "secondary",
      });
    }
  } else if (step === WorkflowStep.GENERATE_SHOTS) {
    if (currentEpisode) {
      if (currentEpisode.status === "review_shots" && !currentEpisodeError) {
        actionButtons.push({
          label: "确认并下一集",
          onClick: onConfirmEpisodeShots,
          disabled: isProcessing,
          tone: "primary",
        });
      } else {
        actionButtons.push({
          label: currentEpisodeError ? "重试当前集" : "生成/继续当前集",
          onClick: onRetryEpisodeShots,
          disabled: isProcessing,
          tone: "primary",
        });
      }
      if (!currentEpisodeError) {
        actionButtons.push({
          label: "重试当前集",
          onClick: onRetryEpisodeShots,
          disabled: isProcessing,
          tone: "secondary",
        });
      }
    }
  } else if (step === WorkflowStep.GENERATE_SORA) {
    actionButtons.push({
      label: "生成/继续当前集",
      onClick: onStartPhase3,
      disabled: isProcessing,
      tone: "primary",
    });
    actionButtons.push({
      label: "继续下一集",
      onClick: onContinueNextEpisodeSora,
      disabled: isProcessing,
      tone: "ghost",
    });
    actionButtons.push({
      label: "重试当前集",
      onClick: onRetryEpisodeSora,
      disabled: isProcessing,
      tone: "secondary",
    });
  } else if (step === WorkflowStep.GENERATE_STORYBOARD) {
    actionButtons.push({
      label: "生成/继续当前集",
      onClick: onStartPhase4,
      disabled: isProcessing,
      tone: "primary",
    });
    actionButtons.push({
      label: "继续下一集",
      onClick: onContinueNextEpisodeStoryboard,
      disabled: isProcessing,
      tone: "ghost",
    });
    actionButtons.push({
      label: "重试当前集",
      onClick: onRetryEpisodeStoryboard,
      disabled: isProcessing,
      tone: "secondary",
    });
  }

  const focusLabel = (() => {
    if (step === WorkflowStep.SETUP_CONTEXT) {
      if (analysisStep === AnalysisSubStep.COMPLETE) return "Phase 1 完成，待开始 Phase 2";
      const label = analysisStepLabel(analysisStep);
      return `Phase 1 · ${label || "未开始"}`;
    }
    if (step === WorkflowStep.GENERATE_SHOTS) {
      if (!currentEpisode) return "Phase 2 · 暂无剧集";
      return `Phase 2 · ${currentEpisode.title || `第${currentEpisode.id}集`}`;
    }
    if (step === WorkflowStep.GENERATE_SORA) {
      if (!currentEpisode) return "Phase 3 · 暂无剧集";
      return `Phase 3 · ${currentEpisode.title || `第${currentEpisode.id}集`}`;
    }
    if (step === WorkflowStep.GENERATE_STORYBOARD) {
      if (!currentEpisode) return "Phase 4 · 暂无剧集";
      return `Phase 4 · ${currentEpisode.title || `第${currentEpisode.id}集`}`;
    }
    if (step === WorkflowStep.COMPLETED) return "流程完成";
    if (analysisStep === AnalysisSubStep.COMPLETE) return "Phase 1 完成，待开始 Phase 2";
    return "等待开始";
  })();

  const actionButtonClass = (tone: ActionTone) => {
    switch (tone) {
      case "primary":
        return "bg-emerald-500/90 text-white hover:bg-emerald-400";
      case "secondary":
        return "border border-[var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)] hover:border-[var(--app-border-strong)]";
      default:
        return "border border-[var(--app-border)] bg-[var(--app-panel-muted)] text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)]";
    }
  };

  useEffect(() => {
    if (step === WorkflowStep.GENERATE_SHOTS) {
      setActivePhase(2);
    } else if (step === WorkflowStep.GENERATE_SORA) {
      setActivePhase(3);
    } else if (step === WorkflowStep.GENERATE_STORYBOARD) {
      setActivePhase(4);
    } else {
      setActivePhase(1);
    }
  }, [step]);

  return (
    <div className="w-[460px] max-h-[calc(100vh-140px)] overflow-hidden rounded-2xl app-panel flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--app-border)]">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500/30 via-teal-500/10 to-transparent border border-[var(--app-border)] flex items-center justify-center">
            <Layers size={16} className="text-emerald-200" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--app-text-primary)]">Workflow</div>
            <div className="text-[11px] text-[var(--app-text-muted)]">{focusLabel}</div>
          </div>
        </div>
      </div>
      <div className="scrollbar-none px-4 pt-3 pb-2 flex items-center gap-2 overflow-x-auto">
        {[
          { key: 1 as const, label: "Phase 1", meta: phase1Progress },
          { key: 2 as const, label: "Phase 2", meta: phase2Progress },
          { key: 3 as const, label: "Phase 3", meta: phase3Progress },
          { key: 4 as const, label: "Phase 4", meta: phase4Progress },
        ].map((tab) => {
          const active = activePhase === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActivePhase(tab.key)}
              className={`px-3 py-1.5 rounded-full text-[11px] uppercase tracking-wide border transition whitespace-nowrap ${
                active
                  ? "bg-[var(--app-panel-soft)] border-[var(--app-border-strong)] text-[var(--app-text-primary)]"
                  : "border-[var(--app-border)] text-[var(--app-text-muted)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)]"
              }`}
            >
              {tab.label} ({tab.meta})
            </button>
          );
        })}
      </div>
      <div className="qalam-scrollbar px-4 pb-4 space-y-3 overflow-y-auto">
        {activePhase === 1 && (
          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--app-text-primary)]">
                <span className={`h-2.5 w-2.5 rounded-full ${phaseTone(phase1Status).dot}`} />
                Phase 1 · 剧本理解
              </div>
              <span className={`text-[10px] ${phaseTone(phase1Status).tag}`}>{phaseTone(phase1Status).text}</span>
            </div>
            <div className="space-y-2">
              {analysisItems.map((item, index) => {
                const status = getAnalysisItemStatus(item.step, index);
                const meta = getAnalysisItemMeta(item.step);
                const tone = itemTone(status);
                return (
                  <button
                    key={item.step}
                    onClick={() => {
                      if (isProcessing) return;
                      setStep(WorkflowStep.SETUP_CONTEXT);
                      setAnalysisStep(item.step);
                    }}
                    disabled={isProcessing}
                    className={`w-full text-left flex items-center justify-between rounded-xl border px-3 py-2 text-[12px] transition ${itemRowClass(status)} ${
                      isProcessing ? "cursor-not-allowed opacity-60" : "hover:border-[var(--app-border-strong)]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                      <div className="truncate font-medium">{item.label}</div>
                      {meta && <span className="text-[10px] text-[var(--app-text-muted)]">{meta}</span>}
                    </div>
                    <span className={`text-[10px] ${tone.tag}`}>{tone.text}</span>
                  </button>
                );
              })}
            </div>
            {analysisError && (
              <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-2 text-[11px] text-rose-200">
                当前步骤失败：{analysisError.message}
              </div>
            )}
          </div>
        )}

        {activePhase === 2 && (
          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--app-text-primary)]">
                <span className={`h-2.5 w-2.5 rounded-full ${phaseTone(phase2Status).dot}`} />
                Phase 2 · Shot Lists
              </div>
              <div className="flex items-center gap-2">
                {reviewShots > 0 && <span className="text-[10px] text-amber-200">待确认 {reviewShots}</span>}
                <span className={`text-[10px] ${phaseTone(phase2Status).tag}`}>{phaseTone(phase2Status).text}</span>
              </div>
            </div>
            <div className="max-h-56 overflow-auto pr-1 space-y-2">
              {episodes.length === 0 && (
                <div className="text-[11px] text-[var(--app-text-muted)] px-2 py-2">暂无剧集，导入脚本后可生成。</div>
              )}
              {episodes.map((episode, index) => {
                const status = getPhase2ItemStatus(episode, index);
                const tone = itemTone(status);
                const meta =
                  status === "error"
                    ? episode.errorMsg || "生成失败"
                    : episode.shots.length > 0
                      ? `镜头 ${episode.shots.length}`
                      : "未生成镜头";
                return (
                  <button
                    key={episode.id}
                    onClick={() => {
                      if (isProcessing) return;
                      setStep(WorkflowStep.GENERATE_SHOTS);
                      setCurrentEpIndex(index);
                    }}
                    disabled={isProcessing}
                    className={`w-full text-left flex items-center justify-between rounded-xl border px-3 py-2 text-[12px] transition ${itemRowClass(status)} ${
                      isProcessing ? "cursor-not-allowed opacity-60" : "hover:border-[var(--app-border-strong)]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                      <div className="truncate font-medium">{episode.title || `第${episode.id}集`}</div>
                      <span className="text-[10px] text-[var(--app-text-muted)] truncate max-w-[140px]">{meta}</span>
                    </div>
                    <span className={`text-[10px] ${tone.tag}`}>{tone.text}</span>
                  </button>
                );
              })}
            </div>
            {currentEpisodeError && step === WorkflowStep.GENERATE_SHOTS && (
              <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-2 text-[11px] text-rose-200">
                当前集失败：{currentEpisode?.errorMsg || "Unknown error"}
              </div>
            )}
          </div>
        )}

        {activePhase === 3 && (
          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--app-text-primary)]">
                <span className={`h-2.5 w-2.5 rounded-full ${phaseTone(phase3Status).dot}`} />
                Phase 3 · Sora Prompts
              </div>
              <span className={`text-[10px] ${phaseTone(phase3Status).tag}`}>{phaseTone(phase3Status).text}</span>
            </div>
            <div className="max-h-56 overflow-auto pr-1 space-y-2">
              {episodes.length === 0 && (
                <div className="text-[11px] text-[var(--app-text-muted)] px-2 py-2">暂无剧集，先完成 Phase 2。</div>
              )}
              {episodes.map((episode, index) => {
                const status = getPhase3ItemStatus(episode, index);
                const tone = itemTone(status);
                const meta =
                  status === "error"
                    ? episode.errorMsg || "生成失败"
                    : episode.shots.length === 0
                      ? "未生成镜头"
                      : `镜头 ${episode.shots.length}`;
                return (
                  <button
                    key={episode.id}
                    onClick={() => {
                      if (isProcessing) return;
                      setStep(WorkflowStep.GENERATE_SORA);
                      setCurrentEpIndex(index);
                    }}
                    disabled={isProcessing}
                    className={`w-full text-left flex items-center justify-between rounded-xl border px-3 py-2 text-[12px] transition ${itemRowClass(status)} ${
                      isProcessing ? "cursor-not-allowed opacity-60" : "hover:border-[var(--app-border-strong)]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                      <div className="truncate font-medium">{episode.title || `第${episode.id}集`}</div>
                      <span className="text-[10px] text-[var(--app-text-muted)] truncate max-w-[140px]">{meta}</span>
                    </div>
                    <span className={`text-[10px] ${tone.tag}`}>{tone.text}</span>
                  </button>
                );
              })}
            </div>
            {currentEpisodeError && step === WorkflowStep.GENERATE_SORA && (
              <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-2 text-[11px] text-rose-200">
                当前集失败：{currentEpisode?.errorMsg || "Unknown error"}
              </div>
            )}
          </div>
        )}

        {activePhase === 4 && (
          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--app-text-primary)]">
                <span className={`h-2.5 w-2.5 rounded-full ${phaseTone(phase4Status).dot}`} />
                Phase 4 · Storyboard Prompts
              </div>
              <span className={`text-[10px] ${phaseTone(phase4Status).tag}`}>{phaseTone(phase4Status).text}</span>
            </div>
            <div className="max-h-56 overflow-auto pr-1 space-y-2">
              {episodes.length === 0 && (
                <div className="text-[11px] text-[var(--app-text-muted)] px-2 py-2">暂无剧集，先完成 Phase 2。</div>
              )}
              {episodes.map((episode, index) => {
                const status = getPhase4ItemStatus(episode, index);
                const tone = itemTone(status);
                const meta =
                  status === "error"
                    ? episode.errorMsg || "生成失败"
                    : episode.shots.length === 0
                      ? "未生成镜头"
                      : `镜头 ${episode.shots.length}`;
                return (
                  <button
                    key={episode.id}
                    onClick={() => {
                      if (isProcessing) return;
                      setStep(WorkflowStep.GENERATE_STORYBOARD);
                      setCurrentEpIndex(index);
                    }}
                    disabled={isProcessing}
                    className={`w-full text-left flex items-center justify-between rounded-xl border px-3 py-2 text-[12px] transition ${itemRowClass(status)} ${
                      isProcessing ? "cursor-not-allowed opacity-60" : "hover:border-[var(--app-border-strong)]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                      <div className="truncate font-medium">{episode.title || `第${episode.id}集`}</div>
                      <span className="text-[10px] text-[var(--app-text-muted)] truncate max-w-[140px]">{meta}</span>
                    </div>
                    <span className={`text-[10px] ${tone.tag}`}>{tone.text}</span>
                  </button>
                );
              })}
            </div>
            {currentEpisodeError && step === WorkflowStep.GENERATE_STORYBOARD && (
              <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-2 text-[11px] text-rose-200">
                当前集失败：{currentEpisode?.errorMsg || "Unknown error"}
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-[var(--app-text-secondary)]">
            <span>当前：{focusLabel}</span>
            <span className={isProcessing ? "text-emerald-300" : "text-[var(--app-text-muted)]"}>
              {isProcessing ? "处理中..." : "就绪"}
            </span>
          </div>
          {actionButtons.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {actionButtons.map((action) => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={`flex-1 min-w-[110px] px-3 py-2 rounded-full text-[11px] font-semibold transition ${actionButtonClass(action.tone)} disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-[var(--app-text-secondary)]">
              {step === WorkflowStep.COMPLETED
                ? "流程已完成，可前往 Video Studio 或导出结果。"
                : totalEpisodes === 0
                  ? "暂无剧集，导入脚本后可开始。"
                  : "暂无可执行操作。"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  tabs,
  onTabChange,
  activeModelLabel,
  sync,
  splitView,
  onTryMe,
  hasGeneratedShots,
  hasUnderstandingData,
  onExportCsv,
  onExportXls,
  onExportUnderstandingJson,
  onToggleExportMenu,
  isExportMenuOpen,
  onToggleTheme,
  isDarkMode,
  account,
  workflow,
}) => {
  const {
    isLoaded,
    isSignedIn,
    user,
    onSignIn,
    onSignOut,
    onOpenSettings,
    onReset,
    isUserMenuOpen,
    setIsUserMenuOpen,
    onUploadAvatar,
    avatarUrl,
  } = account;

  const visibleTabs = useMemo(() => tabs.filter((t) => !t.hidden), [tabs]);
  const hasTabs = visibleTabs.length > 0;
  const currentTab = useMemo(
    () => visibleTabs.find((t) => t.key === activeTab) || visibleTabs[0],
    [visibleTabs, activeTab]
  );
  const [showTabs, setShowTabs] = useState(false);
  const [showTryInfo, setShowTryInfo] = useState(false);
  const formatSyncTime = (ts?: number) => (ts ? new Date(ts).toLocaleTimeString() : "—");
  const statusLabel = (status: SyncStatus) => {
    switch (status) {
      case "synced":
        return "已同步";
      case "syncing":
        return "同步中";
      case "loading":
        return "加载中";
      case "conflict":
        return "冲突";
      case "error":
        return "错误";
      case "offline":
        return "离线";
      case "disabled":
        return "仅本地";
      case "idle":
      default:
        return "就绪";
    }
  };
  const statusMeta = (status: SyncStatus) => {
    switch (status) {
      case "synced":
        return { label: statusLabel(status), dot: "bg-emerald-400" };
      case "syncing":
      case "loading":
        return { label: statusLabel(status), dot: "bg-sky-400", pulse: true };
      case "conflict":
        return { label: statusLabel(status), dot: "bg-amber-400" };
      case "error":
        return { label: statusLabel(status), dot: "bg-rose-400" };
      case "offline":
        return { label: statusLabel(status), dot: "bg-slate-400" };
      case "disabled":
        return { label: statusLabel(status), dot: "bg-slate-400" };
      case "idle":
      default:
        return { label: statusLabel(status), dot: "bg-slate-300" };
    }
  };
  const aggregateStatus = useMemo(() => {
    if (!sync.isOnline) return "offline";
    const statuses = [sync.state.project.status, sync.state.secrets.status].filter((s) => s !== "disabled");
    if (statuses.length === 0) return "disabled";
    if (statuses.includes("error")) return "error";
    if (statuses.includes("conflict")) return "conflict";
    if (statuses.includes("syncing")) return "syncing";
    if (statuses.includes("loading")) return "loading";
    if (statuses.includes("idle")) return "idle";
    return "synced";
  }, [sync]);
  const syncTooltip = useMemo(() => {
    const projectInfo = `项目: ${statusLabel(sync.state.project.status)}${sync.state.project.lastSyncAt ? ` @ ${formatSyncTime(sync.state.project.lastSyncAt)}` : ""}`;
    const secretsInfo = `密钥: ${statusLabel(sync.state.secrets.status)}${sync.state.secrets.lastSyncAt ? ` @ ${formatSyncTime(sync.state.secrets.lastSyncAt)}` : ""}`;
    const networkInfo = sync.isOnline ? "" : "网络: 离线";
    return [networkInfo, projectInfo, secretsInfo].filter(Boolean).join(" · ");
  }, [sync]);
  const syncDisplay = statusMeta(aggregateStatus);

  const pillTriggerClasses = (isActive = false) =>
    `flex h-12 items-center gap-2 px-4 rounded-full bg-[var(--bg-panel)]/95 text-[var(--text-primary)] text-sm font-semibold shadow-[var(--shadow-soft)] transition-transform duration-150 hover:scale-105 ${isActive ? "scale-105" : ""
    }`;

  const iconButtonClasses = (isActive = false) =>
    `relative h-10 w-10 flex items-center justify-center rounded-full text-[var(--text-primary)] transition-transform duration-150 hover:scale-105 ${isActive ? "scale-105" : ""
    }`;

  const canExport = false;
  const exportItems = [
    hasGeneratedShots
      ? { key: "csv", label: "Export CSV", onClick: onExportCsv }
      : null,
    hasGeneratedShots
      ? { key: "xls", label: "Export XLS", onClick: onExportXls }
      : null,
    hasUnderstandingData
      ? { key: "knowledge-json", label: "Export Knowledge JSON", onClick: onExportUnderstandingJson }
      : null
  ].filter(
    (item): item is { key: string; label: string; onClick: () => void } => item !== null
  );

  const closeAll = () => {
    setShowTabs(false);
    setShowTryInfo(false);
    splitView.onClose();
    if (isUserMenuOpen) setIsUserMenuOpen(false);
    if (isExportMenuOpen) onToggleExportMenu();
  };

  const toggleTabs = () => {
    if (!hasTabs) return;
    setShowTryInfo(false);
    splitView.onClose();
    if (isUserMenuOpen) setIsUserMenuOpen(false);
    if (isExportMenuOpen) onToggleExportMenu();
    setShowTabs((v) => !v);
  };

  const cardShell = (title: string, content: React.ReactNode, align: "left" | "center" = "left") => (
    <div
      className={`absolute ${align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"} top-full mt-2 w-[320px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-primary)] shadow-[var(--shadow-soft)] backdrop-blur overflow-hidden z-30`}
    >
      <div className="px-4 py-3 border-b text-xs uppercase tracking-wide text-[var(--text-secondary)]" style={{ borderColor: "var(--border-subtle)" }}>
        {title}
      </div>
      {content}
    </div>
  );

  const episodesMenu = cardShell(
    "剧集目录",
    <EpisodeList
      episodes={workflow.episodes}
      currentEpIndex={workflow.currentEpIndex}
      onSelect={(idx) => {
        workflow.setCurrentEpIndex(idx);
      }}
    />,
    "center"
  );

  return (
    <>
      {(showTabs || isUserMenuOpen || isExportMenuOpen || showTryInfo || splitView.isOpen) && (
        <div className="fixed inset-0 z-20" onClick={closeAll} />
      )}
      <header className="pointer-events-none fixed top-0 left-0 right-0 z-40 px-4 sm:px-6 pt-3">
        <div className="flex items-start justify-end gap-2.5 w-full">
          <div className="pointer-events-auto">
            <div
              className="flex h-12 items-center gap-1.5 px-4 rounded-full bg-[var(--bg-panel)]/95 backdrop-blur max-w-6xl"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <div className="flex items-center gap-1.5">
                {canExport && (
                  <div className="relative">
                    <button
                      onClick={onToggleExportMenu}
                      className={iconButtonClasses(isExportMenuOpen)}
                      aria-pressed={isExportMenuOpen}
                      title="导出"
                    >
                      <Download size={20} />
                    </button>
                    {isExportMenuOpen && (
                      <div
                        className="absolute right-0 mt-2 w-48 rounded-xl border backdrop-blur overflow-hidden z-30 text-[var(--text-primary)]"
                        style={{
                          borderColor: "var(--border-subtle)",
                          backgroundColor: "var(--bg-elevated)",
                          boxShadow: "var(--shadow-strong)",
                        }}
                      >
                        {exportItems.map((item, index) => (
                          <button
                            key={item.key}
                            onClick={item.onClick}
                            className={`w-full text-left px-4 py-3 hover:bg-[var(--bg-muted)] text-sm ${index < exportItems.length - 1 ? "border-b" : ""
                              }`}
                            style={{ borderColor: "var(--border-subtle)" }}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {false && (
                  <div className="relative min-w-[36px] min-h-[36px] flex items-center justify-center">
                    {!isLoaded ? (
                      <div className="w-9 h-9 rounded-full bg-gray-700 animate-pulse ring-2 ring-white/10" />
                    ) : (
                      <>
                        {!isSignedIn && (
                          <button
                            onClick={onSignIn}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--accent-blue)] text-sm font-medium text-[var(--text-primary)] transition-colors"
                          >
                            <User size={16} /> <span className="hidden sm:inline">Sign In</span>
                          </button>
                        )}

                        {isSignedIn && user && (
                          <>
                            <button
                              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                              className="flex items-center justify-center rounded-full hover:ring-2 ring-indigo-500 transition-all relative z-30"
                            >
                              <img
                                src={avatarUrl || user.imageUrl}
                                alt="Profile"
                                className="w-9 h-9 rounded-full object-cover border border-[var(--border-subtle)] bg-[var(--bg-panel)]"
                              />
                            </button>

                            {isUserMenuOpen && (
                              <div
                                className="absolute right-0 top-full mt-2 w-72 rounded-2xl border backdrop-blur overflow-hidden z-30"
                                style={{
                                  borderColor: "var(--border-subtle)",
                                  backgroundColor: "var(--bg-elevated)",
                                  boxShadow: "var(--shadow-strong)",
                                }}
                              >
                                <div
                                  className="p-4 border-b"
                                  style={{ borderColor: "var(--border-subtle)" }}
                                >
                                  <div className="flex items-center gap-3 mb-3">
                                    <img
                                      src={user.imageUrl}
                                      alt="Profile"
                                      className="w-10 h-10 rounded-full object-cover border border-[var(--border-subtle)]"
                                    />
                                    <div className="overflow-hidden text-[var(--text-primary)]">
                                      <div className="font-bold truncate">
                                        {user.fullName || user.username}
                                      </div>
                                      <div className="text-xs text-[var(--text-secondary)] truncate">
                                        {user.primaryEmailAddress?.emailAddress}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs bg-indigo-900/30 text-indigo-200 px-3 py-1.5 rounded-lg border border-indigo-800">
                                    <Shield size={12} />
                                    <span>User Verified</span>
                                  </div>
                                </div>

                                <div className="p-2 space-y-1 text-[var(--text-primary)]">
                                  {onUploadAvatar && (
                                    <button
                                      onClick={() => {
                                        onUploadAvatar();
                                        setIsUserMenuOpen(false);
                                      }}
                                      className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-3 hover:bg-[var(--bg-muted)] transition-colors"
                                    >
                                      <Upload size={16} />
                                      <span>Upload Avatar (Supabase)</span>
                                    </button>
                                  )}

                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
};
