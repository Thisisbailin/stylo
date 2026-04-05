import type { NodeFlowHandle, QalamAgentBridge } from "../bridge/qalamBridge";
import { getNodeFlowRef } from "../runtime/nodeFlowRefs";
import { findProjectedSourceNode } from "../../node-workspace/nodeflow/projectGraph";

export const OPERATE_PROJECT_RESOURCE_TYPES = ["nodeflow_node", "nodeflow_link", "nodeflow_graph_link"] as const;
export const OPERATE_NODEFLOW_NODE_KINDS = ["text", "script_board", "storyboard_board", "character_card"] as const;

const slugifyRefToken = (value: string, fallback: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, "_")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || fallback;

const operateProjectResourceParameters = {
  type: "object",
  properties: {
    resource_type: {
      type: "string",
      enum: [...OPERATE_PROJECT_RESOURCE_TYPES],
      description: "Which NodeFlow resource to operate on.",
    },
    node_kind: {
      type: "string",
      description: "NodeFlow node kind to create when resource_type=nodeflow_node. Supports text, script_board, storyboard_board, character_card, plus common aliases like script, storyboard, character.",
    },
    node_ref: {
      type: "string",
      description: "Optional semantic reference for the created NodeFlow node.",
    },
    title: {
      type: "string",
      description: "Optional node title.",
    },
    text: {
      type: "string",
      description: "Text content for text nodes.",
    },
    episode_id: {
      type: "integer",
      description: "Episode number for script_board or storyboard_board.",
    },
    character_id: {
      type: "string",
      description: "Character id for character_card.",
    },
    source_ref: {
      type: "string",
      description: "Source node ref for nodeflow_graph_link.",
    },
    target_ref: {
      type: "string",
      description: "Target node ref for nodeflow_graph_link.",
    },
    source_node_id: {
      type: "string",
      description: "Fallback source node id for nodeflow_graph_link.",
    },
    target_node_id: {
      type: "string",
      description: "Fallback target node id for nodeflow_graph_link.",
    },
    source_handle: {
      type: "string",
      description: "Optional explicit source handle for nodeflow_link.",
    },
    target_handle: {
      type: "string",
      description: "Optional explicit target handle for nodeflow_link.",
    },
  },
  additionalProperties: false,
  required: ["resource_type"],
  oneOf: [
    {
      properties: {
        resource_type: { enum: ["nodeflow_node"] },
      },
      required: ["resource_type", "node_kind"],
    },
    {
      properties: {
        resource_type: { enum: ["nodeflow_link", "nodeflow_graph_link"] },
      },
      required: ["resource_type"],
      anyOf: [
        { required: ["source_ref", "target_ref"] },
        { required: ["source_ref", "target_node_id"] },
        { required: ["source_node_id", "target_ref"] },
        { required: ["source_node_id", "target_node_id"] },
      ],
    },
  ],
} as const;

const normalizeString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const toPositiveInteger = (value: unknown) => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
};

type ParsedArgs =
  | {
      resourceType: "nodeflow_node";
      nodeKind: "text" | "script_board" | "storyboard_board" | "character_card";
      nodeRef?: string;
      title?: string;
      text?: string;
      episodeId?: number;
      characterId?: string;
    }
  | {
      resourceType: "nodeflow_link";
      sourceRef?: string;
      targetRef?: string;
      sourceNodeId?: string;
      targetNodeId?: string;
      sourceHandle?: string;
      targetHandle?: string;
    }
  | {
      resourceType: "nodeflow_graph_link";
      sourceRef?: string;
      targetRef?: string;
      sourceNodeId?: string;
      targetNodeId?: string;
      sourceHandle?: string;
      targetHandle?: string;
    };

const parseArgs = (input: unknown): ParsedArgs => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("operate_project_resource 需要对象参数。");
  }
  const raw = input as Record<string, unknown>;
  const rawResourceType = normalizeString(raw.resource_type ?? raw.resourceType);
  const resourceType = rawResourceType;

  const normalizedResourceType =
    resourceType === "execution_node"
      ? "nodeflow_node"
      : resourceType === "execution_link"
        ? "nodeflow_link"
        : resourceType === "graph_link"
          ? "nodeflow_graph_link"
          : resourceType;

  if (normalizedResourceType === "nodeflow_node") {
    const rawNodeKind = normalizeString(raw.node_kind ?? raw.nodeKind);
    const nodeKind =
      rawNodeKind === "script" ? "script_board" :
      rawNodeKind === "storyboard" ? "storyboard_board" :
      rawNodeKind === "character" ? "character_card" :
      rawNodeKind;
    const nodeRef = normalizeString(raw.node_ref ?? raw.nodeRef) || undefined;
    const title = normalizeString(raw.title) || undefined;
    const text = normalizeString(raw.text) || undefined;
    const episodeId = toPositiveInteger(raw.episode_id ?? raw.episodeId);
    const characterId =
      normalizeString(raw.character_id ?? raw.characterId) ||
      normalizeString(raw.item_id ?? raw.itemId) ||
      undefined;

    if (!(OPERATE_NODEFLOW_NODE_KINDS as readonly string[]).includes(nodeKind)) {
      throw new Error("nodeflow_node 当前仅支持 text、script_board、storyboard_board、character_card。");
    }
    if (nodeKind === "text" && !text) {
      throw new Error("创建 text 节点时需要 text。");
    }
    if ((nodeKind === "script_board" || nodeKind === "storyboard_board") && !episodeId) {
      throw new Error(`${nodeKind} 需要 episode_id。`);
    }
    if (nodeKind === "character_card" && !characterId) {
      throw new Error("character_card 需要 character_id。");
    }

    return {
      resourceType: "nodeflow_node",
      nodeKind: nodeKind as "text" | "script_board" | "storyboard_board" | "character_card",
      nodeRef,
      title,
      text,
      episodeId,
      characterId,
    };
  }

  if (normalizedResourceType === "nodeflow_link" || normalizedResourceType === "nodeflow_graph_link") {
    const sourceRef = normalizeString(raw.source_ref ?? raw.sourceRef) || undefined;
    const targetRef = normalizeString(raw.target_ref ?? raw.targetRef) || undefined;
    const sourceNodeId = normalizeString(raw.source_node_id ?? raw.sourceNodeId) || undefined;
    const targetNodeId = normalizeString(raw.target_node_id ?? raw.targetNodeId) || undefined;
    const sourceHandle = normalizeString(raw.source_handle ?? raw.sourceHandle) || undefined;
    const targetHandle = normalizeString(raw.target_handle ?? raw.targetHandle) || undefined;

    if ((!sourceRef && !sourceNodeId) || (!targetRef && !targetNodeId)) {
      throw new Error(`${resourceType} 需要为两端分别提供 ref 或 node_id。`);
    }
    if ((sourceRef || sourceNodeId) === (targetRef || targetNodeId)) {
      throw new Error(`${resourceType} 不能连接同一个节点到自己。`);
    }

    return {
      resourceType: normalizedResourceType,
      sourceRef,
      targetRef,
      sourceNodeId,
      targetNodeId,
      sourceHandle,
      targetHandle,
    };
  }

  throw new Error("operate_project_resource 仅支持 nodeflow_node、nodeflow_link 或 nodeflow_graph_link。");
};

const resolveNodeType = (nodeKind: Extract<ParsedArgs, { resourceType: "nodeflow_node" }>["nodeKind"]) => {
  if (nodeKind === "script_board") return "scriptBoard" as const;
  if (nodeKind === "storyboard_board") return "storyboardBoard" as const;
  if (nodeKind === "character_card") return "identityCard" as const;
  return "text" as const;
};

const defaultTitle = (args: Extract<ParsedArgs, { resourceType: "nodeflow_node" }>) => {
  if (args.title) return args.title;
  if (args.nodeKind === "script_board") return args.episodeId ? `第 ${args.episodeId} 集剧本` : "剧本";
  if (args.nodeKind === "storyboard_board") return args.episodeId ? `第 ${args.episodeId} 集分镜表` : "分镜表";
  if (args.nodeKind === "character_card") return "角色卡片";
  return args.text?.slice(0, 24) || "文本";
};

const defaultNodeRef = (args: Extract<ParsedArgs, { resourceType: "nodeflow_node" }>) => {
  if (args.nodeRef) return args.nodeRef;
  if (args.nodeKind === "script_board") return `ep${args.episodeId || "x"}_script_board`;
  if (args.nodeKind === "storyboard_board") return `ep${args.episodeId || "x"}_storyboard_board`;
  if (args.nodeKind === "character_card") return `${slugifyRefToken(args.characterId || args.title || "character", "character")}_card`;
  return `text_${slugifyRefToken(args.title || args.text || Date.now().toString(), "note")}`;
};

export const operateProjectResourceToolDef = {
  name: "operate_project_resource",
  description:
    "Operate NodeFlow resources by creating nodes, connecting canvas links, or creating graph links between projected/source/graph nodes.",
  parameters: operateProjectResourceParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);

    if (args.resourceType === "nodeflow_node") {
      const nodeType = resolveNodeType(args.nodeKind);
      const expectedRevision = bridge.getNodeFlowSnapshot().revision;
      const created = bridge.createNodeFlowNode({
        expectedRevision,
        type: nodeType,
        nodeRef: defaultNodeRef(args),
        title: defaultTitle(args),
        text: args.nodeKind === "text" ? args.text : undefined,
        episodeId: args.nodeKind === "script_board" || args.nodeKind === "storyboard_board" ? args.episodeId : undefined,
        entityType: args.nodeKind === "character_card" ? "character" : undefined,
        entityId: args.nodeKind === "character_card" ? args.characterId : undefined,
      });
      return {
        resource_type: "nodeflow_node",
        node_kind: args.nodeKind,
        node_id: created.nodeId,
        node_ref: created.nodeRef || defaultNodeRef(args),
        node_type: created.nodeType,
        title: created.title,
      };
    }

    if (args.resourceType === "nodeflow_link") {
      const expectedRevision = bridge.getNodeFlowSnapshot().revision;
      const connected = bridge.connectNodeFlowNodes({
        expectedRevision,
        sourceRef: args.sourceRef,
        targetRef: args.targetRef,
        sourceNodeId: args.sourceNodeId,
        targetNodeId: args.targetNodeId,
        sourceHandle: args.sourceHandle as NodeFlowHandle | undefined,
        targetHandle: args.targetHandle as NodeFlowHandle | undefined,
      });
      return {
        resource_type: "nodeflow_link",
        link_id: connected.linkId,
        source_node_id: connected.sourceNodeId,
        target_node_id: connected.targetNodeId,
        source_ref: connected.sourceRef,
        target_ref: connected.targetRef,
        source_handle: connected.sourceHandle,
        target_handle: connected.targetHandle,
      };
    }

    const workflow = bridge.getNodeFlowSnapshot();
    const projectData = bridge.getProjectData();
    const resolveRef = (nodeId?: string, ref?: string) => {
      if (ref) return ref;
      if (!nodeId) return undefined;
      const workflowNode = workflow.nodes.find((node) => node.id === nodeId);
      if (workflowNode) return getNodeFlowRef(workflowNode) || workflowNode.id;
      const projected = findProjectedSourceNode(projectData, { ref: nodeId, sourceRef: nodeId, title: nodeId });
      return projected?.ref;
    };
    const sourceRef = resolveRef(args.sourceNodeId, args.sourceRef);
    const targetRef = resolveRef(args.targetNodeId, args.targetRef);
    if (!sourceRef || !targetRef) {
      throw new Error("nodeflow_graph_link 需要可解析的 source_ref 和 target_ref。source 节点请使用 source_ref。");
    }
    const created = bridge.createNodeFlowGraphLink({
      expectedRevision: workflow.revision,
      sourceRef,
      targetRef,
    });
    return {
      resource_type: "nodeflow_graph_link",
      link_id: created.linkId,
      source_ref: created.sourceRef,
      target_ref: created.targetRef,
    };
  },
  summarize: (output: any) => {
    if (output?.resource_type === "nodeflow_node") return `创建 NodeFlow 节点 ${output.title || output.node_ref || output.node_id}`;
    if (output?.resource_type === "nodeflow_link") return `创建 NodeFlow 连线 ${output?.link_id || ""}`.trim();
    return `创建 NodeFlow 图链接 ${output?.link_id || ""}`.trim();
  },
};
