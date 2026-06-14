import type { ProjectData } from "../../types";
import type { NodeFlowFile } from "../../node-workspace/types";
import type { QalamToolSettings } from "../../types";
import type { AgentRuntimeEvent, QalamRunInput, QalamRunResult } from "./types";

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
  nodeFlow?: NodeFlowFile;
};

export type AgentHttpStreamPacket =
  | { kind: "event"; event: AgentRuntimeEvent }
  | { kind: "result"; result: QalamRunResult }
  | { kind: "error"; error: string };

export const AGENT_HTTP_STREAM_CONTENT_TYPE = "text/event-stream; charset=utf-8";

export const serializeAgentStreamPacket = (packet: AgentHttpStreamPacket) =>
  `data: ${JSON.stringify(packet)}\n\n`;

export const parseAgentStreamPacket = (raw: string): AgentHttpStreamPacket => JSON.parse(raw) as AgentHttpStreamPacket;
