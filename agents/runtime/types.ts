import type { Session } from "@openai/agents";
import type { ProjectData, QalamToolSettings } from "../../types";

export type AgentAttachment = {
  id: string;
  kind: "image";
  name: string;
  mimeType: string;
  url: string;
};

export type AgentUiContext = {
  supplementalContextText?: string;
  mentionTags?: Array<{ kind: "character" | "location"; name: string; id?: string }>;
};

export type AgentEnvironmentProjectDigest = {
  fileName?: string;
  episodeCount: number;
  projectSummary?: string;
  episodeSummaries: Array<{
    episodeId: number;
    label: string;
    summary: string;
  }>;
  primaryRoles: Array<{
    id: string;
    mention: string;
    displayName: string;
    summary: string;
    episodeUsage?: string;
  }>;
  sceneRoles: Array<{
    id: string;
    mention: string;
    displayName: string;
    summary: string;
    episodeUsage?: string;
  }>;
  understandingCoverage: {
    hasProjectSummary: boolean;
    episodeSummaryCount: number;
    primaryRoleCount: number;
    sceneRoleCount: number;
    guideCount: number;
  };
};

export type AgentEnvironmentCapabilityManifest = {
  read: {
    tools: string[];
    resources: string[];
    scopes: string[];
  };
  edit: {
    tools: string[];
    resources: string[];
  };
  operate: {
    tools: string[];
    resources: string[];
    nodeKinds: string[];
  };
};

export type AgentEnvironmentRecentAction = {
  toolName: string;
  summary: string;
  createdAt?: number;
};

export type AgentMemoryTurn = {
  role: "user" | "assistant";
  text: string;
  createdAt?: number;
};

export type AgentMemoryToolRecord = {
  toolName: string;
  status: "success" | "error";
  summary: string;
  createdAt?: number;
};

export type Script2VideoAgentMemory = {
  recentTurns: AgentMemoryTurn[];
  recentSuccessfulTools: AgentMemoryToolRecord[];
  recentFailedTools: AgentMemoryToolRecord[];
};

export type Script2VideoAgentEnvironment = {
  project: AgentEnvironmentProjectDigest;
  capabilityManifest: AgentEnvironmentCapabilityManifest;
  runtimeCapabilities: {
    runtimeMode: "browser" | "edge_full";
    enabledTools: string[];
    canRead: boolean;
    canEdit: boolean;
    canOperate: boolean;
  };
  recentSuccessfulActions: AgentEnvironmentRecentAction[];
};

export type Script2VideoRunContext = {
  runtimeMode: "browser" | "edge_full";
  agentEnvironment: Script2VideoAgentEnvironment;
  agentMemory: Script2VideoAgentMemory;
  uiContext?: AgentUiContext;
};

export type AgentExecutedToolCall = {
  callId: string;
  name: string;
  status: "running" | "success" | "error";
  summary?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
};

export type AgentOutputItem =
  | { kind: "text"; text: string }
  | { kind: "tool_result"; toolCall: AgentExecutedToolCall };

export type AgentTraceStage = "runtime" | "session" | "model" | "tool" | "result";
export type AgentTraceStatus = "info" | "running" | "success" | "error";
export type AgentTraceEntry = {
  id: string;
  at: number;
  stage: AgentTraceStage;
  status: AgentTraceStatus;
  title: string;
  detail?: string;
  payload?: string;
};

export type Script2VideoRunInput = {
  sessionId: string;
  userText: string;
  attachments?: AgentAttachment[];
  enabledSkillIds?: string[];
  uiContext?: AgentUiContext;
};

export type Script2VideoRunResult = {
  finalText: string;
  sessionId: string;
  outputItems: AgentOutputItem[];
  toolCalls: AgentExecutedToolCall[];
  updatedProjectData?: ProjectData;
  tracing?: {
    enabled: boolean;
    traceId?: string;
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export interface Script2VideoAgentRuntime {
  run(input: Script2VideoRunInput, options?: Script2VideoRunOptions): Promise<Script2VideoRunResult>;
}

export type AgentRuntimeEvent =
  | { type: "run_started"; sessionId: string; runId: string; traceId?: string; tracingEnabled?: boolean }
  | { type: "trace"; runId: string; entry: AgentTraceEntry }
  | { type: "message_delta"; runId: string; delta: string; accumulatedText: string }
  | { type: "reasoning_delta"; runId: string; delta: string; accumulatedText: string }
  | { type: "reasoning_completed"; runId: string; text: string }
  | { type: "tool_called"; call: AgentExecutedToolCall }
  | { type: "tool_completed"; call: AgentExecutedToolCall }
  | { type: "tool_failed"; call: AgentExecutedToolCall; error: string }
  | { type: "message_completed"; runId: string; text: string }
  | { type: "run_completed"; runId: string; result: Script2VideoRunResult }
  | { type: "run_failed"; runId: string; error: string };

export type Script2VideoRunOptions = {
  onEvent?: (event: AgentRuntimeEvent) => void;
  signal?: AbortSignal;
};

export type Script2VideoAgentConfig = {
  provider?: "qwen" | "openrouter";
  runtimeTarget?: "browser" | "edge";
  apiKey?: string;
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  model: string;
  qalamTools?: QalamToolSettings;
  tracingDisabled?: boolean;
};

export interface Script2VideoAgentConfigProvider {
  getConfig(): Promise<Script2VideoAgentConfig> | Script2VideoAgentConfig;
}

export type Script2VideoSkillDefinition = {
  id: string;
  title: string;
  description: string;
  systemOverlay: string;
  preferredTools?: string[];
  disabledTools?: string[];
};

export interface Script2VideoSkillLoader {
  listSkills(): Promise<Script2VideoSkillDefinition[]> | Script2VideoSkillDefinition[];
  getSkill(id: string): Promise<Script2VideoSkillDefinition | null> | Script2VideoSkillDefinition | null;
}

export type AgentSessionMessage =
  | {
      role: "user" | "assistant";
      text: string;
      createdAt: number;
    }
  | {
      role: "tool";
      text: string;
      createdAt: number;
      toolName: string;
      toolCallId: string;
      toolStatus: "success" | "error";
      toolOutput?: unknown;
    };

export type Script2VideoSessionRecord = {
  id: string;
  messages: AgentSessionMessage[];
  updatedAt: number;
};

export interface Script2VideoSessionStore {
  getSession(sessionId: string): Promise<Session> | Session;
}

export interface Script2VideoAgentTracer {
  onRunStarted(input: Script2VideoRunInput): void;
  onToolCalled(call: AgentExecutedToolCall): void;
  onToolCompleted(call: AgentExecutedToolCall): void;
  onRunCompleted(result: Script2VideoRunResult): void;
  onRunFailed(error: string): void;
}
