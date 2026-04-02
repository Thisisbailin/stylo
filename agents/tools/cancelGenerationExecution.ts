import type { QalamAgentBridge } from "../bridge/qalamBridge";

const cancelGenerationExecutionParameters = {
  type: "object",
  properties: {
    node_id: {
      type: "string",
      description: "NodeFlow node id for the pending generation request.",
    },
    node_ref: {
      type: "string",
      description: "Semantic node ref for the pending generation request.",
    },
  },
  additionalProperties: false,
  anyOf: [{ required: ["node_id"] }, { required: ["node_ref"] }],
} as const;

const normalizeString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const cancelGenerationExecutionToolDef = {
  name: "cancel_generation_execution",
  description:
    "Cancel a pending generation approval request for an image/video generation node.",
  parameters: cancelGenerationExecutionParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("cancel_generation_execution 需要对象参数。");
    }
    const raw = input as Record<string, unknown>;
    const nodeId = normalizeString(raw.node_id ?? raw.nodeId) || undefined;
    const nodeRef = normalizeString(raw.node_ref ?? raw.nodeRef) || undefined;
    if (!nodeId && !nodeRef) {
      throw new Error("cancel_generation_execution 需要 node_id 或 node_ref。");
    }
    const result = bridge.clearNodeFlowExecutionApproval({ nodeId, nodeRef });
    return {
      node_id: result.nodeId,
      approval_status: "cancelled",
    };
  },
  summarize: (output: any) =>
    `已取消 ${output?.node_id || "该节点"} 的待审批执行请求`,
};
