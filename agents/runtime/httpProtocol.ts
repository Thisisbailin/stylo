import type { ProjectData } from "../../types";
import type { AgentRuntimeEvent, Script2VideoRunInput, Script2VideoRunResult } from "./types";

export type AgentHttpRuntimeConfig = {
  provider?: "qwen" | "openrouter";
  model: string;
  baseUrl?: string;
};

export type AgentHttpRunRequest = {
  run: Script2VideoRunInput;
  runtime: AgentHttpRuntimeConfig;
  projectData?: ProjectData;
};

export type AgentHttpStreamPacket =
  | { kind: "event"; event: AgentRuntimeEvent }
  | { kind: "result"; result: Script2VideoRunResult }
  | { kind: "error"; error: string };

export const AGENT_HTTP_STREAM_CONTENT_TYPE = "text/event-stream; charset=utf-8";

export const serializeAgentStreamPacket = (packet: AgentHttpStreamPacket) =>
  `data: ${JSON.stringify(packet)}\n\n`;

export const parseAgentStreamPacket = (raw: string): AgentHttpStreamPacket => JSON.parse(raw) as AgentHttpStreamPacket;
