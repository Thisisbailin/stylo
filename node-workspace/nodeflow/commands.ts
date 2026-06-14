import type { Connection, EdgeChange, NodeChange, XYPosition } from "@xyflow/react";
import type { NodeFlowLink, NodeFlowNode, NodeFlowNodeData, NodeType } from "../types";
import type { NodeFlowCanvasLink, NodeFlowCanvasNode } from "./reactflow";
import { buildNodeFlowLinkId } from "./links";
import { ensureUniqueNodeRef, getNodeFlowRef, setNodeFlowRef } from "./refs";
import {
  appendNodeToNodeFlow,
  appendNodesAndLinksToNodeFlow,
  connectNodesInNodeFlow,
  removeLinkFromNodeFlow,
  removeNodeFromNodeFlow,
  toggleNodeFlowLinkPauseInState,
  type NodeFlowMutableState,
} from "./mutations";
import { createDefaultNodeFlowNodeData } from "./defaults";
import { applyNodeFlowNodeChanges } from "./reactflow";
import { applyNodeFlowLinkChanges } from "./links";

type CommandState = NodeFlowMutableState & {
  activeView?: string | null;
};

type AllocateNodeId = (nodeType: NodeType) => string;

const DEFAULT_NODE_DIMENSIONS: Partial<Record<NodeType, { width: number; height?: number }>> = {
  scriptBoard: { width: 920 },
  identityCard: { width: 760 },
  audioInput: { width: 340 },
  videoInput: { width: 360 },
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
  let effectiveExtraData = { ...extraData } as Partial<NodeFlowNodeData> & { view?: string };

  if (state.activeView) {
    effectiveExtraData.view = state.activeView;
  }

  const dim = DEFAULT_NODE_DIMENSIONS[type];
  const nodeId = allocateNodeId(type);
  const requestedRef = getNodeFlowRef({ id: nodeId, type, position, data: effectiveExtraData as NodeFlowNodeData } as NodeFlowNode);
  const uniqueRef = ensureUniqueNodeRef({
    desiredRef: requestedRef,
    nodes: state.nodes,
  });
  const nextNode: NodeFlowNode = {
    id: nodeId,
    type,
    position,
    data: setNodeFlowRef(
      { ...createDefaultNodeFlowNodeData(type), ...effectiveExtraData } as Record<string, unknown>,
      uniqueRef
    ) as NodeFlowNodeData,
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

  const stagedNodes: NodeFlowNode[] = [];
  const newNodes: NodeFlowNode[] = clipboard.nodes.map((node) => {
    const newData = { ...node.data } as NodeFlowNodeData & { view?: string };
    if (state.activeView) newData.view = state.activeView;
    const uniqueRef = ensureUniqueNodeRef({
      desiredRef: getNodeFlowRef(node),
      nodes: [...state.nodes, ...stagedNodes],
    });
    const nextNode = {
      ...node,
      id: idMapping.get(node.id)!,
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
      selected: true,
      data: setNodeFlowRef(newData as Record<string, unknown>, uniqueRef) as NodeFlowNodeData,
    };
    stagedNodes.push(nextNode);
    return nextNode;
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

export const connectNodeFlowNodesCommand = ({
  state,
  connection,
}: {
  state: NodeFlowMutableState;
  connection: Connection;
}) => ({
  state: connectNodesInNodeFlow(state, connection),
});

export const removeNodeFlowLinkCommand = ({
  state,
  linkId,
}: {
  state: NodeFlowMutableState;
  linkId: string;
}) => ({
  state: removeLinkFromNodeFlow(state, linkId),
});

export const toggleNodeFlowLinkPauseCommand = ({
  state,
  linkId,
}: {
  state: NodeFlowMutableState;
  linkId: string;
}) => ({
  state: toggleNodeFlowLinkPauseInState(state, linkId),
});

export const removeNodeFlowNodeCommand = ({
  state,
  nodeId,
}: {
  state: NodeFlowMutableState;
  nodeId: string;
}) => ({
  state: removeNodeFromNodeFlow(state, nodeId),
});

export const applyNodeFlowCanvasNodeChangesCommand = ({
  state,
  changes,
}: {
  state: NodeFlowMutableState;
  changes: NodeChange<NodeFlowCanvasNode>[];
}) => {
  const nextNodes = applyNodeFlowNodeChanges(changes, state.nodes);
  return {
    state: {
      ...state,
      revision: state.revision + 1,
      nodes: nextNodes,
    },
  };
};

export const applyNodeFlowCanvasLinkChangesCommand = ({
  state,
  changes,
}: {
  state: NodeFlowMutableState;
  changes: EdgeChange<NodeFlowCanvasLink>[];
}) => {
  const nextLinks = applyNodeFlowLinkChanges(changes, state.links);
  return {
    state: {
      ...state,
      revision: state.revision + 1,
      links: nextLinks,
    },
  };
};
