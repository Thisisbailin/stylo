import { createKnowledgeAnchor } from "./anchors";
import { createAgentKnowledgeLink, createAgentKnowledgeNode } from "./builders";
import { removeKnowledgeLink, upsertKnowledgeLink, upsertKnowledgeNode } from "./mutations";
import {
  assertKnowledgeLinkCanBeRevised,
  assertKnowledgeLinkEndpointsExist,
  assertKnowledgeNodeCanBeRevised,
} from "./lifecycle";
import type {
  KnowledgeAnchor,
  KnowledgeAnchorType,
  KnowledgeLink,
  KnowledgeNode,
  KnowledgeNodeConfidence,
  KnowledgeNodeStatus,
  KnowledgeSnapshot,
} from "./types";

type CreateDerivedKnowledgeNodeInput = {
  id?: string;
  ref?: string;
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

type CreateAnchoredDerivedKnowledgeNodeInput = {
  anchorType: KnowledgeAnchorType;
  anchorRef: string;
  anchorSpan?: string;
} & Omit<CreateDerivedKnowledgeNodeInput, "anchors"> & {
    anchors?: KnowledgeAnchor[];
  };

type CreateDerivedKnowledgeLinkInput = {
  id?: string;
  fromNodeId: string;
  toNodeId: string;
  type: string;
  weight?: number;
  status?: "active" | "superseded";
  createdAt?: number;
  updatedAt?: number;
};

type SupersedeDerivedKnowledgeNodeInput = {
  nodeId?: string;
  nodeRef?: string;
  id?: string;
  ref?: string;
  kind?: string;
  title?: string;
  content?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  status?: KnowledgeNodeStatus;
  confidence?: KnowledgeNodeConfidence;
  anchors?: KnowledgeAnchor[];
  relationType?: string;
  createdAt?: number;
  updatedAt?: number;
};

type SupersedeAnchoredDerivedKnowledgeNodeInput = {
  anchorType: KnowledgeAnchorType;
  anchorRef: string;
  anchorSpan?: string;
} & SupersedeDerivedKnowledgeNodeInput;

const createKnowledgeCommandId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createDerivedNodeRef = (kind: string) =>
  `derived:${kind}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createDerivedKnowledgeNodeCommand = (
  snapshot: KnowledgeSnapshot,
  input: CreateDerivedKnowledgeNodeInput
): { snapshot: KnowledgeSnapshot; node: KnowledgeNode } => {
  const node = createAgentKnowledgeNode({
    id: input.id || createKnowledgeCommandId("knowledge-node"),
    ref: input.ref || createDerivedNodeRef(input.kind),
    kind: input.kind,
    title: input.title,
    content: input.content,
    meta: input.meta,
    status: input.status,
    confidence: input.confidence,
    anchors: input.anchors,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });

  return {
    snapshot: upsertKnowledgeNode(snapshot, node),
    node,
  };
};

export const createAnchoredDerivedKnowledgeNodeCommand = (
  snapshot: KnowledgeSnapshot,
  input: CreateAnchoredDerivedKnowledgeNodeInput
): { snapshot: KnowledgeSnapshot; node: KnowledgeNode } => {
  const anchor = createKnowledgeAnchor(input.anchorType, input.anchorRef, input.anchorSpan);
  const anchors = [...(input.anchors || []), anchor];

  return createDerivedKnowledgeNodeCommand(snapshot, {
    ...input,
    anchors,
  });
};

export const createDerivedKnowledgeLinkCommand = (
  snapshot: KnowledgeSnapshot,
  input: CreateDerivedKnowledgeLinkInput
): { snapshot: KnowledgeSnapshot; link: KnowledgeLink } => {
  assertKnowledgeLinkEndpointsExist(snapshot, input);
  const link = createAgentKnowledgeLink({
    id: input.id || createKnowledgeCommandId("knowledge-link"),
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    type: input.type,
    weight: input.weight,
    status: input.status,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });

  return {
    snapshot: upsertKnowledgeLink(snapshot, link),
    link,
  };
};

export const removeDerivedKnowledgeLinkCommand = (
  snapshot: KnowledgeSnapshot,
  input: { linkId: string }
): { snapshot: KnowledgeSnapshot; link: KnowledgeLink } => {
  const link = snapshot.links.find((item) => item.id === input.linkId);
  if (!link) {
    throw new Error("Cannot unlink knowledge link because the target link was not found.");
  }
  assertKnowledgeLinkCanBeRevised(link);
  return {
    snapshot: removeKnowledgeLink(snapshot, link.id),
    link,
  };
};

export const supersedeDerivedKnowledgeNodeCommand = (
  snapshot: KnowledgeSnapshot,
  input: SupersedeDerivedKnowledgeNodeInput
): { snapshot: KnowledgeSnapshot; previousNode: KnowledgeNode; node: KnowledgeNode; link: KnowledgeLink } => {
  const previousNode = input.nodeId
    ? snapshot.nodes.find((node) => node.id === input.nodeId)
    : snapshot.nodes.find((node) => node.ref === input.nodeRef);

  if (!previousNode) {
    throw new Error("Cannot supersede knowledge node because the target node was not found.");
  }

  assertKnowledgeNodeCanBeRevised(previousNode);

  const supersededAt = input.updatedAt ?? Date.now();
  const nextPreviousNode: KnowledgeNode = {
    ...previousNode,
    package: {
      ...previousNode.package,
      status: "superseded",
    },
    updatedAt: supersededAt,
  };

  const nextNode = createAgentKnowledgeNode({
    id: input.id || createKnowledgeCommandId("knowledge-node"),
    ref: input.ref || createDerivedNodeRef(input.kind || previousNode.kind),
    kind: input.kind || previousNode.kind,
    title: input.title || previousNode.package.title,
    content: input.content ?? previousNode.content,
    meta: input.meta ?? previousNode.meta,
    status: input.status || "working",
    confidence: input.confidence ?? previousNode.package.confidence,
    anchors: input.anchors ?? previousNode.anchors,
    createdAt: input.createdAt ?? supersededAt,
    updatedAt: supersededAt,
  });

  const nextLink = createAgentKnowledgeLink({
    id: createKnowledgeCommandId("knowledge-link"),
    fromNodeId: nextNode.id,
    toNodeId: previousNode.id,
    type: input.relationType || "supersedes",
    createdAt: supersededAt,
    updatedAt: supersededAt,
  });

  const withSupersededPrevious = upsertKnowledgeNode(snapshot, nextPreviousNode);
  const withNextNode = upsertKnowledgeNode(withSupersededPrevious, nextNode);
  const nextSnapshot = upsertKnowledgeLink(withNextNode, nextLink);

  return {
    snapshot: nextSnapshot,
    previousNode: nextPreviousNode,
    node: nextNode,
    link: nextLink,
  };
};

export const supersedeAnchoredDerivedKnowledgeNodeCommand = (
  snapshot: KnowledgeSnapshot,
  input: SupersedeAnchoredDerivedKnowledgeNodeInput
): { snapshot: KnowledgeSnapshot; previousNode: KnowledgeNode; node: KnowledgeNode; link: KnowledgeLink } => {
  const anchor = createKnowledgeAnchor(input.anchorType, input.anchorRef, input.anchorSpan);
  const previousNode = input.nodeId
    ? snapshot.nodes.find((node) => node.id === input.nodeId)
    : snapshot.nodes.find((node) => node.ref === input.nodeRef);

  const inheritedAnchors = previousNode?.anchors || [];
  const nextAnchors = [...inheritedAnchors];
  if (!nextAnchors.some((item) => item.type === anchor.type && item.ref === anchor.ref && item.span === anchor.span)) {
    nextAnchors.push(anchor);
  }

  return supersedeDerivedKnowledgeNodeCommand(snapshot, {
    ...input,
    anchors: input.anchors ? [...input.anchors, ...nextAnchors] : nextAnchors,
  });
};
