import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import type {
  NodeFlowLink,
  NodeFlowLinkData,
  NodeFlowNode,
  NodeFlowNodeData,
  NodeType,
} from "../types";

export type NodeFlowCanvasNode = Node<NodeFlowNodeData, NodeType>;
export type NodeFlowCanvasLink = Edge<NodeFlowLinkData>;

export const toNodeFlowCanvasNode = (node: NodeFlowNode): NodeFlowCanvasNode => ({
  id: node.id,
  type: node.type,
  position: node.position,
  data: node.data,
  parentId: node.parentId,
  extent: node.extent,
  style: node.style,
  measured: node.measured,
  selected: node.selected,
});

export const fromNodeFlowCanvasNode = (node: NodeFlowCanvasNode): NodeFlowNode => ({
  id: node.id,
  type: node.type,
  position: node.position,
  data: node.data,
  parentId: node.parentId,
  extent: node.extent === "parent" ? "parent" : undefined,
  style: node.style,
  measured: node.measured,
  selected: node.selected,
});

export const toNodeFlowCanvasLink = (link: NodeFlowLink): NodeFlowCanvasLink => ({
  id: link.id,
  source: link.source,
  target: link.target,
  sourceHandle: link.sourceHandle ?? undefined,
  targetHandle: link.targetHandle ?? undefined,
  data: link.data,
  selected: link.selected,
  type: link.type,
  markerEnd: link.markerEnd,
});

export const fromNodeFlowCanvasLink = (link: NodeFlowCanvasLink): NodeFlowLink => ({
  id: link.id,
  source: link.source,
  target: link.target,
  sourceHandle: link.sourceHandle ?? null,
  targetHandle: link.targetHandle ?? null,
  data: link.data,
  selected: link.selected,
  type: link.type,
  markerEnd: link.markerEnd,
});

export const applyNodeFlowNodeChanges = (
  changes: NodeChange<NodeFlowCanvasNode>[],
  nodes: NodeFlowNode[]
) => applyNodeChanges(changes, nodes.map(toNodeFlowCanvasNode)).map(fromNodeFlowCanvasNode);

export const applyNodeFlowLinkChanges = (
  changes: EdgeChange<NodeFlowCanvasLink>[],
  links: NodeFlowLink[]
) => applyEdgeChanges(changes, links.map(toNodeFlowCanvasLink)).map(fromNodeFlowCanvasLink);

export const createNodeFlowCanvasLink = (
  connection: Connection,
  links: NodeFlowLink[]
) =>
  addEdge(connection, links.map(toNodeFlowCanvasLink)).map(fromNodeFlowCanvasLink);
