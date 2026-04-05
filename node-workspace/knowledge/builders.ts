import type {
  KnowledgeAnchor,
  KnowledgeLink,
  KnowledgeLinkOrigin,
  KnowledgeNode,
  KnowledgeNodeConfidence,
  KnowledgeNodeOrigin,
  KnowledgeNodeStatus,
} from "./types";
import {
  assertKnowledgeLinkTypeIsValid,
  assertKnowledgeNodeKindIsValid,
} from "./lifecycle";

type CreateKnowledgeNodeInput = {
  id: string;
  ref: string;
  kind: string;
  title: string;
  origin?: KnowledgeNodeOrigin;
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
  origin?: KnowledgeLinkOrigin;
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
  origin = "agent-derived",
  content = {},
  meta,
  status = "draft",
  confidence,
  anchors = [],
  createdAt = Date.now(),
  updatedAt = createdAt,
}: CreateKnowledgeNodeInput): KnowledgeNode => {
  assertKnowledgeNodeKindIsValid(kind, origin);
  return {
    id,
    ref,
    kind,
    origin,
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
  };
};

export const createKnowledgeLink = ({
  id,
  origin = "agent-derived",
  fromNodeId,
  toNodeId,
  type,
  weight,
  status = "active",
  createdAt = Date.now(),
  updatedAt = createdAt,
}: CreateKnowledgeLinkInput): KnowledgeLink => {
  assertKnowledgeLinkTypeIsValid(type);
  return {
    id,
    origin,
    fromNodeId,
    toNodeId,
    type,
    weight,
    status,
    createdAt,
    updatedAt,
  };
};

export const createCanonicalKnowledgeNode = (
  input: Omit<CreateKnowledgeNodeInput, "origin">
): KnowledgeNode =>
  createKnowledgeNode({
    ...input,
    origin: "canonical-source",
  });

export const createAgentKnowledgeNode = (
  input: Omit<CreateKnowledgeNodeInput, "origin">
): KnowledgeNode =>
  createKnowledgeNode({
    ...input,
    origin: "agent-derived",
  });

export const createCanonicalKnowledgeLink = (
  input: Omit<CreateKnowledgeLinkInput, "origin">
): KnowledgeLink =>
  createKnowledgeLink({
    ...input,
    origin: "canonical-source",
  });

export const createAgentKnowledgeLink = (
  input: Omit<CreateKnowledgeLinkInput, "origin">
): KnowledgeLink =>
  createKnowledgeLink({
    ...input,
    origin: "agent-derived",
  });
