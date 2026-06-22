import type { QalamAgentRuntime, QalamRunInput, QalamRunOptions, QalamRunResult } from "./types";
import {
  AGENT_HTTP_STREAM_CONTENT_TYPE,
  type AgentHttpRunRequest,
  parseAgentStreamPacket,
} from "./httpProtocol";
import { browserAgentDebug, browserAgentDebugError } from "./debug";

const summarizeEventForDebug = (event: any) => {
  if (!event || typeof event !== "object") return event;
  if (event.type === "reasoning_delta" || event.type === "message_delta") {
    return {
      type: event.type,
      runId: event.runId,
      deltaChars: typeof event.delta === "string" ? event.delta.length : 0,
      accumulatedChars: typeof event.accumulatedText === "string" ? event.accumulatedText.length : 0,
    };
  }
  if (event.type === "reasoning_completed" || event.type === "message_completed") {
    return {
      type: event.type,
      runId: event.runId,
      textChars: typeof event.text === "string" ? event.text.length : 0,
    };
  }
  if (event.type === "run_completed") {
    return {
      type: event.type,
      runId: event.runId,
      result: {
        sessionId: event.result?.sessionId,
        finalTextChars: typeof event.result?.finalText === "string" ? event.result.finalText.length : 0,
        toolCalls: Array.isArray(event.result?.toolCalls) ? event.result.toolCalls.length : 0,
      },
    };
  }
  if (event.type === "trace") {
    return {
      type: event.type,
      runId: event.runId,
      entry: {
        stage: event.entry?.stage,
        status: event.entry?.status,
        title: event.entry?.title,
      },
    };
  }
  return event;
};

const summarizeRawPacketForDebug = (rawPacket: string) => {
  try {
    const packet = parseAgentStreamPacket(rawPacket);
    if (packet.kind === "event") {
      return {
        kind: packet.kind,
        event: summarizeEventForDebug(packet.event),
      };
    }
    if (packet.kind === "result") {
      return {
        kind: packet.kind,
        sessionId: packet.result?.sessionId,
        finalTextChars: typeof packet.result?.finalText === "string" ? packet.result.finalText.length : 0,
        toolCalls: Array.isArray(packet.result?.toolCalls) ? packet.result.toolCalls.length : 0,
      };
    }
    return {
      kind: packet.kind,
      errorChars: typeof packet.error === "string" ? packet.error.length : 0,
    };
  } catch {
    return {
      kind: "unknown",
      rawChars: rawPacket.length,
    };
  }
};

const summarizeResultForDebug = (result: QalamRunResult) => ({
  sessionId: result.sessionId,
  finalTextChars: typeof result.finalText === "string" ? result.finalText.length : 0,
  toolCalls: result.toolCalls.length,
  outputItems: result.outputItems.length,
  usage: result.usage,
});

type HttpRuntimeDeps = {
  endpoint: string;
  getRuntimeConfig: () => AgentHttpRunRequest["runtime"];
  getProjectDataSnapshot?: () => AgentHttpRunRequest["projectData"];
  getNodeFlowSnapshot?: () => AgentHttpRunRequest["nodeFlow"];
  getAuthToken?: (options?: { skipCache?: boolean }) => Promise<string | null>;
};

const decodeStreamChunks = async (
  stream: ReadableStream<Uint8Array>,
  onPacket: (rawPacket: string) => void
) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const dataLine = frame
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.startsWith("data:"));
        if (!dataLine) continue;
        onPacket(dataLine.slice(5).trim());
      }
    }
    if (buffer.trim().startsWith("data:")) {
      onPacket(buffer.trim().slice(5).trim());
    }
  } finally {
    reader.releaseLock();
  }
};

export const createHttpQalamAgentRuntime = ({
  endpoint,
  getRuntimeConfig,
  getProjectDataSnapshot,
  getNodeFlowSnapshot,
  getAuthToken,
}: HttpRuntimeDeps): QalamAgentRuntime => ({
  async run(input: QalamRunInput, options?: QalamRunOptions): Promise<QalamRunResult> {
    const requestBody: AgentHttpRunRequest = {
      run: input,
      runtime: getRuntimeConfig(),
      projectData: getProjectDataSnapshot?.(),
      nodeFlow: getNodeFlowSnapshot?.(),
    };
    browserAgentDebug("httpClient request", {
      endpoint,
      runtime: requestBody.runtime,
      projectId: requestBody.run.projectId,
      sessionId: requestBody.run.sessionId,
      userText: requestBody.run.userText,
    });
    let authToken = await getAuthToken?.();
    if (!authToken && getAuthToken) {
      authToken = await getAuthToken({ skipCache: true });
    }
    const executeRequest = (token?: string | null) =>
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: AGENT_HTTP_STREAM_CONTENT_TYPE,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(requestBody),
        signal: options?.signal,
      });
    let response = await executeRequest(authToken);
    if ((response.status === 401 || response.status === 403) && getAuthToken) {
      browserAgentDebug("httpClient auth retry", { status: response.status });
      const refreshedToken = await getAuthToken({ skipCache: true });
      if (refreshedToken) {
        authToken = refreshedToken;
        response = await executeRequest(refreshedToken);
      }
    }
    browserAgentDebug("httpClient response", {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type"),
    });

    if (!response.ok || !response.body) {
      const message = await response.text().catch(() => "");
      browserAgentDebugError("httpClient non-ok response", {
        status: response.status,
        message,
      });
      throw new Error(message || `Agent 请求失败：HTTP ${response.status}`);
    }

    let finalResult: QalamRunResult | null = null;
    let streamedError: string | null = null;
    let lastEventType: string | null = null;
    let lastMessageCompletedText = "";
    await decodeStreamChunks(response.body, (rawPacket) => {
      browserAgentDebug("httpClient raw packet", summarizeRawPacketForDebug(rawPacket));
      const packet = parseAgentStreamPacket(rawPacket);
      if (packet.kind === "event") {
        browserAgentDebug("httpClient event", summarizeEventForDebug(packet.event));
        lastEventType = packet.event.type;
        if (packet.event.type === "run_completed") {
          finalResult = packet.event.result;
        }
        if (packet.event.type === "message_completed") {
          lastMessageCompletedText = packet.event.text || "";
        }
        if (packet.event.type === "run_failed") {
          streamedError = packet.event.error;
        }
        options?.onEvent?.(packet.event);
        return;
      }
      if (packet.kind === "result") {
        browserAgentDebug("httpClient result", summarizeResultForDebug(packet.result));
        finalResult = packet.result;
        return;
      }
      if (packet.kind === "error") {
        browserAgentDebugError("httpClient packet error", packet.error);
        throw new Error(packet.error);
      }
    });

    if (!finalResult) {
      if (lastMessageCompletedText.trim()) {
        finalResult = {
          projectId: input.projectId,
          finalText: lastMessageCompletedText,
          sessionId: input.sessionId,
          outputItems: [{ kind: "text", text: lastMessageCompletedText }],
          toolCalls: [],
        };
        browserAgentDebug("httpClient synthesized result from message_completed", {
          sessionId: input.sessionId,
          lastEventType,
        });
      }
    }

    if (!finalResult) {
      if (streamedError) {
        browserAgentDebugError("httpClient streamed error without result", streamedError);
        throw new Error(streamedError);
      }
      browserAgentDebugError("httpClient missing final result", {
        sessionId: input.sessionId,
        lastEventType,
        hadMessageCompletedText: Boolean(lastMessageCompletedText.trim()),
      });
      throw new Error(
        lastEventType
          ? `远端 Agent 在 ${lastEventType} 阶段后异常结束，未返回最终结果。`
          : "远端 Agent 没有返回最终结果。"
      );
    }
    if (finalResult.projectId !== input.projectId) {
      throw new Error(
        `Qalam 返回了其它项目的结果：expected ${input.projectId}, received ${finalResult.projectId || "missing"}。`
      );
    }
    browserAgentDebug("httpClient completed", {
      finalTextChars: finalResult.finalText.length,
      toolCalls: finalResult.toolCalls.length,
    });
    return finalResult;
  },
});
