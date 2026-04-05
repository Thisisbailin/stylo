import type { NodeFlowHandle, QalamAgentBridge } from "../bridge/qalamBridge";
import { getNodeFlowRef } from "../runtime/nodeFlowRefs";
import { findProjectedSourceNode } from "../../node-workspace/nodeflow/projectGraph";

export const OPERATE_NODEFLOW_ENTITIES = ["node", "link"] as const;
export const OPERATE_NODEFLOW_ACTIONS = ["create", "connect"] as const;
export const OPERATE_NODEFLOW_TARGETS = ["nodeflow:node", "nodeflow:link"] as const;
export const OPERATE_NODEFLOW_NODE_KINDS = ["text", "script_board", "storyboard_board", "character_card"] as const;

type OperateEntity = (typeof OPERATE_NODEFLOW_ENTITIES)[number];
type OperateAction = (typeof OPERATE_NODEFLOW_ACTIONS)[number];

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
    entity: {
      type: "string",
      enum: [...OPERATE_NODEFLOW_ENTITIES],
      description: "Which NodeFlow graph entity to operate on.",
    },
    action: {
      type: "string",
      enum: [...OPERATE_NODEFLOW_ACTIONS],
      description: "Whether to create a NodeFlow node or connect NodeFlow links.",
    },
    link_kind: {
      type: "string",
      enum: ["canvas", "graph"],
      description: "Whether the connection is a visible canvas link or a graph-reference link.",
    },
    node_kind: {
      type: "string",
      description: "NodeFlow node kind to create when entity=node and action=create. Supports text, script_board, storyboard_board, character_card, plus aliases script, storyboard, character.",
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
      description: "Source ref when connecting graph links or locating existing nodes by ref.",
    },
    target_ref: {
      type: "string",
      description: "Target ref when connecting graph links or locating existing nodes by ref.",
    },
    source_node_id: {
      type: "string",
      description: "Source node id for canvas or graph connections.",
    },
    target_node_id: {
      type: "string",
      description: "Target node id for canvas or graph connections.",
    },
    source_handle: {
      type: "string",
      description: "Optional explicit source handle for canvas links.",
    },
    target_handle: {
      type: "string",
      description: "Optional explicit target handle for canvas links.",
    },
  },
  additionalProperties: false,
  required: ["entity", "action"],
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
      entity: "node";
      action: "create";
      nodeKind: "text" | "script_board" | "storyboard_board" | "character_card";
      nodeRef?: string;
      title?: string;
      text?: string;
      episodeId?: number;
      characterId?: string;
    }
  | {
      entity: "link";
      action: "connect";
      linkKind: "canvas" | "graph";
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
  const entity = normalizeString(raw.entity) as OperateEntity;
  const action = normalizeString(raw.action) as OperateAction;

  if (!(OPERATE_NODEFLOW_ENTITIES as readonly string[]).includes(entity)) {
    throw new Error(`operate_project_resource 不支持 entity=${normalizeString(raw.entity)}`);
  }
  if (!(OPERATE_NODEFLOW_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`operate_project_resource 不支持 action=${normalizeString(raw.action)}`);
  }

  if (entity === "node" && action !== "create") {
    throw new Error("NodeFlow node 当前仅支持 create。");
  }
  if (entity === "link" && action !== "connect") {
    throw new Error("NodeFlow link 当前仅支持 connect。");
  }

  if (entity === "node") {
    const rawNodeKind = normalizeString(raw.node_kind ?? raw.nodeKind);
    const nodeKind =
      rawNodeKind === "script"
        ? "script_board"
        : rawNodeKind === "storyboard"
          ? "storyboard_board"
          : rawNodeKind === "character"
            ? "character_card"
            : rawNodeKind;
    const nodeRef = normalizeString(raw.node_ref ?? raw.nodeRef) || undefined;
    const title = normalizeString(raw.title) || undefined;
    const text = normalizeString(raw.text) || undefined;
    const episodeId = toPositiveInteger(raw.episode_id ?? raw.episodeId);
    const characterId =
      normalizeString(raw.character_id ?? raw.characterId) ||
      undefined;

    if (!(OPERATE_NODEFLOW_NODE_KINDS as readonly string[]).includes(nodeKind)) {
      throw new Error("NodeFlow node 当前仅支持 text、script_board、storyboard_board、character_card。");
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
      entity: "node",
      action: "create",
      nodeKind: nodeKind as "text" | "script_board" | "storyboard_board" | "character_card",
      nodeRef,
      title,
      text,
      episodeId,
      characterId,
    };
  }

  const linkKind = normalizeString(raw.link_kind ?? raw.linkKind) as "canvas" | "graph" | "";
  const sourceRef = normalizeString(raw.source_ref ?? raw.sourceRef) || undefined;
  const targetRef = normalizeString(raw.target_ref ?? raw.targetRef) || undefined;
  const sourceNodeId = normalizeString(raw.source_node_id ?? raw.sourceNodeId) || undefined;
  const targetNodeId = normalizeString(raw.target_node_id ?? raw.targetNodeId) || undefined;
  const sourceHandle = normalizeString(raw.source_handle ?? raw.sourceHandle) || undefined;
  const targetHandle = normalizeString(raw.target_handle ?? raw.targetHandle) || undefined;

  const effectiveLinkKind = (linkKind || "canvas") as "canvas" | "graph";

  if ((!sourceRef && !sourceNodeId) || (!targetRef && !targetNodeId)) {
    throw new Error("连接 NodeFlow link 时需要为两端分别提供 ref 或 node_id。");
  }
  if ((sourceRef || sourceNodeId) === (targetRef || targetNodeId)) {
    throw new Error("NodeFlow link 不能连接同一个节点到自己。");
  }

  return {
    entity: "link",
    action: "connect",
    linkKind: effectiveLinkKind,
    sourceRef,
    targetRef,
    sourceNodeId,
    targetNodeId,
    sourceHandle,
    targetHandle,
  };
};

const resolveNodeType = (nodeKind: Extract<ParsedArgs, { entity: "node" }>["nodeKind"]) => {
  if (nodeKind === "script_board") return "scriptBoard" as const;
  if (nodeKind === "storyboard_board") return "storyboardBoard" as const;
  if (nodeKind === "character_card") return "identityCard" as const;
  return "text" as const;
};

const defaultTitle = (args: Extract<ParsedArgs, { entity: "node" }>) => {
  if (args.title) return args.title;
  if (args.nodeKind === "script_board") return args.episodeId ? `第 ${args.episodeId} 集剧本` : "剧本";
  if (args.nodeKind === "storyboard_board") return args.episodeId ? `第 ${args.episodeId} 集分镜表` : "分镜表";
  if (args.nodeKind === "character_card") return "角色卡片";
  return args.text?.slice(0, 24) || "文本";
};

const defaultNodeRef = (args: Extract<ParsedArgs, { entity: "node" }>) => {
  if (args.nodeRef) return args.nodeRef;
  if (args.nodeKind === "script_board") return `ep${args.episodeId || "x"}_script_board`;
  if (args.nodeKind === "storyboard_board") return `ep${args.episodeId || "x"}_storyboard_board`;
  if (args.nodeKind === "character_card") {
    return `${slugifyRefToken(args.characterId || args.title || "character", "character")}_card`;
  }
  return `text_${slugifyRefToken(args.title || args.text || Date.now().toString(), "note")}`;
};

export const operateProjectResourceToolDef = {
  name: "operate_project_resource",
  description:
    "Operate the NodeFlow layer by creating working-canvas nodes or connecting links inside the visible workflow graph.",
  parameters: operateProjectResourceParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);

    if (args.entity === "node") {
      const nodeType = resolveNodeType(args.nodeKind);
      const expectedRevision = bridge.getNodeFlowSnapshot().revision;
      const created = bridge.createNodeFlowNode({
        expectedRevision,
        type: nodeType,
        nodeRef: defaultNodeRef(args),
        title: defaultTitle(args),
        text: args.nodeKind === "text" ? args.text : undefined,
        episodeId:
          args.nodeKind === "script_board" || args.nodeKind === "storyboard_board"
            ? args.episodeId
            : undefined,
        entityType: args.nodeKind === "character_card" ? "character" : undefined,
        entityId: args.nodeKind === "character_card" ? args.characterId : undefined,
      });
      return {
        layer: "nodeflow",
        entity: "node",
        action: "create",
        item: {
          node_kind: args.nodeKind,
          node_id: created.nodeId,
          node_ref: created.nodeRef || defaultNodeRef(args),
          node_type: created.nodeType,
          title: created.title,
        },
      };
    }

    if (args.linkKind === "canvas") {
      const expectedRevision = bridge.getNodeFlowSnapshot().revision;
      const connected = bridge.connectNodeFlowNodes({
        expectedRevision,
        sourceNodeId: args.sourceNodeId,
        targetNodeId: args.targetNodeId,
        sourceRef: args.sourceRef,
        targetRef: args.targetRef,
        sourceHandle: args.sourceHandle as NodeFlowHandle | undefined,
        targetHandle: args.targetHandle as NodeFlowHandle | undefined,
      });
      return {
        layer: "nodeflow",
        entity: "link",
        action: "connect",
        link_kind: "canvas",
        item: {
          link_id: connected.linkId,
          source_node_id: connected.sourceNodeId,
          target_node_id: connected.targetNodeId,
          source_ref: connected.sourceRef,
          target_ref: connected.targetRef,
          source_handle: connected.sourceHandle,
          target_handle: connected.targetHandle,
        },
      };
    }

    const workflow = bridge.getNodeFlowSnapshot();
    const resolveRef = (nodeId?: string, nodeRef?: string) => {
      if (nodeRef) return nodeRef;
      if (nodeId) {
        const workflowNode = workflow.nodes.find((node) => node.id === nodeId);
        if (workflowNode) return getNodeFlowRef(workflowNode) || workflowNode.id;
        const projected = findProjectedSourceNode(bridge.getProjectData(), {
          ref: nodeId,
          sourceRef: nodeId,
          title: nodeId,
        });
        if (projected) return projected.ref;
      }
      return undefined;
    };

    const sourceRef = resolveRef(args.sourceNodeId, args.sourceRef);
    const targetRef = resolveRef(args.targetNodeId, args.targetRef);
    if (!sourceRef || !targetRef) {
      throw new Error("创建 NodeFlow graph link 需要可解析的 source_ref 和 target_ref。");
    }

    const created = bridge.createNodeFlowGraphLink({
      expectedRevision: workflow.revision,
      sourceRef,
      targetRef,
    });
    return {
      layer: "nodeflow",
      entity: "link",
      action: "connect",
      link_kind: "graph",
      item: {
        link_id: created.linkId,
        source_ref: created.sourceRef,
        target_ref: created.targetRef,
      },
    };
  },
  summarize: (output: any) => {
    if (output?.entity === "node") return `创建 NodeFlow 节点 ${output?.item?.title || output?.item?.node_ref || output?.item?.node_id}`;
    if (output?.link_kind === "graph") return `创建 NodeFlow 图引用连线 ${output?.item?.link_id || ""}`.trim();
    return `创建 NodeFlow 连线 ${output?.item?.link_id || ""}`.trim();
  },
};
