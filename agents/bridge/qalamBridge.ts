import type { ProjectData } from "../../types";
import type {
  NodeType,
  NodeFlowFile,
  NodeFlowViewport,
} from "../../node-workspace/types";
import type { NodeFlowExecutionApprovalProposal } from "../../node-workspace/nodeflow/approvals";

export type CreateTextNodeInput = {
  title: string;
  text: string;
  x?: number;
  y?: number;
  parentId?: string;
};

export type CreateTextNodeResult = {
  id: string;
  title: string;
};

export type CreateNodeFlowNodeInput = {
  expectedRevision?: number;
  type: Extract<NodeType, "scriptPage" | "mdText" | "folder" | "text" | "imageInput" | "audioInput" | "videoInput">;
  nodeRef?: string;
  title?: string;
  text?: string;
  content?: string;
  documentId?: string;
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  filename?: string;
  mimeType?: string;
  x?: number;
  y?: number;
  parentId?: string;
};

export type CreateNodeFlowNodeResult = {
  nodeId: string;
  nodeRef?: string;
  nodeType: CreateNodeFlowNodeInput["type"];
  title: string;
  defaultOutputHandle?: NodeFlowHandle | null;
  defaultInputHandles?: NodeFlowHandle[];
};

export type UpdateNodeFlowNodeInput = {
  expectedRevision?: number;
  nodeId?: string;
  nodeRef?: string;
  patch: Record<string, unknown>;
};

export type UpdateNodeFlowNodeResult = {
  nodeId: string;
  nodeRef?: string;
  nodeType: string;
  title: string;
  patch: Record<string, unknown>;
};

export type MoveNodeFlowNodeInput = {
  expectedRevision?: number;
  nodeId?: string;
  nodeRef?: string;
  x: number;
  y: number;
};

export type MoveNodeFlowNodeResult = {
  nodeId: string;
  nodeRef?: string;
  nodeType: string;
  title: string;
  position: {
    x: number;
    y: number;
  };
};

export type RemoveNodeFlowNodeInput = {
  expectedRevision?: number;
  nodeId?: string;
  nodeRef?: string;
};

export type RemoveNodeFlowNodeResult = {
  nodeId: string;
  nodeRef?: string;
  nodeType: string;
  title: string;
};

export type ConnectNodeFlowNodesInput = {
  expectedRevision?: number;
  sourceNodeId?: string;
  targetNodeId?: string;
  sourceRef?: string;
  targetRef?: string;
  sourceHandle?: NodeFlowHandle;
  targetHandle?: NodeFlowHandle;
};

export type ConnectNodeFlowNodesResult = {
  linkId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceRef?: string;
  targetRef?: string;
  sourceHandle: NodeFlowHandle;
  targetHandle: NodeFlowHandle;
};

export type NodeFlowNodeLookupInput = {
  nodeId?: string;
  nodeRef?: string;
};

export type NodeFlowNodeLookupResult = {
  nodeId: string;
  nodeRef?: string;
  nodeType: string;
  inputHandles: NodeFlowHandle[];
  outputHandles: NodeFlowHandle[];
};

export type NodeFlowHandle = "image" | "text" | "audio" | "video" | "multi";

export type CreateNodeFlowMapNodeInput = {
  key: string;
  type: Extract<
    NodeType,
    "scriptPage" | "mdText" | "folder" | "text" | "imageInput" | "audioInput" | "videoInput"
  >;
  title?: string;
  text?: string;
  content?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  data?: Record<string, unknown>;
};

export type CreateNodeFlowMapLinkInput = {
  from: string;
  to: string;
  fromHandle?: NodeFlowHandle;
  toHandle?: NodeFlowHandle;
  paused?: boolean;
};

export type CreateNodeFlowMapInput = {
  expectedRevision?: number;
  title?: string;
  description?: string;
  parentId?: string;
  layout?: "horizontal" | "vertical" | "fanout";
  originX?: number;
  originY?: number;
  nodes: CreateNodeFlowMapNodeInput[];
  links?: CreateNodeFlowMapLinkInput[];
};

export type CreateNodeFlowMapResult = {
  nodes: Array<{
    key: string;
    id: string;
    type: CreateNodeFlowMapNodeInput["type"];
    title?: string;
  }>;
  linkCount: number;
};

export type CreateNodeFlowGraphLinkInput = {
  expectedRevision?: number;
  sourceRef: string;
  targetRef: string;
};

export type CreateNodeFlowGraphLinkResult = {
  linkId: string;
  sourceRef: string;
  targetRef: string;
};

export type RemoveNodeFlowLinkInput = {
  expectedRevision?: number;
  linkId: string;
  linkKind?: "canvas" | "graph";
};

export type RemoveNodeFlowLinkResult =
  | {
      linkId: string;
      linkKind: "canvas";
      sourceNodeId: string;
      targetNodeId: string;
      sourceRef?: string;
      targetRef?: string;
      sourceHandle?: NodeFlowHandle | null;
      targetHandle?: NodeFlowHandle | null;
    }
  | {
      linkId: string;
      linkKind: "graph";
      sourceRef: string;
      targetRef: string;
    };

export interface QalamAgentBridge {
  getProjectData(): ProjectData;
  getNodeFlowSnapshot(): NodeFlowFile;
  getPendingNodeFlowExecutionApprovals(): NodeFlowExecutionApprovalProposal[];
  updateProjectData(updater: (prev: ProjectData) => ProjectData): void;
  addTextNode(input: CreateTextNodeInput): CreateTextNodeResult;
  createNodeFlowNode(input: CreateNodeFlowNodeInput): CreateNodeFlowNodeResult;
  updateNodeFlowNode(input: UpdateNodeFlowNodeInput): UpdateNodeFlowNodeResult;
  moveNodeFlowNode(input: MoveNodeFlowNodeInput): MoveNodeFlowNodeResult;
  removeNodeFlowNode(input: RemoveNodeFlowNodeInput): RemoveNodeFlowNodeResult;
  updateNodeFlowNodeData(nodeId: string, data: Record<string, unknown>): void;
  createNodeFlowGraphLink(input: CreateNodeFlowGraphLinkInput): CreateNodeFlowGraphLinkResult;
  connectNodeFlowNodes(input: ConnectNodeFlowNodesInput): ConnectNodeFlowNodesResult;
  removeNodeFlowLink(input: RemoveNodeFlowLinkInput): RemoveNodeFlowLinkResult;
  getNodeFlowNode(input: NodeFlowNodeLookupInput): NodeFlowNodeLookupResult | null;
  createNodeFlowMap(input: CreateNodeFlowMapInput): CreateNodeFlowMapResult;
  requestNodeFlowExecutionApproval(input: {
    nodeId?: string;
    nodeRef?: string;
  }): NodeFlowExecutionApprovalProposal;
  clearNodeFlowExecutionApproval(input: {
    nodeId?: string;
    nodeRef?: string;
  }): { nodeId: string };
  getViewport(): NodeFlowViewport | null;
  getNodeCount(): number;
}
