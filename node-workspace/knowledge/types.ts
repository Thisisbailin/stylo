export type KnowledgeEntryStatus =
  | "draft"
  | "working"
  | "accepted"
  | "superseded"
  | "rejected";

export type KnowledgeEntryConfidence = "low" | "medium" | "high";

export type KnowledgeAnchorType =
  | "script"
  | "episode"
  | "scene"
  | "guide"
  | "nodeflow"
  | "asset";

export type KnowledgeAnchor = {
  type: KnowledgeAnchorType;
  ref: string;
  span?: string;
};

export type KnowledgeEntry = {
  id: string;
  ref: string;
  kind: string;
  title: string;
  payload: Record<string, unknown>;
  meta?: Record<string, unknown>;
  status: KnowledgeEntryStatus;
  confidence?: KnowledgeEntryConfidence;
  anchors: KnowledgeAnchor[];
  createdAt: number;
  updatedAt: number;
};

export type KnowledgeRelation = {
  id: string;
  fromEntryId: string;
  toEntryId: string;
  type: string;
  weight?: number;
  status?: "active" | "superseded";
  createdAt: number;
  updatedAt: number;
};

export type KnowledgeMapView = {
  revision: number;
  entries: KnowledgeEntry[];
  relations: KnowledgeRelation[];
};

export type KnowledgeSnapshot = {
  revision: number;
  entries: KnowledgeEntry[];
  relations: KnowledgeRelation[];
};
