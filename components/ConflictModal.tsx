import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Cloud, HardDrive, X } from "lucide-react";
import { ProjectData } from "../types";
import { TopRightHint } from "./TopRightHint";

type Props = {
  isOpen: boolean;
  remoteData: ProjectData;
  localData: ProjectData;
  onUseRemote?: () => void;
  onKeepLocal?: () => void;
  onAcknowledge?: () => void;
  mode?: "decision" | "notice";
};

const summarize = (data: ProjectData) => {
  const episodes = data.episodes.length;
  const scenes = data.episodes.reduce((acc, ep) => acc + (ep.scenes?.length || 0), 0);
  const scriptChars = data.rawScript?.length || 0;
  return { episodes, scenes, scriptChars };
};

const buildDiffs = (remoteData: ProjectData, localData: ProjectData) => {
  const diffs: string[] = [];
  const remoteSummary = summarize(remoteData);
  const localSummary = summarize(localData);

  if (remoteSummary.episodes !== localSummary.episodes) {
    diffs.push(`集数：云端 ${remoteSummary.episodes} / 本地 ${localSummary.episodes}`);
  }
  if (remoteSummary.scenes !== localSummary.scenes) {
    diffs.push(`场景数：云端 ${remoteSummary.scenes} / 本地 ${localSummary.scenes}`);
  }
  if (remoteSummary.scriptChars !== localSummary.scriptChars) {
    diffs.push(`脚本文本：云端 ${remoteSummary.scriptChars} / 本地 ${localSummary.scriptChars} 字符`);
  }

  const remoteById = new Map(remoteData.episodes.map((ep) => [ep.id, ep]));
  const localById = new Map(localData.episodes.map((ep) => [ep.id, ep]));
  const onlyRemote = remoteData.episodes.filter((ep) => !localById.has(ep.id));
  const onlyLocal = localData.episodes.filter((ep) => !remoteById.has(ep.id));

  if (onlyRemote.length > 0) {
    const names = onlyRemote.slice(0, 3).map((ep) => ep.title).join("、");
    diffs.push(`仅云端：${names}${onlyRemote.length > 3 ? " 等" : ""}`);
  }
  if (onlyLocal.length > 0) {
    const names = onlyLocal.slice(0, 3).map((ep) => ep.title).join("、");
    diffs.push(`仅本地：${names}${onlyLocal.length > 3 ? " 等" : ""}`);
  }

  return diffs;
};

const statRows = (data: ReturnType<typeof summarize>) => [
  { label: "集数", value: data.episodes },
  { label: "场景", value: data.scenes },
  { label: "文本", value: `${data.scriptChars} 字符` },
];

type OptionCardProps = {
  title: string;
  subtitle: string;
  stats: ReturnType<typeof summarize>;
  icon: React.ReactNode;
  onClick?: () => void;
};

const OptionCard: React.FC<OptionCardProps> = ({ title, subtitle, stats, icon, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="group w-full rounded-[20px] bg-[color-mix(in_srgb,var(--app-panel-soft)_72%,transparent)] p-3 text-left transition hover:bg-[color-mix(in_srgb,var(--app-panel-soft)_88%,white_6%)] active:translate-y-px"
  >
    <div className="flex items-start justify-between gap-2">
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
          {subtitle}
        </div>
        <div className="mt-1 text-[14px] font-semibold tracking-[-0.03em] text-[var(--app-text-primary)]">
          {title}
        </div>
      </div>
      <div className="flex h-8 w-8 items-center justify-center rounded-[12px] bg-black/10 text-[var(--app-accent-strong)] transition group-hover:text-[var(--app-text-primary)]">
        {icon}
      </div>
    </div>
    <div className="mt-3 space-y-1">
      {statRows(stats).slice(0, 2).map((item) => (
        <div key={item.label} className="text-[10px] leading-4 text-[var(--app-text-secondary)]">
          {item.label} {item.value}
        </div>
      ))}
    </div>
  </button>
);

export const ConflictModal: React.FC<Props> = ({
  isOpen,
  remoteData,
  localData,
  onUseRemote,
  onKeepLocal,
  onAcknowledge,
  mode = "decision",
}) => {
  const [showDiffs, setShowDiffs] = useState(false);
  const remote = useMemo(() => summarize(remoteData), [remoteData]);
  const local = useMemo(() => summarize(localData), [localData]);
  const diffItems = useMemo(() => buildDiffs(remoteData, localData), [remoteData, localData]);
  const isNotice = mode === "notice";

  useEffect(() => {
    if (!isOpen) return undefined;
    const timeoutId = window.setTimeout(() => {
      if (isNotice) {
        onAcknowledge?.();
      } else {
        onKeepLocal?.();
      }
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [isNotice, isOpen, onAcknowledge, onKeepLocal]);

  if (!isOpen) return null;

  return (
    <TopRightHint
      stackIndex={1}
      top={20}
      right={20}
      variant="compact"
      widthClassName="w-[248px] max-w-[calc(100vw-24px)]"
      dismiss={
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (isNotice) {
              onAcknowledge?.();
            } else {
              onKeepLocal?.();
            }
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/10 text-[var(--app-text-muted)] transition hover:bg-black/15 hover:text-[var(--app-text-primary)] active:translate-y-px"
          aria-label="关闭同步冲突提示"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      }
    >
      <div className="min-h-[152px]">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] bg-[color-mix(in_srgb,#f0b44c_18%,transparent)] text-[#f0b44c]">
            <AlertTriangle className="h-[15px] w-[15px]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
              Cloud Sync
            </div>
            <div className="mt-1 text-[15px] font-semibold tracking-[-0.03em] text-[var(--app-text-primary)]">
              {isNotice ? "已合并" : "本地还是云端"}
            </div>
            <div className="mt-1 text-[11px] leading-5 text-[var(--app-text-secondary)]">
              {isNotice ? "保留合并结果，继续工作。" : "两边都有更新，选一份继续。"}
            </div>
          </div>
        </div>

        {isNotice ? (
          <div className="mt-4">
            <OptionCard
              title="合并结果"
              subtitle="Merged"
              stats={local}
              icon={<AlertTriangle size={16} />}
              onClick={onAcknowledge}
            />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <OptionCard
              title="云端"
              subtitle="Remote"
              stats={remote}
              icon={<Cloud size={16} />}
              onClick={onUseRemote}
            />
            <OptionCard
              title="本地"
              subtitle="Local"
              stats={local}
              icon={<HardDrive size={16} />}
              onClick={onKeepLocal}
            />
          </div>
        )}

        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowDiffs((value) => !value)}
            className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--app-text-muted)] transition hover:text-[var(--app-text-primary)]"
          >
            {showDiffs ? "隐藏差异" : "查看差异"}
          </button>
          {showDiffs && (
            <div className="mt-2 rounded-[18px] bg-[color-mix(in_srgb,var(--app-panel-soft)_70%,transparent)] p-3 text-[11px] leading-5 text-[var(--app-text-secondary)]">
              {diffItems.length === 0 ? (
                <div>未检测到结构性差异。</div>
              ) : (
                <div className="space-y-1.5">
                  {diffItems.map((item, index) => (
                    <div key={`${item}-${index}`}>{item}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </TopRightHint>
  );
};
