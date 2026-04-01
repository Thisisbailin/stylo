import type {
  NodeAssetConfidence,
  NodeAssetPlane,
  NodeAssetStatus,
  NodeFlowNodeData,
} from "../../node-workspace/types";
import type { QalamAgentBridge } from "../bridge/qalamBridge";
import { findNodeFlowNode, getNodeFlowNodeRef } from "../../node-workspace/nodeflow/model";

export const EDIT_PROJECT_RESOURCE_TYPES = ["graph_node"] as const;

const editProjectResourceParameters = {
  type: "object",
  properties: {
    resource_type: {
      type: "string",
      enum: [...EDIT_PROJECT_RESOURCE_TYPES],
      description: "Project graph resource type to write.",
    },
    node_id: {
      type: "string",
      description: "Existing graph node id to update.",
    },
    node_ref: {
      type: "string",
      description: "Existing graph node ref to update, or desired ref for a new node.",
    },
    title: {
      type: "string",
      description: "Graph node title.",
    },
    plane: {
      type: "string",
      enum: ["semantic", "design"],
      description: "Graph plane for new or existing knowledge nodes.",
    },
    asset_type: {
      type: "string",
      description: "Open asset type, for example semantic.relationship or design.episode_vision.",
    },
    content: {
      type: "string",
      description: "Primary content body of the graph node.",
    },
    summary: {
      type: "string",
      description: "Optional compact summary of the node.",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Optional tags for retrieval and clustering.",
    },
    source_refs: {
      type: "array",
      items: { type: "string" },
      description: "Optional source refs such as scene:1-3 or ep:2.",
    },
    status: {
      type: "string",
      enum: ["draft", "working", "approved", "superseded", "archived"],
      description: "Asset lifecycle status.",
    },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
      description: "Confidence level for this node.",
    },
    fields: {
      type: "object",
      description: "Optional structured fields payload.",
      additionalProperties: true,
    },
    x: {
      type: "number",
      description: "Optional x position for a newly created knowledge node.",
    },
    y: {
      type: "number",
      description: "Optional y position for a newly created knowledge node.",
    },
    parent_id: {
      type: "string",
      description: "Optional parent group id for a newly created knowledge node.",
    },
  },
  additionalProperties: false,
  required: ["resource_type"],
} as const;

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const parseStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => trim(item)).filter(Boolean);
  return items.length ? items : undefined;
};

const parsePlane = (value: unknown): NodeAssetPlane | undefined => {
  const plane = trim(value);
  if (plane === "semantic" || plane === "design") return plane;
  return undefined;
};

const parseStatus = (value: unknown): NodeAssetStatus | undefined => {
  const status = trim(value);
  if (status === "draft" || status === "working" || status === "approved" || status === "superseded" || status === "archived") {
    return status;
  }
  return undefined;
};

const parseConfidence = (value: unknown): NodeAssetConfidence | undefined => {
  const confidence = trim(value);
  if (confidence === "low" || confidence === "medium" || confidence === "high") return confidence;
  return undefined;
};

const parseArgs = (input: unknown) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("edit_project_resource 需要对象参数。");
  }
  const raw = input as Record<string, unknown>;
  const resourceType = trim(raw.resource_type);
  if (resourceType !== "graph_node") {
    throw new Error("edit_project_resource 当前仅支持 graph_node。");
  }

  const nodeId = trim(raw.node_id ?? raw.nodeId) || undefined;
  const nodeRef = trim(raw.node_ref ?? raw.nodeRef) || undefined;
  const title = trim(raw.title) || undefined;
  const plane = parsePlane(raw.plane);
  const assetType = trim(raw.asset_type ?? raw.assetType) || undefined;
  const content = typeof raw.content === "string" ? raw.content : undefined;
  const summary = typeof raw.summary === "string" ? raw.summary : undefined;
  const tags = parseStringArray(raw.tags);
  const sourceRefs = parseStringArray(raw.source_refs ?? raw.sourceRefs);
  const status = parseStatus(raw.status);
  const confidence = parseConfidence(raw.confidence);
  const fields = raw.fields && typeof raw.fields === "object" && !Array.isArray(raw.fields)
    ? (raw.fields as Record<string, unknown>)
    : undefined;
  const x = typeof raw.x === "number" ? raw.x : undefined;
  const y = typeof raw.y === "number" ? raw.y : undefined;
  const parentId = trim(raw.parent_id ?? raw.parentId) || undefined;

  const isUpdate = Boolean(nodeId || nodeRef);
  if (!isUpdate && !title && !content) {
    throw new Error("新建 graph_node 至少需要 title 或 content。");
  }

  return {
    resourceType: "graph_node" as const,
    nodeId,
    nodeRef,
    title,
    plane,
    assetType,
    content,
    summary,
    tags,
    sourceRefs,
    status,
    confidence,
    fields,
    x,
    y,
    parentId,
  };
};

const slugify = (value: string, fallback: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, "_")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || fallback;

const buildNodeRef = (args: ReturnType<typeof parseArgs>) => {
  if (args.nodeRef) return args.nodeRef;
  const plane = args.plane || "semantic";
  const base = args.title || args.assetType || args.content || Date.now().toString();
  return `${plane}_${slugify(base, "asset")}`;
};

const buildPatch = (args: ReturnType<typeof parseArgs>) => {
  const patch: Record<string, unknown> = {};
  if (args.title !== undefined) patch.title = args.title;
  if (args.plane !== undefined) patch.plane = args.plane;
  if (args.assetType !== undefined) patch.assetType = args.assetType;
  if (args.content !== undefined) patch.content = args.content;
  if (args.summary !== undefined) patch.summary = args.summary;
  if (args.tags !== undefined) patch.tags = args.tags;
  if (args.sourceRefs !== undefined) patch.sourceRefs = args.sourceRefs;
  if (args.status !== undefined) patch.status = args.status;
  if (args.confidence !== undefined) patch.confidence = args.confidence;
  if (args.fields !== undefined) patch.fields = args.fields;
  return patch;
};

export const editUnderstandingResourceToolDef = {
  name: "edit_project_resource",
  description:
    "Create or update graph knowledge nodes inside NodeFlow. This tool writes semantic or design assets; source nodes remain immutable.",
  parameters: editProjectResourceParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const workflow = bridge.getNodeFlowSnapshot();
    const existing = args.nodeId || args.nodeRef
      ? findNodeFlowNode(workflow, { nodeId: args.nodeId, nodeRef: args.nodeRef })
      : undefined;

    if (existing) {
      if (existing.type !== "knowledge") {
        throw new Error("edit_project_resource 仅允许更新 knowledge 节点。");
      }
      bridge.updateNodeFlowNodeData(existing.id, buildPatch(args) as Partial<NodeFlowNodeData> as Record<string, unknown>);
      return {
        updated: true,
        resource_type: "graph_node",
        operation: "updated",
        node_id: existing.id,
        node_ref: getNodeFlowNodeRef(existing),
        plane: (existing.data as Record<string, unknown>).plane || args.plane || "semantic",
        asset_type: (buildPatch(args).assetType as string | undefined) || (existing.data as Record<string, unknown>).assetType || "semantic.note",
      };
    }

    const resolvedPlane = args.plane || "semantic";
    const resolvedAssetType = args.assetType || `${resolvedPlane}.note`;
    const created = bridge.createNodeFlowNode({
      type: "knowledge",
      nodeRef: buildNodeRef(args),
      title: args.title || args.assetType || "Knowledge Asset",
      content: args.content || "",
      plane: resolvedPlane,
      assetType: resolvedAssetType,
      tags: args.tags,
      sourceRefs: args.sourceRefs,
      status: args.status || "draft",
      confidence: args.confidence || "medium",
      fields: args.fields,
      x: args.x,
      y: args.y,
      parentId: args.parentId,
    });
    if (args.summary !== undefined) {
      bridge.updateNodeFlowNodeData(created.nodeId, { summary: args.summary });
    }
    return {
      updated: true,
      resource_type: "graph_node",
      operation: "created",
      node_id: created.nodeId,
      node_ref: created.nodeRef || buildNodeRef(args),
      plane: resolvedPlane,
      asset_type: resolvedAssetType,
    };
  },
  summarize: (output: any) => {
    const op = output?.operation === "created" ? "创建" : "更新";
    return `${op} graph 节点 ${output?.node_ref || output?.node_id || ""}`.trim();
  },
};
