export type KnowledgeNodeStatus =
  | "draft"
  | "working"
  | "accepted"
  | "superseded"
  | "rejected";

export type KnowledgeNodeConfidence = "low" | "medium" | "high";
export type KnowledgeNodeOrigin = "canonical-source" | "agent-derived";
export type KnowledgeLinkOrigin = "canonical-source" | "agent-derived";

export type KnowledgeAnchorType =
  | "script"
  | "episode"
  | "scene"
  | "nodeflow"
  | "asset";

export type KnowledgeAnchor = {
  type: KnowledgeAnchorType;
  ref: string;
  span?: string;
};

export type KnowledgeNodePackage = {
  title: string;
  status: KnowledgeNodeStatus;
  confidence?: KnowledgeNodeConfidence;
};

export type KnowledgeNode = {
  id: string;
  ref: string;
  kind: string;
  origin: KnowledgeNodeOrigin;
  package: KnowledgeNodePackage;
  content: Record<string, unknown>;
  meta?: Record<string, unknown>;
  anchors: KnowledgeAnchor[];
  createdAt: number;
  updatedAt: number;
};

export type KnowledgeLink = {
  id: string;
  origin: KnowledgeLinkOrigin;
  fromNodeId: string;
  toNodeId: string;
  type: string;
  weight?: number;
  status?: "active" | "superseded";
  createdAt: number;
  updatedAt: number;
};

export type KnowledgeMapLens = {
  id: string;
  kind: "full" | "local" | "anchor" | "kind" | "focus";
  focusNodeRefs?: string[];
  anchorRefs?: string[];
  nodeKinds?: string[];
  depth?: number;
};

export type KnowledgeMapLensProjection = {
  lens: KnowledgeMapLens;
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
};

export type KnowledgeMap = {
  revision: number;
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
};

export type KnowledgeLocalMapProjection = {
  centerNode: KnowledgeNode | null;
  depth: number;
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
};

export type KnowledgeAnchorMapProjection = {
  anchor: KnowledgeAnchor | null;
  depth: number;
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
};

export type KnowledgeSnapshot = {
  revision: number;
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
};

export type KnowledgeLifecycleProjection = {
  nodeStatusCounts: Record<KnowledgeNodeStatus, number>;
  supersedeChains: Array<{
    headNode: KnowledgeNode;
    nodes: KnowledgeNode[];
    links: KnowledgeLink[];
  }>;
};

export type KnowledgeAnchorRegistryItem = {
  anchor: KnowledgeAnchor;
  nodeCount: number;
  canonicalNodeCount: number;
  derivedNodeCount: number;
  latestUpdatedAt: number | null;
};

export type KnowledgeAnchorTimelineProjection = {
  anchor: KnowledgeAnchor | null;
  nodes: KnowledgeNode[];
  supersedeChains: Array<{
    headNode: KnowledgeNode;
    nodes: KnowledgeNode[];
    links: KnowledgeLink[];
  }>;
};

export type KnowledgeNodeIdentity = {
  id: string;
  ref: string;
  kind: string;
  origin: KnowledgeNodeOrigin;
  title: string;
  status: KnowledgeNodeStatus;
  confidence?: KnowledgeNodeConfidence;
  anchorCount: number;
  incomingLinkCount: number;
  outgoingLinkCount: number;
  updatedAt: number;
};

export type KnowledgeNodeDetail = {
  id: string;
  ref: string;
  kind: string;
  origin: KnowledgeNodeOrigin;
  package: KnowledgeNodePackage;
  content: Record<string, unknown>;
  meta?: Record<string, unknown>;
  anchors: KnowledgeAnchor[];
  incomingLinks: KnowledgeLink[];
  outgoingLinks: KnowledgeLink[];
  createdAt: number;
  updatedAt: number;
};

export type KnowledgeSearchScope = "identity" | "content" | "anchors" | "links";

export type KnowledgeSearchContext = {
  preferredAnchorRefs?: string[];
  preferredNodeRefs?: string[];
  preferredNodeKinds?: string[];
  preferredOrigins?: KnowledgeNodeOrigin[];
  preferredStatuses?: KnowledgeNodeStatus[];
};

export type KnowledgeSearchResult = {
  node: KnowledgeNodeIdentity;
  matchedScopes: KnowledgeSearchScope[];
  score: number;
};
