import {
  ToolGuardrailFunctionOutputFactory,
  defineToolInputGuardrail,
  defineToolOutputGuardrail,
  type InputGuardrail,
  type OutputGuardrail,
  type ToolInputGuardrailDefinition,
  type ToolOutputGuardrailDefinition,
} from "@openai/agents";
import type { QalamAgentBridge } from "../bridge/qalamBridge";

export type QalamGuardrailContext = {
  runtimeMode: "browser" | "edge_full";
};

const extractInputText = (input: string | any[]) => {
  if (typeof input === "string") return input.trim();
  if (!Array.isArray(input)) return "";
  return input
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      if (typeof (item as any).content === "string") return (item as any).content;
      if (!Array.isArray((item as any).content)) return "";
      return (item as any).content
        .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n")
    .trim();
};

const parseToolArguments = (value: unknown) => {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

export const createQalamInputGuardrails = (): InputGuardrail[] => [
  {
    name: "input_size_guardrail",
    runInParallel: false,
    execute: async ({ input }) => {
      const text = extractInputText(input);
      if (!text) {
        return {
          tripwireTriggered: true,
          outputInfo: { message: "输入为空，Agent 不应启动空回合。" },
        };
      }
      if (text.length > 12000) {
        return {
          tripwireTriggered: true,
          outputInfo: { message: "输入过长，请先缩小任务范围或分步执行。" },
        };
      }
      return {
        tripwireTriggered: false,
        outputInfo: { chars: text.length },
      };
    },
  },
];

export const createQalamOutputGuardrails = (): OutputGuardrail[] => [
  {
    name: "non_empty_output_guardrail",
    execute: async ({ agentOutput }) => {
      const text =
        typeof (agentOutput as any)?.text === "string"
          ? (agentOutput as any).text.trim()
          : typeof agentOutput === "string"
            ? agentOutput.trim()
            : "";
      return {
        tripwireTriggered: false,
        outputInfo: {
          message: text ? "ok" : "模型未产出可见回复文本，runtime 将尝试用已完成工具结果生成最小回复。",
          emptyText: !text,
        },
      };
    },
  },
];

export const createQalamToolInputGuardrails = (
  toolName: string,
  bridge: QalamAgentBridge
): ToolInputGuardrailDefinition[] => {
  if (toolName === "search_project_resource") {
    return [
      defineToolInputGuardrail({
        name: "search_query_guardrail",
        run: async ({ toolCall }) => {
          const args = parseToolArguments((toolCall as any).arguments);
          const query = typeof args.query === "string" ? args.query.trim() : "";
          if (query.length < 1) {
            return ToolGuardrailFunctionOutputFactory.rejectContent(
              "search_project_resource 需要非空 query。",
              { queryLength: query.length }
            );
          }
          return ToolGuardrailFunctionOutputFactory.allow({ queryLength: query.length });
        },
      }),
    ];
  }

  if (toolName === "read_project_resource") {
    return [
      defineToolInputGuardrail({
        name: "read_locator_guardrail",
        run: async ({ toolCall }) => {
          const args = parseToolArguments((toolCall as any).arguments);
          const resourceType = typeof args.resource_type === "string" ? args.resource_type.trim() : "";
          if (!resourceType) {
            return ToolGuardrailFunctionOutputFactory.rejectContent("read_project_resource 需要 resource_type。");
          }
          return ToolGuardrailFunctionOutputFactory.allow({ resourceType });
        },
      }),
    ];
  }

  if (toolName === "edit_knowledge_resource") {
    return [
      defineToolInputGuardrail({
        name: "edit_knowledge_resource_guardrail",
        run: async ({ toolCall }) => {
          const args = parseToolArguments((toolCall as any).arguments);
          const resourceType = typeof args.resource_type === "string" ? args.resource_type.trim() : "";
          if (!resourceType) {
            return ToolGuardrailFunctionOutputFactory.rejectContent("edit_knowledge_resource 需要 resource_type。");
          }
          if (!["knowledge_node", "knowledge_link"].includes(resourceType)) {
            return ToolGuardrailFunctionOutputFactory.rejectContent(
              "edit_knowledge_resource 仅支持 knowledge_node 和 knowledge_link。",
              { resourceType }
            );
          }
          return ToolGuardrailFunctionOutputFactory.allow({ resourceType });
        },
      }),
    ];
  }

  if (toolName === "operate_project_resource") {
    return [
      defineToolInputGuardrail({
        name: "operate_project_resource_guardrail",
        run: async ({ toolCall }) => {
          const args = parseToolArguments((toolCall as any).arguments);
          const resourceType =
            typeof (args.resource_type ?? args.resourceType) === "string"
              ? String(args.resource_type ?? args.resourceType).trim()
              : "";
          const effectiveResourceType =
            resourceType === "execution_node"
              ? "nodeflow_node"
              : resourceType === "execution_link"
                ? "nodeflow_link"
                : resourceType === "graph_link"
                  ? "nodeflow_graph_link"
                  : resourceType;

          if (effectiveResourceType === "nodeflow_node") {
            const nodeKind = typeof (args.node_kind ?? args.nodeKind) === "string" ? String(args.node_kind ?? args.nodeKind).trim() : "";
            const episodeId = Number(args.episode_id ?? args.episodeId);

            if (!["text", "script_board", "storyboard_board", "character_card", "script", "storyboard", "character"].includes(nodeKind)) {
              return ToolGuardrailFunctionOutputFactory.rejectContent(
                "nodeflow_node 当前只支持 text、script_board、storyboard_board、character_card。",
                { nodeKind }
              );
            }
            if ((nodeKind === "script_board" || nodeKind === "storyboard_board") && !Number.isInteger(episodeId)) {
              return ToolGuardrailFunctionOutputFactory.rejectContent(`${nodeKind} 需要合法的 episode_id。`, {
                episodeId,
              });
            }
            return ToolGuardrailFunctionOutputFactory.allow({ resourceType: effectiveResourceType, nodeKind });
          }

          if (effectiveResourceType === "nodeflow_link" || effectiveResourceType === "nodeflow_graph_link") {
            return ToolGuardrailFunctionOutputFactory.allow({ resourceType: effectiveResourceType });
          }

          return ToolGuardrailFunctionOutputFactory.rejectContent(
            "operate_project_resource 仅支持 nodeflow_node、nodeflow_link 和 nodeflow_graph_link。",
            { resourceType }
          );
        },
      }),
    ];
  }

  return [];
};

export const createQalamToolOutputGuardrails = (toolName: string): ToolOutputGuardrailDefinition[] => {
  if (toolName === "edit_knowledge_resource") {
    return [
      defineToolOutputGuardrail({
        name: "edit_knowledge_resource_output_guardrail",
        run: async ({ output }) => {
          const result = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
          const resourceType = typeof result?.resource_type === "string" ? result.resource_type : "";
          if (
            !result ||
            result.updated !== true ||
            (resourceType !== "knowledge_node" && resourceType !== "knowledge_link")
          ) {
            return ToolGuardrailFunctionOutputFactory.throwException({
              toolName,
              reason: "invalid_output_shape",
            });
          }
          return ToolGuardrailFunctionOutputFactory.allow({ resourceType });
        },
      }),
    ];
  }

  if (toolName === "operate_project_resource") {
    return [
      defineToolOutputGuardrail({
        name: "operate_project_resource_output_guardrail",
        run: async ({ output }) => {
          const result = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
          const resourceType = typeof result?.resource_type === "string" ? result.resource_type : "";
          const effectiveResourceType =
            resourceType === "execution_node"
              ? "nodeflow_node"
              : resourceType === "execution_link"
                ? "nodeflow_link"
                : resourceType === "graph_link"
                  ? "nodeflow_graph_link"
                  : resourceType;
          if (effectiveResourceType === "nodeflow_node") {
            const nodeId = typeof result?.node_id === "string" ? result.node_id : "";
            const nodeRef = typeof result?.node_ref === "string" ? result.node_ref : "";
            if (!nodeId || !nodeRef) {
              return ToolGuardrailFunctionOutputFactory.throwException({
                toolName,
                reason: "missing_node_identity",
              });
            }
            return ToolGuardrailFunctionOutputFactory.allow({ resourceType: effectiveResourceType, nodeId, nodeRef });
          }
          if (effectiveResourceType === "nodeflow_link") {
            const linkId =
              typeof result?.link_id === "string"
                ? result.link_id
                : typeof result?.edge_id === "string"
                  ? result.edge_id
                  : "";
            const sourceNodeId = typeof result?.source_node_id === "string" ? result.source_node_id : "";
            const targetNodeId = typeof result?.target_node_id === "string" ? result.target_node_id : "";
            if (!linkId || !sourceNodeId || !targetNodeId) {
              return ToolGuardrailFunctionOutputFactory.throwException({
                toolName,
                reason: "missing_edge_identity",
              });
            }
            return ToolGuardrailFunctionOutputFactory.allow({
              resourceType: effectiveResourceType,
              linkId,
              sourceNodeId,
              targetNodeId,
            });
          }
          if (effectiveResourceType === "nodeflow_graph_link") {
            const linkId = typeof result?.link_id === "string" ? result.link_id : "";
            const sourceRef = typeof result?.source_ref === "string" ? result.source_ref : "";
            const targetRef = typeof result?.target_ref === "string" ? result.target_ref : "";
            if (!linkId || !sourceRef || !targetRef) {
              return ToolGuardrailFunctionOutputFactory.throwException({
                toolName,
                reason: "missing_graph_link_identity",
              });
            }
            return ToolGuardrailFunctionOutputFactory.allow({
              resourceType: effectiveResourceType,
              linkId,
              sourceRef,
              targetRef,
            });
          }
          return ToolGuardrailFunctionOutputFactory.throwException({
            toolName,
            reason: "invalid_output_shape",
          });
        },
      }),
    ];
  }

  return [];
};
