import type { QalamAgentRuntime, QalamRunInput, QalamRunOptions, QalamRunResult } from "./types";
import {
  AGENT_HTTP_STREAM_CONTENT_TYPE,
  type AgentHttpRunRequest,
  parseAgentStreamPacket,
} from "./httpProtocol";
import { browserAgentDebug, browserAgentDebugError } from "./debug";

type HttpRuntimeDeps = {
  endpoint: string;
  getRuntimeConfig: () => AgentHttpRunRequest["runtime"];
  getProjectDataSnapshot?: () => AgentHttpRunRequest["projectData"];
  getWorkflowSnapshot?: () => AgentHttpRunRequest["workflow"];
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
  getWorkflowSnapshot,
  getAuthToken,
}: HttpRuntimeDeps): QalamAgentRuntime => ({
  async run(input: QalamRunInput, options?: QalamRunOptions): Promise<QalamRunResult> {
    const requestBody: AgentHttpRunRequest = {
      run: input,
      runtime: getRuntimeConfig(),
      projectData: getProjectDataSnapshot?.(),
      workflow: getWorkflowSnapshot?.(),
    };
    browserAgentDebug("httpClient request", {
      endpoint,
      runtime: requestBody.runtime,
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
    await decodeStreamChunks(response.body, (rawPacket) => {
      browserAgentDebug("httpClient raw packet", rawPacket);
      const packet = parseAgentStreamPacket(rawPacket);
      if (packet.kind === "event") {
        browserAgentDebug("httpClient event", packet.event);
        if (packet.event.type === "run_completed") {
          finalResult = packet.event.result;
        }
        if (packet.event.type === "run_failed") {
          streamedError = packet.event.error;
        }
        options?.onEvent?.(packet.event);
        return;
      }
      if (packet.kind === "result") {
        browserAgentDebug("httpClient result", packet.result);
        finalResult = packet.result;
        return;
      }
      if (packet.kind === "error") {
        browserAgentDebugError("httpClient packet error", packet.error);
        throw new Error(packet.error);
      }
    });

    if (!finalResult) {
      if (streamedError) {
        browserAgentDebugError("httpClient streamed error without result", streamedError);
        throw new Error(streamedError);
      }
      browserAgentDebugError("httpClient missing final result");
      throw new Error("远端 Agent 没有返回最终结果。");
    }
    browserAgentDebug("httpClient completed", {
      finalText: finalResult.finalText,
      toolCalls: finalResult.toolCalls.length,
    });
    return finalResult;
  },
});
