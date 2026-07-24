import React, { useMemo } from "react";
import { AlertCircle, Cloud, CloudOff, Loader2 } from "lucide-react";
import type { SyncState, SyncStatus } from "../types";

type Props = {
  syncState: SyncState;
  isOnline: boolean;
  isSignedIn: boolean;
  onOpenDetails?: () => void;
};

const statusMeta = (status: SyncStatus) => {
  switch (status) {
    case "loading":
      return {
        label: "正在连接多端实时同步",
        icon: Loader2,
        accent: "var(--app-accent-strong)",
        spin: true,
      };
    case "syncing":
    case "conflict":
      return {
        label: "正在同步更改",
        icon: Loader2,
        accent: "var(--app-accent-strong)",
        spin: true,
      };
    case "error":
      return {
        label: "实时同步暂时中断",
        icon: AlertCircle,
        accent: "#ff6b6b",
        spin: false,
      };
    case "offline":
      return {
        label: "离线编辑 · 联网后自动续传",
        icon: CloudOff,
        accent: "var(--app-text-muted)",
        spin: false,
      };
    case "disabled":
      return {
        label: "未连接云端",
        icon: CloudOff,
        accent: "var(--app-text-muted)",
        spin: false,
      };
    case "synced":
    case "idle":
    default:
      return {
        label: "多端实时同步已连接",
        icon: Cloud,
        accent: "#57c38c",
        spin: false,
      };
  }
};

export const SyncStatusBanner: React.FC<Props> = ({
  syncState,
  isOnline,
  isSignedIn,
  onOpenDetails,
}) => {
  const project = syncState.project;
  const aggregateStatus = useMemo<SyncStatus>(() => {
    if (!isOnline) return "offline";
    if (project.status === "error") return "error";
    if (project.status === "offline") return "offline";
    if (project.status === "loading") return "loading";
    if (project.status === "syncing" || (project.pendingOps ?? 0) > 0) return "syncing";
    return project.status;
  }, [isOnline, project.pendingOps, project.status]);

  if (!isSignedIn || aggregateStatus === "disabled") return null;
  const meta = statusMeta(aggregateStatus);
  const Icon = meta.icon;
  const detail = syncState.secrets.status === "syncing"
    ? `${meta.label} · 账户设置保存中`
    : meta.label;

  return (
    <button
      type="button"
      onClick={onOpenDetails}
      className="pointer-events-auto fixed right-5 top-5 z-[80] flex h-8 items-center gap-2 border-b border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-bg)_88%,transparent)] px-1.5 text-[10px] font-medium tracking-[0.04em] text-[var(--app-text-secondary)] backdrop-blur-md transition-colors hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)]"
      aria-label={`${detail}，打开同步详情`}
      title={detail}
    >
      <Icon
        className={`h-3.5 w-3.5 ${meta.spin ? "animate-spin" : ""}`}
        style={{ color: meta.accent }}
      />
      <span>{meta.label}</span>
    </button>
  );
};
