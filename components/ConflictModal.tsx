import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Cloud, HardDrive } from "lucide-react";
import { ProjectData } from "../types";

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
  const shots = data.episodes.reduce((acc, ep) => acc + ep.shots.length, 0);
  const scriptChars = data.rawScript?.length || 0;
  return { episodes, shots, scriptChars };
};

const buildDiffs = (remoteData: ProjectData, localData: ProjectData) => {
  const diffs: string[] = [];
  const remoteSummary = summarize(remoteData);
  const localSummary = summarize(localData);

  if (remoteSummary.episodes !== localSummary.episodes) {
    diffs.push(`集数：云端 ${remoteSummary.episodes} / 本地 ${localSummary.episodes}`);
  }
  if (remoteSummary.shots !== localSummary.shots) {
    diffs.push(`镜头数：云端 ${remoteSummary.shots} / 本地 ${localSummary.shots}`);
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
  { label: "镜头", value: data.shots },
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
    className="group w-full rounded-[24px] border border-[var(--app-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent),var(--app-panel-muted)] p-4 text-left transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)] active:translate-y-px"
    style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
          {subtitle}
        </div>
        <div className="mt-1 text-[17px] font-semibold tracking-[-0.03em] text-[var(--app-text-primary)]">
          {title}
        </div>
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-[var(--app-border)] bg-[var(--app-panel-strong)] text-[var(--app-accent-strong)] transition group-hover:text-[var(--app-text-primary)]">
        {icon}
      </div>
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2">
      {statRows(stats).map((item) => (
        <div key={item.label} className="rounded-[16px] border border-white/5 bg-black/10 px-3 py-2">
          <div className="text-[9px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">{item.label}</div>
          <div className="mt-1 text-[11px] font-medium text-[var(--app-text-secondary)]">{item.value}</div>
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

  if (!isOpen) return null;

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

  return (
    <div className="pointer-events-none fixed right-5 top-[112px] z-[73] sm:right-6">
      <div
        className="pointer-events-auto w-[min(420px,calc(100vw-24px))] rounded-[30px] border border-[var(--app-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent),var(--app-panel)] p-4 text-[var(--app-text-primary)] shadow-[0_26px_46px_-24px_rgba(0,0,0,0.52)] backdrop-blur-xl"
        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 26px 46px -24px rgba(0,0,0,0.52)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-strong)] text-[#f0b44c] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <AlertTriangle className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
                Cloud Sync
              </div>
              <div className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-[var(--app-text-primary)]">
                {isNotice ? "冲突已自动合并" : "本地还是云端"}
              </div>
              <div className="mt-2 text-[12px] leading-5 text-[var(--app-text-secondary)]">
                {isNotice
                  ? "系统已保留双份文本并完成自动合并，建议你检查差异后继续工作。"
                  : "两边都有新改动。选择一份继续，另一份会保留在备份里。"}
              </div>
            </div>
          </div>
        </div>

        {isNotice ? (
          <div className="mt-4">
            <OptionCard
              title="已保留合并结果"
              subtitle="Auto merge"
              stats={local}
              icon={<AlertTriangle size={16} />}
              onClick={onAcknowledge}
            />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3">
            <OptionCard
              title="云端版本"
              subtitle="Remote"
              stats={remote}
              icon={<Cloud size={16} />}
              onClick={onUseRemote}
            />
            <OptionCard
              title="本地版本"
              subtitle="Local"
              stats={local}
              icon={<HardDrive size={16} />}
              onClick={onKeepLocal}
            />
          </div>
        )}

        <div className="mt-4">
          <div className="mb-3 text-[11px] leading-5 text-[var(--app-text-muted)]">
            {isNotice ? "3 秒后自动忽略该提示。" : "3 秒后默认保留本地版本，忽略本次同步异常。"}
          </div>
          <button
            type="button"
            onClick={() => setShowDiffs((value) => !value)}
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--app-text-muted)] transition hover:text-[var(--app-text-primary)]"
          >
            {showDiffs ? "隐藏差异" : "查看差异"}
          </button>
          {showDiffs && (
            <div className="mt-3 rounded-[22px] border border-[var(--app-border)] bg-[var(--app-panel-muted)]/90 p-3 text-[12px] leading-5 text-[var(--app-text-secondary)]">
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
    </div>
  );
};
