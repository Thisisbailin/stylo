import {
  Agent,
  InputGuardrailTripwireTriggered,
  OutputGuardrailTripwireTriggered,
  OpenAIProvider,
  Runner,
  ToolInputGuardrailTripwireTriggered,
  ToolOutputGuardrailTripwireTriggered,
  setDefaultOpenAIClient,
  setOpenAIAPI,
  type Session,
} from "@openai/agents";
import OpenAI from "openai";
import type { QalamAgentBridge } from "../bridge/qalamBridge";
import { createQalamTools } from "../tools";
import { installDeepSeekChatCompletionsCompatibility } from "./deepseekCompat";
import { buildAgentEnvironment } from "./environment";
import { createQalamInputGuardrails, createQalamOutputGuardrails } from "./guardrails";
import { composeAgentInstructions } from "./instructions";
import { buildAgentMemorySnapshot, buildRunInputItems } from "./memory";
import { formatModelAccessError, isModelAccessError, type QalamAgentApiMode, type QalamAgentProvider } from "./providerConfig";
import { createQalamToolBudgetPolicy } from "./toolBudget";
import type {
  AgentExecutedToolCall,
  AgentRuntimeEvent,
  AgentTraceEntry,
  AgentTraceStage,
  AgentTraceStatus,
  AgentSessionMessage,
  QalamAgentConfig,
  QalamRunContext,
  QalamRunInput,
  QalamRunResult,
  QalamResolvedSkill,
} from "./types";

const SUCCESSFUL_ACTION_TOOL_NAMES = new Set([
  "create_document",
  "update_document",
  "connect_flow_nodes",
  "move_flow_node",
  "operate_project_resource",
  "prepare_generation_execution",
  "cancel_generation_execution",
]);

const createTraceEntry = (
  stage: AgentTraceStage,
  status: AgentTraceStatus,
  title: string,
  detail?: string,
  payload?: string
): AgentTraceEntry => ({
  id: `${stage}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  at: Date.now(),
  stage,
  status,
  title,
  detail,
  payload,
});

const extractTextFromResponseOutput = (output: unknown): string => {
  if (!output) return "";
  if (typeof output === "string") return output.trim();
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    if ((item as any).type === "message" && Array.isArray((item as any).content)) {
      for (const content of (item as any).content) {
        if (content?.type === "output_text" && typeof content.text === "string") {
          parts.push(content.text);
        }
      }
    }
    if ((item as any).type === "output_text" && typeof (item as any).text === "string") {
      parts.push((item as any).text);
    }
  }
  return parts.join("\n").trim();
};

const extractReasoningSummaryFromResponseOutput = (output: unknown): string => {
  if (!output || !Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const itemType = (item as any).type;
    if (
      (itemType === "reasoning" || itemType === "reasoning_summary" || itemType === "summary_text") &&
      typeof (item as any).text === "string"
    ) {
      parts.push((item as any).text);
    }
    if (Array.isArray((item as any).summary)) {
      for (const summaryItem of (item as any).summary) {
        if (typeof summaryItem?.text === "string") parts.push(summaryItem.text);
      }
    }
    if (Array.isArray((item as any).content)) {
      for (const content of (item as any).content) {
        if (
          (content?.type === "reasoning_summary_text" ||
            content?.type === "reasoning_text" ||
            content?.type === "summary_text") &&
          typeof content.text === "string"
        ) {
          parts.push(content.text);
        }
      }
    }
  }
  return parts.join("\n").trim();
};

const responseHasToolCalls = (output: unknown) =>
  Array.isArray(output) && output.some((item) => item && typeof item === "object" && (item as any).type === "function_call");

const unwrapProviderEvent = (data: any) => {
  if (data && typeof data === "object" && data.event && typeof data.event === "object") {
    return data.event;
  }
  if (data && typeof data === "object" && data.providerData && typeof data.providerData === "object") {
    return data.providerData;
  }
  return data;
};

const summarizeSuccessfulToolCalls = (toolCalls: AgentExecutedToolCall[]) => {
  const successfulCalls = toolCalls.filter((toolCall) => toolCall.status === "success" && toolCall.summary?.trim());
  if (!successfulCalls.length) return "";
  const prioritizedCalls = successfulCalls.filter((toolCall) => SUCCESSFUL_ACTION_TOOL_NAMES.has(toolCall.name));
  const source = prioritizedCalls.length ? prioritizedCalls : successfulCalls;
  const uniqueSummaries = Array.from(
    new Map(source.map((toolCall) => [toolCall.summary!.trim(), toolCall.summary!.trim()])).values()
  );
  return uniqueSummaries.slice(-3).join("\n");
};

const clipPayload = (value: unknown, limit = 12000) => {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return text.length <= limit ? text : `${text.slice(0, limit)}\n... [truncated]`;
  } catch {
    const text = String(value);
    return text.length <= limit ? text : `${text.slice(0, limit)}\n... [truncated]`;
  }
};

const instrumentOpenAIResponsesClient = (
  client: OpenAI,
  hooks: {
    emitTrace: (stage: AgentTraceStage, status: AgentTraceStatus, title: string, detail?: string, payload?: string) => void;
    debug?: (label: string, payload?: unknown) => void;
  }
) => {
  const responsesApi = client.responses as OpenAI["responses"] & {
    create: (...args: any[]) => Promise<any>;
  };
  const originalCreate = responsesApi.create.bind(responsesApi);
  responsesApi.create = (async (...args: any[]) => {
    const [request, options] = args;
    hooks.debug?.("responses.create request", request);
    hooks.emitTrace(
      "model",
      "info",
      "responses.create request",
      `model=${request?.model || "unknown"} · tools=${Array.isArray(request?.tools) ? request.tools.length : 0} · stream=${Boolean(request?.stream)}`,
      clipPayload({
        model: request?.model,
        instructions: request?.instructions,
        input: request?.input,
        tools: request?.tools,
        tool_choice: request?.tool_choice,
        parallel_tool_calls: request?.parallel_tool_calls,
        previous_response_id: request?.previous_response_id,
        conversation: request?.conversation,
      })
    );
    if (options) hooks.debug?.("responses.create options", options);
    try {
      const response = await originalCreate(...args);
      hooks.debug?.("responses.create response", {
        hasWithResponse: typeof response?.withResponse === "function",
        hasAsyncIterator: typeof response?.[Symbol.asyncIterator] === "function",
      });
      return response;
    } catch (error: any) {
      hooks.emitTrace(
        "result",
        "error",
        "responses.create failed",
        error?.message || "unknown error",
        clipPayload({
          message: error?.message,
          status: error?.status,
          code: error?.code,
          type: error?.type,
          cause: error?.cause,
          error: error?.error,
        })
      );
      throw error;
    }
  }) as typeof responsesApi.create;
};

type ResolvedRuntimeConfig = Pick<QalamAgentConfig, "defaultHeaders" | "qalamTools"> & {
  provider: QalamAgentProvider;
  apiMode?: QalamAgentApiMode;
  model: string;
  apiKey: string;
  baseUrl: string;
};

type RunQalamAgentCoreOptions = {
  input: QalamRunInput;
  config: ResolvedRuntimeConfig;
  bridge: QalamAgentBridge;
  session: Session;
  sessionMessages: AgentSessionMessage[];
  runtimeMode: QalamRunContext["runtimeMode"];
  runtimeLabel: string;
  workflowName: string;
  enabledSkills: QalamResolvedSkill[];
  disabledTools?: string[];
  maxTurns?: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentRuntimeEvent) => void;
  onDebug?: (label: string, payload?: unknown) => void;
  getExtraResult?: () => Partial<QalamRunResult>;
  runStartedMeta?: Pick<Extract<AgentRuntimeEvent, { type: "run_started" }>, "traceId" | "tracingEnabled">;
  recoverFallbackOnAnyError?: boolean;
  traceId?: string;
  groupId?: string;
  traceMetadata?: Record<string, string>;
  tracingDisabled?: boolean;
  traceIncludeSensitiveData?: boolean;
};

export const runQalamAgentCore = async ({
  input,
  config,
  bridge,
  session,
  sessionMessages,
  runtimeMode,
  runtimeLabel,
  workflowName,
  enabledSkills,
  disabledTools = [],
  maxTurns = 50,
  signal,
  onEvent,
  onDebug,
  getExtraResult,
  runStartedMeta,
  recoverFallbackOnAnyError = false,
  traceId,
  groupId,
  traceMetadata,
  tracingDisabled,
  traceIncludeSensitiveData,
}: RunQalamAgentCoreOptions): Promise<QalamRunResult> => {
  const runId = `${runtimeMode === "edge_full" ? "edge-run" : "run"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let runtimeEventSequence = 0;
  const emitRuntimeEvent = (event: AgentRuntimeEvent) => {
    runtimeEventSequence += 1;
    onEvent?.({ ...event, sequence: runtimeEventSequence } as AgentRuntimeEvent);
  };
  const emitTrace = (
    stage: AgentTraceStage,
    status: AgentTraceStatus,
    title: string,
    detail?: string,
    payload?: string
  ) => {
    emitRuntimeEvent({
      type: "trace",
      runId,
      entry: createTraceEntry(stage, status, title, detail, payload),
    });
  };

  if (input.attachments?.length) {
    const message = "新的 Agent runtime 暂不支持图片附件，请先移除附件后再发送。";
    emitRuntimeEvent({ type: "run_failed", runId, error: message });
    throw new Error(message);
  }

  onDebug?.("run input", {
    projectId: input.projectId,
    sessionId: input.sessionId,
    userText: input.userText,
    enabledSkillIds: input.enabledSkillIds || [],
    attachments: input.attachments?.length || 0,
  });

  emitRuntimeEvent({
    type: "run_started",
    sessionId: input.sessionId,
    runId,
    traceId: runStartedMeta?.traceId,
    tracingEnabled: runStartedMeta?.tracingEnabled,
  });
  emitTrace("runtime", "running", "Run started", `session=${input.sessionId}`);

  const apiMode = config.apiMode || "responses";
  setOpenAIAPI(apiMode);
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    defaultHeaders: config.defaultHeaders,
    dangerouslyAllowBrowser: runtimeMode === "browser",
  });
  if (config.provider === "deepseek" && apiMode === "chat_completions") {
    installDeepSeekChatCompletionsCompatibility(client);
  }
  if (apiMode === "responses") {
    instrumentOpenAIResponsesClient(client, {
      emitTrace,
      debug: onDebug,
    });
  }
  setDefaultOpenAIClient(client);

  const toolEvents: AgentExecutedToolCall[] = [];
  const toolBudget = createQalamToolBudgetPolicy();
  let streamedTextDelta = "";
  let streamedResponseText = "";
  let streamedReasoningText = "";
  let activeReasoningText = "";
  let textSegmentIndex = 0;
  let activeMessageId = "";
  let activeMessageText = "";
  const completedMessages: Array<{ messageId: string; text: string; isFinal: boolean }> = [];

  const ensureActiveMessageId = () => {
    if (!activeMessageId) {
      textSegmentIndex += 1;
      activeMessageId = `${runId}-message-${textSegmentIndex}`;
      activeMessageText = "";
    }
    return activeMessageId;
  };

  const selectCompletedSegmentText = (streamedText: string, completedText?: string) => {
    const candidate = completedText || "";
    if (!candidate) return streamedText;
    if (!streamedText) return candidate;
    if (candidate.includes(streamedText)) return candidate;
    if (streamedText.includes(candidate)) return streamedText;
    return `${streamedText.trimEnd()}\n\n${candidate.trimStart()}`;
  };

  const emitMessageDelta = (delta: string) => {
    if (!delta) return;
    const messageId = ensureActiveMessageId();
    activeMessageText += delta;
    streamedTextDelta += delta;
    emitRuntimeEvent({
      type: "message_delta",
      runId,
      messageId,
      delta,
      accumulatedText: activeMessageText,
    });
  };

  const completeActiveReasoning = (completedText?: string) => {
    const text = selectCompletedSegmentText(activeReasoningText, completedText);
    if (!text.trim()) return;
    activeReasoningText = "";
    emitRuntimeEvent({ type: "reasoning_completed", runId, text });
  };

  const completeActiveMessage = (completedText?: string, options?: { isFinal?: boolean }) => {
    const hasText = Boolean(activeMessageText.trim() || completedText?.trim());
    if (!hasText) return;
    const messageId = ensureActiveMessageId();
    activeMessageText = selectCompletedSegmentText(activeMessageText, completedText);
    const isFinal = options?.isFinal === true;
    completedMessages.push({ messageId, text: activeMessageText, isFinal });
    emitRuntimeEvent({
      type: "message_completed",
      runId,
      messageId,
      text: activeMessageText,
      isFinal,
    });
    activeMessageId = "";
    activeMessageText = "";
  };

  const textAlreadyRepresented = (text: string) => {
    const normalized = text.trim();
    if (!normalized) return true;
    return completedMessages.some((completed) => {
      const item = completed.text.trim();
      return item === normalized || item.includes(normalized);
    });
  };

  const markCompletedMessageFinal = (text: string) => {
    const normalized = text.trim();
    const completed = completedMessages.find((item) => {
      const itemText = item.text.trim();
      return itemText === normalized || itemText.includes(normalized);
    });
    if (!completed || completed.isFinal) return false;
    completed.isFinal = true;
    emitRuntimeEvent({
      type: "message_completed",
      runId,
      messageId: completed.messageId,
      text: completed.text,
      isFinal: true,
    });
    return true;
  };

  const emitToolEvent = (
    event:
      | { type: "tool_called"; call: AgentExecutedToolCall }
      | { type: "tool_completed"; call: AgentExecutedToolCall }
      | { type: "tool_failed"; call: AgentExecutedToolCall; error: string }
  ) => {
    if (event.type === "tool_called") {
      toolEvents.push(event.call);
    }
    if (event.type === "tool_completed" || event.type === "tool_failed") {
      const index = toolEvents.findIndex((toolCall) => toolCall.callId === event.call.callId);
      if (index >= 0) toolEvents[index] = event.call;
      else toolEvents.push(event.call);
    }
    emitRuntimeEvent({ ...event, runId } as AgentRuntimeEvent);
  };

  const tools = createQalamTools({
    bridge,
    emitEvent: emitToolEvent,
    disabledTools,
    toolBudget,
  });
  const agentMemory = buildAgentMemorySnapshot(sessionMessages);
  const initialToolBudgetSnapshot = toolBudget.snapshot();
  const runContext: QalamRunContext = {
    runtimeMode,
    agentEnvironment: buildAgentEnvironment({
      projectData: bridge.getProjectData(),
      nodeFlowSnapshot: bridge.getNodeFlowSnapshot(),
      executionApprovals: bridge.getPendingNodeFlowExecutionApprovals(),
      runtimeMode,
      enabledTools: tools.map((tool) => tool.name),
      sessionMessages,
    }),
    agentMemory,
    toolBudget: {
      totalCalls: initialToolBudgetSnapshot.totalCalls,
      lookupCalls: initialToolBudgetSnapshot.lookupCalls,
      mutationCalls: initialToolBudgetSnapshot.mutationCalls,
      fullReadCalls: initialToolBudgetSnapshot.fullReadCalls,
      limits: {
        totalCalls: initialToolBudgetSnapshot.limits.totalCalls,
        lookupCalls: initialToolBudgetSnapshot.limits.lookupCalls,
        mutationCalls: initialToolBudgetSnapshot.limits.mutationCalls,
        fullReadCalls: initialToolBudgetSnapshot.limits.fullReadCalls,
      },
    },
    uiContext: input.uiContext,
  };
  const runInputItems = buildRunInputItems(input);
  const resolvedToolChoice = tools.length > 0 ? "auto" : "none";

  emitTrace("runtime", "info", "Config resolved", `${config.provider} · ${config.model}`, config.baseUrl);
  emitTrace("session", "info", "Session attached", `id=${input.sessionId} · items=${sessionMessages.length}`);
  emitTrace(
    "tool",
    "info",
    "Tools prepared",
    `${tools.length} tools enabled`,
    JSON.stringify({
      tools: tools.map((tool) => tool.name),
      budget: initialToolBudgetSnapshot.limits,
    }, null, 2)
  );

  const agent = new Agent<QalamRunContext>({
    name: runtimeLabel,
    instructions: composeAgentInstructions({
      enabledSkills,
    }),
    handoffDescription: "Single all-purpose Qalam creative agent.",
    model: config.model,
    modelSettings: {
      toolChoice: resolvedToolChoice,
      parallelToolCalls: false,
      ...(config.provider === "deepseek"
        ? {
            reasoning: { effort: "high" },
            providerData: {
              thinking: { type: "enabled" },
              reasoning_effort: "high",
            },
          }
        : {}),
    },
    inputGuardrails: createQalamInputGuardrails(),
    outputGuardrails: createQalamOutputGuardrails(),
    resetToolChoice: true,
    tools,
  });

  emitTrace(
    "model",
    "running",
    "Agent run started",
    `model=${config.model} · sessionMemory=${sessionMessages.length}`,
    JSON.stringify({
      runtimeMode,
      enabledTools: tools.map((tool) => tool.name),
      skills: enabledSkills.map((skill) => skill.id),
    }, null, 2)
  );

  try {
    const runner = new Runner({
      modelProvider: new OpenAIProvider({
        openAIClient: client,
        useResponses: apiMode === "responses",
      }),
      tracingDisabled: tracingDisabled ?? true,
      traceIncludeSensitiveData: traceIncludeSensitiveData ?? false,
      workflowName,
      traceId,
      groupId,
      traceMetadata,
    });
    const result = await runner.run(agent, runInputItems, {
      signal,
      maxTurns,
      session,
      context: runContext,
      stream: true,
    });

    const streamReader = (result.toStream() as any).getReader();
    try {
      while (true) {
        const { done, value } = await streamReader.read();
        if (done) break;
        if (!value) continue;
        if (value.type !== "raw_model_stream_event") continue;
        const rawData = (value as any).data;
        const providerEvent = unwrapProviderEvent(rawData);
        const rawType = rawData?.type || providerEvent?.type;
        const chatDelta = Array.isArray(providerEvent?.choices) ? providerEvent.choices[0]?.delta : null;
        const chatReasoningDelta =
          typeof chatDelta?.reasoning_content === "string"
            ? chatDelta.reasoning_content
            : typeof chatDelta?.reasoning === "string"
              ? chatDelta.reasoning
              : "";
        if (chatReasoningDelta) {
          activeReasoningText += chatReasoningDelta;
          streamedReasoningText += chatReasoningDelta;
          emitRuntimeEvent({
            type: "reasoning_delta",
            runId,
            delta: chatReasoningDelta,
            accumulatedText: activeReasoningText,
          });
        }
        if (rawType === "output_text_delta" && typeof rawData?.delta === "string") {
          emitMessageDelta(rawData.delta);
        }
        const reasoningDelta = typeof rawData?.delta === "string" ? rawData.delta : typeof providerEvent?.delta === "string" ? providerEvent.delta : "";
        if (
          (rawType === "response.reasoning_summary_text.delta" || rawType === "reasoning_summary_text.delta") &&
          reasoningDelta
        ) {
          activeReasoningText += reasoningDelta;
          streamedReasoningText += reasoningDelta;
          emitRuntimeEvent({
            type: "reasoning_delta",
            runId,
            delta: reasoningDelta,
            accumulatedText: activeReasoningText,
          });
        }
        if (
          (rawType === "response.reasoning_summary_text.done" || rawType === "reasoning_summary_text.done") &&
          typeof rawData?.text === "string"
        ) {
          completeActiveReasoning(rawData.text);
        }
        if (rawType === "response_done") {
          const responsePayload = rawData?.response || providerEvent?.response;
          const candidate = extractTextFromResponseOutput(responsePayload?.output);
          if (candidate) streamedResponseText = candidate;
          const reasoningCandidate = extractReasoningSummaryFromResponseOutput(responsePayload?.output);
          if (reasoningCandidate) completeActiveReasoning(reasoningCandidate);
          completeActiveMessage(candidate, { isFinal: !responseHasToolCalls(responsePayload?.output) });
          emitTrace(
            "model",
            "success",
            "Model stream completed",
            candidate ? `response_done text=${candidate.length} chars` : "response_done without final text candidate"
          );
        }
      }
    } finally {
      streamReader.releaseLock();
    }
    completeActiveReasoning();
    completeActiveMessage();

    await (result as any)?.completed;
    const synthesizedToolText = summarizeSuccessfulToolCalls(toolEvents);
    const finalText =
      String(result.finalOutput || "").trim() ||
      streamedResponseText.trim() ||
      extractTextFromResponseOutput(result.rawResponses?.at(-1)?.output) ||
      streamedTextDelta.trim() ||
      synthesizedToolText;

    const runResult: QalamRunResult = {
      projectId: input.projectId,
      finalText,
      sessionId: input.sessionId,
      outputItems: [
        ...toolEvents.map((toolCall) => ({ kind: "tool_result", toolCall }) as const),
        { kind: "text", text: finalText } as const,
      ],
      toolCalls: toolEvents,
      usage: result.rawResponses?.at(-1)?.usage
        ? {
            inputTokens: result.rawResponses.at(-1)?.usage?.inputTokens,
            outputTokens: result.rawResponses.at(-1)?.usage?.outputTokens,
            totalTokens: result.rawResponses.at(-1)?.usage?.totalTokens,
          }
        : undefined,
      ...(getExtraResult?.() || {}),
    };

    onDebug?.("run result", runResult);
    emitTrace(
      "result",
      "success",
      "Run completed",
      `tools=${toolEvents.length} · response=${result.lastResponseId || "n/a"}`,
      finalText
    );
    if (!markCompletedMessageFinal(finalText) && !textAlreadyRepresented(finalText)) {
      completeActiveMessage(finalText, { isFinal: true });
    }
    emitRuntimeEvent({ type: "run_completed", runId, result: runResult });
    return runResult;
  } catch (error: any) {
    const isMaxTurns = error?.name === "MaxTurnsExceededError" || String(error?.message || "").includes("Max turns");
    const isGuardrailError =
      error instanceof InputGuardrailTripwireTriggered ||
      error instanceof OutputGuardrailTripwireTriggered ||
      error instanceof ToolInputGuardrailTripwireTriggered ||
      error instanceof ToolOutputGuardrailTripwireTriggered;
    const toolTrace = toolEvents
      .slice(-5)
      .map((toolCall) => `${toolCall.name}:${toolCall.status}${toolCall.summary ? `(${toolCall.summary})` : ""}`)
      .join(" -> ");
    const synthesizedToolText = summarizeSuccessfulToolCalls(toolEvents);
    const hasSuccessfulAction = toolEvents.some(
      (toolCall) => toolCall.status === "success" && SUCCESSFUL_ACTION_TOOL_NAMES.has(toolCall.name)
    );
    const fallbackText = streamedResponseText.trim() || streamedTextDelta.trim() || synthesizedToolText;

    onDebug?.("run error", {
      error,
      isMaxTurns,
      toolEvents,
      toolTrace,
      streamedTextDelta,
      streamedResponseText,
      fallbackText,
    });

    const shouldRecover =
      Boolean(fallbackText) &&
      (
        (isMaxTurns && (!toolEvents.length || hasSuccessfulAction)) ||
        (recoverFallbackOnAnyError && (hasSuccessfulAction || !toolEvents.length))
      );

    if (shouldRecover) {
      const recoveredText = fallbackText;
      const runResult: QalamRunResult = {
        projectId: input.projectId,
        finalText: recoveredText,
        sessionId: input.sessionId,
        outputItems: [
          ...toolEvents.map((toolCall) => ({ kind: "tool_result", toolCall }) as const),
          { kind: "text", text: recoveredText } as const,
        ],
        toolCalls: toolEvents,
        ...(getExtraResult?.() || {}),
      };
      emitTrace(
        "result",
        "success",
        "Fallback text recovered",
        isMaxTurns
          ? "模型未完整收尾，已从已知结果恢复文本。"
          : "运行中断，但已从已知结果恢复文本。",
        recoveredText
      );
      if (!markCompletedMessageFinal(recoveredText) && !textAlreadyRepresented(recoveredText)) {
        completeActiveMessage(recoveredText, { isFinal: true });
      }
      emitRuntimeEvent({ type: "run_completed", runId, result: runResult });
      return runResult;
    }

    const message = isGuardrailError
      ? `Guardrail 已拦截当前请求：${error?.message || "请求不符合运行边界。"}`
      : isMaxTurns
        ? toolEvents.length
          ? `Agent 在工具调用中未能收敛，已中止。${toolTrace ? ` 最近工具链路：${toolTrace}` : ""}`
          : `Agent 未产出可识别的最终输出，已在 ${maxTurns} 个回合后中止。`
        : isModelAccessError(error?.message || String(error))
          ? formatModelAccessError(config.provider, config.model, error?.message || String(error))
          : error?.message || "Agent runtime 执行失败";

    emitTrace("result", "error", "Run failed", message);
    emitRuntimeEvent({ type: "run_failed", runId, error: message });
    throw new Error(message);
  }
};
