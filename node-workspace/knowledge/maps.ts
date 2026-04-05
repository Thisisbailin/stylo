import type {
  KnowledgeAnchor,
  KnowledgeAnchorRegistryItem,
  KnowledgeAnchorTimelineProjection,
  KnowledgeAnchorMapProjection,
  KnowledgeLifecycleProjection,
  KnowledgeLink,
  KnowledgeMap,
  KnowledgeNode,
  KnowledgeNodeStatus,
  KnowledgeSnapshot,
} from "./types";

export const buildKnowledgeMap = (snapshot: KnowledgeSnapshot): KnowledgeMap => ({
  revision: snapshot.revision,
  nodes: snapshot.nodes,
  links: snapshot.links,
});

export type KnowledgeScriptSceneBranch = {
  link: KnowledgeLink | null;
  node: KnowledgeNode;
  scenes: Array<{
    link: KnowledgeLink | null;
    node: KnowledgeNode;
  }>;
};

export type KnowledgeScriptMapProjection = {
  scripts: Array<{
    node: KnowledgeNode;
    episodes: KnowledgeScriptSceneBranch[];
  }>;
  looseNodes: KnowledgeNode[];
  looseLinks: KnowledgeLink[];
};

export type KnowledgeLocalMapProjection = {
  centerNode: KnowledgeNode | null;
  depth: number;
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
};

export const buildKnowledgeScriptMapProjection = (
  snapshot: KnowledgeSnapshot
): KnowledgeScriptMapProjection => {
  const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const scriptNodes = snapshot.nodes.filter((node) => node.kind === "source.script");
  const usedNodeIds = new Set<string>();
  const usedLinkIds = new Set<string>();

  const scripts = scriptNodes.map((scriptNode) => {
    usedNodeIds.add(scriptNode.id);
    const episodeLinks = snapshot.links.filter(
      (link) => link.fromNodeId === scriptNode.id && link.type === "contains"
    );
    const episodes = episodeLinks
      .map((episodeLink) => {
        const episodeNode = nodesById.get(episodeLink.toNodeId);
        if (!episodeNode) return null;
        usedLinkIds.add(episodeLink.id);
        usedNodeIds.add(episodeNode.id);
        const sceneLinks = snapshot.links.filter(
          (link) => link.fromNodeId === episodeNode.id && link.type === "contains"
        );
        const scenes = sceneLinks
          .map((sceneLink) => {
            const sceneNode = nodesById.get(sceneLink.toNodeId);
            if (!sceneNode) return null;
            usedLinkIds.add(sceneLink.id);
            usedNodeIds.add(sceneNode.id);
            return {
              link: sceneLink,
              node: sceneNode,
            };
          })
          .filter((value): value is { link: KnowledgeLink | null; node: KnowledgeNode } => Boolean(value));

        return {
          link: episodeLink,
          node: episodeNode,
          scenes,
        };
      })
      .filter((value): value is KnowledgeScriptSceneBranch => Boolean(value));

    return {
      node: scriptNode,
      episodes,
    };
  });

  return {
    scripts,
    looseNodes: snapshot.nodes.filter((node) => !usedNodeIds.has(node.id)),
    looseLinks: snapshot.links.filter((link) => !usedLinkIds.has(link.id)),
  };
};

export const buildKnowledgeLocalMapProjection = (
  snapshot: KnowledgeSnapshot,
  {
    nodeId,
    nodeRef,
    depth = 1,
  }: {
    nodeId?: string;
    nodeRef?: string;
    depth?: number;
  }
): KnowledgeLocalMapProjection => {
  const centerNode =
    (nodeId ? snapshot.nodes.find((node) => node.id === nodeId) : undefined) ||
    (nodeRef ? snapshot.nodes.find((node) => node.ref === nodeRef) : undefined) ||
    null;

  if (!centerNode) {
    return {
      centerNode: null,
      depth,
      nodes: [],
      links: [],
    };
  }

  const effectiveDepth = Math.max(0, Math.floor(depth));
  const visitedNodeIds = new Set<string>([centerNode.id]);
  const visitedLinkIds = new Set<string>();
  let frontier = new Set<string>([centerNode.id]);

  for (let level = 0; level < effectiveDepth; level += 1) {
    const nextFrontier = new Set<string>();

    for (const link of snapshot.links) {
      const touchesFrontier =
        frontier.has(link.fromNodeId) || frontier.has(link.toNodeId);
      if (!touchesFrontier) continue;

      visitedLinkIds.add(link.id);

      if (!visitedNodeIds.has(link.fromNodeId)) {
        visitedNodeIds.add(link.fromNodeId);
        nextFrontier.add(link.fromNodeId);
      }
      if (!visitedNodeIds.has(link.toNodeId)) {
        visitedNodeIds.add(link.toNodeId);
        nextFrontier.add(link.toNodeId);
      }
    }

    frontier = nextFrontier;
    if (!frontier.size) break;
  }

  return {
    centerNode,
    depth: effectiveDepth,
    nodes: snapshot.nodes.filter((node) => visitedNodeIds.has(node.id)),
    links: snapshot.links.filter((link) => visitedLinkIds.has(link.id)),
  };
};

export const buildKnowledgeAnchorMapProjection = (
  snapshot: KnowledgeSnapshot,
  {
    anchor,
    depth = 1,
  }: {
    anchor?: KnowledgeAnchor | null;
    depth?: number;
  }
): KnowledgeAnchorMapProjection => {
  if (!anchor) {
    return {
      anchor: null,
      depth: Math.max(0, Math.floor(depth)),
      nodes: [],
      links: [],
    };
  }

  const anchorNodes = snapshot.nodes.filter((node) =>
    node.anchors.some(
      (candidate) => candidate.type === anchor.type && candidate.ref === anchor.ref
    )
  );

  if (!anchorNodes.length) {
    return {
      anchor,
      depth: Math.max(0, Math.floor(depth)),
      nodes: [],
      links: [],
    };
  }

  const effectiveDepth = Math.max(0, Math.floor(depth));
  const visitedNodeIds = new Set<string>(anchorNodes.map((node) => node.id));
  const visitedLinkIds = new Set<string>();
  let frontier = new Set<string>(anchorNodes.map((node) => node.id));

  for (let level = 0; level < effectiveDepth; level += 1) {
    const nextFrontier = new Set<string>();

    for (const link of snapshot.links) {
      const touchesFrontier =
        frontier.has(link.fromNodeId) || frontier.has(link.toNodeId);
      if (!touchesFrontier) continue;

      visitedLinkIds.add(link.id);

      if (!visitedNodeIds.has(link.fromNodeId)) {
        visitedNodeIds.add(link.fromNodeId);
        nextFrontier.add(link.fromNodeId);
      }
      if (!visitedNodeIds.has(link.toNodeId)) {
        visitedNodeIds.add(link.toNodeId);
        nextFrontier.add(link.toNodeId);
      }
    }

    frontier = nextFrontier;
    if (!frontier.size) break;
  }

  return {
    anchor,
    depth: effectiveDepth,
    nodes: snapshot.nodes.filter((node) => visitedNodeIds.has(node.id)),
    links: snapshot.links.filter((link) => visitedLinkIds.has(link.id)),
  };
};

export const buildKnowledgeAnchorRegistryProjection = (
  snapshot: KnowledgeSnapshot
): KnowledgeAnchorRegistryItem[] => {
  const grouped = new Map<string, { anchor: KnowledgeAnchor; nodes: KnowledgeNode[] }>();

  for (const node of snapshot.nodes) {
    for (const anchor of node.anchors) {
      const key = `${anchor.type}:${anchor.ref}:${anchor.span || ""}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.nodes.push(node);
      } else {
        grouped.set(key, {
          anchor,
          nodes: [node],
        });
      }
    }
  }

  return Array.from(grouped.values())
    .map(({ anchor, nodes }) => ({
      anchor,
      nodeCount: nodes.length,
      canonicalNodeCount: nodes.filter((node) => node.origin === "canonical-source").length,
      derivedNodeCount: nodes.filter((node) => node.origin === "agent-derived").length,
      latestUpdatedAt: nodes.reduce<number | null>(
        (latest, node) => (latest == null || node.updatedAt > latest ? node.updatedAt : latest),
        null
      ),
    }))
    .sort((a, b) => {
      const latestA = a.latestUpdatedAt || 0;
      const latestB = b.latestUpdatedAt || 0;
      if (latestA !== latestB) return latestB - latestA;
      return `${a.anchor.type}:${a.anchor.ref}`.localeCompare(`${b.anchor.type}:${b.anchor.ref}`);
    });
};

const KNOWLEDGE_NODE_STATUSES: KnowledgeNodeStatus[] = [
  "draft",
  "working",
  "accepted",
  "superseded",
  "rejected",
];

export const buildKnowledgeLifecycleProjection = (
  snapshot: KnowledgeSnapshot
): KnowledgeLifecycleProjection => {
  const nodeStatusCounts = KNOWLEDGE_NODE_STATUSES.reduce<Record<KnowledgeNodeStatus, number>>(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<KnowledgeNodeStatus, number>
  );

  for (const node of snapshot.nodes) {
    nodeStatusCounts[node.package.status] += 1;
  }

  const supersedeLinks = snapshot.links.filter((link) => link.type === "supersedes");
  const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const incomingSupersedes = new Map<string, KnowledgeLink[]>();
  const outgoingSupersedes = new Map<string, KnowledgeLink[]>();

  for (const link of supersedeLinks) {
    const outgoing = outgoingSupersedes.get(link.fromNodeId) || [];
    outgoing.push(link);
    outgoingSupersedes.set(link.fromNodeId, outgoing);

    const incoming = incomingSupersedes.get(link.toNodeId) || [];
    incoming.push(link);
    incomingSupersedes.set(link.toNodeId, incoming);
  }

  const chainHeads = snapshot.nodes.filter((node) => {
    if (!outgoingSupersedes.get(node.id)?.length) return false;
    return !(incomingSupersedes.get(node.id)?.length);
  });

  const supersedeChains = chainHeads.map((headNode) => {
    const chainNodes: KnowledgeNode[] = [];
    const chainLinks: KnowledgeLink[] = [];
    const visitedNodeIds = new Set<string>();
    let cursor: KnowledgeNode | undefined = headNode;

    while (cursor && !visitedNodeIds.has(cursor.id)) {
      visitedNodeIds.add(cursor.id);
      chainNodes.push(cursor);
      const nextLink = (outgoingSupersedes.get(cursor.id) || [])
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (!nextLink) break;
      chainLinks.push(nextLink);
      cursor = nodesById.get(nextLink.toNodeId);
    }

    return {
      headNode,
      nodes: chainNodes,
      links: chainLinks,
    };
  });

  return {
    nodeStatusCounts,
    supersedeChains,
  };
};

export const buildKnowledgeAnchorTimelineProjection = (
  snapshot: KnowledgeSnapshot,
  anchor?: KnowledgeAnchor | null
): KnowledgeAnchorTimelineProjection => {
  if (!anchor) {
    return {
      anchor: null,
      nodes: [],
      supersedeChains: [],
    };
  }

  const nodes = snapshot.nodes
    .filter((node) =>
      node.anchors.some(
        (candidate) =>
          candidate.type === anchor.type &&
          candidate.ref === anchor.ref &&
          candidate.span === anchor.span
      )
    )
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const nodeIds = new Set(nodes.map((node) => node.id));
  const lifecycle = buildKnowledgeLifecycleProjection(snapshot);
  const supersedeChains = lifecycle.supersedeChains.filter((chain) =>
    chain.nodes.some((node) => nodeIds.has(node.id))
  );

  return {
    anchor,
    nodes,
    supersedeChains,
  };
};
