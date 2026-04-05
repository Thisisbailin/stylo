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

const KNOWLEDGE_KIND_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
const KNOWLEDGE_LINK_TYPE_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export const assertKnowledgeNodeKindIsValid = (
  kind: string,
  origin: KnowledgeNode["origin"]
) => {
  if (!KNOWLEDGE_KIND_PATTERN.test(kind)) {
    throw new Error(
      `Knowledge node kind "${kind}" is invalid. Use a light namespaced shape such as "source.scene" or "derived.note".`
    );
  }
  if (origin === "canonical-source" && !kind.startsWith("source.")) {
    throw new Error(
      `Canonical knowledge node kind "${kind}" is invalid. Canonical source nodes must use the "source." namespace.`
    );
  }
  if (origin === "agent-derived" && kind.startsWith("source.")) {
    throw new Error(
      `Agent-derived knowledge node kind "${kind}" cannot use the reserved "source." namespace.`
    );
  }
};

export const assertKnowledgeLinkTypeIsValid = (type: string) => {
  if (!KNOWLEDGE_LINK_TYPE_PATTERN.test(type)) {
    throw new Error(
      `Knowledge link type "${type}" is invalid. Use a light lowercase identifier such as "contains" or "supersedes".`
    );
  }
};
