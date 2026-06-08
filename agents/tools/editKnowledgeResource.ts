import type {
  KnowledgeAnchor,
  KnowledgeNodeConfidence,
  KnowledgeNodeStatus,
} from "../../node-workspace/knowledge/types";
import { parseKnowledgeAnchorRef } from "../../node-workspace/knowledge/anchors";
import type { QalamAgentBridge } from "../bridge/qalamBridge";

export const EDIT_KNOWLEDGE_ENTITIES = ["node", "link"] as const;
export const EDIT_KNOWLEDGE_ACTIONS = ["create", "supersede", "connect", "unlink"] as const;
export const EDIT_KNOWLEDGE_TARGETS = ["knowledge:node", "knowledge:link"] as const;

type KnowledgeEditEntity = (typeof EDIT_KNOWLEDGE_ENTITIES)[number];
type KnowledgeEditAction = (typeof EDIT_KNOWLEDGE_ACTIONS)[number];

const editKnowledgeResourceParameters = {
  type: "object",
  properties: {
    entity: {
      type: "string",
      enum: [...EDIT_KNOWLEDGE_ENTITIES],
      description: "Which Knowledge graph entity to edit.",
    },
    action: {
      type: "string",
      enum: [...EDIT_KNOWLEDGE_ACTIONS],
      description: "Atomic Knowledge edit action. Nodes support create and supersede. Links support connect and unlink.",
    },
    node_id: {
      type: "string",
      description: "Existing knowledge node id for supersede.",
    },
    node_ref: {
      type: "string",
      description: "Existing knowledge node ref for supersede.",
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
      description: "Source knowledge node id for link connect.",
    },
    to_node_id: {
      type: "string",
      description: "Target knowledge node id for link connect.",
    },
    link_id: {
      type: "string",
      description: "Existing knowledge link id for unlink.",
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
  required: ["entity", "action"],
} as const;

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

type ParsedArgs =
  | {
      entity: "node";
      action: "create";
      kind: string;
      title: string;
      content?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      status?: KnowledgeNodeStatus;
      confidence?: KnowledgeNodeConfidence;
      anchor?: KnowledgeAnchor;
    }
  | {
      entity: "node";
      action: "supersede";
      nodeId?: string;
      nodeRef?: string;
      kind?: string;
      title?: string;
      content?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      status?: KnowledgeNodeStatus;
      confidence?: KnowledgeNodeConfidence;
      anchor?: KnowledgeAnchor;
      relationType?: string;
    }
  | {
      entity: "link";
      action: "connect";
      fromNodeId: string;
      toNodeId: string;
      linkType: string;
      weight?: number;
    }
  | {
      entity: "link";
      action: "unlink";
      linkId: string;
    };

const parseArgs = (input: unknown): ParsedArgs => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("edit_knowledge_resource 需要对象参数。");
  }
  const raw = input as Record<string, unknown>;
  const entity = trim(raw.entity) as KnowledgeEditEntity;
  const action = trim(raw.action) as KnowledgeEditAction;
  if (!(EDIT_KNOWLEDGE_ENTITIES as readonly string[]).includes(entity)) {
    throw new Error(`edit_knowledge_resource 不支持 entity=${trim(raw.entity)}`);
  }
  if (!(EDIT_KNOWLEDGE_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`edit_knowledge_resource 不支持 action=${trim(raw.action)}`);
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
  const linkId = trim(raw.link_id ?? raw.linkId) || undefined;
  const linkType = trim(raw.link_type ?? raw.linkType) || undefined;
  const weight = typeof raw.weight === "number" ? raw.weight : undefined;
  const anchor = parseAnchor(anchorRef, anchorSpan);

  if (entity === "node" && action === "create") {
    if (!kind || !title) {
      throw new Error("创建 Knowledge node 至少需要 kind 和 title。");
    }
    return {
      entity: "node",
      action: "create",
      kind,
      title,
      content,
      meta,
      status,
      confidence,
      anchor,
    };
  }

  if (entity === "node" && action === "supersede") {
    if (!nodeId && !nodeRef) {
      throw new Error("supersede Knowledge node 需要 node_id 或 node_ref。");
    }
    return {
      entity: "node",
      action: "supersede",
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
    };
  }

  if (entity === "link" && action === "connect") {
    if (!fromNodeId || !toNodeId || !linkType) {
      throw new Error("connect Knowledge link 需要 from_node_id、to_node_id 和 link_type。");
    }
    return {
      entity: "link",
      action: "connect",
      fromNodeId,
      toNodeId,
      linkType,
      weight,
    };
  }

  if (entity === "link" && action === "unlink") {
    if (!linkId) {
      throw new Error("unlink Knowledge link 需要 link_id。");
    }
    return {
      entity: "link",
      action: "unlink",
      linkId,
    };
  }

  throw new Error(`edit_knowledge_resource 当前不支持 entity=${entity} action=${action}`);
};

export const editKnowledgeResourceToolDef = {
  name: "edit_knowledge_resource",
  description:
    "Edit the Knowledge graph with atomic node or link actions. Nodes support create and supersede. Links support connect and unlink. This tool writes only to Knowledge Core and must not directly rewrite canonical-source knowledge.",
  parameters: editKnowledgeResourceParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);

    if (args.entity === "link" && args.action === "connect") {
      const link = bridge.createDerivedKnowledgeLink({
        fromNodeId: args.fromNodeId,
        toNodeId: args.toNodeId,
        type: args.linkType,
        weight: args.weight,
      });
      return {
        layer: "knowledge",
        entity: "link",
        target: "knowledge:link",
        action: "connect",
        updated: true,
        artifact: {
          kind: "link",
          target: "knowledge:link",
          id: link.id,
          title: link.type,
          source: {
            node_id: link.fromNodeId,
          },
          destination: {
            node_id: link.toNodeId,
          },
        },
        item: {
          link_id: link.id,
          from_node_id: link.fromNodeId,
          to_node_id: link.toNodeId,
          link_type: link.type,
          origin: link.origin,
        },
      };
    }

    if (args.entity === "link" && args.action === "unlink") {
      const link = bridge.removeDerivedKnowledgeLink({
        linkId: args.linkId,
      });
      return {
        layer: "knowledge",
        entity: "link",
        target: "knowledge:link",
        action: "unlink",
        removed: true,
        artifact: {
          kind: "link",
          target: "knowledge:link",
          id: link.id,
          title: link.type,
          source: {
            node_id: link.fromNodeId,
          },
          destination: {
            node_id: link.toNodeId,
          },
        },
        item: {
          link_id: link.id,
          from_node_id: link.fromNodeId,
          to_node_id: link.toNodeId,
          link_type: link.type,
          origin: link.origin,
        },
      };
    }

    if (args.action === "supersede") {
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
        layer: "knowledge",
        entity: "node",
        target: "knowledge:node",
        action: "supersede",
        updated: true,
        artifact: {
          kind: "node",
          target: "knowledge:node",
          id: result.node.id,
          ref: result.node.ref,
          title: result.node.package.title,
          node_kind: result.node.kind,
        },
        item: {
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
        },
      };
    }

    const node = bridge.createDerivedKnowledgeNode({
      kind: args.kind,
      title: args.title,
      content: args.content,
      meta: args.meta,
      status: args.status,
      confidence: args.confidence,
      anchorType: args.anchor?.type,
      anchorRef: args.anchor?.ref,
      anchorSpan: args.anchor?.span,
    });
    return {
      layer: "knowledge",
      entity: "node",
      target: "knowledge:node",
      action: "create",
      updated: true,
      artifact: {
        kind: "node",
        target: "knowledge:node",
        id: node.id,
        ref: node.ref,
        title: node.package.title,
        node_kind: node.kind,
      },
      item: {
        node_id: node.id,
        node_ref: node.ref,
        kind: node.kind,
        title: node.package.title,
        origin: node.origin,
        status: node.package.status,
      },
    };
  },
  summarize: (output: any) => {
    if (output?.entity === "link" && output?.action === "connect") {
      return `连接 Knowledge 关系 ${output?.item?.link_type || ""}`.trim();
    }
    if (output?.entity === "link" && output?.action === "unlink") {
      return `断开 Knowledge 关系 ${output?.item?.link_type || ""}`.trim();
    }
    if (output?.action === "supersede") {
      return `修正 Knowledge 节点 ${output?.item?.title || output?.item?.node_ref || ""}`.trim();
    }
    return `创建 Knowledge 节点 ${output?.item?.title || output?.item?.node_ref || ""}`.trim();
  },
};
