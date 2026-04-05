import type { Session } from "@openai/agents";
import type { ProjectData, QalamToolSettings } from "../../types";
import type { KnowledgeSnapshot } from "../../node-workspace/knowledge/types";
import type { NodeFlowFile } from "../../node-workspace/types";
import type { NodeFlowExecutionApprovalProposal } from "../../node-workspace/nodeflow/approvals";

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
  sceneCount: number;
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
  knowledgeCoverage: {
    hasProjectSummary: boolean;
    episodeSummaryCount: number;
    primaryRoleCount: number;
    sceneRoleCount: number;
  };
  readingLayers: {
    knowledge: {
      nodeCount: number;
      linkCount: number;
      canonicalNodeCount: number;
      derivedNodeCount: number;
      canonicalBackbone: string;
    };
    nodeflow: {
      nodeCount: number;
      linkCount: number;
      graphLinkCount: number;
    };
  };
  graphWorld: {
    centerSurface: "Nodes";
    planes: {
      front: "Flow";
      back: "Knowledge";
    };
    actions: {
      read: {
        covers: Array<"knowledge" | "nodeflow">;
      };
      edit: {
        target: "knowledge";
      };
      operate: {
        target: "nodeflow";
      };
    };
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

export type QalamAgentMemory = {
  recentTurns: AgentMemoryTurn[];
  recentSuccessfulTools: AgentMemoryToolRecord[];
  recentFailedTools: AgentMemoryToolRecord[];
};

export type QalamAgentEnvironment = {
  project: AgentEnvironmentProjectDigest;
  capabilityManifest: AgentEnvironmentCapabilityManifest;
  executionApprovals: {
    pendingCount: number;
    pendingNodeTitles: string[];
  };
  runtimeCapabilities: {
    runtimeMode: "browser" | "edge_full";
    enabledTools: string[];
    canRead: boolean;
    canEdit: boolean;
    canOperate: boolean;
  };
  recentSuccessfulActions: AgentEnvironmentRecentAction[];
};

export type QalamRunContext = {
  runtimeMode: "browser" | "edge_full";
  agentEnvironment: QalamAgentEnvironment;
  agentMemory: QalamAgentMemory;
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

export type QalamRunInput = {
  sessionId: string;
  userText: string;
  attachments?: AgentAttachment[];
  enabledSkillIds?: string[];
  uiContext?: AgentUiContext;
};

export type QalamRunResult = {
  finalText: string;
  sessionId: string;
  outputItems: AgentOutputItem[];
  toolCalls: AgentExecutedToolCall[];
  updatedProjectData?: ProjectData;
  updatedKnowledge?: KnowledgeSnapshot;
  updatedNodeFlow?: NodeFlowFile;
  updatedExecutionApprovals?: NodeFlowExecutionApprovalProposal[];
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

export interface QalamAgentRuntime {
  run(input: QalamRunInput, options?: QalamRunOptions): Promise<QalamRunResult>;
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
  | { type: "run_completed"; runId: string; result: QalamRunResult }
  | { type: "run_failed"; runId: string; error: string };

export type QalamRunOptions = {
  onEvent?: (event: AgentRuntimeEvent) => void;
  signal?: AbortSignal;
};

export type QalamAgentConfig = {
  provider?: "qwen" | "openrouter" | "ark";
  runtimeTarget?: "browser" | "edge";
  apiKey?: string;
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  model: string;
  qalamTools?: QalamToolSettings;
  tracingDisabled?: boolean;
};

export interface QalamAgentConfigProvider {
  getConfig(): Promise<QalamAgentConfig> | QalamAgentConfig;
}

export type QalamSkillManifest = {
  id: string;
  title: string;
  description: string;
  sourcePath?: string;
  activationMode?: "explicit" | "implicit";
  tags?: string[];
  preferredTools?: string[];
  disabledTools?: string[];
  implicitInvocationHints?: string[];
  version?: string;
};

export type QalamResolvedSkill = QalamSkillManifest & {
  guidanceMarkdown: string;
  overlays: string[];
  preferredTools?: string[];
  disabledTools?: string[];
  metadata?: Record<string, string>;
};

export interface QalamSkillLoader {
  listSkills(): Promise<QalamSkillManifest[]> | QalamSkillManifest[];
  getSkill(id: string): Promise<QalamResolvedSkill | null> | QalamResolvedSkill | null;
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

export type QalamSessionRecord = {
  id: string;
  messages: AgentSessionMessage[];
  updatedAt: number;
};

export interface QalamSessionStore {
  getSession(sessionId: string): Promise<Session> | Session;
}

export interface QalamAgentTracer {
  onRunStarted(input: QalamRunInput): void;
  onToolCalled(call: AgentExecutedToolCall): void;
  onToolCompleted(call: AgentExecutedToolCall): void;
  onRunCompleted(result: QalamRunResult): void;
  onRunFailed(error: string): void;
}
