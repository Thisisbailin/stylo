import type { KnowledgeSnapshot } from "./types";

export const getKnowledgeNodeById = (snapshot: KnowledgeSnapshot, nodeId: string) =>
  snapshot.nodes.find((node) => node.id === nodeId);

export const getKnowledgeNodeByRef = (snapshot: KnowledgeSnapshot, nodeRef: string) =>
  snapshot.nodes.find((node) => node.ref === nodeRef);

export const getKnowledgeLinksForNode = (snapshot: KnowledgeSnapshot, nodeId: string) => ({
  incoming: snapshot.links.filter((link) => link.toNodeId === nodeId),
  outgoing: snapshot.links.filter((link) => link.fromNodeId === nodeId),
});
