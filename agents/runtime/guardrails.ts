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
          const layer = typeof args.layer === "string" ? args.layer.trim() : "";
          const entity = typeof args.entity === "string" ? args.entity.trim() : "";
          if (!layer || !entity) {
            return ToolGuardrailFunctionOutputFactory.rejectContent("read_project_resource 需要 layer 和 entity。");
          }
          return ToolGuardrailFunctionOutputFactory.allow({ layer, entity });
        },
      }),
    ];
  }

  if (toolName === "edit_script_resource") {
    return [
      defineToolInputGuardrail({
        name: "edit_script_resource_guardrail",
        run: async ({ toolCall }) => {
          const args = parseToolArguments((toolCall as any).arguments);
          const entity = typeof args.entity === "string" ? args.entity.trim() : "";
          const action = typeof args.action === "string" ? args.action.trim() : "";
          if (!entity || !action) {
            return ToolGuardrailFunctionOutputFactory.rejectContent("edit_script_resource 需要 entity 和 action。");
          }
          if (!["archive", "space_block"].includes(entity)) {
            return ToolGuardrailFunctionOutputFactory.rejectContent(
              "edit_script_resource 仅支持 archive 和 space_block。",
              { entity }
            );
          }
          if (!["create", "update"].includes(action)) {
            return ToolGuardrailFunctionOutputFactory.rejectContent(
              "Script resource 当前仅支持 create 或 update。",
              { entity, action }
            );
          }
          if (entity === "space_block" && action !== "update") {
            return ToolGuardrailFunctionOutputFactory.rejectContent(
              "space_block 当前只支持 update。",
              { entity, action }
            );
          }
          if (action === "update") {
            const nodeId = typeof (args.node_id ?? args.nodeId) === "string" ? String(args.node_id ?? args.nodeId).trim() : "";
            const nodeRef = typeof (args.node_ref ?? args.nodeRef) === "string" ? String(args.node_ref ?? args.nodeRef).trim() : "";
            const documentId = typeof (args.document_id ?? args.documentId) === "string" ? String(args.document_id ?? args.documentId).trim() : "";
            const blockId = typeof (args.block_id ?? args.blockId) === "string" ? String(args.block_id ?? args.blockId).trim() : "";
            if (!nodeId && !nodeRef && !documentId && !blockId) {
              return ToolGuardrailFunctionOutputFactory.rejectContent(
                "update Script resource 需要 node_id、node_ref、document_id 或 block_id。",
                { entity, action }
              );
            }
          }
          return ToolGuardrailFunctionOutputFactory.allow({ entity, action });
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
            const nodeKind = typeof (args.node_kind ?? args.nodeKind) === "string" ? String(args.node_kind ?? args.nodeKind).trim() : "";
            const episodeId = Number(args.episode_id ?? args.episodeId);
            const text = typeof args.text === "string" ? args.text.trim() : "";
            const content = typeof args.content === "string" ? args.content.trim() : "";

            if (!["script", "script_page", "script_node", "script_document", "archive", "archive_document", "archive_node", "document", "md_text", "text", "image", "image_input", "audio", "audio_input", "video", "video_input"].includes(nodeKind)) {
              return ToolGuardrailFunctionOutputFactory.rejectContent(
                "nodeflow_node 当前只支持 script、archive、text、image、audio、video 基础节点。",
                { nodeKind }
              );
            }
            if (["script", "script_page", "script_node", "script_document"].includes(nodeKind) && !Number.isInteger(episodeId)) {
              return ToolGuardrailFunctionOutputFactory.rejectContent("script 节点需要合法的 episode_id。", {
                episodeId,
              });
            }
            if (nodeKind === "text" && !text && !content) {
              return ToolGuardrailFunctionOutputFactory.rejectContent("text 节点需要 text 或 content。", {
                nodeKind,
              });
            }
            return ToolGuardrailFunctionOutputFactory.allow({ entity, action, nodeKind });
          }

          if (entity === "node" && action === "update") {
            const nodeId = typeof (args.node_id ?? args.nodeId) === "string" ? String(args.node_id ?? args.nodeId).trim() : "";
            const nodeRef = typeof (args.node_ref ?? args.nodeRef) === "string" ? String(args.node_ref ?? args.nodeRef).trim() : "";
            const patch = args.patch && typeof args.patch === "object" && !Array.isArray(args.patch) ? args.patch : null;
            if (!nodeId && !nodeRef) {
              return ToolGuardrailFunctionOutputFactory.rejectContent("更新 Flow 节点需要 node_id 或 node_ref。", {
                entity,
                action,
              });
            }
            if (!patch || Object.keys(patch).length === 0) {
              return ToolGuardrailFunctionOutputFactory.rejectContent("更新 Flow 节点需要非空 patch。", {
                entity,
                action,
              });
            }
            return ToolGuardrailFunctionOutputFactory.allow({ entity, action });
          }

          if (entity === "node" && action === "move") {
            const nodeId = typeof (args.node_id ?? args.nodeId) === "string" ? String(args.node_id ?? args.nodeId).trim() : "";
            const nodeRef = typeof (args.node_ref ?? args.nodeRef) === "string" ? String(args.node_ref ?? args.nodeRef).trim() : "";
            const x = Number(args.x);
            const y = Number(args.y);
            if (!nodeId && !nodeRef) {
              return ToolGuardrailFunctionOutputFactory.rejectContent("移动 Flow 节点需要 node_id 或 node_ref。", {
                entity,
                action,
              });
            }
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
              return ToolGuardrailFunctionOutputFactory.rejectContent("移动 Flow 节点需要合法的 x 和 y。", {
                entity,
                action,
              });
            }
            return ToolGuardrailFunctionOutputFactory.allow({ entity, action });
          }

          if (entity === "node" && action === "remove") {
            const nodeId = typeof (args.node_id ?? args.nodeId) === "string" ? String(args.node_id ?? args.nodeId).trim() : "";
            const nodeRef = typeof (args.node_ref ?? args.nodeRef) === "string" ? String(args.node_ref ?? args.nodeRef).trim() : "";
            if (!nodeId && !nodeRef) {
              return ToolGuardrailFunctionOutputFactory.rejectContent("删除 Flow 节点需要 node_id 或 node_ref。", {
                entity,
                action,
              });
            }
            return ToolGuardrailFunctionOutputFactory.allow({ entity, action });
          }

          if (entity === "link" && action === "connect") {
            return ToolGuardrailFunctionOutputFactory.allow({
              entity,
              action,
              linkRole:
                typeof (args.link_role ?? args.linkRole) === "string"
                  ? String(args.link_role ?? args.linkRole).trim()
                  : "connection",
            });
          }

          if (entity === "link" && action === "unlink") {
            const linkId = typeof (args.link_id ?? args.linkId) === "string" ? String(args.link_id ?? args.linkId).trim() : "";
            if (!linkId) {
              return ToolGuardrailFunctionOutputFactory.rejectContent("断开 Flow 连线需要 link_id。", {
                entity,
                action,
              });
            }
            return ToolGuardrailFunctionOutputFactory.allow({
              entity,
              action,
              linkRole:
                typeof (args.link_role ?? args.linkRole) === "string"
                  ? String(args.link_role ?? args.linkRole).trim()
                  : "connection",
            });
          }

          return ToolGuardrailFunctionOutputFactory.rejectContent(
            "operate_project_resource 仅支持 Flow 节点 create/update/move/remove 与连线 connect/unlink。",
            { entity, action }
          );
        },
      }),
    ];
  }

  return [];
};

export const createQalamToolOutputGuardrails = (toolName: string): ToolOutputGuardrailDefinition[] => {
  if (toolName === "edit_script_resource") {
    return [
      defineToolOutputGuardrail({
        name: "edit_script_resource_output_guardrail",
        run: async ({ output }) => {
          const result = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
          const target = typeof result?.target === "string" ? result.target : "";
          const artifact =
            result?.artifact && typeof result.artifact === "object"
              ? (result.artifact as Record<string, unknown>)
              : null;
          const artifactKind = typeof artifact?.kind === "string" ? artifact.kind : "";
          const item = result?.item && typeof result.item === "object" ? (result.item as Record<string, unknown>) : null;
          if (
            !result ||
            result.updated !== true ||
            (target !== "script:archive" && target !== "script:space_block") ||
            artifactKind !== "node"
          ) {
            return ToolGuardrailFunctionOutputFactory.throwException({
              toolName,
              reason: "invalid_output_shape",
            });
          }
          const nodeId = typeof item?.node_id === "string" ? item.node_id : "";
          const nodeRef = typeof item?.node_ref === "string" ? item.node_ref : "";
          const artifactId = typeof artifact?.id === "string" ? artifact.id : "";
          const artifactRef = typeof artifact?.ref === "string" ? artifact.ref : "";
          if (!nodeId || !nodeRef || !artifactId || !artifactRef) {
            return ToolGuardrailFunctionOutputFactory.throwException({
              toolName,
              reason: "missing_script_resource_identity",
            });
          }
          return ToolGuardrailFunctionOutputFactory.allow({ target, artifactKind });
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
          const target = typeof result?.target === "string" ? result.target : "";
          const artifact =
            result?.artifact && typeof result.artifact === "object"
              ? (result.artifact as Record<string, unknown>)
              : null;
          const artifactKind = typeof artifact?.kind === "string" ? artifact.kind : "";
          const item = result?.item && typeof result.item === "object" ? (result.item as Record<string, unknown>) : null;
          if (target === "nodeflow:node" && artifactKind === "node") {
            const nodeId = typeof item?.node_id === "string" ? item.node_id : "";
            const nodeRef = typeof item?.node_ref === "string" ? item.node_ref : "";
            const artifactId = typeof artifact?.id === "string" ? artifact.id : "";
            if (!nodeId || !artifactId) {
              return ToolGuardrailFunctionOutputFactory.throwException({
                toolName,
                reason: "missing_node_identity",
              });
            }
            return ToolGuardrailFunctionOutputFactory.allow({ target, artifactKind, nodeId, nodeRef });
          }
          if (target === "nodeflow:link" && artifactKind === "link") {
            const linkId = typeof item?.link_id === "string" ? item.link_id : "";
            const sourceNodeId = typeof item?.source_node_id === "string" ? item.source_node_id : "";
            const targetNodeId = typeof item?.target_node_id === "string" ? item.target_node_id : "";
            const sourceRef = typeof item?.source_ref === "string" ? item.source_ref : "";
            const targetRef = typeof item?.target_ref === "string" ? item.target_ref : "";
            const artifactId = typeof artifact?.id === "string" ? artifact.id : "";
            if (sourceRef && targetRef) {
              if (!linkId || !artifactId) {
                return ToolGuardrailFunctionOutputFactory.throwException({
                  toolName,
                  reason: "missing_nodeflow_graph_link_identity",
                });
              }
              return ToolGuardrailFunctionOutputFactory.allow({
                target,
                artifactKind,
                linkId,
                sourceRef,
                targetRef,
              });
            }
            if (!linkId || !artifactId || !sourceNodeId || !targetNodeId) {
              return ToolGuardrailFunctionOutputFactory.throwException({
                toolName,
                reason: "missing_nodeflow_canvas_link_identity",
              });
            }
            return ToolGuardrailFunctionOutputFactory.allow({
              target,
              artifactKind,
              linkId,
              sourceNodeId,
              targetNodeId,
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
