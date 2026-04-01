import { addEdge, applyEdgeChanges, Connection, EdgeChange } from "@xyflow/react";
import type { NodeFlowLink } from "../types";

export const buildNodeFlowLinkId = (
  sourceNodeId: string,
  targetNodeId: string,
  sourceHandle?: string | null,
  targetHandle?: string | null
) =>
  `link-${sourceNodeId}-${targetNodeId}-${sourceHandle || "default"}-${targetHandle || "default"}`;

export const applyNodeFlowLinkChanges = (
  changes: EdgeChange<NodeFlowLink>[],
  links: NodeFlowLink[]
) => applyEdgeChanges(changes, links);

export const createNodeFlowLink = (
  connection: Connection,
  links: NodeFlowLink[]
) =>
  addEdge(
    {
      ...connection,
      id: buildNodeFlowLinkId(
        connection.source,
        connection.target,
        connection.sourceHandle,
        connection.targetHandle
      ),
    },
    links
  );

export const removeNodeFlowLink = (links: NodeFlowLink[], linkId: string) =>
  links.filter((link) => link.id !== linkId);

export const toggleNodeFlowLinkPause = (links: NodeFlowLink[], linkId: string) =>
  links.map((link) =>
    link.id === linkId
      ? { ...link, data: { ...link.data, hasPause: !link.data?.hasPause } }
      : link
  );
