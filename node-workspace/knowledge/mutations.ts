import type { KnowledgeLink, KnowledgeNode, KnowledgeSnapshot } from "./types";

export const replaceKnowledgeNodes = (
  snapshot: KnowledgeSnapshot,
  nodes: KnowledgeNode[]
): KnowledgeSnapshot => ({
  ...snapshot,
  revision: snapshot.revision + 1,
  nodes,
});

export const replaceKnowledgeLinks = (
  snapshot: KnowledgeSnapshot,
  links: KnowledgeLink[]
): KnowledgeSnapshot => ({
  ...snapshot,
  revision: snapshot.revision + 1,
  links,
});

export const upsertKnowledgeNode = (
  snapshot: KnowledgeSnapshot,
  node: KnowledgeNode
): KnowledgeSnapshot => {
  const existingIndex = snapshot.nodes.findIndex((item) => item.id === node.id);
  if (existingIndex < 0) {
    return {
      ...snapshot,
      revision: snapshot.revision + 1,
      nodes: [...snapshot.nodes, node],
    };
  }
  const nextNodes = snapshot.nodes.slice();
  nextNodes[existingIndex] = node;
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    nodes: nextNodes,
  };
};

export const upsertKnowledgeNodes = (
  snapshot: KnowledgeSnapshot,
  nodes: KnowledgeNode[]
): KnowledgeSnapshot => {
  if (!nodes.length) return snapshot;
  const nextNodes = snapshot.nodes.slice();
  for (const node of nodes) {
    const existingIndex = nextNodes.findIndex((item) => item.id === node.id || item.ref === node.ref);
    if (existingIndex < 0) {
      nextNodes.push(node);
    } else {
      nextNodes[existingIndex] = node;
    }
  }
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    nodes: nextNodes,
  };
};

export const removeKnowledgeNode = (
  snapshot: KnowledgeSnapshot,
  nodeId: string
): KnowledgeSnapshot => ({
  ...snapshot,
  revision: snapshot.revision + 1,
  nodes: snapshot.nodes.filter((node) => node.id !== nodeId),
  links: snapshot.links.filter((link) => link.fromNodeId !== nodeId && link.toNodeId !== nodeId),
});

export const upsertKnowledgeLink = (
  snapshot: KnowledgeSnapshot,
  link: KnowledgeLink
): KnowledgeSnapshot => {
  const existingIndex = snapshot.links.findIndex((item) => item.id === link.id);
  if (existingIndex < 0) {
    return {
      ...snapshot,
      revision: snapshot.revision + 1,
      links: [...snapshot.links, link],
    };
  }
  const nextLinks = snapshot.links.slice();
  nextLinks[existingIndex] = link;
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    links: nextLinks,
  };
};

export const upsertKnowledgeLinks = (
  snapshot: KnowledgeSnapshot,
  links: KnowledgeLink[]
): KnowledgeSnapshot => {
  if (!links.length) return snapshot;
  const nextLinks = snapshot.links.slice();
  for (const link of links) {
    const existingIndex = nextLinks.findIndex((item) => item.id === link.id);
    if (existingIndex < 0) {
      nextLinks.push(link);
    } else {
      nextLinks[existingIndex] = link;
    }
  }
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    links: nextLinks,
  };
};

export const removeKnowledgeLink = (
  snapshot: KnowledgeSnapshot,
  linkId: string
): KnowledgeSnapshot => ({
  ...snapshot,
  revision: snapshot.revision + 1,
  links: snapshot.links.filter((link) => link.id !== linkId),
});
