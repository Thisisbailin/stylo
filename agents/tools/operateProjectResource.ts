import type { QalamAgentBridge } from "../bridge/qalamBridge";
import type { NodeFlowHandle } from "../bridge/qalamBridge";

export const OPERATE_PROJECT_RESOURCE_TYPES = ["workflow_node", "workflow_connection"] as const;
export const OPERATE_WORKFLOW_NODE_KINDS = ["text", "script_board", "storyboard_board", "character_card"] as const;

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
      description: "Which workflow resource to operate on.",
    },
    node_kind: {
      type: "string",
      description: "Node kind to create when resource_type=workflow_node. Supports text, script_board, storyboard_board, character_card, plus common aliases like script, storyboard, character.",
    },
    node_ref: {
      type: "string",
      description: "Optional semantic reference for the node. If omitted, the tool will derive one.",
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
      description: "Source node ref for workflow_connection.",
    },
    target_ref: {
      type: "string",
      description: "Target node ref for workflow_connection.",
    },
    source_node_id: {
      type: "string",
      description: "Fallback source node id for workflow_connection.",
    },
    target_node_id: {
      type: "string",
      description: "Fallback target node id for workflow_connection.",
    },
    source_handle: {
      type: "string",
      description: "Optional explicit source handle for workflow_connection.",
    },
    target_handle: {
      type: "string",
      description: "Optional explicit target handle for workflow_connection.",
    },
  },
  additionalProperties: false,
  required: ["resource_type"],
  oneOf: [
    {
      properties: {
        resource_type: { const: "workflow_node" },
      },
      required: ["resource_type", "node_kind"],
    },
    {
      properties: {
        resource_type: { const: "workflow_connection" },
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
      resourceType: "workflow_node";
      nodeKind: "text" | "script_board" | "storyboard_board" | "character_card";
      nodeRef?: string;
      title?: string;
      text?: string;
      episodeId?: number;
      characterId?: string;
    }
  | {
      resourceType: "workflow_connection";
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
  const resourceType = normalizeString(raw.resource_type ?? raw.resourceType);

  if (resourceType === "workflow_node") {
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

    if (!(OPERATE_WORKFLOW_NODE_KINDS as readonly string[]).includes(nodeKind)) {
      throw new Error("workflow_node 当前仅支持 text、script_board、storyboard_board、character_card。");
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
      resourceType: "workflow_node",
      nodeKind: nodeKind as "text" | "script_board" | "storyboard_board" | "character_card",
      nodeRef,
      title,
      text,
      episodeId,
      characterId,
    };
  }

  if (resourceType === "workflow_connection") {
    const sourceRef = normalizeString(raw.source_ref ?? raw.sourceRef) || undefined;
    const targetRef = normalizeString(raw.target_ref ?? raw.targetRef) || undefined;
    const sourceNodeId = normalizeString(raw.source_node_id ?? raw.sourceNodeId) || undefined;
    const targetNodeId = normalizeString(raw.target_node_id ?? raw.targetNodeId) || undefined;
    const sourceHandle = normalizeString(raw.source_handle ?? raw.sourceHandle) || undefined;
    const targetHandle = normalizeString(raw.target_handle ?? raw.targetHandle) || undefined;

    if ((!sourceRef && !sourceNodeId) || (!targetRef && !targetNodeId)) {
      throw new Error("workflow_connection 需要为两端分别提供 ref 或 node_id。");
    }
    if ((sourceRef || sourceNodeId) === (targetRef || targetNodeId)) {
      throw new Error("workflow_connection 不能连接同一个节点到自己。");
    }

    return {
      resourceType: "workflow_connection",
      sourceRef,
      targetRef,
      sourceNodeId,
      targetNodeId,
      sourceHandle,
      targetHandle,
    };
  }

  throw new Error("operate_project_resource 仅支持 workflow_node 或 workflow_connection。");
};

const resolveNodeType = (nodeKind: Extract<ParsedArgs, { resourceType: "workflow_node" }>["nodeKind"]) => {
  if (nodeKind === "script_board") return "scriptBoard" as const;
  if (nodeKind === "storyboard_board") return "storyboardBoard" as const;
  if (nodeKind === "character_card") return "identityCard" as const;
  return "text" as const;
};

const defaultTitle = (args: Extract<ParsedArgs, { resourceType: "workflow_node" }>) => {
  if (args.title) return args.title;
  if (args.nodeKind === "script_board") return args.episodeId ? `第 ${args.episodeId} 集剧本` : "剧本";
  if (args.nodeKind === "storyboard_board") return args.episodeId ? `第 ${args.episodeId} 集分镜表` : "分镜表";
  if (args.nodeKind === "character_card") return "角色卡片";
  return args.text?.slice(0, 24) || "文本";
};

const defaultNodeRef = (args: Extract<ParsedArgs, { resourceType: "workflow_node" }>) => {
  if (args.nodeRef) return args.nodeRef;
  if (args.nodeKind === "script_board") return `ep${args.episodeId || "x"}_script_board`;
  if (args.nodeKind === "storyboard_board") return `ep${args.episodeId || "x"}_storyboard_board`;
  if (args.nodeKind === "character_card") return `${slugifyRefToken(args.characterId || args.title || "character", "character")}_card`;
  return `text_${slugifyRefToken(args.title || args.text || Date.now().toString(), "note")}`;
};

export const operateProjectResourceToolDef = {
  name: "operate_project_resource",
  description:
    "Operate workflow resources in NodeFlow. Supports creating a workflow_node (text, script_board, storyboard_board, character_card) or a workflow_connection between existing nodes.",
  parameters: operateProjectResourceParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);

    if (args.resourceType === "workflow_node") {
      const nodeType = resolveNodeType(args.nodeKind);
      const created = bridge.createNodeFlowNode({
        type: nodeType,
        nodeRef: defaultNodeRef(args),
        title: defaultTitle(args),
        text: args.nodeKind === "text" ? args.text : undefined,
        episodeId: args.nodeKind === "script_board" || args.nodeKind === "storyboard_board" ? args.episodeId : undefined,
        entityType: args.nodeKind === "character_card" ? "character" : undefined,
        entityId: args.nodeKind === "character_card" ? args.characterId : undefined,
      });
      return {
        resource_type: "workflow_node",
        node_kind: args.nodeKind,
        node_id: created.nodeId,
        node_ref: created.nodeRef || defaultNodeRef(args),
        node_type: created.nodeType,
        title: created.title,
      };
    }

    const connected = bridge.connectNodeFlowNodes({
      sourceRef: args.sourceRef,
      targetRef: args.targetRef,
      sourceNodeId: args.sourceNodeId,
      targetNodeId: args.targetNodeId,
      sourceHandle: args.sourceHandle as NodeFlowHandle | undefined,
      targetHandle: args.targetHandle as NodeFlowHandle | undefined,
    });
    return {
      resource_type: "workflow_connection",
      link_id: connected.linkId,
      edge_id: connected.linkId,
      source_node_id: connected.sourceNodeId,
      target_node_id: connected.targetNodeId,
      source_ref: connected.sourceRef,
      target_ref: connected.targetRef,
      source_handle: connected.sourceHandle,
      target_handle: connected.targetHandle,
    };
  },
  summarize: (output: any) => {
    if (output?.resource_type === "workflow_node") {
      return `已创建 ${output?.node_kind || output?.node_type || "节点"}（ref:${output?.node_ref || "n/a"}）`;
    }
    return `已连接 ${output?.source_ref || output?.source_node_id || "源节点"} -> ${output?.target_ref || output?.target_node_id || "目标节点"}`;
  },
};
