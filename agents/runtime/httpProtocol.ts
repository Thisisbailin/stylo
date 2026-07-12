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

export const parseAgentStreamPacket = (raw: string): AgentHttpStreamPacket => {
  const packet: unknown = JSON.parse(raw);
  if (!isRecord(packet) || typeof packet.kind !== "string") {
    throw new Error("Malformed Agent stream packet");
  }
  if (packet.kind === "error" && typeof packet.error === "string") {
    return { kind: "error", error: packet.error };
  }
  if (packet.kind === "event" && isRecord(packet.event)) {
    return { kind: "event", event: packet.event as AgentRuntimeEvent };
  }
  if (packet.kind === "result" && isRecord(packet.result)) {
    const result = packet.result as unknown as QalamRunResult;
    return {
      kind: "result",
      result: {
        ...result,
        ...(result.updatedNodeFlow !== undefined
          ? { updatedNodeFlow: parseNodeFlowFile(result.updatedNodeFlow) }
          : {}),
      },
    };
  }
  throw new Error("Malformed Agent stream packet");
};
