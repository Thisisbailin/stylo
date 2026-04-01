import type { XYPosition } from "@xyflow/react";
import type { NodeFlowLink, NodeFlowNode, NodeFlowNodeData, NodeType } from "../types";
import { buildNodeFlowLinkId } from "./links";
import { appendNodeToNodeFlow, appendNodesAndLinksToNodeFlow, type NodeFlowMutableState } from "./mutations";
import { createDefaultNodeFlowNodeData } from "./defaults";

type CommandState = NodeFlowMutableState & {
  activeView?: string | null;
};

type AllocateNodeId = (nodeType: NodeType) => string;

const DEFAULT_NODE_DIMENSIONS: Partial<Record<NodeType, { width: number; height?: number }>> = {
  group: { width: 1100, height: 900 },
  scriptBoard: { width: 920 },
  storyboardBoard: { width: 1080 },
  identityCard: { width: 760 },
  audioInput: { width: 340 },
  seedanceVideoGen: { width: 380 },
};

export const createNodeFlowNodeCommand = ({
  state,
  type,
  position,
  parentId,
  extraData,
  allocateNodeId,
}: {
  state: CommandState;
  type: NodeType;
  position: XYPosition;
  parentId?: string;
  extraData?: Partial<NodeFlowNodeData>;
  allocateNodeId: AllocateNodeId;
}) => {
  let effectiveParentId = parentId;
  let effectiveExtraData = { ...extraData } as Partial<NodeFlowNodeData> & { view?: string };

  if (state.activeView) {
    effectiveExtraData.view = state.activeView;
    if (!effectiveParentId) {
      const matchingGroup = state.nodes.find(
        (node) => node.type === "group" && (node.data as { view?: string }).view === state.activeView
      );
      if (matchingGroup) effectiveParentId = matchingGroup.id;
    }
  }

  const dim = DEFAULT_NODE_DIMENSIONS[type];
  const nodeId = allocateNodeId(type);
  const nextNode: NodeFlowNode = {
    id: nodeId,
    type,
    position,
    parentId: effectiveParentId,
    extent: effectiveParentId ? "parent" : undefined,
    data: { ...createDefaultNodeFlowNodeData(type), ...effectiveExtraData } as NodeFlowNodeData,
    style: dim ? { width: dim.width, height: dim.height } : undefined,
  };

  return {
    nodeId,
    state: appendNodeToNodeFlow(state, nextNode),
  };
};

export const pasteClipboardIntoNodeFlow = ({
  state,
  clipboard,
  offset,
  allocateNodeId,
}: {
  state: CommandState;
  clipboard: { nodes: NodeFlowNode[]; links: NodeFlowLink[] };
  offset: XYPosition;
  allocateNodeId: AllocateNodeId;
}) => {
  const idMapping = new Map<string, string>();
  clipboard.nodes.forEach((node) => {
    idMapping.set(node.id, allocateNodeId(node.type));
  });

  const matchingGroup = state.activeView
    ? state.nodes.find((node) => node.type === "group" && (node.data as { view?: string }).view === state.activeView)
    : null;

  const newNodes: NodeFlowNode[] = clipboard.nodes.map((node) => {
    const newData = { ...node.data } as NodeFlowNodeData & { view?: string };
    if (state.activeView) newData.view = state.activeView;
    return {
      ...node,
      id: idMapping.get(node.id)!,
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
      selected: true,
      parentId: node.parentId || matchingGroup?.id,
      extent: node.parentId || matchingGroup?.id ? "parent" : undefined,
      data: newData,
    };
  });

  const newLinks: NodeFlowLink[] = clipboard.links.map((link) => ({
    ...link,
    id: buildNodeFlowLinkId(
      idMapping.get(link.source)!,
      idMapping.get(link.target)!,
      link.sourceHandle,
      link.targetHandle
    ),
    source: idMapping.get(link.source)!,
    target: idMapping.get(link.target)!,
  }));

  const deselectedNodes = state.nodes.map((node) => ({ ...node, selected: false }));
  return {
    state: appendNodesAndLinksToNodeFlow(
      {
        ...state,
        nodes: deselectedNodes,
      },
      newNodes,
      newLinks
    ),
  };
};

export const appendExternalNodesAndLinksCommand = ({
  state,
  nodes,
  links,
}: {
  state: NodeFlowMutableState;
  nodes: NodeFlowNode[];
  links: NodeFlowLink[];
}) => ({
  state: appendNodesAndLinksToNodeFlow(state, nodes, links),
});
