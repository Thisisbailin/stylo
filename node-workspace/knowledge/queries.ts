import type {
  KnowledgeSearchContext,
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
  const chunks: string[] = [];
  const visit = (candidate: unknown, depth = 0) => {
    if (candidate == null || depth > 4 || chunks.length >= 64) return;
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) chunks.push(trimmed);
      return;
    }
    if (typeof candidate === "number" || typeof candidate === "boolean") {
      chunks.push(String(candidate));
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.slice(0, 24).forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof candidate === "object") {
      Object.values(candidate as Record<string, unknown>)
        .slice(0, 24)
        .forEach((item) => visit(item, depth + 1));
    }
  };
  visit(value);
  return chunks.join(" ");
};

const normalizeSearchText = (value: string) => value.trim().toLowerCase();

const toAnchorRefs = (node: KnowledgeNode) => node.anchors.map((anchor) => `${anchor.type}:${anchor.ref}`);

export const searchKnowledgeNodes = (
  snapshot: KnowledgeSnapshot,
  {
    query,
    scopes = ["identity", "content", "anchors", "links"],
    context,
  }: {
    query: string;
    scopes?: KnowledgeSearchScope[];
    context?: KnowledgeSearchContext;
  }
): KnowledgeSearchResult[] => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const matches: KnowledgeSearchResult[] = [];

  for (const node of snapshot.nodes) {
    const links = getKnowledgeLinksForNode(snapshot, node.id);
    const matchedScopes: KnowledgeSearchScope[] = [];
    let score = 0;
    const anchorRefs = toAnchorRefs(node);
    const titleText = normalizeSearchText(node.package.title);
    const refText = normalizeSearchText(node.ref);
    const kindText = normalizeSearchText(node.kind);
    const originText = normalizeSearchText(node.origin);
    const statusText = normalizeSearchText(node.package.status);

    if (scopes.includes("identity")) {
      const haystack = normalizeSearchText([node.ref, node.kind, node.package.title, node.origin, node.package.status].join(" "));
      if (haystack.includes(normalizedQuery)) matchedScopes.push("identity");
      if (titleText === normalizedQuery) score += 90;
      else if (titleText.includes(normalizedQuery)) score += 52;
      if (refText === normalizedQuery) score += 72;
      else if (refText.includes(normalizedQuery)) score += 40;
      if (kindText === normalizedQuery) score += 44;
      else if (kindText.includes(normalizedQuery)) score += 24;
      if (originText === normalizedQuery) score += 18;
      if (statusText === normalizedQuery) score += 14;
    }

    if (scopes.includes("content")) {
      const haystack = normalizeSearchText(stringifyKnowledgeContent(node.content));
      if (haystack.includes(normalizedQuery)) {
        matchedScopes.push("content");
        score += 28;
      }
    }

    if (scopes.includes("anchors")) {
      const haystack = normalizeSearchText(node.anchors.map((anchor) => `${anchor.type} ${anchor.ref} ${anchor.span || ""}`).join(" "));
      if (haystack.includes(normalizedQuery)) {
        matchedScopes.push("anchors");
        score += 48;
      }
    }

    if (scopes.includes("links")) {
      const relatedNodeTitles = [...links.incoming, ...links.outgoing]
        .map((link) => {
          const relatedNodeId = link.fromNodeId === node.id ? link.toNodeId : link.fromNodeId;
          return snapshot.nodes.find((candidate) => candidate.id === relatedNodeId)?.package.title || "";
        })
        .filter(Boolean);
      const haystack = normalizeSearchText(
        [...links.incoming, ...links.outgoing]
          .map((link) => link.type)
          .concat(relatedNodeTitles)
          .join(" ")
      );
      if (haystack.includes(normalizedQuery)) {
        matchedScopes.push("links");
        score += 20;
      }
    }

    if (context?.preferredAnchorRefs?.length) {
      const matchedAnchorCount = context.preferredAnchorRefs.filter((ref) => anchorRefs.includes(ref)).length;
      score += matchedAnchorCount * 18;
    }
    if (context?.preferredNodeRefs?.includes(node.ref)) {
      score += 36;
    }
    if (context?.preferredNodeKinds?.includes(node.kind)) {
      score += 16;
    }
    if (context?.preferredOrigins?.includes(node.origin)) {
      score += 10;
    }
    if (context?.preferredStatuses?.includes(node.package.status)) {
      score += 8;
    }

    if (matchedScopes.length) {
      matches.push({
        node: toKnowledgeNodeIdentity(snapshot, node),
        matchedScopes,
        score,
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score || b.node.updatedAt - a.node.updatedAt);
};
