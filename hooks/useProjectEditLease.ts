import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountApiSession } from "../sync/authenticatedFetch";

export type ProjectEditLeaseOwner = {
  clientLabel: string;
  acquiredAt: number;
  renewedAt: number;
  expiresAt: number;
};

export type ProjectEditLeaseState =
  | { status: "disabled" }
  | { status: "acquiring" }
  | { status: "owned"; leaseId: string; acquiredAt: number; renewedAt: number; expiresAt: number }
  | { status: "blocked"; owner: ProjectEditLeaseOwner | null }
  | { status: "error"; message: string };

type LeasePayload = {
  status?: "owned" | "blocked" | "released";
  leaseId?: string;
  acquiredAt?: number;
  renewedAt?: number;
  expiresAt?: number;
  owner?: ProjectEditLeaseOwner | null;
  error?: string;
};

const HEARTBEAT_MS = 12_000;
const runtimeSessionIds = new Map<string, string>();

const createSessionId = () => globalThis.crypto?.randomUUID?.() ||
  `session-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

const getSessionId = (accountScope: string) => {
  const existing = runtimeSessionIds.get(accountScope);
  if (existing) return existing;
  const created = createSessionId();
  runtimeSessionIds.set(accountScope, created);
  return created;
};

const getClientLabel = () => {
  const scoped = window as Window & {
    styloDesktop?: { isDesktop?: boolean };
    qalamDesktop?: { isDesktop?: boolean };
  };
  if (scoped.styloDesktop?.isDesktop || scoped.qalamDesktop?.isDesktop) return "Stylo 桌面端";
  return /Mac/i.test(navigator.platform) ? "Stylo 网页端 · Mac" : "Stylo 网页端";
};

const parsePayload = async (response: Response): Promise<LeasePayload> =>
  response.json().catch(() => ({} as LeasePayload));

export const useProjectEditLease = ({
  accountScope,
  projectId,
  accountSession,
  enabled,
}: {
  accountScope: string;
  projectId: string;
  accountSession: AccountApiSession;
  enabled: boolean;
}) => {
  const [state, setState] = useState<ProjectEditLeaseState>(
    enabled ? { status: "acquiring" } : { status: "disabled" },
  );
  const stateRef = useRef(state);
  const inFlightRef = useRef(false);
  const releasingRef = useRef(false);
  const mountedRef = useRef(false);
  stateRef.current = state;
  const activeProjectIdRef = useRef(projectId);
  activeProjectIdRef.current = projectId;

  const sessionId = getSessionId(`${accountScope}:${projectId}`);
  const clientLabelRef = useRef("");
  if (!clientLabelRef.current && typeof window !== "undefined") clientLabelRef.current = getClientLabel();

  const updateState = useCallback((next: ProjectEditLeaseState) => {
    stateRef.current = next;
    if (mountedRef.current) setState(next);
  }, []);

  const send = useCallback(async (action: "acquire" | "renew" | "release", leaseId?: string) => {
    const response = await accountSession.request("/api/project-lease", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: action === "release",
      body: JSON.stringify({
        action,
        sessionId,
        projectId,
        clientLabel: clientLabelRef.current,
        ...(leaseId ? { leaseId } : {}),
      }),
    });
    return { response, payload: await parsePayload(response) };
  }, [accountSession, projectId, sessionId]);

  const acquireOrRenew = useCallback(async (forceAcquire = false) => {
    if (!enabled || inFlightRef.current || releasingRef.current) return;
    inFlightRef.current = true;
    const current = stateRef.current;
    const activeLeaseId = !forceAcquire && current.status === "owned" ? current.leaseId : undefined;
    try {
      const { response, payload } = await send(activeLeaseId ? "renew" : "acquire", activeLeaseId);
      if (response.ok && payload.status === "owned" && payload.leaseId) {
        updateState({
          status: "owned",
          leaseId: payload.leaseId,
          acquiredAt: Number(payload.acquiredAt) || Date.now(),
          renewedAt: Number(payload.renewedAt) || Date.now(),
          expiresAt: Number(payload.expiresAt) || Date.now(),
        });
      } else if (response.status === 423 || payload.status === "blocked") {
        updateState({ status: "blocked", owner: payload.owner || null });
      } else {
        throw new Error(payload.error || `编辑权请求失败（${response.status}）`);
      }
    } catch (error) {
      const latest = stateRef.current;
      if (latest.status === "owned" && latest.expiresAt > Date.now()) {
        // Preserve a still-live lease through a transient heartbeat failure.
        return;
      }
      updateState({
        status: "error",
        message: error instanceof Error ? error.message : "无法确认项目编辑权。",
      });
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled, send, updateState]);

  const retry = useCallback(() => {
    releasingRef.current = false;
    updateState({ status: "acquiring" });
    void acquireOrRenew(true);
  }, [acquireOrRenew, updateState]);

  const markLost = useCallback(() => {
    updateState({ status: "blocked", owner: null });
  }, [updateState]);

  const release = useCallback(async () => {
    const current = stateRef.current;
    if (current.status !== "owned") return;
    releasingRef.current = true;
    try {
      await send("release", current.leaseId);
    } finally {
      updateState({ status: "disabled" });
    }
  }, [send, updateState]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      updateState({ status: "disabled" });
      return () => {
        mountedRef.current = false;
      };
    }

    updateState({ status: "acquiring" });
    releasingRef.current = false;
    void acquireOrRenew(true);
    const interval = window.setInterval(() => void acquireOrRenew(), HEARTBEAT_MS);
    const handleResume = () => void acquireOrRenew();
    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleResume);
    const handlePageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) void release().catch(() => undefined);
    };
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      const previousLease = stateRef.current.status === "owned" ? stateRef.current : null;
      mountedRef.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleResume);
      window.removeEventListener("pagehide", handlePageHide);
      queueMicrotask(() => {
        if (previousLease && activeProjectIdRef.current !== projectId) {
          void send("release", previousLease.leaseId).catch(() => undefined);
        }
      });
      // Do not release from an effect cleanup: React StrictMode performs a
      // synthetic unmount/remount and a late release could delete the newly
      // renewed session. The short TTL is the crash/unload fallback; explicit
      // sign-out and local-mode transitions call release().
    };
  }, [accountScope, acquireOrRenew, enabled, projectId, release, send, updateState]);

  return {
    state,
    leaseId: state.status === "owned" ? state.leaseId : undefined,
    retry,
    markLost,
    release,
  };
};
