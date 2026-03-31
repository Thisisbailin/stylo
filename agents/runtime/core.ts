import {
  Agent,
  InputGuardrailTripwireTriggered,
  OutputGuardrailTripwireTriggered,
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
import { buildAgentEnvironment } from "./environment";
import { createQalamInputGuardrails, createQalamOutputGuardrails } from "./guardrails";
import { composeAgentInstructions } from "./instructions";
import { buildAgentMemorySnapshot, buildRunInputItems, createAgentSessionInputCallback } from "./memory";
import { formatModelAccessError, isModelAccessError, type QalamAgentProvider } from "./providerConfig";
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
  QalamSkillDefinition,
} from "./types";

const SUCCESSFUL_ACTION_TOOL_NAMES = new Set([
  "edit_project_resource",
  "operate_project_resource",
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
  enabledSkills: QalamSkillDefinition[];
  disabledTools?: string[];
  maxTurns?: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentRuntimeEvent) => void;
  onDebug?: (label: string, payload?: unknown) => void;
  getExtraResult?: () => Partial<QalamRunResult>;
  runStartedMeta?: Pick<Extract<AgentRuntimeEvent, { type: "run_started" }>, "traceId" | "tracingEnabled">;
  recoverFallbackOnAnyError?: boolean;
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
}: RunQalamAgentCoreOptions): Promise<QalamRunResult> => {
  const runId = `${runtimeMode === "edge_full" ? "edge-run" : "run"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const emitTrace = (
    stage: AgentTraceStage,
    status: AgentTraceStatus,
    title: string,
    detail?: string,
    payload?: string
  ) => {
    onEvent?.({
      type: "trace",
      runId,
      entry: createTraceEntry(stage, status, title, detail, payload),
    });
  };

  if (input.attachments?.length) {
    const message = "新的 Agent runtime 暂不支持图片附件，请先移除附件后再发送。";
    onEvent?.({ type: "run_failed", runId, error: message });
    throw new Error(message);
  }

  onDebug?.("run input", {
    sessionId: input.sessionId,
    userText: input.userText,
    enabledSkillIds: input.enabledSkillIds || [],
    attachments: input.attachments?.length || 0,
  });

  onEvent?.({
    type: "run_started",
    sessionId: input.sessionId,
    runId,
    traceId: runStartedMeta?.traceId,
    tracingEnabled: runStartedMeta?.tracingEnabled,
  });
  emitTrace("runtime", "running", "Run started", `session=${input.sessionId}`);

  setOpenAIAPI("responses");
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    defaultHeaders: config.defaultHeaders,
    dangerouslyAllowBrowser: runtimeMode === "browser",
  });
  instrumentOpenAIResponsesClient(client, {
    emitTrace,
    debug: onDebug,
  });
  setDefaultOpenAIClient(client);

  const toolEvents: AgentExecutedToolCall[] = [];
  let streamedTextDelta = "";
  let streamedResponseText = "";
  let streamedReasoningText = "";

  const emitToolEvent = (event: AgentRuntimeEvent) => {
    if (event.type === "tool_called") {
      toolEvents.push(event.call);
    }
    if (event.type === "tool_completed" || event.type === "tool_failed") {
      const index = toolEvents.findIndex((toolCall) => toolCall.callId === event.call.callId);
      if (index >= 0) toolEvents[index] = event.call;
      else toolEvents.push(event.call);
    }
    onEvent?.(event);
  };

  const tools = createQalamTools({
    bridge,
    emitEvent: emitToolEvent,
    disabledTools,
  });
  const agentMemory = buildAgentMemorySnapshot(sessionMessages);
  const runContext: QalamRunContext = {
    runtimeMode,
    agentEnvironment: buildAgentEnvironment({
      projectData: bridge.getProjectData(),
      runtimeMode,
      enabledTools: tools.map((tool) => tool.name),
      sessionMessages,
    }),
    agentMemory,
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
    JSON.stringify(tools.map((tool) => tool.name), null, 2)
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
      tracingDisabled: true,
      traceIncludeSensitiveData: false,
      workflowName,
    });
    const result = await runner.run(agent, runInputItems, {
      signal,
      maxTurns,
      session,
      sessionInputCallback: createAgentSessionInputCallback(agentMemory),
      context: runContext,
      stream: true,
    });

    const streamReader = result.toStream().getReader();
    try {
      while (true) {
        const { done, value } = await streamReader.read();
        if (done) break;
        if (!value) continue;
        if (value.type !== "raw_model_stream_event") continue;
        const providerEvent = unwrapProviderEvent((value as any).data);
        const rawType = providerEvent?.type || (value as any)?.data?.type;
        if (rawType === "output_text_delta" && typeof providerEvent?.delta === "string") {
          streamedTextDelta += providerEvent.delta;
          onEvent?.({
            type: "message_delta",
            runId,
            delta: providerEvent.delta,
            accumulatedText: streamedTextDelta,
          });
        }
        if (
          (rawType === "response.reasoning_summary_text.delta" || rawType === "reasoning_summary_text.delta") &&
          typeof providerEvent?.delta === "string"
        ) {
          streamedReasoningText += providerEvent.delta;
          onEvent?.({
            type: "reasoning_delta",
            runId,
            delta: providerEvent.delta,
            accumulatedText: streamedReasoningText,
          });
        }
        if (
          (rawType === "response.reasoning_summary_text.done" || rawType === "reasoning_summary_text.done") &&
          typeof providerEvent?.text === "string"
        ) {
          streamedReasoningText = providerEvent.text || streamedReasoningText;
          onEvent?.({
            type: "reasoning_completed",
            runId,
            text: streamedReasoningText,
          });
        }
        if (rawType === "response_done") {
          const responsePayload = providerEvent?.response || (value as any)?.data?.response;
          const candidate = extractTextFromResponseOutput(responsePayload?.output);
          if (candidate) streamedResponseText = candidate;
          const reasoningCandidate = extractReasoningSummaryFromResponseOutput(responsePayload?.output);
          if (reasoningCandidate && !streamedReasoningText.trim()) {
            streamedReasoningText = reasoningCandidate;
            onEvent?.({
              type: "reasoning_completed",
              runId,
              text: reasoningCandidate,
            });
          }
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

    await (result as any)?.completed;
    const synthesizedToolText = summarizeSuccessfulToolCalls(toolEvents);
    const finalText =
      String(result.finalOutput || "").trim() ||
      streamedTextDelta.trim() ||
      streamedResponseText.trim() ||
      extractTextFromResponseOutput(result.rawResponses?.at(-1)?.output) ||
      synthesizedToolText;

    const runResult: QalamRunResult = {
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
    onEvent?.({ type: "message_completed", runId, text: finalText });
    onEvent?.({ type: "run_completed", runId, result: runResult });
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
    const fallbackText = streamedTextDelta.trim() || streamedResponseText.trim() || synthesizedToolText;

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
      onEvent?.({ type: "message_completed", runId, text: recoveredText });
      onEvent?.({ type: "run_completed", runId, result: runResult });
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
    onEvent?.({ type: "run_failed", runId, error: message });
    throw new Error(message);
  }
};
