import type {
  KnowledgeNode,
  KnowledgeNodeDetail,
  KnowledgeNodeIdentity,
  KnowledgeSearchResult,
  KnowledgeSearchScope,
  KnowledgeSnapshot,
} from "./types";

export const getKnowledgeNodeById = (snapshot: KnowledgeSnapshot, nodeId: string) =>
  snapshot.nodes.find((node) => node.id === nodeId);

export const getKnowledgeNodeByRef = (snapshot: KnowledgeSnapshot, nodeRef: string) =>
  snapshot.nodes.find((node) => node.ref === nodeRef);

export const getKnowledgeLinksForNode = (snapshot: KnowledgeSnapshot, nodeId: string) => ({
  incoming: snapshot.links.filter((link) => link.toNodeId === nodeId),
  outgoing: snapshot.links.filter((link) => link.fromNodeId === nodeId),
});

export const toKnowledgeNodeIdentity = (
  snapshot: KnowledgeSnapshot,
  node: KnowledgeNode
): KnowledgeNodeIdentity => {
  const links = getKnowledgeLinksForNode(snapshot, node.id);
  return {
    id: node.id,
    ref: node.ref,
    kind: node.kind,
    origin: node.origin,
    title: node.package.title,
    status: node.package.status,
    confidence: node.package.confidence,
    anchorCount: node.anchors.length,
    incomingLinkCount: links.incoming.length,
    outgoingLinkCount: links.outgoing.length,
    updatedAt: node.updatedAt,
  };
};

export const listKnowledgeNodeIdentities = (
  snapshot: KnowledgeSnapshot
): KnowledgeNodeIdentity[] =>
  snapshot.nodes
    .map((node) => toKnowledgeNodeIdentity(snapshot, node))
    .sort((a, b) => b.updatedAt - a.updatedAt);

export const readKnowledgeNodeIdentity = (
  snapshot: KnowledgeSnapshot,
  args: { nodeId?: string; nodeRef?: string }
): KnowledgeNodeIdentity | null => {
  const node =
    (args.nodeId ? getKnowledgeNodeById(snapshot, args.nodeId) : undefined) ||
    (args.nodeRef ? getKnowledgeNodeByRef(snapshot, args.nodeRef) : undefined) ||
    null;
  return node ? toKnowledgeNodeIdentity(snapshot, node) : null;
};

export const readKnowledgeNodeDetail = (
  snapshot: KnowledgeSnapshot,
  args: { nodeId?: string; nodeRef?: string }
): KnowledgeNodeDetail | null => {
  const node =
    (args.nodeId ? getKnowledgeNodeById(snapshot, args.nodeId) : undefined) ||
    (args.nodeRef ? getKnowledgeNodeByRef(snapshot, args.nodeRef) : undefined) ||
    null;
  if (!node) return null;

  const links = getKnowledgeLinksForNode(snapshot, node.id);
  return {
    id: node.id,
    ref: node.ref,
    kind: node.kind,
    origin: node.origin,
    package: node.package,
    content: node.content,
    meta: node.meta,
    anchors: node.anchors,
    incomingLinks: links.incoming,
    outgoingLinks: links.outgoing,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
};

const stringifyKnowledgeContent = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const normalizeSearchText = (value: string) => value.trim().toLowerCase();

export const searchKnowledgeNodes = (
  snapshot: KnowledgeSnapshot,
  {
    query,
    scopes = ["identity", "content", "anchors", "links"],
  }: {
    query: string;
    scopes?: KnowledgeSearchScope[];
  }
): KnowledgeSearchResult[] => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const matches: KnowledgeSearchResult[] = [];

  for (const node of snapshot.nodes) {
    const links = getKnowledgeLinksForNode(snapshot, node.id);
    const matchedScopes: KnowledgeSearchScope[] = [];

    if (scopes.includes("identity")) {
      const haystack = normalizeSearchText(
        [node.ref, node.kind, node.package.title, node.origin, node.package.status].join(" ")
      );
      if (haystack.includes(normalizedQuery)) matchedScopes.push("identity");
    }

    if (scopes.includes("content")) {
      const haystack = normalizeSearchText(stringifyKnowledgeContent(node.content));
      if (haystack.includes(normalizedQuery)) matchedScopes.push("content");
    }

    if (scopes.includes("anchors")) {
      const haystack = normalizeSearchText(
        node.anchors.map((anchor) => `${anchor.type} ${anchor.ref} ${anchor.span || ""}`).join(" ")
      );
      if (haystack.includes(normalizedQuery)) matchedScopes.push("anchors");
    }

    if (scopes.includes("links")) {
      const haystack = normalizeSearchText(
        [...links.incoming, ...links.outgoing].map((link) => link.type).join(" ")
      );
      if (haystack.includes(normalizedQuery)) matchedScopes.push("links");
    }

    if (matchedScopes.length) {
      matches.push({
        node: toKnowledgeNodeIdentity(snapshot, node),
        matchedScopes,
      });
    }
  }

  return matches.sort((a, b) => b.node.updatedAt - a.node.updatedAt);
};
