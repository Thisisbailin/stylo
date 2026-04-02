import React, { useEffect, useMemo } from "react";
import { AlertCircle, CheckCircle2, CloudOff, Loader2, ShieldAlert } from "lucide-react";
import { SyncState, SyncStatus } from "../types";
import { TopRightHint } from "./TopRightHint";

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
      action={
        onForceSync && canForceSync ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onForceSync();
            }}
            className="rounded-full border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-1.5 text-[10px] font-semibold tracking-[0.02em] text-[var(--app-text-secondary)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)] active:translate-y-px"
          >
            立即同步
          </button>
        ) : null
      }
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)]"
          style={{ color: meta.accent }}
        >
          <Icon className={`h-[14px] w-[14px] ${effectiveStatus === "syncing" || effectiveStatus === "loading" ? "animate-spin" : ""}`} />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] leading-5 text-[var(--app-text-primary)]">
            {meta.label}，{summary}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-[var(--app-text-secondary)]">
            {metaLine}
          </div>
        </div>
      </div>
    </TopRightHint>
  );
};
