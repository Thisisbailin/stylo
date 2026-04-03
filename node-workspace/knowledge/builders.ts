import type {
  KnowledgeAnchor,
  KnowledgeEntry,
  KnowledgeEntryConfidence,
  KnowledgeEntryStatus,
  KnowledgeRelation,
} from "./types";

type CreateKnowledgeEntryInput = {
  id: string;
  ref: string;
  kind: string;
  title: string;
  payload?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  status?: KnowledgeEntryStatus;
  confidence?: KnowledgeEntryConfidence;
  anchors?: KnowledgeAnchor[];
  createdAt?: number;
  updatedAt?: number;
};

type CreateKnowledgeRelationInput = {
  id: string;
  fromEntryId: string;
  toEntryId: string;
  type: string;
  weight?: number;
  status?: "active" | "superseded";
  createdAt?: number;
  updatedAt?: number;
};

export const createKnowledgeEntry = ({
  id,
  ref,
  kind,
  title,
  payload = {},
  meta,
  status = "draft",
  confidence,
  anchors = [],
  createdAt = Date.now(),
  updatedAt = createdAt,
}: CreateKnowledgeEntryInput): KnowledgeEntry => ({
  id,
  ref,
  kind,
  title,
  payload,
  meta,
  status,
  confidence,
  anchors,
  createdAt,
  updatedAt,
});

export const createKnowledgeRelation = ({
  id,
  fromEntryId,
  toEntryId,
  type,
  weight,
  status = "active",
  createdAt = Date.now(),
  updatedAt = createdAt,
}: CreateKnowledgeRelationInput): KnowledgeRelation => ({
  id,
  fromEntryId,
  toEntryId,
  type,
  weight,
  status,
  createdAt,
  updatedAt,
});
