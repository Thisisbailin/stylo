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

const parseRecoverableToolErrorOutput = (value: unknown) => {
  const result =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : typeof value === "string" && value.trim().startsWith("{")
        ? (() => {
            try {
              const parsed = JSON.parse(value);
              return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
            } catch {
              return null;
            }
          })()
        : null;
  if (result?.target === "tool_error" && result?.recoverable === true) return result;
  return null;
};

const stringArg = (args: Record<string, unknown>, snake: string, camel = snake) =>
  typeof (args[snake] ?? args[camel]) === "string" ? String(args[snake] ?? args[camel]).trim() : "";

export const createQalamInputGuardrails = (): InputGuardrail[] => [
  {
    name: "input_size_guardrail",
    runInParallel: false,
    execute: async ({ input }) => {
      const text = extractInputText(input);
      if (!text) {
        return {
          tripwireTriggered: true,
          outputInfo: { message: "Input is empty." },
        };
      }
      if (text.length > 12000) {
        return {
          tripwireTriggered: true,
          outputInfo: { message: "Input is too long; narrow the task or split it into smaller steps." },
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
          message: text ? "ok" : "Agent output text is empty; runtime may synthesize a minimal tool-result reply.",
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
  void bridge;

  if (toolName === "search_project_resource") {
    return [
      defineToolInputGuardrail({
        name: "search_query_guardrail",
        run: async ({ toolCall }) => {
          const args = parseToolArguments((toolCall as any).arguments);
          const query = typeof args.query === "string" ? args.query.trim() : "";
          if (query.length < 1) {
            return ToolGuardrailFunctionOutputFactory.rejectContent(
              "search_project_resource requires a non-empty query.",
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
          const layer = typeof args.layer === "string" ? args.layer.trim() : "";
          const entity = typeof args.entity === "string" ? args.entity.trim() : "";
          if (!layer || !entity) {
            return ToolGuardrailFunctionOutputFactory.rejectContent("read_project_resource requires layer and entity.");
          }
          return ToolGuardrailFunctionOutputFactory.allow({ layer, entity });
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
          const entity = typeof args.entity === "string" ? String(args.entity).trim() : "";
          const action = typeof args.action === "string" ? String(args.action).trim() : "";

          if (entity === "node" && action === "create") {
            const nodeKind = stringArg(args, "node_kind", "nodeKind");
            const text = typeof args.text === "string" ? args.text.trim() : "";
            const content = typeof args.content === "string" ? args.content.trim() : "";
            const allowedKinds = [
              "script",
              "script_page",
              "script_node",
              "script_document",
              "archive",
              "archive_document",
              "archive_node",
              "document",
              "md_text",
              "text",
              "image",
              "image_input",
              "audio",
              "audio_input",
              "video",
              "video_input",
            ];
            if (!allowedKinds.includes(nodeKind)) {
              return ToolGuardrailFunctionOutputFactory.rejectContent("Unsupported Flow node kind.", { nodeKind });
            }
            if (nodeKind === "text" && !text && !content) {
              return ToolGuardrailFunctionOutputFactory.rejectContent("Text nodes require text or content.", { nodeKind });
            }
            return ToolGuardrailFunctionOutputFactory.allow({ entity, action, nodeKind });
          }

          if (entity === "node" && action === "update") {
            const nodeId = stringArg(args, "node_id", "nodeId");
            const nodeRef = stringArg(args, "node_ref", "nodeRef");
            const patch = args.patch && typeof args.patch === "object" && !Array.isArray(args.patch) ? args.patch : null;
            if (!nodeId && !nodeRef) {
              return ToolGuardrailFunctionOutputFactory.rejectContent("Updating a Flow node requires node_id or node_ref.", {
                entity,
                action,
              });
            }
            if (!patch || Object.keys(patch).length === 0) {
              return ToolGuardrailFunctionOutputFactory.rejectContent("Updating a Flow node requires a non-empty patch.", {
                entity,
                action,
              });
            }
            return ToolGuardrailFunctionOutputFactory.allow({ entity, action });
          }

          if (entity === "node" && action === "move") {
            const nodeId = stringArg(args, "node_id", "nodeId");
            const nodeRef = stringArg(args, "node_ref", "nodeRef");
            const x = Number(args.x);
            const y = Number(args.y);
            if (!nodeId && !nodeRef) {
              return ToolGuardrailFunctionOutputFactory.rejectContent("Moving a Flow node requires node_id or node_ref.", {
                entity,
                action,
              });
            }
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
              return ToolGuardrailFunctionOutputFactory.rejectContent("Moving a Flow node requires finite x and y.", {
                entity,
                action,
              });
            }
            return ToolGuardrailFunctionOutputFactory.allow({ entity, action });
          }

          if (entity === "node" && action === "remove") {
            return ToolGuardrailFunctionOutputFactory.rejectContent(
              "Direct Flow node removal is disabled for the agent. Ask the user to remove the node manually.",
              { entity, action }
            );
          }

          if (entity === "link" && action === "connect") {
            return ToolGuardrailFunctionOutputFactory.allow({
              entity,
              action,
              linkRole: stringArg(args, "link_role", "linkRole") || "connection",
            });
          }

          if (entity === "link" && action === "unlink") {
            return ToolGuardrailFunctionOutputFactory.rejectContent(
              "Direct Flow unlink is disabled for the agent. Ask the user to unlink manually.",
              { entity, action }
            );
          }

          return ToolGuardrailFunctionOutputFactory.rejectContent(
            "operate_project_resource supports Flow node create/update/move and link connect.",
            { entity, action }
          );
        },
      }),
    ];
  }

  if (toolName === "move_flow_node") {
    return [
      defineToolInputGuardrail({
        name: "move_flow_node_guardrail",
        run: async ({ toolCall }) => {
          const args = parseToolArguments((toolCall as any).arguments);
          const nodeId = stringArg(args, "node_id", "nodeId");
          const nodeRef = stringArg(args, "node_ref", "nodeRef");
          const x = Number(args.x);
          const y = Number(args.y);
          if (!nodeId && !nodeRef) {
            return ToolGuardrailFunctionOutputFactory.rejectContent("move_flow_node needs node_id or node_ref.", {
              toolName,
            });
          }
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return ToolGuardrailFunctionOutputFactory.rejectContent("move_flow_node needs finite x and y.", {
              toolName,
            });
          }
          return ToolGuardrailFunctionOutputFactory.allow({ nodeId, nodeRef, x, y });
        },
      }),
    ];
  }

  if (toolName === "connect_flow_nodes") {
    return [
      defineToolInputGuardrail({
        name: "connect_flow_nodes_guardrail",
        run: async ({ toolCall }) => {
          const args = parseToolArguments((toolCall as any).arguments);
          const sourceNodeId = stringArg(args, "source_node_id", "sourceNodeId");
          const targetNodeId = stringArg(args, "target_node_id", "targetNodeId");
          const sourceRef = stringArg(args, "source_ref", "sourceRef");
          const targetRef = stringArg(args, "target_ref", "targetRef");
          const connectionKind = stringArg(args, "connection_kind", "connectionKind") || "canvas";
          if ((!sourceNodeId && !sourceRef) || (!targetNodeId && !targetRef)) {
            return ToolGuardrailFunctionOutputFactory.rejectContent(
              "connect_flow_nodes needs source and target node_id or node_ref.",
              { toolName }
            );
          }
          if ((sourceNodeId || sourceRef) === (targetNodeId || targetRef)) {
            return ToolGuardrailFunctionOutputFactory.rejectContent("connect_flow_nodes cannot connect a node to itself.", {
              toolName,
            });
          }
          if (connectionKind === "reference" && (!sourceRef || !targetRef)) {
            return ToolGuardrailFunctionOutputFactory.rejectContent(
              "connect_flow_nodes connection_kind=reference needs source_ref and target_ref.",
              { toolName }
            );
          }
          return ToolGuardrailFunctionOutputFactory.allow({
            sourceNodeId,
            targetNodeId,
            sourceRef,
            targetRef,
            connectionKind,
          });
        },
      }),
    ];
  }

  return [];
};

export const createQalamToolOutputGuardrails = (toolName: string): ToolOutputGuardrailDefinition[] => {
  if (toolName === "operate_project_resource") {
    return [
      defineToolOutputGuardrail({
        name: "operate_project_resource_output_guardrail",
        run: async ({ output }) => {
          const toolError = parseRecoverableToolErrorOutput(output);
          if (toolError) {
            return ToolGuardrailFunctionOutputFactory.allow({
              target: "tool_error",
              recoverable: true,
              toolName: toolError.tool_name || toolName,
            });
          }
          const result = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
          const target = typeof result?.target === "string" ? result.target : "";
          const artifact =
            result?.artifact && typeof result.artifact === "object"
              ? (result.artifact as Record<string, unknown>)
              : null;
          const artifactKind = typeof artifact?.kind === "string" ? artifact.kind : "";
          if (result?.skipped === true) {
            return ToolGuardrailFunctionOutputFactory.allow({ target, skipped: true });
          }
          if (!result || result.updated !== true || !target || !artifactKind) {
            return ToolGuardrailFunctionOutputFactory.throwException({
              toolName,
              reason: "invalid_output_shape",
            });
          }
          return ToolGuardrailFunctionOutputFactory.allow({ target, artifactKind });
        },
      }),
    ];
  }

  return [];
};
