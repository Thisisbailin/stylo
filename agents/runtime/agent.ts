import {
  Agent,
  InputGuardrailTripwireTriggered,
  OutputGuardrailTripwireTriggered,
  ToolInputGuardrailTripwireTriggered,
  ToolOutputGuardrailTripwireTriggered,
  run,
  setDefaultOpenAIClient,
  setOpenAIAPI,
} from "@openai/agents";
import OpenAI from "openai";
import type { Script2VideoAgentBridge } from "../bridge/script2videoBridge";
import { createScript2VideoTools } from "../tools";
import { normalizeQalamToolSettings } from "../../node-workspace/components/qalam/tooling";
import { createScript2VideoInputGuardrails, createScript2VideoOutputGuardrails } from "./guardrails";
import { buildAgentEnvironment } from "./environment";
import { composeAgentInstructions } from "./instructions";
import { buildAgentMemorySnapshot, buildRunInputItems, createAgentSessionInputCallback } from "./memory";
import { readPersistedAgentSessionMessages } from "./session";
import { OPENROUTER_RESPONSES_BASE_URL, QWEN_RESPONSES_BASE_URL } from "../../constants";
import type {
  AgentExecutedToolCall,
  AgentTraceEntry,
  Script2VideoAgentRuntime,
  AgentRuntimeEvent,
  Script2VideoAgentConfigProvider,
  Script2VideoAgentTracer,
  Script2VideoRunInput,
  Script2VideoRunOptions,
  Script2VideoRunResult,
  Script2VideoRunContext,
  Script2VideoSessionStore,
  Script2VideoSkillLoader,
} from "./types";

const STABILIZATION_DISABLED_TOOLS = [
  "ping_tool",
] as const;

const AGENT_MAX_TURNS = 50;
const SUCCESSFUL_ACTION_TOOL_NAMES = new Set([
  "edit_project_resource",
  "operate_project_resource",
]);

type RuntimeDeps = {
  bridge: Script2VideoAgentBridge;
  skillLoader: Script2VideoSkillLoader;
  configProvider: Script2VideoAgentConfigProvider;
  sessionStore: Script2VideoSessionStore;
  tracer?: Script2VideoAgentTracer;
};

const resolveApiKey = (provider: "qwen" | "openrouter" | undefined, apiKey?: string) => {
  const env = typeof import.meta !== "undefined" ? import.meta.env : undefined;
  const processEnv = typeof process !== "undefined" ? process.env : undefined;
  const envKey =
    provider === "openrouter"
      ? env?.OPENROUTER_API_KEY ||
        env?.VITE_OPENROUTER_API_KEY ||
        processEnv?.OPENROUTER_API_KEY ||
        processEnv?.VITE_OPENROUTER_API_KEY
      : env?.QWEN_API_KEY ||
        env?.VITE_QWEN_API_KEY ||
        env?.DASHSCOPE_API_KEY ||
        env?.VITE_DASHSCOPE_API_KEY ||
        processEnv?.QWEN_API_KEY ||
        processEnv?.VITE_QWEN_API_KEY ||
        processEnv?.DASHSCOPE_API_KEY ||
        processEnv?.VITE_DASHSCOPE_API_KEY ||
        env?.OPENAI_API_KEY ||
        env?.VITE_OPENAI_API_KEY ||
        processEnv?.OPENAI_API_KEY ||
        processEnv?.VITE_OPENAI_API_KEY;
  const finalKey = (apiKey || envKey || "").trim();
  if (!finalKey) {
    throw new Error("缺少 OpenAI 兼容 API Key，无法运行新的 Agent runtime。");
  }
  return finalKey;
};

const resolveBaseUrl = (provider: "qwen" | "openrouter" | undefined, baseUrl?: string) => {
  const configured = (baseUrl || "").trim();
  if (configured) return configured;
  if (provider === "openrouter") return OPENROUTER_RESPONSES_BASE_URL;
  return QWEN_RESPONSES_BASE_URL;
};

const normalizeText = (value: unknown) => {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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

const debugLog = (runId: string, label: string, payload?: unknown) => {
  if (typeof console === "undefined") return;
  const prefix = `[Qalam][${runId}] ${label}`;
  if (payload === undefined) {
    console.debug(prefix);
    return;
  }
  console.debug(prefix, payload);
};

const debugGroupStart = (runId: string, label: string) => {
  if (typeof console === "undefined" || typeof console.groupCollapsed !== "function") return;
  console.groupCollapsed(`[Qalam][${runId}] ${label}`);
};

const debugGroupEnd = () => {
  if (typeof console === "undefined" || typeof console.groupEnd !== "function") return;
  console.groupEnd();
};

const createTraceEntry = (
  stage: AgentTraceEntry["stage"],
  status: AgentTraceEntry["status"],
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

const instrumentOpenAIResponsesClient = (client: OpenAI, runId: string) => {
  const responsesApi = client.responses as OpenAI["responses"] & {
    create: (...args: any[]) => Promise<any>;
  };
  const originalCreate = responsesApi.create.bind(responsesApi);
  responsesApi.create = (async (...args: any[]) => {
    const [request, options] = args;
    debugLog(runId, "responses.create request", request);
    if (options) {
      debugLog(runId, "responses.create options", options);
    }
    const response = await originalCreate(...args);
    if (request?.stream) {
      debugLog(runId, "responses.create response(stream)", {
        constructor: response?.constructor?.name,
        hasAsyncIterator: typeof response?.[Symbol.asyncIterator] === "function",
        hasWithResponse: typeof response?.withResponse === "function",
      });
    } else {
      debugLog(runId, "responses.create response", response);
    }
    return response;
  }) as typeof responsesApi.create;
};

const consumeRunStream = async (
  streamResult: Awaited<ReturnType<typeof run>>,
  onEvent: (streamEvent: any) => void
) => {
  if (!("toStream" in streamResult) || typeof streamResult.toStream !== "function") {
    return;
  }
  const stream = streamResult.toStream();
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) onEvent(value);
    }
  } finally {
    reader.releaseLock();
  }
};

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

const unwrapProviderEvent = (data: any) => {
  if (data && typeof data === "object" && data.event && typeof data.event === "object") {
    return data.event;
  }
  if (data && typeof data === "object" && data.providerData && typeof data.providerData === "object") {
    return data.providerData;
  }
  return data;
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

export const createScript2VideoAgentRuntime = ({
  bridge,
  skillLoader,
  configProvider,
  sessionStore,
  tracer,
}: RuntimeDeps): Script2VideoAgentRuntime => ({
  async run(input: Script2VideoRunInput, options?: Script2VideoRunOptions): Promise<Script2VideoRunResult> {
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const emitTrace = (
      stage: AgentTraceEntry["stage"],
      status: AgentTraceEntry["status"],
      title: string,
      detail?: string,
      payload?: string
    ) => {
      options?.onEvent?.({
        type: "trace",
        runId,
        entry: createTraceEntry(stage, status, title, detail, payload),
      });
    };

    if (input.attachments?.length) {
      const message = "新的 Agent runtime 暂不支持图片附件，请先移除附件后再发送。";
      options?.onEvent?.({ type: "run_failed", runId, error: message });
      throw new Error(message);
    }

    debugGroupStart(runId, "Agent run");
    debugLog(runId, "input", {
      sessionId: input.sessionId,
      userText: input.userText,
      uiContext: {
        supplementalContextChars: input.uiContext?.supplementalContextText?.length || 0,
        mentionTags: input.uiContext?.mentionTags || [],
      },
      attachments: input.attachments?.length || 0,
      enabledSkillIds: input.enabledSkillIds || [],
    });
    options?.onEvent?.({ type: "run_started", sessionId: input.sessionId, runId });
    emitTrace("runtime", "running", "Run started", `session=${input.sessionId}`);
    tracer?.onRunStarted(input);

    const config = await configProvider.getConfig();
    const provider = config.provider === "openrouter" ? "openrouter" : "qwen";
    const apiKey = resolveApiKey(provider, config.apiKey);
    const baseURL = resolveBaseUrl(provider, config.baseUrl);
    debugLog(runId, "provider resolved", {
      provider,
      model: config.model,
      baseURL,
      apiKeySource: config.apiKey ? "config" : "env",
      apiKeyPresent: Boolean(apiKey),
    });
    emitTrace("runtime", "info", "Config resolved", `${provider} · ${config.model}`, baseURL);
    setOpenAIAPI("responses");
    const client = new OpenAI({
      apiKey,
      baseURL,
      dangerouslyAllowBrowser: true,
      defaultHeaders: config.defaultHeaders,
    });
    instrumentOpenAIResponsesClient(client, runId);
    setDefaultOpenAIClient(client);

    const enabledSkills = (
      await Promise.all((input.enabledSkillIds || []).map((skillId) => skillLoader.getSkill(skillId)))
    ).filter(Boolean);
    debugLog(runId, "skills resolved", enabledSkills);
    emitTrace(
      "runtime",
      "info",
      "Instructions prepared",
      `skills=${enabledSkills.length}`
    );

    const session = await sessionStore.getSession(input.sessionId);
    const sessionId = await session.getSessionId();
    const sessionItems = await session.getItems(12);
    debugLog(runId, "session attached", {
      sessionId,
      itemCount: sessionItems.length,
      items: sessionItems,
    });
    emitTrace("session", "info", "Session attached", `id=${sessionId} · items=${sessionItems.length}`);

    const toolEvents: AgentExecutedToolCall[] = [];
    let streamedTextDelta = "";
    let streamedResponseText = "";
    let streamedReasoningText = "";
    const emitToolEvent = (event: AgentRuntimeEvent) => {
      debugLog(runId, `tool event: ${event.type}`, event);
      if (event.type === "tool_called") {
        toolEvents.push(event.call);
        tracer?.onToolCalled(event.call);
      }
      if (event.type === "tool_completed") {
        const index = toolEvents.findIndex((toolCall) => toolCall.callId === event.call.callId);
        if (index >= 0) toolEvents[index] = event.call;
        tracer?.onToolCompleted(event.call);
      }
      if (event.type === "tool_failed") {
        const index = toolEvents.findIndex((toolCall) => toolCall.callId === event.call.callId);
        if (index >= 0) toolEvents[index] = event.call;
      }
      options?.onEvent?.(event);
    };

    const toolSettings = normalizeQalamToolSettings(config.qalamTools);
    const disabledTools = enabledSkills.flatMap((skill) => skill?.disabledTools || []);
    disabledTools.push(...STABILIZATION_DISABLED_TOOLS);
    if (!toolSettings.projectData.enabled) {
      disabledTools.push(
        "list_project_resources",
        "read_project_resource",
        "search_project_resource",
        "edit_project_resource"
      );
    }
    if (!toolSettings.workflowBuilder.enabled) {
      disabledTools.push("operate_project_resource");
    }
    const enabledToolNames = createScript2VideoTools({
      bridge,
      disabledTools,
    }).map((tool) => tool.name);
    const sessionMessages = readPersistedAgentSessionMessages(input.sessionId);
    const agentMemory = buildAgentMemorySnapshot(sessionMessages);
    const runContext: Script2VideoRunContext = {
      runtimeMode: "browser",
      agentEnvironment: buildAgentEnvironment({
        projectData: bridge.getProjectData(),
        runtimeMode: "browser",
        enabledTools: enabledToolNames,
        sessionMessages,
      }),
      agentMemory,
      uiContext: input.uiContext,
    };
    const runInputItems = buildRunInputItems(input);
    const resolvedToolChoice = enabledToolNames.length > 0 ? "auto" : "none";
    debugLog(runId, "tool catalog", {
      enabled: enabledToolNames,
      disabled: Array.from(new Set(disabledTools)),
      toolSettings,
      toolChoice: resolvedToolChoice,
    });
    emitTrace(
      "tool",
      "info",
      "Tool catalog ready",
      `enabled=${enabledToolNames.length} · disabled=${Array.from(new Set(disabledTools)).length}`,
      enabledToolNames.join(", ")
    );
    const agent = new Agent<Script2VideoRunContext>({
      name: "Script2Video Agent",
      instructions: composeAgentInstructions({
        enabledSkills: enabledSkills as any,
      }),
      handoffDescription: "Single all-purpose Script2Video creative agent.",
      model: config.model,
      modelSettings: {
        toolChoice: resolvedToolChoice,
        parallelToolCalls: false,
      },
      inputGuardrails: createScript2VideoInputGuardrails(),
      outputGuardrails: createScript2VideoOutputGuardrails(),
      resetToolChoice: true,
      tools: createScript2VideoTools({
        bridge,
        emitEvent: emitToolEvent,
        disabledTools,
      }),
    });
    debugLog(runId, "agent created", {
      name: agent.name,
      model: config.model,
      toolChoice: resolvedToolChoice,
      parallelToolCalls: false,
    });
    emitTrace("runtime", "info", "Agent created", agent.name, `model=${config.model}`);

    const useStreaming = true;

    try {
      emitTrace(
        "model",
        "running",
        useStreaming ? "Streaming started" : "Model request started",
        input.userText.trim(),
        useStreaming ? "mode=stream" : "mode=non-stream"
      );
      debugLog(runId, "run() invoked", {
        input: input.userText.trim(),
        maxTurns: AGENT_MAX_TURNS,
        stream: useStreaming,
      });
      const result = useStreaming
        ? await run(agent, runInputItems, {
          signal: options?.signal,
          maxTurns: AGENT_MAX_TURNS,
          session,
          sessionInputCallback: createAgentSessionInputCallback(agentMemory),
          context: runContext,
          stream: true,
        })
        : await run(agent, runInputItems, {
            signal: options?.signal,
            maxTurns: AGENT_MAX_TURNS,
            session,
            sessionInputCallback: createAgentSessionInputCallback(agentMemory),
            context: runContext,
          });
      if (useStreaming) {
        await consumeRunStream(result as Awaited<ReturnType<typeof run>>, (streamEvent) => {
          debugLog(runId, "stream event", streamEvent);
          if (streamEvent.type === "agent_updated_stream_event") {
            emitTrace("runtime", "info", "Agent updated", streamEvent.agent.name);
            return;
          }
          if (streamEvent.type === "run_item_stream_event") {
            const itemType = (streamEvent.item as any)?.type || (streamEvent.item as any)?.rawItem?.type || "unknown";
            const rawItem = (streamEvent.item as any)?.rawItem;
            const detail =
              itemType === "function_call"
                ? `${rawItem?.name || "tool"}`
                : itemType === "function_call_result"
                  ? `${rawItem?.name || "tool"} · ${rawItem?.status || "completed"}`
                  : streamEvent.name;
            const payload =
              itemType === "function_call"
                ? rawItem?.arguments
                : itemType === "function_call_result"
                  ? normalizeText(rawItem?.output)
                  : undefined;
            emitTrace(
              itemType === "function_call" || itemType === "function_call_result" ? "tool" : "model",
              itemType === "function_call_result" ? "success" : "info",
              `Stream item: ${streamEvent.name}`,
              detail,
              payload
            );
            return;
          }
          if (streamEvent.type === "raw_model_stream_event") {
            const providerEvent = unwrapProviderEvent((streamEvent.data as any));
            const rawType = providerEvent?.type || (streamEvent.data as any)?.type || "raw_event";
            if (rawType === "response_started") {
              debugLog(runId, "raw response_started", providerEvent);
            }
            if (rawType === "output_text_delta" && typeof providerEvent?.delta === "string") {
              streamedTextDelta += providerEvent.delta;
              options?.onEvent?.({
                type: "message_delta",
                runId,
                delta: providerEvent.delta,
                accumulatedText: streamedTextDelta,
              });
              debugLog(runId, "raw output_text_delta", {
                delta: providerEvent.delta,
                accumulated: streamedTextDelta,
                providerData: providerEvent,
              });
            }
            if (
              (rawType === "response.reasoning_summary_text.delta" || rawType === "reasoning_summary_text.delta") &&
              typeof providerEvent?.delta === "string"
            ) {
              streamedReasoningText += providerEvent.delta;
              options?.onEvent?.({
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
              options?.onEvent?.({
                type: "reasoning_completed",
                runId,
                text: streamedReasoningText,
              });
            }
            if (rawType === "response_done") {
              const responsePayload = providerEvent?.response || (streamEvent.data as any)?.response;
              debugLog(runId, "raw response_done", responsePayload);
              const candidate = extractTextFromResponseOutput(responsePayload?.output);
              if (candidate) {
                streamedResponseText = candidate;
              }
              const reasoningCandidate = extractReasoningSummaryFromResponseOutput(responsePayload?.output);
              if (reasoningCandidate && !streamedReasoningText.trim()) {
                streamedReasoningText = reasoningCandidate;
                options?.onEvent?.({
                  type: "reasoning_completed",
                  runId,
                  text: reasoningCandidate,
                });
              }
            }
            if (rawType === "model") {
              debugLog(runId, "raw model event", providerEvent);
            }
            emitTrace("model", "info", `Raw event: ${rawType}`);
          }
        });
        await (result as Awaited<ReturnType<typeof run>> & { completed: Promise<void> }).completed;
      }
      debugLog(runId, useStreaming ? "stream completed" : "non-stream completed", {
        lastResponseId: result.lastResponseId,
        rawResponses: result.rawResponses,
        streamedTextDelta,
        streamedResponseText,
        finalOutput: result.finalOutput,
      });
      if (!useStreaming) {
        const latestRawResponse = result.rawResponses?.at(-1);
        emitTrace(
          "model",
          "info",
          "Raw response received",
          `status=${latestRawResponse?.providerData?.status || "unknown"} · output=${latestRawResponse?.output?.length || 0}`,
          normalizeText(latestRawResponse?.providerData || latestRawResponse)
        );
      }
      const synthesizedToolText = summarizeSuccessfulToolCalls(toolEvents);
      const finalText =
        normalizeText(result.finalOutput) || streamedTextDelta.trim() || streamedResponseText.trim() || synthesizedToolText;
      const runResult: Script2VideoRunResult = {
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
      };

      debugLog(runId, "run result", runResult);
      emitTrace(
        "result",
        "success",
        "Run completed",
        `tools=${toolEvents.length} · response=${result.lastResponseId || "n/a"}`,
        finalText
      );
      options?.onEvent?.({ type: "message_completed", runId, text: finalText });
      options?.onEvent?.({ type: "run_completed", runId, result: runResult });
      tracer?.onRunCompleted(runResult);
      debugGroupEnd();
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
      debugLog(runId, "run error", {
        error,
        isMaxTurns,
        toolEvents,
        toolTrace,
        streamedTextDelta,
        streamedResponseText,
        fallbackText,
      });
      if (isMaxTurns && fallbackText && (!toolEvents.length || hasSuccessfulAction)) {
        const runResult: Script2VideoRunResult = {
          finalText: fallbackText,
          sessionId: input.sessionId,
          outputItems: [
            ...toolEvents.map((toolCall) => ({ kind: "tool_result", toolCall }) as const),
            { kind: "text", text: fallbackText },
          ],
          toolCalls: toolEvents,
        };
        debugLog(runId, "fallback text recovered", runResult);
        emitTrace(
          "result",
          "success",
          "Fallback text recovered",
          hasSuccessfulAction
            ? "模型未收尾，但已从成功工具结果恢复最小回复。"
            : "SDK 未识别 finalOutput，已从 raw response 恢复文本。",
          fallbackText
        );
        options?.onEvent?.({ type: "message_completed", runId, text: fallbackText });
        options?.onEvent?.({ type: "run_completed", runId, result: runResult });
        tracer?.onRunCompleted(runResult);
        debugGroupEnd();
        return runResult;
      }
      const message = isGuardrailError
        ? `Guardrail 已拦截当前请求：${error?.message || "请求不符合运行边界。"}`
        : isMaxTurns
          ? toolEvents.length
            ? `Agent 在工具调用中未能收敛，已中止。${toolTrace ? ` 最近工具链路：${toolTrace}` : ""}`
            : `Agent 未产出可识别的最终输出，已在 ${AGENT_MAX_TURNS} 个回合后中止。`
          : error?.message || "Agent runtime 执行失败";
      emitTrace("result", "error", "Run failed", message);
      options?.onEvent?.({ type: "run_failed", runId, error: message });
      tracer?.onRunFailed(message);
      debugGroupEnd();
      throw new Error(message);
    }
  },
});
