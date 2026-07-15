import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Cloud, Shield, Trash2 } from "lucide-react";
import type { AppConfig, SyncState } from "../../types";
import type { AccountApiSession } from "../../sync/authenticatedFetch";

type Props = {
  config: AppConfig;
  onConfigChange: (c: AppConfig) => void;
  isSignedIn?: boolean;
  accountSession?: AccountApiSession;
  onForceSync?: () => void;
  syncState?: SyncState;
  syncRollout?: { enabled: boolean; percent: number; bucket?: number | null; allowlisted?: boolean };
  onResetProject?: () => void;
  initialSection?: SyncSectionKey;
  activeSection?: SyncSectionKey;
  onActiveSectionChange?: (section: SyncSectionKey) => void;
  showSidebar?: boolean;
};

export type SyncSectionKey = "status" | "history";

export const SyncPanel: React.FC<Props> = ({
  config,
  onConfigChange,
  isSignedIn,
  accountSession,
  onForceSync,
  syncState,
  syncRollout,
  onResetProject,
  initialSection = "status",
  activeSection,
  onActiveSectionChange,
  showSidebar = true,
}) => {
  const [internalActive, setInternalActive] = useState<SyncSectionKey>(initialSection);
  const active = activeSection ?? internalActive;
  const [snapshots, setSnapshots] = useState<{ version: number; createdAt: number }[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [snapshotMessage, setSnapshotMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isRestoringSnapshot, setIsRestoringSnapshot] = useState(false);
  const [auditEntries, setAuditEntries] = useState<
    Array<{ id: number; action: string; status: string; createdAt: number; detail: Record<string, unknown> }>
  >([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [auditMessage, setAuditMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const projectSync = syncState?.project;
  const secretsSync = syncState?.secrets;
  const syncAllowed = syncRollout?.enabled ?? true;
  const syncPercent = syncRollout?.percent ?? 100;
  const syncIsRollout = syncPercent < 100;

  useEffect(() => {
    if (active === "history") {
      fetchSnapshots();
      fetchAuditLogs();
    }
  }, [active]);
  const handleSectionSelect = (section: SyncSectionKey) => {
    if (activeSection === undefined) {
      setInternalActive(section);
    }
    onActiveSectionChange?.(section);
  };

  const formatSnapshotTime = (ts: number) => new Date(ts).toLocaleString();
  const formatSyncTime = (ts?: number) => (ts ? new Date(ts).toLocaleString() : "—");
  const formatAuditDetail = (detail: Record<string, unknown>) => {
    const parts: string[] = [];
    if (typeof detail.updatedAt === "number") parts.push(`v${detail.updatedAt}`);
    if (typeof detail.episodes === "number") parts.push(`eps ${detail.episodes}`);
    if (typeof detail.version === "number") parts.push(`snapshot ${detail.version}`);
    if (typeof detail.mode === "string") parts.push(`mode ${detail.mode}`);
    if (typeof detail.reason === "string") parts.push(`reason: ${detail.reason}`);
    if (typeof detail.error === "string") parts.push(`error: ${detail.error}`);
    if (typeof detail.textKey === "boolean") parts.push(`textKey ${detail.textKey ? "yes" : "no"}`);
    if (typeof detail.multiKey === "boolean") parts.push(`multiKey ${detail.multiKey ? "yes" : "no"}`);
    if (typeof detail.videoKey === "boolean") parts.push(`videoKey ${detail.videoKey ? "yes" : "no"}`);
    if (typeof detail.deviceId === "string") parts.push(`device ${detail.deviceId}`);
    return parts.join(" · ");
  };

  const statusLabel = (status?: string) => {
    switch (status) {
      case "synced":
        return "Synced";
      case "syncing":
        return "Syncing";
      case "loading":
        return "Loading";
      case "conflict":
        return "Conflict";
      case "error":
        return "Error";
      case "offline":
        return "Offline";
      case "disabled":
        return "Local";
      case "idle":
      default:
        return "Ready";
    }
  };

  const fetchSnapshots = async () => {
    if (!syncAllowed) {
      setSnapshotMessage({ type: "error", text: "Cloud sync is not enabled yet." });
      return;
    }
    if (!accountSession || !isSignedIn) {
      setSnapshotMessage({ type: "error", text: "Sign in to view cloud snapshots." });
      return;
    }
    setIsLoadingSnapshots(true);
    setSnapshotMessage(null);
    try {
      const res = await accountSession.request("/api/project-snapshots");
      if (!res.ok) {
        throw new Error(`Failed to load snapshots (${res.status})`);
      }
      const data = await res.json();
      setSnapshots(Array.isArray(data?.snapshots) ? data.snapshots : []);
      setSnapshotMessage({ type: "success", text: "Snapshots loaded." });
    } catch (err: any) {
      setSnapshotMessage({ type: "error", text: err.message || "Failed to load snapshots." });
    } finally {
      setIsLoadingSnapshots(false);
    }
  };

  const restoreSnapshot = async (version: number) => {
    if (!syncAllowed) {
      setSnapshotMessage({ type: "error", text: "Cloud sync is not enabled yet." });
      return;
    }
    if (!accountSession || !isSignedIn) {
      setSnapshotMessage({ type: "error", text: "Sign in to restore snapshots." });
      return;
    }
    const confirmRestore = window.confirm("Restore this snapshot? It will overwrite cloud data.");
    if (!confirmRestore) return;
    setIsRestoringSnapshot(true);
    try {
      const indexRes = await accountSession.request("/api/project-snapshots");
      if (!indexRes.ok) {
        throw new Error(`Failed to read the current project version (${indexRes.status})`);
      }
      const index = await indexRes.json();
      const expectedUpdatedAt = typeof index?.currentVersion === "number" &&
        Number.isSafeInteger(index.currentVersion) && index.currentVersion >= 0
        ? index.currentVersion
        : null;
      if (expectedUpdatedAt === null) {
        throw new Error("The server returned an invalid project version.");
      }
      const opId = globalThis.crypto?.randomUUID?.() ||
        `restore-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const res = await accountSession.request("/api/project-restore", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "if-match": String(expectedUpdatedAt),
        },
        body: JSON.stringify({ version, expectedUpdatedAt, opId }),
      });
      if (!res.ok) {
        if (res.status === 409) {
          throw new Error("Cloud data changed before the restore. Reload history and try again.");
        }
        throw new Error(`Restore failed (${res.status})`);
      }
      setSnapshotMessage({ type: "success", text: "Snapshot restored." });
      onForceSync?.();
      await fetchSnapshots();
    } catch (err: any) {
      setSnapshotMessage({ type: "error", text: err.message || "Restore failed." });
    } finally {
      setIsRestoringSnapshot(false);
    }
  };

  const fetchAuditLogs = async () => {
    if (!syncAllowed) {
      setAuditMessage({ type: "error", text: "Cloud sync is not enabled yet." });
      return;
    }
    if (!accountSession || !isSignedIn) {
      setAuditMessage({ type: "error", text: "Sign in to view audit logs." });
      return;
    }
    setIsLoadingAudit(true);
    setAuditMessage(null);
    try {
      const res = await accountSession.request("/api/sync-audit");
      if (!res.ok) {
        throw new Error(`Failed to load logs (${res.status})`);
      }
      const data = await res.json();
      setAuditEntries(Array.isArray(data?.entries) ? data.entries : []);
      setAuditMessage({ type: "success", text: "Logs loaded." });
    } catch (err: any) {
      setAuditMessage({ type: "error", text: err.message || "Failed to load logs." });
    } finally {
      setIsLoadingAudit(false);
    }
  };

  return (
    <div className="space-y-4 text-[var(--app-text-primary)]">
      <div className={`grid grid-cols-1 gap-5 ${showSidebar ? "lg:grid-cols-[260px_1fr]" : ""}`}>
        {showSidebar ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
              <div className="text-[11px] uppercase tracking-widest app-text-muted">Sync</div>
              {[
                { key: "status" as const, label: "Status & Keys", Icon: Shield },
                { key: "history" as const, label: "Cloud History", Icon: Cloud },
              ].map(({ key, label, Icon }) => {
                const activeItem = active === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSectionSelect(key)}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[12px] border transition ${
                      activeItem
                        ? "bg-[var(--app-panel-soft)] border-[var(--app-border-strong)] text-[var(--app-text-primary)]"
                        : "border-[var(--app-border)] text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon size={14} />
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 text-[11px] text-[var(--app-text-secondary)] space-y-2">
              <div className="uppercase tracking-widest">Notes</div>
              <div>Sync status reflects latest cloud handshake.</div>
              <div>Snapshot restore will overwrite cloud data.</div>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-5">
          {active === "status" ? (
            <>
              {syncIsRollout && (
                <div className="text-xs px-3 py-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-text-secondary)]">
                  Cloud sync rollout: {syncPercent}%. {syncAllowed ? "Enabled for this account." : "Not enabled yet."}
                </div>
              )}
              <div className="space-y-3">
                {[
                  {
                    id: "rememberKeys",
                    label: "Store API keys locally",
                    desc: "Keys will be stored in this browser only.",
                    value: !!config.rememberApiKeys,
                    onChange: (checked: boolean) =>
                      onConfigChange({ ...config, rememberApiKeys: checked }),
                  },
                  {
                    id: "syncKeys",
                    label: "Sync API keys to cloud",
                    desc: "Keys are stored in your account vault.",
                    value: !!config.syncApiKeys,
                    onChange: (checked: boolean) =>
                      onConfigChange({ ...config, syncApiKeys: checked }),
                  },
                ].map((item) => (
                  <label
                    key={item.id}
                    htmlFor={item.id}
                    className="flex items-start gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3 text-[12px]"
                  >
                    <input
                      id={item.id}
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-emerald-400"
                      checked={item.value}
                      onChange={(e) => item.onChange(e.target.checked)}
                    />
                    <div>
                      <div className="text-[12px] font-semibold">{item.label}</div>
                      <div className="text-[11px] text-[var(--app-text-secondary)]">{item.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="space-y-3">
                <div className="text-[12px] font-semibold">Sync Diagnostics</div>
                {!syncState ? (
                  <div className="text-[11px] text-[var(--app-text-secondary)]">
                    Sync state not available.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { label: "Project", channel: projectSync },
                      { label: "Secrets", channel: secretsSync },
                    ].map(({ label, channel }) => (
                      <div
                        key={label}
                        className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3 text-[11px] text-[var(--app-text-secondary)] space-y-1"
                      >
                        <div className="text-[12px] font-semibold text-[var(--app-text-primary)]">
                          {label}
                        </div>
                        <div>Status: {statusLabel(channel?.status)}</div>
                        <div>Last sync: {formatSyncTime(channel?.lastSyncAt)}</div>
                        <div>Last attempt: {formatSyncTime(channel?.lastAttemptAt)}</div>
                        <div>Pending ops: {channel?.pendingOps ?? 0}</div>
                        <div>Retries: {channel?.retryCount ?? 0}</div>
                        {channel?.lastError && <div className="text-rose-300">Error: {channel.lastError}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl border border-rose-400/40 bg-rose-500/20 flex items-center justify-center text-rose-200">
                  <Trash2 size={16} />
                </div>
                <div className="flex-1">
                  <div className="text-[12px] font-semibold">Reset project data</div>
                  <div className="text-[11px] text-[var(--app-text-secondary)]">
                    Clears local and cloud data. Use carefully.
                  </div>
                  <button
                    type="button"
                    onClick={() => onResetProject?.()}
                    className="mt-3 px-3 py-1.5 rounded-lg text-[11px] border border-rose-400/40 text-rose-200 hover:border-rose-300/70 transition"
                  >
                    Reset now
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12px] font-semibold">Cloud Snapshots</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onForceSync?.();
                      fetchSnapshots();
                    }}
                    className="px-3 py-1.5 rounded-full text-[11px] border border-[var(--app-border)] hover:border-[var(--app-border-strong)] transition"
                    disabled={!syncAllowed}
                  >
                    Sync now
                  </button>
                  <button
                    type="button"
                    onClick={fetchSnapshots}
                    className="px-3 py-1.5 rounded-full text-[11px] bg-[var(--accent-blue)] text-white hover:bg-sky-500 transition"
                    disabled={isLoadingSnapshots || !syncAllowed}
                  >
                    {isLoadingSnapshots ? "Loading..." : "Refresh"}
                  </button>
                </div>
              </div>
              {snapshotMessage && (
                <div
                  className={`text-[11px] px-3 py-2 rounded-xl border ${
                    snapshotMessage.type === "error"
                      ? "border-red-400/60 text-red-300 bg-red-900/20"
                      : "border-emerald-400/60 text-emerald-200 bg-emerald-900/20"
                  }`}
                >
                  {snapshotMessage.type === "error" ? <AlertCircle size={12} className="inline mr-2" /> : <CheckCircle size={12} className="inline mr-2" />}
                  {snapshotMessage.text}
                </div>
              )}
              <div className="space-y-2">
                {snapshots.length === 0 ? (
                  <div className="text-[11px] text-[var(--app-text-secondary)]">No snapshots yet.</div>
                ) : (
                  snapshots.map((snap) => (
                    <div
                      key={snap.version}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)]"
                    >
                      <div>
                        <div className="text-[12px] font-semibold">v{snap.version}</div>
                        <div className="text-[11px] text-[var(--app-text-secondary)]">
                          {formatSnapshotTime(snap.createdAt)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => restoreSnapshot(snap.version)}
                        disabled={isRestoringSnapshot || !syncAllowed}
                        className="px-3 py-1.5 rounded-full text-[11px] border border-[var(--app-border)] hover:border-[var(--app-border-strong)] transition"
                      >
                        {isRestoringSnapshot ? "Restoring..." : "Restore"}
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <div className="text-[12px] font-semibold">Sync Audit Logs</div>
                <button
                  type="button"
                  onClick={fetchAuditLogs}
                  className="px-3 py-1.5 rounded-full text-[11px] bg-[var(--accent-blue)] text-white hover:bg-sky-500 transition"
                  disabled={isLoadingAudit || !syncAllowed}
                >
                  {isLoadingAudit ? "Loading..." : "Refresh"}
                </button>
              </div>
              {auditMessage && (
                <div
                  className={`text-[11px] px-3 py-2 rounded-xl border ${
                    auditMessage.type === "error"
                      ? "border-red-400/60 text-red-300 bg-red-900/20"
                      : "border-emerald-400/60 text-emerald-200 bg-emerald-900/20"
                  }`}
                >
                  {auditMessage.type === "error" ? <AlertCircle size={12} className="inline mr-2" /> : <CheckCircle size={12} className="inline mr-2" />}
                  {auditMessage.text}
                </div>
              )}
              <div className="space-y-2">
                {auditEntries.length === 0 ? (
                  <div className="text-[11px] text-[var(--app-text-secondary)]">No logs yet.</div>
                ) : (
                  auditEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)]"
                    >
                      <div className="text-[12px] font-semibold">
                        {entry.action} · {entry.status}
                      </div>
                      <div className="text-[11px] text-[var(--app-text-secondary)]">
                        {formatSnapshotTime(entry.createdAt)}
                      </div>
                      {Object.keys(entry.detail || {}).length > 0 && (
                        <div className="text-[10px] text-[var(--app-text-secondary)] mt-1">
                          {formatAuditDetail(entry.detail)}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="text-[10px] text-[var(--app-text-secondary)]">
                Restoring snapshots overwrites cloud data and will sync to local on next pull.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
