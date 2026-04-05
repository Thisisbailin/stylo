import {
  buildKnowledgeAnchorTimelineProjection,
  buildKnowledgeAnchorMapProjection,
  buildKnowledgeAnchorRegistryProjection,
  buildKnowledgeLifecycleProjection,
  buildKnowledgeLocalMapProjection,
  buildKnowledgeMap,
} from "./maps";
import {
  listKnowledgeNodeIdentities,
  readKnowledgeNodeDetail,
  readKnowledgeNodeIdentity,
  searchKnowledgeNodes,
} from "./queries";
import type {
  KnowledgeAnchor,
  KnowledgeSearchScope,
  KnowledgeSnapshot,
} from "./types";

export const KNOWLEDGE_LIST_RESOURCE_TYPES = [
  "knowledge_node_identities",
  "knowledge_anchors",
] as const;

export const KNOWLEDGE_READ_RESOURCE_TYPES = [
  "knowledge_node_identity",
  "knowledge_node_detail",
  "knowledge_map",
  "knowledge_local_map",
  "knowledge_anchor_map",
  "knowledge_lifecycle",
  "knowledge_anchor_timeline",
] as const;

export const KNOWLEDGE_SEARCH_RESOURCE_SCOPES = [
  "identity",
  "content",
  "anchors",
  "links",
] as const satisfies readonly KnowledgeSearchScope[];

export type KnowledgeListResourceType = (typeof KNOWLEDGE_LIST_RESOURCE_TYPES)[number];
export type KnowledgeReadResourceType = (typeof KNOWLEDGE_READ_RESOURCE_TYPES)[number];

export const listKnowledgeResources = (
  snapshot: KnowledgeSnapshot,
  {
    resourceType,
    maxItems = 50,
  }: {
    resourceType: KnowledgeListResourceType;
    maxItems?: number;
  }
) => {
  const effectiveMaxItems = Math.max(1, Math.min(200, Math.floor(maxItems)));

  if (resourceType === "knowledge_node_identities") {
    const items = listKnowledgeNodeIdentities(snapshot).slice(0, effectiveMaxItems);
    return {
      resource_type: resourceType,
      total: snapshot.nodes.length,
      items,
    };
  }

  const allItems = buildKnowledgeAnchorRegistryProjection(snapshot);
  const items = allItems.slice(0, effectiveMaxItems);
  return {
    resource_type: resourceType,
    total: allItems.length,
    items,
  };
};

export const readKnowledgeResource = (
  snapshot: KnowledgeSnapshot,
  {
    resourceType,
    nodeId,
    nodeRef,
    anchor,
    depth = 1,
  }: {
    resourceType: KnowledgeReadResourceType;
    nodeId?: string;
    nodeRef?: string;
    anchor?: KnowledgeAnchor | null;
    depth?: number;
  }
) => {
  if (resourceType === "knowledge_node_identity") {
    return {
      resource_type: resourceType,
      found: true,
      item: readKnowledgeNodeIdentity(snapshot, { nodeId, nodeRef }),
    };
  }

  if (resourceType === "knowledge_node_detail") {
    return {
      resource_type: resourceType,
      found: true,
      item: readKnowledgeNodeDetail(snapshot, { nodeId, nodeRef }),
    };
  }

  if (resourceType === "knowledge_map") {
    return {
      resource_type: resourceType,
      item: buildKnowledgeMap(snapshot),
    };
  }

  if (resourceType === "knowledge_local_map") {
    return {
      resource_type: resourceType,
      item: buildKnowledgeLocalMapProjection(snapshot, { nodeId, nodeRef, depth }),
    };
  }

  if (resourceType === "knowledge_anchor_map") {
    return {
      resource_type: resourceType,
      item: buildKnowledgeAnchorMapProjection(snapshot, { anchor, depth }),
    };
  }

  if (resourceType === "knowledge_lifecycle") {
    return {
      resource_type: resourceType,
      item: buildKnowledgeLifecycleProjection(snapshot),
    };
  }

  const registry = buildKnowledgeAnchorRegistryProjection(snapshot);
  const effectiveAnchor =
    anchor ||
    (nodeId || nodeRef
      ? readKnowledgeNodeDetail(snapshot, { nodeId, nodeRef })?.anchors[0] || null
      : registry[0]?.anchor || null);

  return {
    resource_type: resourceType,
    item: buildKnowledgeAnchorTimelineProjection(snapshot, effectiveAnchor),
  };
};

export const searchKnowledgeResources = (
  snapshot: KnowledgeSnapshot,
  {
    query,
    scopes,
  }: {
    query: string;
    scopes?: KnowledgeSearchScope[];
  }
) => ({
  resource_type: "knowledge_search",
  total: searchKnowledgeNodes(snapshot, { query, scopes }).length,
  items: searchKnowledgeNodes(snapshot, { query, scopes }),
});
