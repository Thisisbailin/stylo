import type { Connection, EdgeChange } from "@xyflow/react";
import type { NodeFlowLink } from "../types";
import {
  type NodeFlowCanvasLink,
  applyNodeFlowLinkChanges as applyCanvasLinkChanges,
  createNodeFlowCanvasLink,
} from "./reactflow";

export const buildNodeFlowLinkId = (
  sourceNodeId: string,
  targetNodeId: string,
  sourceHandle?: string | null,
  targetHandle?: string | null
) =>
  `link-${sourceNodeId}-${targetNodeId}-${sourceHandle || "default"}-${targetHandle || "default"}`;

export const applyNodeFlowLinkChanges = (changes: EdgeChange<NodeFlowCanvasLink>[], links: NodeFlowLink[]) =>
  applyCanvasLinkChanges(changes, links);

export const createNodeFlowLink = (
  connection: Connection,
  links: NodeFlowLink[]
) =>
  createNodeFlowCanvasLink(
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
