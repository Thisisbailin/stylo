import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "../../node-workspace/components/stylo/types";
import {
  recordAgentToolCalled,
  recordAgentToolCompleted,
  recordAgentToolFailed,
} from "../runtime/activity";
import { browserAgentDebug, browserAgentDebugError } from "../runtime/debug";
import type { AgentRuntimeEvent, StyloAgentRuntime, StyloRunInput, StyloRunResult } from "../runtime/types";
import { StyloMessageEventState } from "./styloMessageState";

type Options = {
  runtime: StyloAgentRuntime;
  projectId: string;
  sessionId: string;
  activityStorageKey?: string;
  setMessages: (updater: Message[] | ((previous: Message[]) => Message[])) => void;
};

type DisplayAwareError = Error & { styloAlreadyDisplayed?: boolean };

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useStyloAgentController = ({
  runtime,
  projectId,
  sessionId,
  activityStorageKey,
  setMessages,
}: Options) => {
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const projectionRef = useRef(new StyloMessageEventState());
  const displayedErrorRef = useRef<string | null>(null);

  const handleEvent = useCallback((event: AgentRuntimeEvent) => {
    if (!mountedRef.current) return;
    if (event.type === "tool_called") recordAgentToolCalled(event.call, activityStorageKey);
    if (event.type === "tool_completed") recordAgentToolCompleted(event.call, activityStorageKey);
    if (event.type === "tool_failed") recordAgentToolFailed(event.call, event.error, activityStorageKey);

    setMessages((previous) => {
      const projected = projectionRef.current.apply(previous, event);
      if (projected.abortReason && abortRef.current && !abortRef.current.signal.aborted) {
        queueMicrotask(() => abortRef.current?.abort(projected.abortReason));
      }
      if (projected.displayedError) displayedErrorRef.current = projected.displayedError;
      return projected.messages;
    });
  }, [activityStorageKey, setMessages]);

  const sendMessage = useCallback(async (
    input: Omit<StyloRunInput, "projectId" | "sessionId">
  ): Promise<StyloRunResult> => {
    if (abortRef.current) throw new Error("Agent 已有正在执行的任务。");
    const controller = new AbortController();
    abortRef.current = controller;
    displayedErrorRef.current = null;
    const preflightId = createId("preflight");
    setMessages((previous) => projectionRef.current.createPreflight(previous, preflightId));
    setIsRunning(true);
    try {
      const result = await runtime.run(
        { ...input, projectId, sessionId },
        { signal: controller.signal, onEvent: handleEvent }
      );
      if (result.projectId !== projectId) {
        throw new Error(`Stylo 项目作用域失配：expected ${projectId}, received ${result.projectId || "missing"}。`);
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "Agent 请求失败。");
      if (displayedErrorRef.current === message && error instanceof Error) {
        (error as DisplayAwareError).styloAlreadyDisplayed = true;
      }
      if (projectionRef.current.preflightStatusId) {
        setMessages((previous) => projectionRef.current.failPreflight(previous, message));
      }
      browserAgentDebugError("useStyloAgentController runtime error", error);
      throw error;
    } finally {
      abortRef.current = null;
      setIsRunning(false);
      browserAgentDebug("useStyloAgentController settled", { projectId, sessionId });
    }
  }, [handleEvent, projectId, runtime, sessionId, setMessages]);

  const cancel = useCallback(() => abortRef.current?.abort("用户已停止当前 Agent 任务。"), []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort("Agent 视图已卸载。");
    };
  }, []);

  return { isRunning, sendMessage, cancel };
};
