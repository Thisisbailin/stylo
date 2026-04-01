import type { Connection } from "@xyflow/react";
import type { NodeFlowLink, NodeFlowNode, NodeFlowNodeData, NodeFlowNodeStyle } from "../types";
import { createNodeFlowLink, removeNodeFlowLink, toggleNodeFlowLinkPause } from "./links";
import { normalizeNodeFlowGroupBindings } from "./state";

export type NodeFlowMutableState = {
  revision: number;
  nodes: NodeFlowNode[];
  links: NodeFlowLink[];
};

const bumpRevision = (state: NodeFlowMutableState) => state.revision + 1;

export const appendNodeToNodeFlow = (
  state: NodeFlowMutableState,
  node: NodeFlowNode
): NodeFlowMutableState => ({
  ...state,
  revision: bumpRevision(state),
  nodes: [...state.nodes, node],
});

export const patchNodeFlowNodeData = (
  state: NodeFlowMutableState,
  nodeId: string,
  data: Partial<NodeFlowNodeData>
): NodeFlowMutableState => ({
  ...state,
  revision: bumpRevision(state),
  nodes: state.nodes.map((node) =>
    node.id === nodeId ? { ...node, data: { ...node.data, ...data } as NodeFlowNodeData } : node
  ),
});

export const patchNodeFlowNodeStyle = (
  state: NodeFlowMutableState,
  nodeId: string,
  style: Partial<NodeFlowNodeStyle>
): NodeFlowMutableState => ({
  ...state,
  revision: bumpRevision(state),
  nodes: state.nodes.map((node) =>
    node.id === nodeId ? { ...node, style: { ...(node.style || {}), ...(style || {}) } } : node
  ),
});

export const removeNodeFromNodeFlow = (
  state: NodeFlowMutableState,
  nodeId: string
): NodeFlowMutableState => ({
  ...state,
  revision: bumpRevision(state),
  nodes: state.nodes.filter((node) => node.id !== nodeId),
  links: state.links.filter((link) => link.source !== nodeId && link.target !== nodeId),
});

export const connectNodesInNodeFlow = (
  state: NodeFlowMutableState,
  connection: Connection
): NodeFlowMutableState => {
  const nextLinks = createNodeFlowLink(connection, state.links);
  return {
    ...state,
    revision: bumpRevision(state),
    links: nextLinks,
    nodes: normalizeNodeFlowGroupBindings(state.nodes, nextLinks),
  };
};

export const removeLinkFromNodeFlow = (
  state: NodeFlowMutableState,
  linkId: string
): NodeFlowMutableState => {
  const nextLinks = removeNodeFlowLink(state.links, linkId);
  return {
    ...state,
    revision: bumpRevision(state),
    links: nextLinks,
    nodes: normalizeNodeFlowGroupBindings(state.nodes, nextLinks),
  };
};

export const toggleNodeFlowLinkPauseInState = (
  state: NodeFlowMutableState,
  linkId: string
): NodeFlowMutableState => ({
  ...state,
  revision: bumpRevision(state),
  links: toggleNodeFlowLinkPause(state.links, linkId),
});

export const appendNodesAndLinksToNodeFlow = (
  state: NodeFlowMutableState,
  nodes: NodeFlowNode[],
  links: NodeFlowLink[]
): NodeFlowMutableState => ({
  ...state,
  revision: bumpRevision(state),
  nodes: [...state.nodes, ...nodes],
  links: [...state.links, ...links],
});
