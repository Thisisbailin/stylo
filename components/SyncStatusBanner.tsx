import React, { useMemo } from "react";
import { AlertCircle, CheckCircle2, CloudOff, Loader2, ShieldAlert, X } from "lucide-react";
import { SyncState, SyncStatus } from "../types";

type Props = {
  syncState: SyncState;
  isOnline: boolean;
  isSignedIn: boolean;
  syncRollout?: { enabled: boolean; percent: number; allowlisted?: boolean };
  onOpenDetails?: () => void;
  onForceSync?: () => void;
  onClose?: () => void;
};

const formatTime = (ts?: number) => (ts ? new Date(ts).toLocaleTimeString() : "—");

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
    case "syncing":
    case "loading":
      return { label: statusLabel(status), icon: Loader2, accent: "var(--app-accent-strong)" };
    case "conflict":
      return { label: "同步冲突", icon: AlertCircle, accent: "#f0b44c" };
    case "error":
      return { label: "同步失败", icon: AlertCircle, accent: "#ff6b6b" };
    case "offline":
      return { label: "离线", icon: CloudOff, accent: "var(--app-text-muted)" };
    case "disabled":
      return { label: "仅本地", icon: ShieldAlert, accent: "var(--app-text-muted)" };
    case "synced":
      return { label: "已同步", icon: CheckCircle2, accent: "#57c38c" };
    case "idle":
    default:
      return { label: "就绪", icon: CheckCircle2, accent: "var(--app-text-secondary)" };
  }
};

export const SyncStatusBanner: React.FC<Props> = ({
  syncState,
  isOnline,
  isSignedIn,
  syncRollout,
  onOpenDetails,
  onForceSync,
  onClose,
}) => {
  const project = syncState.project;
  const secrets = syncState.secrets;
  const pendingOps = (project.pendingOps ?? 0) + (secrets.pendingOps ?? 0);
  const retryCount = (project.retryCount ?? 0) + (secrets.retryCount ?? 0);
  const lastAttemptAt = Math.max(project.lastAttemptAt ?? 0, secrets.lastAttemptAt ?? 0) || undefined;
  const lastSyncAt = Math.max(project.lastSyncAt ?? 0, secrets.lastSyncAt ?? 0) || undefined;
  const rolloutDisabled = !!syncRollout && !syncRollout.enabled;
  const canForceSync = isOnline && !rolloutDisabled;

  const aggregateStatus = useMemo<SyncStatus>(() => {
    if (!isOnline) return "offline";
    const statuses = [project.status, secrets.status].filter((s) => s !== "disabled");
    if (statuses.length === 0) return "disabled";
    if (statuses.includes("error")) return "error";
    if (statuses.includes("conflict")) return "conflict";
    if (statuses.includes("syncing")) return "syncing";
    if (statuses.includes("loading")) return "loading";
    if (statuses.includes("idle")) return "idle";
    return "synced";
  }, [isOnline, project.status, secrets.status]);

  const shouldShow = useMemo(() => {
    if (!isSignedIn) return false;
    if (rolloutDisabled) return true;
    if (!isOnline) return true;
    if (["syncing", "loading", "conflict", "error"].includes(aggregateStatus)) return true;
    if (pendingOps > 0 || retryCount > 0) return true;
    return false;
  }, [aggregateStatus, isOnline, isSignedIn, pendingOps, retryCount, rolloutDisabled]);

  if (!shouldShow) return null;

  const effectiveStatus: SyncStatus = rolloutDisabled ? "disabled" : aggregateStatus;
  const meta = statusMeta(effectiveStatus);
  const Icon = meta.icon;

  const summary = rolloutDisabled
    ? `灰度 ${syncRollout?.percent ?? 0}% · 当前账号未启用`
    : [
        `项目 ${statusLabel(project.status)}`,
        `密钥 ${statusLabel(secrets.status)}`,
        pendingOps > 0 ? `待发送 ${pendingOps}` : null,
        retryCount > 0 ? `重试 ${retryCount}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

  const metaLine = lastSyncAt
    ? `上次成功 ${formatTime(lastSyncAt)}${lastAttemptAt ? ` · 最近尝试 ${formatTime(lastAttemptAt)}` : ""}`
    : lastAttemptAt
      ? `最近尝试 ${formatTime(lastAttemptAt)}`
      : "点击卡片查看同步详情";

  return (
    <div className="pointer-events-none fixed right-5 top-5 z-[72] sm:right-6 sm:top-6">
      <div
        className="pointer-events-auto w-[min(360px,calc(100vw-24px))] rounded-[28px] border border-[var(--app-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent),var(--app-panel)] p-4 text-[var(--app-text-primary)] shadow-[0_24px_44px_-24px_rgba(0,0,0,0.48)] backdrop-blur-xl"
        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 44px -24px rgba(0,0,0,0.48)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onOpenDetails}
            className="group flex min-w-0 flex-1 items-start gap-3 text-left"
          >
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
              style={{ color: meta.accent }}
            >
              <Icon className={`h-[18px] w-[18px] ${effectiveStatus === "syncing" || effectiveStatus === "loading" ? "animate-spin" : ""}`} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
                Cloud Sync
              </span>
              <span className="mt-1 block text-[18px] font-semibold tracking-[-0.03em] text-[var(--app-text-primary)]">
                {meta.label}
              </span>
              <span className="mt-2 block text-[12px] leading-5 text-[var(--app-text-secondary)]">
                {summary}
              </span>
              <span className="mt-1.5 block text-[11px] leading-5 text-[var(--app-text-muted)] transition group-hover:text-[var(--app-text-secondary)]">
                {metaLine}
              </span>
            </span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent text-[var(--app-text-muted)] transition hover:border-[var(--app-border)] hover:bg-[var(--app-panel-muted)] hover:text-[var(--app-text-primary)]"
              aria-label="关闭同步提示"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {onForceSync && canForceSync && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">
              点击卡片查看详情
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onForceSync();
              }}
              className="rounded-full border border-[var(--app-border-strong)] bg-[var(--app-panel-strong)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-primary)] transition hover:border-[var(--app-accent-strong)] hover:bg-[var(--app-panel-soft)] active:translate-y-px"
            >
              Sync now
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
