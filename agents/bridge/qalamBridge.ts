import type { ProjectData } from "../../types";
import type {
  NodeAssetConfidence,
  NodeAssetPlane,
  NodeAssetStatus,
  NodeType,
  NodeFlowFile,
  NodeFlowViewport,
} from "../../node-workspace/types";

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
  type: Extract<NodeType, "knowledge" | "text" | "imageGen" | "scriptBoard" | "storyboardBoard" | "identityCard">;
  nodeRef?: string;
  title?: string;
  content?: string;
  plane?: NodeAssetPlane;
  assetType?: string;
  tags?: string[];
  sourceRefs?: string[];
  status?: NodeAssetStatus;
  confidence?: NodeAssetConfidence;
  locked?: boolean;
  fields?: Record<string, unknown>;
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

export type CreateNodeFlowNodeResult = {
  nodeId: string;
  nodeRef?: string;
  nodeType: CreateNodeFlowNodeInput["type"];
  title: string;
  defaultOutputHandle?: NodeFlowHandle | null;
  defaultInputHandles?: NodeFlowHandle[];
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

export type NodeFlowHandle = "image" | "text" | "audio" | "multi";

export type CreateNodeFlowMapNodeInput = {
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
  wrapInGroup?: boolean;
  parentId?: string;
  layout?: "horizontal" | "vertical" | "fanout";
  originX?: number;
  originY?: number;
  nodes: CreateNodeFlowMapNodeInput[];
  links?: CreateNodeFlowMapLinkInput[];
};

export type CreateNodeFlowMapResult = {
  groupId?: string;
  nodes: Array<{
    key: string;
    id: string;
    type: CreateNodeFlowMapNodeInput["type"];
    title?: string;
  }>;
  linkCount: number;
};

export interface QalamAgentBridge {
  getProjectData(): ProjectData;
  getNodeFlowSnapshot(): NodeFlowFile;
  updateProjectData(updater: (prev: ProjectData) => ProjectData): void;
  addTextNode(input: CreateTextNodeInput): CreateTextNodeResult;
  createNodeFlowNode(input: CreateNodeFlowNodeInput): CreateNodeFlowNodeResult;
  updateNodeFlowNodeData(nodeId: string, data: Record<string, unknown>): void;
  connectNodeFlowNodes(input: ConnectNodeFlowNodesInput): ConnectNodeFlowNodesResult;
  getNodeFlowNode(input: NodeFlowNodeLookupInput): NodeFlowNodeLookupResult | null;
  createNodeFlowMap(input: CreateNodeFlowMapInput): CreateNodeFlowMapResult;
  getViewport(): NodeFlowViewport | null;
  getNodeCount(): number;
}
