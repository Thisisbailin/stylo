import type { ProjectData } from "../../types";
import type { NodeFlowFile } from "../../node-workspace/types";
import type { QalamToolSettings } from "../../types";
import type { AgentRuntimeEvent, QalamRunInput, QalamRunResult } from "./types";
import { parseNodeFlowFile } from "../../node-workspace/nodeflow/schema";

export type AgentHttpRuntimeConfig = {
  provider?: "qwen" | "openrouter" | "ark" | "deepseek";
  model: string;
  baseUrl?: string;
  qalamTools?: QalamToolSettings;
};

export type AgentHttpRunRequest = {
  run: QalamRunInput;
  runtime: AgentHttpRuntimeConfig;
  projectData?: ProjectData;
  nodeFlow: NodeFlowFile;
};

export type AgentHttpStreamPacket =
  | { kind: "event"; event: AgentRuntimeEvent }
  | { kind: "result"; result: QalamRunResult }
  | { kind: "error"; error: string };

export const AGENT_HTTP_STREAM_CONTENT_TYPE = "text/event-stream; charset=utf-8";

export const serializeAgentStreamPacket = (packet: AgentHttpStreamPacket) =>
  `data: ${JSON.stringify(packet)}\n\n`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const failMalformedPacket = (): never => {
  throw new Error("Malformed Agent stream packet");
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const TOOL_CALL_STATUSES = new Set(["running", "success", "error"]);

const parseToolCall = (value: unknown) => {
  if (!isRecord(value) || !isNonEmptyString(value.callId) || !isNonEmptyString(value.name)) {
    return failMalformedPacket();
  }
  if (typeof value.status !== "string" || !TOOL_CALL_STATUSES.has(value.status)) {
    return failMalformedPacket();
  }
  return value;
};

const parseRunResult = (value: unknown): QalamRunResult => {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.projectId) ||
    !isNonEmptyString(value.sessionId) ||
    typeof value.finalText !== "string" ||
    !Array.isArray(value.outputItems) ||
    !Array.isArray(value.toolCalls)
  ) {
    return failMalformedPacket();
  }
  value.toolCalls.forEach(parseToolCall);
  const result = value as unknown as QalamRunResult;
  return {
    ...result,
    ...(result.updatedNodeFlow !== undefined
      ? { updatedNodeFlow: parseNodeFlowFile(result.updatedNodeFlow) }
      : {}),
  };
};

const parseRuntimeEvent = (value: unknown): AgentRuntimeEvent => {
  if (!isRecord(value) || !isNonEmptyString(value.type) || !isNonEmptyString(value.runId)) {
    return failMalformedPacket();
  }
  if (
    value.sequence !== undefined &&
    (!Number.isSafeInteger(value.sequence) || Number(value.sequence) <= 0)
  ) {
    return failMalformedPacket();
  }
  switch (value.type) {
    case "run_started":
      if (!isNonEmptyString(value.sessionId)) return failMalformedPacket();
      break;
    case "trace": {
      const entry = value.entry;
      if (
        !isRecord(entry) ||
        !isNonEmptyString(entry.id) ||
        typeof entry.at !== "number" ||
        !isNonEmptyString(entry.stage) ||
        !isNonEmptyString(entry.status) ||
        !isNonEmptyString(entry.title)
      ) return failMalformedPacket();
      break;
    }
    case "message_delta":
      if (typeof value.delta !== "string" || typeof value.accumulatedText !== "string") return failMalformedPacket();
      break;
    case "reasoning_delta":
      if (typeof value.delta !== "string" || typeof value.accumulatedText !== "string") return failMalformedPacket();
      break;
    case "reasoning_completed":
      if (typeof value.text !== "string") return failMalformedPacket();
      break;
    case "tool_called":
    case "tool_completed":
      parseToolCall(value.call);
      break;
    case "tool_failed":
      parseToolCall(value.call);
      if (typeof value.error !== "string") return failMalformedPacket();
      break;
    case "message_completed":
      if (typeof value.text !== "string" || typeof value.isFinal !== "boolean") return failMalformedPacket();
      break;
    case "run_completed":
      return { ...value, result: parseRunResult(value.result) } as unknown as AgentRuntimeEvent;
    case "run_failed":
      if (typeof value.error !== "string") return failMalformedPacket();
      break;
    default:
      return failMalformedPacket();
  }
  return value as unknown as AgentRuntimeEvent;
};

export class AgentEventSequenceGuard {
  private readonly lastSequenceByRun = new Map<string, number>();

  accept(event: AgentRuntimeEvent) {
    if (event.sequence === undefined) return true;
    const previous = this.lastSequenceByRun.get(event.runId) || 0;
    if (event.sequence <= previous) return false;
    this.lastSequenceByRun.set(event.runId, event.sequence);
    return true;
  }
}

export const parseAgentStreamPacket = (raw: string): AgentHttpStreamPacket => {
  const packet: unknown = JSON.parse(raw);
  if (!isRecord(packet) || typeof packet.kind !== "string") {
    throw new Error("Malformed Agent stream packet");
  }
  if (packet.kind === "error" && typeof packet.error === "string") {
    return { kind: "error", error: packet.error };
  }
  if (packet.kind === "event" && isRecord(packet.event)) {
    return { kind: "event", event: parseRuntimeEvent(packet.event) };
  }
  if (packet.kind === "result" && isRecord(packet.result)) {
    return { kind: "result", result: parseRunResult(packet.result) };
  }
  return failMalformedPacket();
};
