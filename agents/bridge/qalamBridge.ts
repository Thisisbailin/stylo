import type { ProjectData } from "../../types";
import type { NodeType, WorkflowViewport } from "../../node-workspace/types";

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

export type CreateWorkflowNodeInput = {
  type: Extract<NodeType, "text" | "imageGen" | "scriptBoard" | "storyboardBoard" | "identityCard">;
  nodeRef?: string;
  title?: string;
  text?: string;
  aspectRatio?: string;
  episodeId?: number;
  sceneId?: string;
  displayMode?: "table" | "workflow";
  entityType?: "character" | "scene";
  entityId?: string;
  x?: number;
  y?: number;
  parentId?: string;
};

export type CreateWorkflowNodeResult = {
  nodeId: string;
  nodeRef?: string;
  nodeType: CreateWorkflowNodeInput["type"];
  title: string;
  defaultOutputHandle?: WorkflowBuilderHandle | null;
  defaultInputHandles?: WorkflowBuilderHandle[];
};

export type ConnectWorkflowNodesInput = {
  sourceNodeId?: string;
  targetNodeId?: string;
  sourceRef?: string;
  targetRef?: string;
  sourceHandle?: WorkflowBuilderHandle;
  targetHandle?: WorkflowBuilderHandle;
};

export type ConnectWorkflowNodesResult = {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceRef?: string;
  targetRef?: string;
  sourceHandle: WorkflowBuilderHandle;
  targetHandle: WorkflowBuilderHandle;
};

export type WorkflowNodeLookupInput = {
  nodeId?: string;
  nodeRef?: string;
};

export type WorkflowNodeLookupResult = {
  nodeId: string;
  nodeRef?: string;
  nodeType: string;
  inputHandles: WorkflowBuilderHandle[];
  outputHandles: WorkflowBuilderHandle[];
};

export type WorkflowBuilderHandle = "image" | "text" | "audio" | "multi";

export type CreateNodeWorkflowNodeInput = {
  key: string;
  type: Extract<
    NodeType,
    "text" | "shot" | "annotation" | "imageGen" | "wanImageGen" | "soraVideoGen" | "wanVideoGen" | "wanReferenceVideoGen" | "viduVideoGen" | "seedanceVideoGen"
  >;
  title?: string;
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  data?: Record<string, unknown>;
};

export type CreateNodeWorkflowEdgeInput = {
  from: string;
  to: string;
  fromHandle?: WorkflowBuilderHandle;
  toHandle?: WorkflowBuilderHandle;
  paused?: boolean;
};

export type CreateNodeWorkflowInput = {
  title?: string;
  description?: string;
  wrapInGroup?: boolean;
  parentId?: string;
  layout?: "horizontal" | "vertical" | "fanout";
  originX?: number;
  originY?: number;
  nodes: CreateNodeWorkflowNodeInput[];
  edges?: CreateNodeWorkflowEdgeInput[];
};

export type CreateNodeWorkflowResult = {
  groupId?: string;
  nodes: Array<{
    key: string;
    id: string;
    type: CreateNodeWorkflowNodeInput["type"];
    title?: string;
  }>;
  edgeCount: number;
};

export interface QalamAgentBridge {
  getProjectData(): ProjectData;
  updateProjectData(updater: (prev: ProjectData) => ProjectData): void;
  addTextNode(input: CreateTextNodeInput): CreateTextNodeResult;
  createWorkflowNode(input: CreateWorkflowNodeInput): CreateWorkflowNodeResult;
  connectWorkflowNodes(input: ConnectWorkflowNodesInput): ConnectWorkflowNodesResult;
  getWorkflowNode(input: WorkflowNodeLookupInput): WorkflowNodeLookupResult | null;
  createNodeWorkflow(input: CreateNodeWorkflowInput): CreateNodeWorkflowResult;
  getViewport(): WorkflowViewport | null;
  getNodeCount(): number;
}
