import type { KnowledgeLink, KnowledgeNode, KnowledgeSnapshot } from "./types";

export const isCanonicalKnowledgeNode = (node: KnowledgeNode) =>
  node.origin === "canonical-source";

export const isAgentDerivedKnowledgeNode = (node: KnowledgeNode) =>
  node.origin === "agent-derived";

export const isCanonicalKnowledgeLink = (link: KnowledgeLink) =>
  link.origin === "canonical-source";

export const isAgentDerivedKnowledgeLink = (link: KnowledgeLink) =>
  link.origin === "agent-derived";

export const assertKnowledgeNodeCanBeRevised = (node: KnowledgeNode) => {
  if (isCanonicalKnowledgeNode(node)) {
    throw new Error(
      `Knowledge node "${node.ref}" is canonical-source and cannot be revised directly. Create agent-derived knowledge instead.`
    );
  }
};

export const assertKnowledgeLinkCanBeRevised = (link: KnowledgeLink) => {
  if (isCanonicalKnowledgeLink(link)) {
    throw new Error(
      `Knowledge link "${link.id}" is canonical-source and cannot be revised directly.`
    );
  }
};

export const assertKnowledgeLinkEndpointsExist = (
  snapshot: KnowledgeSnapshot,
  args: { fromNodeId: string; toNodeId: string }
) => {
  const fromNode = snapshot.nodes.find((node) => node.id === args.fromNodeId);
  const toNode = snapshot.nodes.find((node) => node.id === args.toNodeId);
  if (!fromNode || !toNode) {
    throw new Error(
      `Cannot create knowledge link because endpoint nodes are missing. from="${args.fromNodeId}" to="${args.toNodeId}".`
    );
  }
  return { fromNode, toNode };
};

