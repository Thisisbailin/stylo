import type { NodeType } from "../types";

export type NodeFlowExecutionApprovalAction = "image_generation" | "video_generation";

export type NodeFlowExecutionApprovalProposal = {
  id: string;
  nodeId: string;
  nodeRef?: string;
  nodeType: NodeType;
  nodeTitle: string;
  action: NodeFlowExecutionApprovalAction;
  providerLabel: string;
  modelLabel: string;
  promptPreview: string | null;
  inputSummary: string[];
  createdAt: number;
};

export type NodeFlowApprovalState = {
  pendingExecutionApprovals: Record<string, NodeFlowExecutionApprovalProposal>;
};

export const createEmptyNodeFlowApprovalState = (): NodeFlowApprovalState => ({
  pendingExecutionApprovals: {},
});

export const upsertNodeFlowExecutionApproval = <T extends NodeFlowApprovalState>(
  state: T,
  proposal: NodeFlowExecutionApprovalProposal
): T => ({
  ...state,
  pendingExecutionApprovals: {
    ...state.pendingExecutionApprovals,
    [proposal.nodeId]: proposal,
  },
});

export const clearNodeFlowExecutionApproval = <T extends NodeFlowApprovalState>(
  state: T,
  nodeId: string
): T => {
  if (!state.pendingExecutionApprovals[nodeId]) return state;
  const next = { ...state.pendingExecutionApprovals };
  delete next[nodeId];
  return {
    ...state,
    pendingExecutionApprovals: next,
  };
};
