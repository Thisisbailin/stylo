import {
  Agent,
  InputGuardrailTripwireTriggered,
  OutputGuardrailTripwireTriggered,
  Runner,
  ToolInputGuardrailTripwireTriggered,
  ToolOutputGuardrailTripwireTriggered,
  setDefaultOpenAIClient,
  setOpenAIAPI,
} from "@openai/agents";
import OpenAI from "openai";
import { ARK_DEFAULT_MODEL, ARK_RESPONSES_BASE_URL, OPENROUTER_RESPONSES_BASE_URL, QWEN_DEFAULT_MODEL, QWEN_RESPONSES_BASE_URL } from "../../constants";
import { createQalamTools } from "../../agents/tools";
import { EdgeMemorySession, readEdgeSessionMessages } from "../../agents/runtime/edgeSession";
import { buildAgentEnvironment } from "../../agents/runtime/environment";
import { createQalamInputGuardrails, createQalamOutputGuardrails } from "../../agents/runtime/guardrails";
import { composeAgentInstructions } from "../../agents/runtime/instructions";
import { buildAgentMemorySnapshot, buildRunInputItems, createAgentSessionInputCallback } from "../../agents/runtime/memory";
import {
  AGENT_HTTP_STREAM_CONTENT_TYPE,
  serializeAgentStreamPacket,
  type AgentHttpRunRequest,
} from "../../agents/runtime/httpProtocol";
import type { AgentRuntimeEvent, QalamRunContext, QalamRunResult } from "../../agents/runtime/types";
import type { AgentExecutedToolCall } from "../../agents/runtime/types";
import type { ProjectData } from "../../types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

const EDGE_AGENT_MAX_TURNS = 50;
const SUCCESSFUL_ACTION_TOOL_NAMES = new Set([
  "edit_project_resource",
  "operate_project_resource",
]);

const resolveApiKey = (env: Record<string, unknown>, provider: "qwen" | "openrouter" | "ark") => {
  const value =
    provider === "openrouter"
      ? env.OPENROUTER_API_KEY
      : provider === "ark"
        ? env.ARK_API_KEY
      : env.QWEN_API_KEY || env.DASHSCOPE_API_KEY || env.OPENAI_API_KEY;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Pages Functions 未配置 ${provider} 的可用 API Key。`);
  }
  return value.trim();
};

const resolveBaseUrl = (provider: "qwen" | "openrouter" | "ark", baseUrl?: string) => {
  const configured = (baseUrl || "").trim();
  if (configured) return configured;
  if (provider === "openrouter") return OPENROUTER_RESPONSES_BASE_URL;
  if (provider === "ark") return ARK_RESPONSES_BASE_URL;
  return QWEN_RESPONSES_BASE_URL;
};

const resolveProviderModel = (provider: "qwen" | "openrouter" | "ark", requestedModel?: string) => {
  const model = (requestedModel || "").trim();
  if (provider === "ark") {
    if (!model || model.startsWith("qwen") || model.startsWith("doubao-lite-") || model.startsWith("doubao-pro-")) {
      return ARK_DEFAULT_MODEL;
    }
    return model;
  }
  if (provider === "qwen") {
    if (!model || model.startsWith("doubao-")) {
      return QWEN_DEFAULT_MODEL;
    }
    return model;
  }
  return model;
};

const isModelAccessError = (message: string) =>
  /model or endpoint/i.test(message) &&
  /(does not exist|do not have access)/i.test(message);

const formatModelAccessError = (
  provider: "qwen" | "openrouter" | "ark",
  requestedModel: string,
  effectiveModel: string,
  message: string
) => {
  if (provider === "ark") {
    return `Ark 模型不可用：当前请求使用的是 \`${effectiveModel}\`。方舟 Agent 路线请优先使用 \`doubao-seed-*\` 或已开通权限的 \`ep-*\` 接入点 ID；旧的 \`doubao-lite/pro-*\` 常会在 Responses 路线上 404。原始错误：${message}`;
  }
  if (provider === "qwen") {
    return `Qwen 模型不可用：当前请求使用的是 \`${effectiveModel}\`。这通常表示当前 API Key 对该模型未开通权限，或该模型不在当前兼容路线上可用。建议先切回 \`${QWEN_DEFAULT_MODEL}\` 再试。原始错误：${message}`;
  }
  return message;
};

const isDebugEnabled = (env: Record<string, unknown>) => {
  const value = env.AGENT_DEBUG_LOGS;
  return value === "1" || value === "true";
};

const debugLog = (enabled: boolean, runId: string, label: string, payload?: unknown) => {
  if (!enabled || typeof console === "undefined") return;
  const prefix = `[Qalam][edge][${runId}] ${label}`;
  if (payload === undefined) {
    console.log(prefix);
    return;
  }
  console.log(prefix, payload);
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
  opts: {
    controller: ReadableStreamDefaultController<Uint8Array>;
    runId: string;
    debugEnabled: boolean;
  }
) => {
  const responsesApi = client.responses as OpenAI["responses"] & {
    create: (...args: any[]) => Promise<any>;
  };
  const originalCreate = responsesApi.create.bind(responsesApi);
  responsesApi.create = (async (...args: any[]) => {
    const [request, options] = args;
    debugLog(opts.debugEnabled, opts.runId, "responses.create request", request);
    emitTrace(
      opts.controller,
      opts.runId,
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
        text: request?.text,
        store: request?.store,
      })
    );
    if (options) {
      debugLog(opts.debugEnabled, opts.runId, "responses.create options", options);
    }
    try {
      const response = await originalCreate(...args);
      debugLog(opts.debugEnabled, opts.runId, "responses.create response", {
        hasWithResponse: typeof response?.withResponse === "function",
        hasAsyncIterator: typeof response?.[Symbol.asyncIterator] === "function",
      });
      return response;
    } catch (error: any) {
      emitTrace(
        opts.controller,
        opts.runId,
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
          headers: error?.headers,
        })
      );
      throw error;
    }
  }) as typeof responsesApi.create;
};

const unwrapProviderEvent = (data: any) => {
  if (data && typeof data === "object" && data.event && typeof data.event === "object") return data.event;
  if (data && typeof data === "object" && data.providerData && typeof data.providerData === "object") return data.providerData;
  return data;
};

const extractTextFromResponseOutput = (output: unknown): string => {
  if (!output || !Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    if ((item as any).type === "message" && Array.isArray((item as any).content)) {
      for (const content of (item as any).content) {
        if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
      }
    }
    if ((item as any).type === "output_text" && typeof (item as any).text === "string") {
      parts.push((item as any).text);
    }
  }
  return parts.join("\n").trim();
};

const isLateStreamEnqueueError = (error: unknown) =>
  String((error as any)?.message || error || "").includes("Unable to enqueue");

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

const createEdgeBridgeState = (projectData: ProjectData) => {
  let currentProjectData = projectData;
  let projectDataUpdated = false;
  return {
    bridge: {
      getProjectData: () => currentProjectData,
      updateProjectData: (updater: (prev: ProjectData) => ProjectData) => {
        currentProjectData = updater(currentProjectData);
        projectDataUpdated = true;
      },
      addTextNode: () => {
        throw new Error("当前 edge runtime 暂不支持节点操作。");
      },
      createWorkflowNode: () => {
        throw new Error("当前 edge runtime 暂不支持节点操作。");
      },
      connectWorkflowNodes: () => {
        throw new Error("当前 edge runtime 暂不支持节点操作。");
      },
      getWorkflowNode: () => null,
      createNodeWorkflow: () => {
        throw new Error("当前 edge runtime 暂不支持节点操作。");
      },
      getViewport: () => null,
      getNodeCount: () => 0,
    },
    getProjectData: () => currentProjectData,
    hasUpdatedProjectData: () => projectDataUpdated,
  };
};

const createSseResponse = (stream: ReadableStream<Uint8Array>) =>
  new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": AGENT_HTTP_STREAM_CONTENT_TYPE,
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });

const emitEvent = (controller: ReadableStreamDefaultController<Uint8Array>, event: AgentRuntimeEvent) => {
  try {
    controller.enqueue(
      new TextEncoder().encode(serializeAgentStreamPacket({ kind: "event", event }))
    );
  } catch (error: any) {
    if (!String(error?.message || error).includes("Unable to enqueue")) {
      throw error;
    }
  }
};

const emitResult = (controller: ReadableStreamDefaultController<Uint8Array>, result: QalamRunResult) => {
  try {
    controller.enqueue(
      new TextEncoder().encode(serializeAgentStreamPacket({ kind: "result", result }))
    );
  } catch (error: any) {
    if (!String(error?.message || error).includes("Unable to enqueue")) {
      throw error;
    }
  }
};

const emitError = (controller: ReadableStreamDefaultController<Uint8Array>, error: string) => {
  try {
    controller.enqueue(
      new TextEncoder().encode(serializeAgentStreamPacket({ kind: "error", error }))
    );
  } catch (errorLike: any) {
    if (!String(errorLike?.message || errorLike).includes("Unable to enqueue")) {
      throw errorLike;
    }
  }
};

const emitTrace = (
  controller: ReadableStreamDefaultController<Uint8Array>,
  runId: string,
  stage: "runtime" | "session" | "model" | "tool" | "result",
  status: "info" | "running" | "success" | "error",
  title: string,
  detail?: string,
  payload?: string
) => {
  emitEvent(controller, {
    type: "trace",
    runId,
    entry: {
      id: `${stage}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      stage,
      status,
      title,
      detail,
      payload,
    },
  });
};

export const onRequestOptions = async () =>
  new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });

export const onRequestPost = async (context: any) => {
  const body = (await context.request.json().catch(() => null)) as AgentHttpRunRequest | null;
  if (!body?.run?.sessionId || !body?.run?.userText || !body?.runtime?.model || !body?.projectData) {
    return new Response(JSON.stringify({ error: "请求缺少 run.sessionId、run.userText、runtime.model 或 projectData。" }), {
      status: 400,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }

  const runId = `edge-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const provider =
    body.runtime.provider === "openrouter"
      ? "openrouter"
      : body.runtime.provider === "ark"
        ? "ark"
        : "qwen";

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const debugEnabled = isDebugEnabled(context.env || {});
      const tracingEnabled = false;
      const traceId = `local-trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const bridgeState = createEdgeBridgeState(body.projectData);
      const toolCalls: AgentExecutedToolCall[] = [];
      let accumulatedText = "";
      let accumulatedReasoning = "";
      let streamedResponseText = "";
      try {
        debugLog(debugEnabled, runId, "request received", {
          provider,
          runtime: body.runtime,
          sessionId: body.run.sessionId,
          userText: body.run.userText,
        });
        emitTrace(
          controller,
          runId,
          "runtime",
          "info",
          "Request accepted",
          `provider=${provider} · session=${body.run.sessionId}`,
          JSON.stringify({
            model: body.runtime.model,
            baseUrl: body.runtime.baseUrl || null,
            userTextLength: body.run.userText.length,
            attachmentCount: body.run.attachments?.length || 0,
          }, null, 2)
        );
        const emitRuntimeEvent = (event: AgentRuntimeEvent) => {
          if (event.type === "tool_called") {
            toolCalls.push(event.call);
          } else if (event.type === "tool_completed" || event.type === "tool_failed") {
            const index = toolCalls.findIndex((item) => item.callId === event.call.callId);
            if (index >= 0) toolCalls[index] = event.call;
            else toolCalls.push(event.call);
          }
          emitEvent(controller, event);
        };
        emitEvent(controller, {
          type: "run_started",
          runId,
          sessionId: body.run.sessionId,
          traceId,
          tracingEnabled,
        });

        const effectiveModel = resolveProviderModel(provider, body.runtime.model);
        const resolvedAuth = {
          apiKey: resolveApiKey(context.env || {}, provider),
          baseURL: resolveBaseUrl(provider, body.runtime.baseUrl),
          defaultHeaders: undefined as Record<string, string> | undefined,
        };
        debugLog(debugEnabled, runId, "provider resolved", {
          provider,
          model: effectiveModel,
          baseURL: resolvedAuth.baseURL,
          hasApiKey: Boolean(resolvedAuth.apiKey),
        });
        emitTrace(
          controller,
          runId,
          "runtime",
          "success",
          "Provider resolved",
          `provider=${provider} · model=${effectiveModel}`,
          JSON.stringify({
            requestedModel: body.runtime.model,
            baseURL: resolvedAuth.baseURL,
            hasApiKey: Boolean(resolvedAuth.apiKey),
            tracingEnabled,
          }, null, 2)
        );
        const client = new OpenAI({
          apiKey: resolvedAuth.apiKey,
          baseURL: resolvedAuth.baseURL,
          defaultHeaders: resolvedAuth.defaultHeaders,
        });
        instrumentOpenAIResponsesClient(client, {
          controller,
          runId,
          debugEnabled,
        });
        setOpenAIAPI("responses");
        setDefaultOpenAIClient(client);

        const session = new EdgeMemorySession(body.run.sessionId);
        const sessionId = await session.getSessionId();
        const sessionItems = await session.getItems(24);
        emitTrace(controller, runId, "session", "info", "Session attached", `id=${sessionId} · items=${sessionItems.length}`);

        const enabledTools = createQalamTools({
          bridge: bridgeState.bridge,
          emitEvent: emitRuntimeEvent,
          disabledTools: [
            "ping_tool",
            "operate_project_resource",
          ],
        });
        const sessionMessages = readEdgeSessionMessages(body.run.sessionId);
        const agentMemory = buildAgentMemorySnapshot(sessionMessages);
        const runContext: QalamRunContext = {
          runtimeMode: "edge_full",
          agentEnvironment: buildAgentEnvironment({
            projectData: bridgeState.bridge.getProjectData(),
            runtimeMode: "edge_full",
            enabledTools: enabledTools.map((tool) => tool.name),
            sessionMessages,
          }),
          agentMemory,
          uiContext: body.run.uiContext,
        };
        const runInputItems = buildRunInputItems(body.run);
        emitTrace(
          controller,
          runId,
          "tool",
          "info",
          "Tools prepared",
          `${enabledTools.length} tools enabled`,
          JSON.stringify(enabledTools.map((tool) => tool.name), null, 2)
        );

        const agent = new Agent<QalamRunContext>({
          name: "Qalam Edge Agent",
          instructions: composeAgentInstructions({
            enabledSkills: [],
          }),
          handoffDescription: "Edge runtime scaffold for Qalam.",
          model: effectiveModel,
          modelSettings: {
            toolChoice: "auto",
            parallelToolCalls: false,
          },
          inputGuardrails: createQalamInputGuardrails(),
          outputGuardrails: createQalamOutputGuardrails(),
          resetToolChoice: true,
          tools: enabledTools,
        });
        emitTrace(
          controller,
          runId,
          "model",
          "running",
          "Agent run started",
          `model=${effectiveModel} · sessionMemory=${sessionMessages.length}`,
          JSON.stringify({
            requestedModel: body.runtime.model,
            runtimeMode: runContext.runtimeMode,
            projectEpisodes: runContext.agentEnvironment.project.episodeCount,
            enabledTools: enabledTools.map((tool) => tool.name),
          }, null, 2)
        );
        const runner = new Runner({
          tracingDisabled: true,
          traceIncludeSensitiveData: false,
          workflowName: "Qalam Edge Agent",
        });
        const result = await runner.run(agent, runInputItems, {
          stream: true,
          maxTurns: EDGE_AGENT_MAX_TURNS,
          signal: context.request.signal,
          session,
          sessionInputCallback: createAgentSessionInputCallback(agentMemory),
          context: runContext,
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
              accumulatedText += providerEvent.delta;
              debugLog(debugEnabled, runId, "output_text_delta", {
                delta: providerEvent.delta,
                accumulatedLength: accumulatedText.length,
              });
              emitEvent(controller, {
                type: "message_delta",
                runId,
                delta: providerEvent.delta,
                accumulatedText,
              });
            }
            if (
              (rawType === "response.reasoning_summary_text.delta" || rawType === "reasoning_summary_text.delta") &&
              typeof providerEvent?.delta === "string"
            ) {
              accumulatedReasoning += providerEvent.delta;
              emitEvent(controller, {
                type: "reasoning_delta",
                runId,
                delta: providerEvent.delta,
                accumulatedText: accumulatedReasoning,
              });
            }
            if (
              (rawType === "response.reasoning_summary_text.done" || rawType === "reasoning_summary_text.done") &&
              typeof providerEvent?.text === "string"
            ) {
              accumulatedReasoning = providerEvent.text;
              emitEvent(controller, {
                type: "reasoning_completed",
                runId,
                text: accumulatedReasoning,
              });
            }
            if (rawType === "response_done") {
              const responsePayload = providerEvent?.response || (value as any)?.data?.response;
              const candidate = extractTextFromResponseOutput(responsePayload?.output);
              if (candidate) {
                streamedResponseText = candidate;
              }
              debugLog(debugEnabled, runId, "response_done", {
                hasCandidate: Boolean(candidate),
                candidateLength: candidate?.length || 0,
              });
              emitTrace(
                controller,
                runId,
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

        try {
          await (result as any)?.completed;
        } catch (error: any) {
          const completedTextCandidate =
            String(result.finalOutput || "").trim() ||
            accumulatedText ||
            streamedResponseText ||
            extractTextFromResponseOutput(result.rawResponses?.at(-1)?.output);
          if (!isLateStreamEnqueueError(error) || !completedTextCandidate) {
            throw error;
          }
          debugLog(debugEnabled, runId, "ignored late stream enqueue error after completed response", {
            error: error?.message || String(error),
            completedTextLength: completedTextCandidate.length,
            rawResponses: result.rawResponses?.length || 0,
          });
          emitTrace(
            controller,
            runId,
            "result",
            "info",
            "Ignored late stream enqueue error",
            error?.message || String(error),
            JSON.stringify(
              {
                completedTextLength: completedTextCandidate.length,
                rawResponses: result.rawResponses?.length || 0,
              },
              null,
              2
            )
          );
        }
        const synthesizedToolText = summarizeSuccessfulToolCalls(toolCalls);
        const finalText =
          String(result.finalOutput || "").trim() ||
          accumulatedText ||
          streamedResponseText ||
          extractTextFromResponseOutput(result.rawResponses?.at(-1)?.output) ||
          synthesizedToolText;
        debugLog(debugEnabled, runId, "finalized result", {
          finalText,
          toolCalls: toolCalls.length,
          usage: result.rawResponses?.at(-1)?.usage,
        });
        emitTrace(
          controller,
          runId,
          "result",
          "success",
          "Run finalized",
          finalText ? `finalText=${finalText.length} chars · tools=${toolCalls.length}` : `empty finalText · tools=${toolCalls.length}`,
          JSON.stringify(result.rawResponses?.at(-1)?.usage || {}, null, 2)
        );
        const runResult: QalamRunResult = {
          finalText,
          sessionId: body.run.sessionId,
          outputItems: [
            ...toolCalls.map((toolCall) => ({ kind: "tool_result", toolCall }) as const),
            { kind: "text", text: finalText },
          ],
          toolCalls,
          updatedProjectData: bridgeState.hasUpdatedProjectData() ? bridgeState.getProjectData() : undefined,
          tracing: {
            enabled: tracingEnabled,
            traceId,
          },
          usage: result.rawResponses?.at(-1)?.usage
            ? {
                inputTokens: result.rawResponses.at(-1)?.usage?.inputTokens,
                outputTokens: result.rawResponses.at(-1)?.usage?.outputTokens,
                totalTokens: result.rawResponses.at(-1)?.usage?.totalTokens,
              }
            : undefined,
        };
        emitEvent(controller, {
          type: "message_completed",
          runId,
          text: finalText,
        });
        emitEvent(controller, {
          type: "run_completed",
          runId,
          result: runResult,
        });
        emitResult(controller, runResult);
      } catch (error: any) {
        const isMaxTurns = error?.name === "MaxTurnsExceededError" || String(error?.message || "").includes("Max turns");
        const isGuardrailError =
          error instanceof InputGuardrailTripwireTriggered ||
          error instanceof OutputGuardrailTripwireTriggered ||
          error instanceof ToolInputGuardrailTripwireTriggered ||
          error instanceof ToolOutputGuardrailTripwireTriggered;
        const synthesizedToolText = summarizeSuccessfulToolCalls(toolCalls);
        const hasSuccessfulAction = toolCalls.some(
          (toolCall) => toolCall.status === "success" && SUCCESSFUL_ACTION_TOOL_NAMES.has(toolCall.name)
        );
        const fallbackText = accumulatedText.trim() || streamedResponseText.trim() || synthesizedToolText;
        debugLog(debugEnabled, runId, "run error", {
          error: error?.message || String(error),
          isMaxTurns,
          isGuardrailError,
          fallbackText,
          toolCalls,
        });
        if (isMaxTurns && synthesizedToolText && hasSuccessfulAction) {
          emitTrace(
            controller,
            runId,
            "result",
            "success",
            "Recovered from max turns",
            `Using synthesized tool text · tools=${toolCalls.length}`,
            synthesizedToolText
          );
          const runResult: QalamRunResult = {
            finalText: synthesizedToolText,
            sessionId: body.run.sessionId,
            outputItems: [
              ...toolCalls.map((toolCall) => ({ kind: "tool_result", toolCall }) as const),
              { kind: "text", text: synthesizedToolText },
            ],
            toolCalls,
            updatedProjectData: bridgeState.hasUpdatedProjectData() ? bridgeState.getProjectData() : undefined,
            tracing: {
              enabled: tracingEnabled,
              traceId,
            },
          };
          emitEvent(controller, {
            type: "message_completed",
            runId,
            text: synthesizedToolText,
          });
          emitEvent(controller, {
            type: "run_completed",
            runId,
            result: runResult,
          });
          emitResult(controller, runResult);
          return;
        }
        if (fallbackText) {
          debugLog(debugEnabled, runId, "recovered fallback result", {
            fallbackText,
            toolCalls: toolCalls.length,
          });
          emitTrace(
            controller,
            runId,
            "result",
            "success",
            "Recovered fallback text",
            `Recovered ${fallbackText.length} chars after runtime error`,
            JSON.stringify({
              error: error?.message || String(error),
              toolCalls: toolCalls.length,
            }, null, 2)
          );
          const runResult: QalamRunResult = {
            finalText: fallbackText,
            sessionId: body.run.sessionId,
            outputItems: [
              ...toolCalls.map((toolCall) => ({ kind: "tool_result", toolCall }) as const),
              { kind: "text", text: fallbackText },
            ],
            toolCalls,
            updatedProjectData: bridgeState.hasUpdatedProjectData() ? bridgeState.getProjectData() : undefined,
            tracing: {
              enabled: tracingEnabled,
              traceId,
            },
          };
          emitEvent(controller, {
            type: "message_completed",
            runId,
            text: fallbackText,
          });
          emitEvent(controller, {
            type: "run_completed",
            runId,
            result: runResult,
          });
          emitResult(controller, runResult);
          return;
        }
        const message = isGuardrailError
          ? `Guardrail 已拦截当前请求：${error?.message || "请求不符合运行边界。"}`
          : isModelAccessError(error?.message || String(error))
            ? formatModelAccessError(provider, body.runtime.model, effectiveModel, error?.message || String(error))
            : error?.message || "Cloudflare Agent runtime 执行失败";
        emitTrace(
          controller,
          runId,
          "result",
          "error",
          "Run failed",
          message,
          JSON.stringify({
            errorName: error?.name || null,
            stack: error?.stack || null,
            isMaxTurns,
            isGuardrailError,
            toolCalls,
            accumulatedTextLength: accumulatedText.length,
            streamedResponseTextLength: streamedResponseText.length,
            accumulatedReasoningLength: accumulatedReasoning.length,
          }, null, 2)
        );
        emitEvent(controller, {
          type: "run_failed",
          runId,
          error: message,
        });
        emitError(controller, message);
      } finally {
        try {
          controller.close();
        } catch (error: any) {
          if (!String(error?.message || error).includes("Controller is already closed")) {
            throw error;
          }
        }
      }
    },
  });

  return createSseResponse(stream);
};
