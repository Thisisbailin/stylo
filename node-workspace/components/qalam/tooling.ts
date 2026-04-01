import type { AgentToolCall } from "../../../services/toolingTypes";
import type { ToolMessage } from "./types";
import type { QalamToolSettings } from "../../../types";

export const normalizeQalamToolSettings = (value: QalamToolSettings | undefined) => {
  const projectData = value?.projectData || {};
  const workflowBuilder = value?.workflowBuilder || {};
  const characterLocation = value?.characterLocation || {};
  return {
    projectData: {
      enabled: projectData.enabled ?? true,
    },
    workflowBuilder: {
      enabled: workflowBuilder.enabled ?? true,
    },
    characterLocation: {
      enabled: characterLocation.enabled ?? true,
      mergeStrategy: characterLocation.mergeStrategy === "replace" ? "replace" : "patch",
      formsMode: characterLocation.formsMode === "replace" ? "replace" : "merge",
      zonesMode: characterLocation.zonesMode === "replace" ? "replace" : "merge",
    },
  };
};

export const parseToolArguments = (value: string) => {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

export const buildToolSummary = (name: string, args: any) => {
  if (name === "list_project_resources") {
    return `资源目录：${args?.resource_type || "project"}`;
  }
  if (name === "read_project_resource") {
    return `资源读取：${args?.resource_type || "resource"}`;
  }
  if (name === "search_project_resource") {
    return `资源搜索：${String(args?.query || "").slice(0, 32)}`;
  }
  if (name === "edit_project_resource") {
    return `资源写入：${args?.resource_type || "resource"}`;
  }
  if (name === "operate_project_resource") {
    return `图操作：${args?.resource_type || "graph"}`;
  }
  return "工具调用";
};

export const applyToolDefaults = (
  name: string | undefined,
  args: any,
  settings: ReturnType<typeof normalizeQalamToolSettings>
) => {
  void name;
  void settings;
  return args;
};

export type ToolCallMeta = {
  tc: AgentToolCall;
  args: any;
  callId: string;
};

export const buildToolCallMeta = (
  toolCalls: AgentToolCall[],
  settings: ReturnType<typeof normalizeQalamToolSettings>
): ToolCallMeta[] => {
  const baseTs = Date.now();
  return toolCalls.map((tc, idx) => {
    const parsed = parseToolArguments(tc.arguments);
    const args = applyToolDefaults(tc.name, parsed, settings);
    const callId = tc.callId || `${tc.name || "tool"}-${baseTs}-${idx}`;
    return { tc, args, callId };
  });
};

export const buildToolMessages = (toolMeta: ToolCallMeta[]): ToolMessage[] =>
  toolMeta.map(({ tc, args, callId }) => ({
    role: "assistant",
    kind: "tool",
    tool: {
      name: tc.name || "tool",
      status: "queued",
      summary: buildToolSummary(tc.name, args),
      evidence: Array.isArray(args?.evidence) ? args.evidence : undefined,
      callId,
    },
  }));
