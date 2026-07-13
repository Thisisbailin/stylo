import {
  AGENT_HTTP_STREAM_CONTENT_TYPE,
  serializeAgentStreamPacket,
} from "../../agents/runtime/httpProtocol";
import type { AgentRuntimeEvent, QalamRunResult } from "../../agents/runtime/types";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
};

export const withCorsHeaders = (response: Response) => {
  const headers = new Headers(response.headers);
  Object.entries(CORS_HEADERS).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const createSseResponse = (stream: ReadableStream<Uint8Array>) =>
  new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": AGENT_HTTP_STREAM_CONTENT_TYPE,
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });

const isClosedStreamControllerError = (error: unknown) =>
  error instanceof Error && /Unable to enqueue|already closed|Invalid state/i.test(error.message);

export const emitEvent = (controller: ReadableStreamDefaultController<Uint8Array>, event: AgentRuntimeEvent) => {
  try {
    controller.enqueue(
      new TextEncoder().encode(serializeAgentStreamPacket({ kind: "event", event }))
    );
    return true;
  } catch (error: unknown) {
    if (!isClosedStreamControllerError(error)) throw error;
    return false;
  }
};

export const emitResult = (controller: ReadableStreamDefaultController<Uint8Array>, result: QalamRunResult) => {
  try {
    controller.enqueue(
      new TextEncoder().encode(serializeAgentStreamPacket({ kind: "result", result }))
    );
    return true;
  } catch (error: unknown) {
    if (!isClosedStreamControllerError(error)) throw error;
    return false;
  }
};

export const emitError = (controller: ReadableStreamDefaultController<Uint8Array>, error: string) => {
  try {
    controller.enqueue(
      new TextEncoder().encode(serializeAgentStreamPacket({ kind: "error", error }))
    );
    return true;
  } catch (errorLike: unknown) {
    if (!isClosedStreamControllerError(errorLike)) throw errorLike;
    return false;
  }
};

export const emitTrace = (
  controller: ReadableStreamDefaultController<Uint8Array>,
  runId: string,
  stage: "runtime" | "session" | "model" | "tool" | "result",
  status: "info" | "running" | "success" | "error",
  title: string,
  detail?: string,
  payload?: string
) => {
  return emitEvent(controller, {
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
