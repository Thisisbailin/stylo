import React, { useEffect, useMemo } from "react";
import { AlertCircle, CheckCircle2, CloudOff, Loader2, X } from "lucide-react";
import { SyncState, SyncStatus } from "../types";
import { TopRightHint } from "./TopRightHint";

type Props = {
  syncState: SyncState;
  isOnline: boolean;
  isSignedIn: boolean;
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
      return "未连接云端";
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
      return { label: "未连接云端", icon: CloudOff, accent: "var(--app-text-muted)" };
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
  const canForceSync = isOnline;

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
    if (!isOnline) return true;
    if (["syncing", "loading", "conflict", "error"].includes(aggregateStatus)) return true;
    if (pendingOps > 0 || retryCount > 0) return true;
    return false;
  }, [aggregateStatus, isOnline, isSignedIn, pendingOps, retryCount]);

  const effectiveStatus: SyncStatus = aggregateStatus;
  const meta = statusMeta(effectiveStatus);
  const Icon = meta.icon;

  const summary = [
    `项目 ${statusLabel(project.status)}`,
    pendingOps > 0 ? `待同步 ${pendingOps}` : `密钥 ${statusLabel(secrets.status)}`,
    retryCount > 0 ? `重试 ${retryCount}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const metaLine = lastSyncAt
    ? `上次 ${formatTime(lastSyncAt)}`
    : lastAttemptAt
      ? `尝试 ${formatTime(lastAttemptAt)}`
      : "点开查看同步详情";

  useEffect(() => {
    if (!shouldShow || !onClose) return undefined;
    const timeoutId = window.setTimeout(() => onClose(), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [onClose, shouldShow, summary, metaLine, meta.label]);

  if (!shouldShow) return null;

  return (
    <TopRightHint
      stackIndex={0}
      onClick={onOpenDetails}
      variant="compact"
      top={20}
      right={20}
      widthClassName="w-[248px] max-w-[calc(100vw-24px)]"
      dismiss={
        onClose ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/10 text-[var(--app-text-muted)] transition hover:bg-black/15 hover:text-[var(--app-text-primary)] active:translate-y-px"
            aria-label="关闭同步提示"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null
      }
      action={
        onForceSync && canForceSync ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onForceSync();
            }}
            className="rounded-full bg-[var(--app-panel-soft)] px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.02em] text-[var(--app-text-primary)] transition hover:bg-[color-mix(in_srgb,var(--app-panel-soft)_74%,white_10%)] active:translate-y-px"
          >
            立即同步
          </button>
        ) : null
      }
    >
      <div className="min-h-[116px]">
        <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] bg-[color-mix(in_srgb,var(--app-panel-soft)_82%,transparent)]"
          style={{ color: meta.accent }}
        >
          <Icon className={`h-[14px] w-[14px] ${effectiveStatus === "syncing" || effectiveStatus === "loading" ? "animate-spin" : ""}`} />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
            Cloud Sync
          </div>
          <div className="mt-1 text-[15px] font-semibold tracking-[-0.03em] text-[var(--app-text-primary)]">
            {meta.label}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-[var(--app-text-secondary)]">
            {summary}
          </div>
          <div className="mt-1 text-[10px] leading-5 text-[var(--app-text-muted)]">
            {metaLine}
          </div>
        </div>
        </div>
      </div>
    </TopRightHint>
  );
};
