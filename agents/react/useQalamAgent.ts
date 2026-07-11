import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, Message, StatusMessage, ToolMessage } from "../../node-workspace/components/qalam/types";
import { isToolMessage } from "../../node-workspace/components/qalam/types";
import { buildAssistantChatMessage } from "../adapters/qalamMessageAdapter";
import {
  recordAgentToolCalled,
  recordAgentToolCompleted,
  recordAgentToolFailed,
} from "../runtime/activity";
import type {
  AgentRuntimeEvent,
  QalamAgentRuntime,
  QalamRunInput,
  QalamRunResult,
} from "../runtime/types";
import { browserAgentDebug, browserAgentDebugError } from "../runtime/debug";

type Options = {
  runtime: QalamAgentRuntime;
  projectId: string;
  sessionId: string;
  activityStorageKey?: string;
  setMessages: (updater: Message[] | ((prev: Message[]) => Message[])) => void;
};

type DisplayAwareError = Error & {
  qalamAlreadyDisplayed?: boolean;
};

const isChatMessage = (message: Message): message is ChatMessage =>
  message.kind === "chat" || message.kind == null;

const summarizeEventForDebug = (event: AgentRuntimeEvent) => {
  if (event.type === "reasoning_delta" || event.type === "message_delta") {
    return {
      type: event.type,
      runId: event.runId,
      deltaChars: event.delta.length,
      accumulatedChars: event.accumulatedText.length,
    };
  }
  if (event.type === "reasoning_completed" || event.type === "message_completed") {
    return {
      type: event.type,
      runId: event.runId,
      textChars: event.text.length,
    };
  }
  if (event.type === "run_completed") {
    return {
      type: event.type,
      runId: event.runId,
      result: {
        sessionId: event.result.sessionId,
        finalTextChars: event.result.finalText.length,
        toolCalls: event.result.toolCalls.length,
      },
    };
  }
  if (event.type === "trace") {
    return {
      type: event.type,
      runId: event.runId,
      entry: {
        stage: event.entry.stage,
        status: event.entry.status,
        title: event.entry.title,
      },
    };
  }
  return event;
};

const upsertToolStatus = (messages: Message[], callId: string, status: "running" | "success" | "error", summary?: string) =>
  messages.map((message) => {
    if (message.kind !== "tool" || message.tool.callId !== callId) return message;
    return {
      ...message,
      tool: {
        ...message.tool,
        status,
        summary: summary ?? message.tool.summary,
      },
    };
  });

const upsertStatusMessage = (
  messages: Message[],
  statusId: string,
  updater: (current: StatusMessage | null) => StatusMessage
) => {
  const index = messages.findIndex((message) => message.kind === "status" && message.statusCard.id === statusId);
  const current = index >= 0 ? (messages[index] as StatusMessage) : null;
  const next = updater(current);
  if (index >= 0) {
    const clone = [...messages];
    clone[index] = next;
    return clone;
  }
  return [...messages, next];
};

const upsertStreamingAssistantMessage = (
  messages: Message[],
  runId: string,
  messageId: string | undefined,
  updater: (current: ChatMessage | null) => ChatMessage
) => {
  const index = messages.findIndex((message) => {
    if (message.role !== "assistant" || !isChatMessage(message) || message.meta?.runId !== runId) return false;
    return messageId ? message.meta?.messageId === messageId : !message.meta?.messageId;
  });
  const current = index >= 0 ? (messages[index] as ChatMessage) : null;
  const next = updater(current);
  if (index >= 0) {
    const clone = [...messages];
    clone[index] = next;
    return clone;
  }
  return [...messages, next];
};

const nextMessageOrder = (messages: Message[]) =>
  messages.reduce((max, message) => Math.max(max, message.order || 0), 0) + 1;

const humanizeToolName = (name: string) => {
  switch (name) {
    case "list_project_resources":
      return "查看项目目录";
    case "read_project_resource":
      return "查阅项目内容";
    case "search_project_resource":
      return "搜索项目内容";
    case "edit_script_resource":
      return "编辑 Flow 档案";
    case "operate_project_resource":
      return "操作 Flow";
    default:
      return name;
  }
};

const isAbortLikeError = (value: unknown) => {
  const message = String(value || "");
  return (
    message.includes("AbortError") ||
    message.includes("aborted") ||
    message.includes("已取消") ||
    message.includes("用户已停止")
  );
};

type StatusKind = "reasoning" | "response";

const messageStreamKey = (runId: string, messageId?: string) => `${runId}:${messageId || "default"}`;

const completeStatusMessage = (
  messages: Message[],
  statusId: string,
  status: "success" | "error",
  patch?: Partial<StatusMessage["statusCard"]>
) =>
  messages.map((message) => {
    if (message.kind !== "status" || message.statusCard.id !== statusId) return message;
    return {
      ...message,
      statusCard: {
        ...message.statusCard,
        ...patch,
        status,
        updatedAt: Date.now(),
      },
    };
  });

export const useQalamAgent = ({ runtime, projectId, sessionId, activityStorageKey, setMessages }: Options) => {
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const activeRunStartedAtRef = useRef<number | null>(null);
  const statusSequenceRef = useRef<Record<string, number>>({});
  const activeReasoningStatusIdRef = useRef<Record<string, string | undefined>>({});
  const activeResponseStatusIdRef = useRef<Record<string, string | undefined>>({});
  const preflightStatusIdRef = useRef<string | null>(null);
  const streamedMessageSeenRef = useRef<Record<string, boolean>>({});
  const toolFailureCountsRef = useRef<Record<string, Record<string, number>>>({});
  const runAbortMessageRef = useRef<Record<string, string | undefined>>({});
  const displayedRunFailureRef = useRef<Record<string, string>>({});
  const runTimelineBaseRef = useRef<Record<string, number>>({});

  const createStatusId = useCallback((runId: string, kind: StatusKind) => {
    const next = (statusSequenceRef.current[runId] || 0) + 1;
    statusSequenceRef.current[runId] = next;
    return `${runId}-${kind}-${next}`;
  }, []);

  const resolveEventOrder = useCallback((messages: Message[], event: AgentRuntimeEvent) => {
    const sequence = event.sequence;
    if (!event.runId || typeof sequence !== "number") return nextMessageOrder(messages);
    let base = runTimelineBaseRef.current[event.runId];
    if (typeof base !== "number") {
      base = nextMessageOrder(messages) - sequence;
      runTimelineBaseRef.current[event.runId] = base;
    }
    return base + sequence;
  }, []);

  const ensureActiveStatusId = useCallback(
    (runId: string, kind: StatusKind) => {
      const ref = kind === "reasoning" ? activeReasoningStatusIdRef.current : activeResponseStatusIdRef.current;
      if (ref[runId]) return ref[runId] as string;
      const statusId = createStatusId(runId, kind);
      ref[runId] = statusId;
      return statusId;
    },
    [createStatusId]
  );

  const finalizeActiveReasoningStatus = useCallback((messages: Message[], runId: string, status: "success" | "error") => {
    const statusId = activeReasoningStatusIdRef.current[runId];
    if (!statusId) return messages;
    activeReasoningStatusIdRef.current[runId] = undefined;
    return completeStatusMessage(messages, statusId, status);
  }, []);

  const finalizeActiveResponseStatus = useCallback(
    (messages: Message[], runId: string, status: "success" | "error", patch?: Partial<StatusMessage["statusCard"]>) => {
      const statusId = activeResponseStatusIdRef.current[runId];
      if (!statusId) return messages;
      activeResponseStatusIdRef.current[runId] = undefined;
      return completeStatusMessage(messages, statusId, status, patch);
    },
    []
  );

  const finalizeDanglingToolCalls = useCallback((messages: Message[], runId: string, error: string) => {
    const existingResults = new Set(
      messages
        .filter(
          (message): message is ToolMessage =>
            isToolMessage(message) && message.kind === "tool_result" && message.tool.runId === runId
        )
        .map((message) => message.tool.callId)
        .filter(Boolean)
    );

    const pendingTools = messages.filter(
      (message): message is ToolMessage =>
        isToolMessage(message) &&
        message.kind === "tool" &&
        message.tool.runId === runId &&
        message.tool.status === "running" &&
        Boolean(message.tool.callId)
    );

    if (!pendingTools.length) return messages;

    const next = messages.map((message) => {
      if (!isToolMessage(message) || message.kind !== "tool" || message.tool.runId !== runId || message.tool.status !== "running") return message;
      return {
        ...message,
        tool: {
          ...message.tool,
          status: "error" as const,
          summary: error,
        },
      };
    });

    let order = nextMessageOrder(next);
    const syntheticResults: Message[] = pendingTools
      .filter((message) => message.tool.callId && !existingResults.has(message.tool.callId))
      .map((message) => ({
        role: "assistant" as const,
        kind: "tool_result" as const,
        order: order++,
        tool: {
          callId: message.tool.callId,
          runId,
          name: message.tool.name,
          status: "error" as const,
          summary: error,
        },
      }));

    return syntheticResults.length ? [...next, ...syntheticResults] : next;
  }, []);

  const handleEvent = useCallback(
    (event: AgentRuntimeEvent) => {
      browserAgentDebug("useQalamAgent event", summarizeEventForDebug(event));
      if (event.type === "run_started") {
        activeRunIdRef.current = event.runId;
        activeRunStartedAtRef.current = Date.now();
        toolFailureCountsRef.current[event.runId] = {};
        runAbortMessageRef.current[event.runId] = undefined;
        const statusId = ensureActiveStatusId(event.runId, "reasoning");
        const preflightStatusId = preflightStatusIdRef.current;
        preflightStatusIdRef.current = null;
        setMessages((prev) => {
          const withPreflight = preflightStatusId
            ? upsertStatusMessage(prev, preflightStatusId, (current) => ({
                  role: "assistant",
                  kind: "status",
                  order: current?.order || resolveEventOrder(prev, event),
                  statusCard: {
                    id: preflightStatusId,
                    runId: event.runId,
                    status: "success",
                    headline: "Agent 已启动",
                    detail: "Edge 已受理请求，正在初始化模型会话。",
                    summary: current?.statusCard.summary,
                    steps: current?.statusCard.steps || [],
                    startedAt: current?.statusCard.startedAt || Date.now(),
                    updatedAt: Date.now(),
                    isThinking: false,
                  },
                }))
            : prev;
          return upsertStatusMessage(
            withPreflight,
            statusId,
            (current) => ({
              role: "assistant",
              kind: "status",
              order: current?.order || resolveEventOrder(withPreflight, event),
              statusCard: {
                id: statusId,
                runId: event.runId,
                status: current?.statusCard.status || "running",
                headline: "准备中",
                detail: "正在建立本轮 Agent 执行上下文。",
                summary: current?.statusCard.summary,
                steps: current?.statusCard.steps || [],
                startedAt: current?.statusCard.startedAt || Date.now(),
                updatedAt: Date.now(),
                isThinking: true,
              },
            })
          );
        });
        return;
      }

      if (event.type === "trace") {
        if (!activeRunIdRef.current && preflightStatusIdRef.current) {
          const statusId = preflightStatusIdRef.current;
          const status = event.entry.status === "error" ? "error" : "running";
          setMessages((prev) =>
            upsertStatusMessage(prev, statusId, (current) => ({
              role: "assistant",
              kind: "status",
              order: current?.order || resolveEventOrder(prev, event),
              statusCard: {
                id: statusId,
                runId: event.runId,
                status,
                headline: "连接 Agent",
                detail: event.entry.detail || event.entry.title,
                summary: event.entry.title,
                steps: current?.statusCard.steps || [],
                startedAt: current?.statusCard.startedAt || Date.now(),
                updatedAt: Date.now(),
                isThinking: true,
              },
            }))
          );
        }
        return;
      }

      if (event.type === "reasoning_delta") {
        const statusId = ensureActiveStatusId(event.runId, "reasoning");
        setMessages((prev) =>
          upsertStatusMessage(prev, statusId, (current) => ({
            role: "assistant",
            kind: "status",
            order: current?.order || resolveEventOrder(prev, event),
            statusCard: {
              id: statusId,
              runId: event.runId,
              status: current?.statusCard.status || "running",
              headline: "思考",
              detail: "模型正在分析并规划下一步。",
              summary: event.accumulatedText,
              steps: [],
              startedAt: current?.statusCard.startedAt || Date.now(),
              updatedAt: Date.now(),
              isThinking: true,
            },
          }))
        );
        return;
      }

      if (event.type === "reasoning_completed") {
        const statusId = ensureActiveStatusId(event.runId, "reasoning");
        setMessages((prev) =>
          upsertStatusMessage(prev, statusId, (current) => ({
            role: "assistant",
            kind: "status",
            order: current?.order || resolveEventOrder(prev, event),
            statusCard: {
              id: statusId,
              runId: event.runId,
              status: "success",
              headline: "思考",
              detail: "模型已完成这一段思考。",
              summary: event.text,
              steps: [],
              startedAt: current?.statusCard.startedAt || Date.now(),
              updatedAt: Date.now(),
              isThinking: true,
            },
          }))
        );
        activeReasoningStatusIdRef.current[event.runId] = undefined;
        return;
      }

      if (event.type === "message_delta") {
        streamedMessageSeenRef.current[messageStreamKey(event.runId, event.messageId)] = true;
        const responseStatusId = ensureActiveStatusId(event.runId, "response");
        setMessages((prev) => {
          const withResponseStatus = upsertStatusMessage(
            prev,
            responseStatusId,
            (current) => ({
              role: "assistant",
              kind: "status",
              order: current?.order || resolveEventOrder(prev, event),
              statusCard: {
                id: responseStatusId,
                runId: event.runId,
                status: current?.statusCard.status || "running",
                headline: "生成内容",
                detail: "模型正在持续输出本轮内容。",
                summary: undefined,
                steps: [],
                startedAt: current?.statusCard.startedAt || Date.now(),
                updatedAt: Date.now(),
                isThinking: false,
              },
            })
          );
          return upsertStreamingAssistantMessage(withResponseStatus, event.runId, event.messageId, (current) => ({
            role: "assistant",
            kind: "chat",
            order: current?.order || resolveEventOrder(withResponseStatus, event),
            text: event.accumulatedText,
            meta: {
              ...current?.meta,
              runId: event.runId,
              messageId: event.messageId,
              isStreaming: true,
            },
          }));
        });
        setMessages((prev) => finalizeActiveReasoningStatus(prev, event.runId, "success"));
        return;
      }

      if (event.type === "tool_called") {
        recordAgentToolCalled(event.call, activityStorageKey);
        const actionLabel = humanizeToolName(event.call.name);
        const runId = event.runId;
        setMessages((prev) => {
          const withReasoningCompleted = runId ? finalizeActiveReasoningStatus(prev, runId, "success") : prev;
          return [
            ...withReasoningCompleted,
            {
              role: "assistant",
              kind: "tool",
              order: resolveEventOrder(withReasoningCompleted, event),
              tool: {
                callId: event.call.callId,
                runId: runId || undefined,
                name: event.call.name,
                status: "running",
                summary: event.call.summary || actionLabel,
              },
            },
          ];
        });
        return;
      }

      if (event.type === "tool_completed") {
        recordAgentToolCompleted(event.call, activityStorageKey);
        const runId = event.runId;
        setMessages((prev) => [
          ...upsertToolStatus(prev, event.call.callId, "success", event.call.summary),
          {
            role: "assistant",
            kind: "tool_result",
            order: resolveEventOrder(prev, event),
            tool: {
              callId: event.call.callId,
              runId: runId || undefined,
              name: event.call.name,
              status: "success",
              summary: event.call.summary,
              output: typeof event.call.output === "string" ? event.call.output : JSON.stringify(event.call.output || {}),
            },
          },
        ]);
        return;
      }

      if (event.type === "tool_failed") {
        recordAgentToolFailed(event.call, event.error, activityStorageKey);
        const runId = event.runId;
        if (runId) {
          const currentFailures = toolFailureCountsRef.current[runId] || {};
          const nextFailures = (currentFailures[event.call.name] || 0) + 1;
          toolFailureCountsRef.current[runId] = {
            ...currentFailures,
            [event.call.name]: nextFailures,
          };
          if (nextFailures >= 5 && abortRef.current && !abortRef.current.signal.aborted) {
            runAbortMessageRef.current[runId] = `${event.call.name} 在本轮中已连续失败 ${nextFailures} 次，任务已停止。请修正工具链逻辑后再继续。`;
            abortRef.current.abort();
          }
        }
        setMessages((prev) => [
          ...upsertToolStatus(prev, event.call.callId, "error", event.error),
          {
            role: "assistant",
            kind: "tool_result",
            order: resolveEventOrder(prev, event),
            tool: {
              callId: event.call.callId,
              runId: runId || undefined,
              name: event.call.name,
              status: "error",
              summary: event.error,
            },
          },
        ]);
        return;
      }

      if (event.type === "message_completed") {
        const built = buildAssistantChatMessage(event.text);
        const streamKey = messageStreamKey(event.runId, event.messageId);
        const hasStreamedDelta = streamedMessageSeenRef.current[streamKey];
        setMessages((prev) => {
          const withStreamedAnswer = hasStreamedDelta
            ? upsertStreamingAssistantMessage(prev, event.runId, event.messageId, (current) => {
                return current
                  ? {
                      ...current,
                      order: current.order || resolveEventOrder(prev, event),
                      text: event.text || current.text,
                      meta: {
                        ...current.meta,
                        runId: event.runId,
                        messageId: event.messageId,
                        isStreaming: false,
                        isFinal: event.isFinal,
                        planItems: built.meta?.planItems,
                      },
                    }
                  : {
                      ...built,
                      order: resolveEventOrder(prev, event),
                      meta: {
                        ...built.meta,
                        runId: event.runId,
                        messageId: event.messageId,
                        isStreaming: false,
                        isFinal: event.isFinal,
                      },
                    };
              })
            : upsertStreamingAssistantMessage(prev, event.runId, event.messageId, (current) => ({
                role: "assistant",
                kind: "chat",
                order: current?.order || resolveEventOrder(prev, event),
                text: built.text || event.text,
                meta: {
                  ...current?.meta,
                  runId: event.runId,
                  messageId: event.messageId,
                  isStreaming: false,
                  isFinal: event.isFinal,
                  planItems: built.meta?.planItems,
                },
              }));
          return finalizeActiveResponseStatus(withStreamedAnswer, event.runId, "success", {
            headline: event.isFinal ? "最终回答已完成" : "本轮内容已生成",
            detail: event.isFinal ? "Agent 已完成本次任务。" : "Agent 将继续处理后续工具或推理步骤。",
          });
        });
        delete streamedMessageSeenRef.current[streamKey];
        return;
      }

      if (event.type === "run_completed") {
        browserAgentDebug("useQalamAgent run completed", {
          sessionId: event.result.sessionId,
          finalTextChars: event.result.finalText.length,
          toolCalls: event.result.toolCalls.length,
        });
        activeRunIdRef.current = null;
        activeRunStartedAtRef.current = null;
        preflightStatusIdRef.current = null;
        delete activeReasoningStatusIdRef.current[event.runId];
        delete activeResponseStatusIdRef.current[event.runId];
        delete statusSequenceRef.current[event.runId];
        Object.keys(streamedMessageSeenRef.current)
          .filter((key) => key.startsWith(`${event.runId}:`))
          .forEach((key) => delete streamedMessageSeenRef.current[key]);
        delete toolFailureCountsRef.current[event.runId];
        delete runAbortMessageRef.current[event.runId];
        delete displayedRunFailureRef.current[event.runId];
        delete runTimelineBaseRef.current[event.runId];
        return;
      }

      if (event.type === "run_failed") {
        browserAgentDebugError("useQalamAgent run failed", event.error);
        activeRunStartedAtRef.current = null;
        const forcedAbortMessage = runAbortMessageRef.current[event.runId];
        const finalError = forcedAbortMessage || event.error;
        const aborted = !forcedAbortMessage && isAbortLikeError(event.error);
        displayedRunFailureRef.current[event.runId] = finalError;
        setMessages((prev) => {
          let withStatus = finalizeDanglingToolCalls(prev, event.runId, finalError);
          withStatus = finalizeActiveReasoningStatus(withStatus, event.runId, "error");
          withStatus = finalizeActiveResponseStatus(withStatus, event.runId, "error", {
            headline: aborted ? "已停止" : "回复中断",
            detail: aborted ? "当前任务已由你手动停止。" : finalError,
          });
          delete activeReasoningStatusIdRef.current[event.runId];
          delete activeResponseStatusIdRef.current[event.runId];
          delete statusSequenceRef.current[event.runId];
          Object.keys(streamedMessageSeenRef.current)
            .filter((key) => key.startsWith(`${event.runId}:`))
            .forEach((key) => delete streamedMessageSeenRef.current[key]);
          delete toolFailureCountsRef.current[event.runId];
          delete runAbortMessageRef.current[event.runId];
          delete runTimelineBaseRef.current[event.runId];
          if (aborted) {
            return withStatus;
          }
          return [
            ...withStatus,
            {
              role: "assistant",
              kind: "chat",
              order: nextMessageOrder(withStatus),
              text: `请求失败: ${finalError}`,
            },
          ];
        });
      }
    },
    [activityStorageKey, createStatusId, ensureActiveStatusId, finalizeActiveReasoningStatus, finalizeActiveResponseStatus, finalizeDanglingToolCalls, resolveEventOrder, setMessages]
  );

  const sendMessage = useCallback(
    async (input: Omit<QalamRunInput, "projectId" | "sessionId">): Promise<QalamRunResult> => {
      browserAgentDebug("useQalamAgent sendMessage", {
        projectId,
        sessionId,
        userText: input.userText,
        attachments: input.attachments?.length || 0,
        enabledSkillIds: input.enabledSkillIds || [],
      });
      const controller = new AbortController();
      abortRef.current = controller;
      const preflightStatusId = `preflight-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      preflightStatusIdRef.current = preflightStatusId;
      setMessages((prev) =>
        upsertStatusMessage(prev, preflightStatusId, (current) => ({
          role: "assistant",
          kind: "status",
          order: current?.order || nextMessageOrder(prev),
          statusCard: {
            id: preflightStatusId,
            runId: preflightStatusId,
            status: "running",
            headline: "连接 Agent",
            detail: "请求已提交，正在连接 Edge runtime。",
            summary: undefined,
            steps: current?.statusCard.steps || [],
            startedAt: current?.statusCard.startedAt || Date.now(),
            updatedAt: Date.now(),
            isThinking: true,
          },
        }))
      );
      setIsRunning(true);
      try {
        const result = await runtime.run(
          {
            ...input,
            projectId,
            sessionId,
          },
          {
            signal: controller.signal,
            onEvent: handleEvent,
          }
        );
        browserAgentDebug("useQalamAgent runtime result", {
          sessionId: result.sessionId,
          finalTextChars: result.finalText.length,
          toolCalls: result.toolCalls.length,
          outputItems: result.outputItems.length,
          usage: result.usage,
        });
        if (result.projectId !== projectId) {
          throw new Error(
            `Qalam 项目作用域失配：expected ${projectId}, received ${result.projectId || "missing"}。`
          );
        }
        return result;
      } catch (error: any) {
        const activeRunId = activeRunIdRef.current;
        const displayedError = activeRunId ? displayedRunFailureRef.current[activeRunId] : undefined;
        if (displayedError && String(error?.message || error || "") === displayedError) {
          (error as DisplayAwareError).qalamAlreadyDisplayed = true;
        }
        if (preflightStatusIdRef.current) {
          const statusId = preflightStatusIdRef.current;
          preflightStatusIdRef.current = null;
          setMessages((prev) =>
            upsertStatusMessage(prev, statusId, (current) => ({
              role: "assistant",
              kind: "status",
              order: current?.order || nextMessageOrder(prev),
              statusCard: {
                id: statusId,
                runId: statusId,
                status: "error",
                headline: "连接失败",
                detail: String(error?.message || error || "Agent 请求失败。"),
                summary: current?.statusCard.summary,
                steps: current?.statusCard.steps || [],
                startedAt: current?.statusCard.startedAt || Date.now(),
                updatedAt: Date.now(),
                isThinking: false,
              },
            }))
          );
        }
        browserAgentDebugError("useQalamAgent runtime error", error);
        throw error;
      } finally {
        abortRef.current = null;
        activeRunIdRef.current = null;
        activeRunStartedAtRef.current = null;
        preflightStatusIdRef.current = null;
        setIsRunning(false);
      }
    },
    [handleEvent, projectId, runtime, sessionId]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  return { isRunning, sendMessage, cancel };
};
