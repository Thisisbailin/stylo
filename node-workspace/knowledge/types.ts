export type KnowledgeNodeStatus =
  | "draft"
  | "working"
  | "accepted"
  | "superseded"
  | "rejected";

export type KnowledgeNodeConfidence = "low" | "medium" | "high";

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
  package: KnowledgeNodePackage;
  content: Record<string, unknown>;
  meta?: Record<string, unknown>;
  anchors: KnowledgeAnchor[];
  createdAt: number;
  updatedAt: number;
};

export type KnowledgeLink = {
  id: string;
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

export type KnowledgeMap = {
  revision: number;
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
};

export type KnowledgeSnapshot = {
  revision: number;
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
};
