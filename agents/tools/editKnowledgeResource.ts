import type { KnowledgeAnchor, KnowledgeNodeConfidence, KnowledgeNodeStatus } from "../../node-workspace/knowledge/types";
import { parseKnowledgeAnchorRef } from "../../node-workspace/knowledge/anchors";
import type { QalamAgentBridge } from "../bridge/qalamBridge";

export const EDIT_KNOWLEDGE_RESOURCE_TYPES = ["knowledge_node", "knowledge_link"] as const;

const editKnowledgeResourceParameters = {
  type: "object",
  properties: {
    resource_type: {
      type: "string",
      enum: [...EDIT_KNOWLEDGE_RESOURCE_TYPES],
      description: "Which Knowledge resource to edit.",
    },
    node_id: {
      type: "string",
      description: "Existing knowledge node id to supersede.",
    },
    node_ref: {
      type: "string",
      description: "Existing knowledge node ref to supersede.",
    },
    kind: {
      type: "string",
      description: "Derived knowledge node kind such as derived.note or scene.observation.",
    },
    title: {
      type: "string",
      description: "Knowledge node package title.",
    },
    content: {
      type: "object",
      description: "Structured Knowledge node content payload.",
      additionalProperties: true,
    },
    meta: {
      type: "object",
      description: "Optional structured metadata payload.",
      additionalProperties: true,
    },
    status: {
      type: "string",
      enum: ["draft", "working", "accepted", "superseded", "rejected"],
      description: "Optional lifecycle status for the new derived node.",
    },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
      description: "Optional confidence level for the new derived node.",
    },
    anchor_ref: {
      type: "string",
      description: "Optional anchor ref such as script:raw, episode:1, or scene:1-3.",
    },
    anchor_span: {
      type: "string",
      description: "Optional anchor span metadata.",
    },
    relation_type: {
      type: "string",
      description: "Optional relation type used when superseding a node. Defaults to supersedes.",
    },
    from_node_id: {
      type: "string",
      description: "Source node id for knowledge_link.",
    },
    to_node_id: {
      type: "string",
      description: "Target node id for knowledge_link.",
    },
    link_type: {
      type: "string",
      description: "Knowledge link type such as references, supports, or supersedes.",
    },
    weight: {
      type: "number",
      description: "Optional link weight.",
    },
  },
  additionalProperties: false,
  required: ["resource_type"],
} as const;

type ResourceType = (typeof EDIT_KNOWLEDGE_RESOURCE_TYPES)[number];

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const parseStatus = (value: unknown): KnowledgeNodeStatus | undefined => {
  const status = trim(value);
  if (status === "draft" || status === "working" || status === "accepted" || status === "superseded" || status === "rejected") {
    return status;
  }
  return undefined;
};

const parseConfidence = (value: unknown): KnowledgeNodeConfidence | undefined => {
  const confidence = trim(value);
  if (confidence === "low" || confidence === "medium" || confidence === "high") return confidence;
  return undefined;
};

const parseAnchor = (anchorRef: string | undefined, anchorSpan: string | undefined): KnowledgeAnchor | undefined => {
  if (!anchorRef) return undefined;
  const parsed = parseKnowledgeAnchorRef(anchorRef);
  if (!parsed) {
    throw new Error("edit_knowledge_resource 收到无效 anchor_ref。请使用 script:raw、episode:1 或 scene:1-3。");
  }
  return {
    ...parsed,
    span: anchorSpan,
  };
};

const parseArgs = (input: unknown) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("edit_knowledge_resource 需要对象参数。");
  }
  const raw = input as Record<string, unknown>;
  const resourceType = trim(raw.resource_type) as ResourceType;
  if (resourceType !== "knowledge_node" && resourceType !== "knowledge_link") {
    throw new Error(`edit_knowledge_resource 不支持 resource_type=${trim(raw.resource_type)}`);
  }

  const nodeId = trim(raw.node_id ?? raw.nodeId) || undefined;
  const nodeRef = trim(raw.node_ref ?? raw.nodeRef) || undefined;
  const kind = trim(raw.kind) || undefined;
  const title = trim(raw.title) || undefined;
  const content =
    raw.content && typeof raw.content === "object" && !Array.isArray(raw.content)
      ? (raw.content as Record<string, unknown>)
      : undefined;
  const meta =
    raw.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta)
      ? (raw.meta as Record<string, unknown>)
      : undefined;
  const status = parseStatus(raw.status);
  const confidence = parseConfidence(raw.confidence);
  const anchorRef = trim(raw.anchor_ref ?? raw.anchorRef) || undefined;
  const anchorSpan = trim(raw.anchor_span ?? raw.anchorSpan) || undefined;
  const relationType = trim(raw.relation_type ?? raw.relationType) || undefined;
  const fromNodeId = trim(raw.from_node_id ?? raw.fromNodeId) || undefined;
  const toNodeId = trim(raw.to_node_id ?? raw.toNodeId) || undefined;
  const linkType = trim(raw.link_type ?? raw.linkType) || undefined;
  const weight = typeof raw.weight === "number" ? raw.weight : undefined;
  const anchor = parseAnchor(anchorRef, anchorSpan);

  if (resourceType === "knowledge_node") {
    const isSupersede = Boolean(nodeId || nodeRef);
    if (!isSupersede && (!kind || !title)) {
      throw new Error("新建 knowledge_node 至少需要 kind 和 title。");
    }
    if (isSupersede && !nodeId && !nodeRef) {
      throw new Error("supersede knowledge_node 需要 node_id 或 node_ref。");
    }
  }

  if (resourceType === "knowledge_link") {
    if (!fromNodeId || !toNodeId || !linkType) {
      throw new Error("knowledge_link 需要 from_node_id、to_node_id 和 link_type。");
    }
  }

  return {
    resourceType,
    nodeId,
    nodeRef,
    kind,
    title,
    content,
    meta,
    status,
    confidence,
    anchor,
    relationType,
    fromNodeId,
    toNodeId,
    linkType,
    weight,
  };
};

export const editKnowledgeResourceToolDef = {
  name: "edit_knowledge_resource",
  description:
    "Create or supersede agent-derived Knowledge nodes, or create agent-derived Knowledge links. This tool writes only to Knowledge Core. It must not directly rewrite canonical-source knowledge.",
  parameters: editKnowledgeResourceParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);

    if (args.resourceType === "knowledge_link") {
      const link = bridge.createDerivedKnowledgeLink({
        fromNodeId: args.fromNodeId!,
        toNodeId: args.toNodeId!,
        type: args.linkType!,
        weight: args.weight,
      });
      return {
        updated: true,
        resource_type: "knowledge_link",
        operation: "created",
        link_id: link.id,
        from_node_id: link.fromNodeId,
        to_node_id: link.toNodeId,
        link_type: link.type,
        origin: link.origin,
      };
    }

    if (args.nodeId || args.nodeRef) {
      const result = bridge.supersedeDerivedKnowledgeNode({
        nodeId: args.nodeId,
        nodeRef: args.nodeRef,
        kind: args.kind,
        title: args.title,
        content: args.content,
        meta: args.meta,
        status: args.status,
        confidence: args.confidence,
        anchorType: args.anchor?.type,
        anchorRef: args.anchor?.ref,
        anchorSpan: args.anchor?.span,
        relationType: args.relationType,
      });
      return {
        updated: true,
        resource_type: "knowledge_node",
        operation: "superseded",
        previous_node_id: result.previousNode.id,
        previous_node_ref: result.previousNode.ref,
        node_id: result.node.id,
        node_ref: result.node.ref,
        kind: result.node.kind,
        title: result.node.package.title,
        origin: result.node.origin,
        status: result.node.package.status,
        supersede_link_id: result.link.id,
        relation_type: result.link.type,
      };
    }

    const node = bridge.createDerivedKnowledgeNode({
      kind: args.kind!,
      title: args.title!,
      content: args.content,
      meta: args.meta,
      status: args.status,
      confidence: args.confidence,
      anchorType: args.anchor?.type,
      anchorRef: args.anchor?.ref,
      anchorSpan: args.anchor?.span,
    });
    return {
      updated: true,
      resource_type: "knowledge_node",
      operation: "created",
      node_id: node.id,
      node_ref: node.ref,
      kind: node.kind,
      title: node.package.title,
      origin: node.origin,
      status: node.package.status,
    };
  },
  summarize: (output: any) => {
    if (output?.resource_type === "knowledge_link") {
      return `创建 Knowledge 关系 ${output?.link_type || ""}`.trim();
    }
    if (output?.operation === "superseded") {
      return `修正 Knowledge 节点 ${output?.title || output?.node_ref || output?.node_id || ""}`.trim();
    }
    return `创建 Knowledge 节点 ${output?.title || output?.node_ref || output?.node_id || ""}`.trim();
  },
};
