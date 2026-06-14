import type { QalamAgentBridge } from "../bridge/qalamBridge";

const prepareGenerationExecutionParameters = {
  type: "object",
  properties: {
    node_id: {
      type: "string",
      description: "Flow node id for the generation node.",
    },
    node_ref: {
      type: "string",
      description: "Semantic node ref for the generation node.",
    },
  },
  additionalProperties: false,
  anyOf: [{ required: ["node_id"] }, { required: ["node_ref"] }],
} as const;

const normalizeString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const prepareGenerationExecutionToolDef = {
  name: "prepare_generation_execution",
  description:
    "Create a pending approval request for an image/video generation node. Use this instead of directly running high-privilege generation tasks.",
  parameters: prepareGenerationExecutionParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("prepare_generation_execution 需要对象参数。");
    }
    const raw = input as Record<string, unknown>;
    const nodeId = normalizeString(raw.node_id ?? raw.nodeId) || undefined;
    const nodeRef = normalizeString(raw.node_ref ?? raw.nodeRef) || undefined;
    if (!nodeId && !nodeRef) {
      throw new Error("prepare_generation_execution 需要 node_id 或 node_ref。");
    }
    const proposal = bridge.requestNodeFlowExecutionApproval({ nodeId, nodeRef });
    return {
      node_id: proposal.nodeId,
      node_ref: proposal.nodeRef,
      node_type: proposal.nodeType,
      node_title: proposal.nodeTitle,
      action: proposal.action,
      provider: proposal.providerLabel,
      model: proposal.modelLabel,
      prompt_preview: proposal.promptPreview,
      input_summary: proposal.inputSummary,
      approval_status: "pending",
    };
  },
  summarize: (output: any) =>
    `已为 ${output?.node_title || output?.node_ref || output?.node_id || "生成节点"} 创建待审批执行请求`,
};
