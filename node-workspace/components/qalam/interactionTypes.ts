import type { AgentUiContext } from "../../../agents/runtime/types";

export type QalamSubmitRequest = {
  id: number;
  text: string;
  uiContext?: AgentUiContext;
};

export type AgentScriptEditProposal = {
  id: string;
  nodeId: string;
  documentId?: string;
  title: string;
  content: string;
  receivedAt: number;
};

export type AgentScriptEditProposalBatch = {
  id: string;
  proposals: AgentScriptEditProposal[];
};
