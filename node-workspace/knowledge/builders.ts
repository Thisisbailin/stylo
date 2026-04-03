import type {
  KnowledgeAnchor,
  KnowledgeLink,
  KnowledgeNode,
  KnowledgeNodeConfidence,
  KnowledgeNodeStatus,
} from "./types";

type CreateKnowledgeNodeInput = {
  id: string;
  ref: string;
  kind: string;
  title: string;
  content?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  status?: KnowledgeNodeStatus;
  confidence?: KnowledgeNodeConfidence;
  anchors?: KnowledgeAnchor[];
  createdAt?: number;
  updatedAt?: number;
};

type CreateKnowledgeLinkInput = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  type: string;
  weight?: number;
  status?: "active" | "superseded";
  createdAt?: number;
  updatedAt?: number;
};

export const createKnowledgeNode = ({
  id,
  ref,
  kind,
  title,
  content = {},
  meta,
  status = "draft",
  confidence,
  anchors = [],
  createdAt = Date.now(),
  updatedAt = createdAt,
}: CreateKnowledgeNodeInput): KnowledgeNode => ({
  id,
  ref,
  kind,
  package: {
    title,
    status,
    confidence,
  },
  content,
  meta,
  anchors,
  createdAt,
  updatedAt,
});

export const createKnowledgeLink = ({
  id,
  fromNodeId,
  toNodeId,
  type,
  weight,
  status = "active",
  createdAt = Date.now(),
  updatedAt = createdAt,
}: CreateKnowledgeLinkInput): KnowledgeLink => ({
  id,
  fromNodeId,
  toNodeId,
  type,
  weight,
  status,
  createdAt,
  updatedAt,
});
