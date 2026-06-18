import type { AgentExecutedToolCall } from "./types";

export const DEFAULT_AGENT_ACTIVITY_STORAGE_KEY = "qalam_agent_tool_activity_v1";
export const AGENT_ACTIVITY_STORAGE_UPDATED_EVENT = "qalam:agent-activity-storage-updated";

export type AgentToolActivityRecord = {
  toolName: string;
  lastCalledAt?: number;
  lastCompletedAt?: number;
  lastFailedAt?: number;
  lastStatus?: "running" | "success" | "error";
  lastSummary?: string;
  lastError?: string;
  lastArtifact?: string;
  lastCallId?: string;
  totalCalls: number;
  totalSuccesses: number;
  totalFailures: number;
};

const emitActivityUpdated = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AGENT_ACTIVITY_STORAGE_UPDATED_EVENT));
};

const normalizeActivityRecord = (toolName: string, value: any): AgentToolActivityRecord => ({
  toolName,
  lastCalledAt: typeof value?.lastCalledAt === "number" ? value.lastCalledAt : undefined,
  lastCompletedAt: typeof value?.lastCompletedAt === "number" ? value.lastCompletedAt : undefined,
  lastFailedAt: typeof value?.lastFailedAt === "number" ? value.lastFailedAt : undefined,
  lastStatus:
    value?.lastStatus === "running" || value?.lastStatus === "success" || value?.lastStatus === "error"
      ? value.lastStatus
      : undefined,
  lastSummary: typeof value?.lastSummary === "string" ? value.lastSummary : undefined,
  lastError: typeof value?.lastError === "string" ? value.lastError : undefined,
  lastArtifact: typeof value?.lastArtifact === "string" ? value.lastArtifact : undefined,
  lastCallId: typeof value?.lastCallId === "string" ? value.lastCallId : undefined,
  totalCalls: typeof value?.totalCalls === "number" ? value.totalCalls : 0,
  totalSuccesses: typeof value?.totalSuccesses === "number" ? value.totalSuccesses : 0,
  totalFailures: typeof value?.totalFailures === "number" ? value.totalFailures : 0,
});

const readActivityMap = (storageKey: string): Record<string, AgentToolActivityRecord> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([toolName, value]) => [toolName, normalizeActivityRecord(toolName, value)])
    );
  } catch {
    return {};
  }
};

const writeActivityMap = (storageKey: string, map: Record<string, AgentToolActivityRecord>) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(map));
  emitActivityUpdated();
};

const summarizeArtifact = (call: AgentExecutedToolCall) => {
  const output = call.output as any;
  if (!output || typeof output !== "object") return undefined;
  if (output.target === "tool_error" && typeof output.error === "string") {
    return `Tool error: ${output.error}`;
  }
  const artifact = output.artifact && typeof output.artifact === "object" ? output.artifact : null;
  if (artifact?.target === "script:archive" && typeof artifact.title === "string") {
    return `Script archive - ${artifact.title}`;
  }
  if (artifact?.target === "script:folder" && typeof artifact.title === "string") {
    return `Script folder - ${artifact.title}`;
  }
  if (artifact?.target === "script:node" && typeof artifact.title === "string") {
    return `Script node - ${artifact.title}`;
  }
  if (artifact?.target === "script:link") {
    return `Script link - ${artifact.title || "link"}`;
  }
  if (artifact?.target === "script:map" && typeof artifact.title === "string") {
    return `Script map - ${artifact.title}`;
  }
  if (artifact?.target === "nodeflow:node" && typeof artifact.title === "string") {
    return `Flow node - ${artifact.title}`;
  }
  if (artifact?.target === "nodeflow:link") {
    const source = artifact.source?.node_ref || artifact.source?.node_id || "source";
    const destination = artifact.destination?.node_ref || artifact.destination?.node_id || "target";
    return `Flow link - ${source} -> ${destination}`;
  }
  if (artifact?.target === "nodeflow:map" && typeof artifact.title === "string") {
    return `Flow map - ${artifact.title}`;
  }
  if (artifact?.target === "nodeflow:approval" && typeof artifact.title === "string") {
    return `Flow approval - ${artifact.title}`;
  }
  if (output.target === "nodeflow:node" && typeof output.item?.title === "string") {
    return `Flow node - ${output.item.title}`;
  }
  if (output.target === "nodeflow:link" && output.role === "connection") {
    return `Flow link - ${output.item?.source_ref || output.item?.source_node_id || "source"} -> ${output.item?.target_ref || output.item?.target_node_id || "target"}`;
  }
  if (output.target === "nodeflow:link" && output.role === "reference") {
    return `Flow reference - ${output.item?.source_ref || "source"} -> ${output.item?.target_ref || "target"}`;
  }
  if (output.target === "script:archive" && typeof output.item?.title === "string") {
    return `Script archive - ${output.item.title}`;
  }
  if (output.target === "script:folder" && typeof output.item?.title === "string") {
    return `Script folder - ${output.item.title}`;
  }
  return undefined;
};

export const readAgentToolActivity = (
  storageKey = DEFAULT_AGENT_ACTIVITY_STORAGE_KEY
): Record<string, AgentToolActivityRecord> => readActivityMap(storageKey);

export const recordAgentToolCalled = (
  call: AgentExecutedToolCall,
  storageKey = DEFAULT_AGENT_ACTIVITY_STORAGE_KEY
) => {
  const map = readActivityMap(storageKey);
  const current = map[call.name] || normalizeActivityRecord(call.name, {});
  map[call.name] = {
    ...current,
    lastCalledAt: Date.now(),
    lastStatus: "running",
    lastSummary: call.summary || current.lastSummary,
    lastCallId: call.callId,
    totalCalls: current.totalCalls + 1,
  };
  writeActivityMap(storageKey, map);
};

export const recordAgentToolCompleted = (
  call: AgentExecutedToolCall,
  storageKey = DEFAULT_AGENT_ACTIVITY_STORAGE_KEY
) => {
  const map = readActivityMap(storageKey);
  const current = map[call.name] || normalizeActivityRecord(call.name, {});
  map[call.name] = {
    ...current,
    lastCompletedAt: Date.now(),
    lastStatus: "success",
    lastSummary: call.summary || current.lastSummary,
    lastArtifact: summarizeArtifact(call) || current.lastArtifact,
    lastCallId: call.callId,
    totalSuccesses: current.totalSuccesses + 1,
  };
  writeActivityMap(storageKey, map);
};

export const recordAgentToolFailed = (
  call: AgentExecutedToolCall,
  error: string,
  storageKey = DEFAULT_AGENT_ACTIVITY_STORAGE_KEY
) => {
  const map = readActivityMap(storageKey);
  const current = map[call.name] || normalizeActivityRecord(call.name, {});
  map[call.name] = {
    ...current,
    lastFailedAt: Date.now(),
    lastStatus: "error",
    lastSummary: call.summary || current.lastSummary,
    lastError: error,
    lastCallId: call.callId,
    totalFailures: current.totalFailures + 1,
  };
  writeActivityMap(storageKey, map);
};
