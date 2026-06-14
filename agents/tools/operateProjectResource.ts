import type {
  NodeFlowHandle,
  QalamAgentBridge,
} from "../bridge/qalamBridge";
import { getNodeFlowRef } from "../runtime/nodeFlowRefs";
import { findProjectedSourceNode } from "../../node-workspace/nodeflow/projectGraph";

export const OPERATE_NODEFLOW_ENTITIES = ["node", "link"] as const;
export const OPERATE_NODEFLOW_ACTIONS = ["create", "update", "move", "remove", "connect", "unlink"] as const;
export const OPERATE_NODEFLOW_TARGETS = ["nodeflow:node", "nodeflow:link"] as const;
export const OPERATE_NODEFLOW_NODE_KINDS = ["text", "script_board", "character_card"] as const;

type OperateEntity = (typeof OPERATE_NODEFLOW_ENTITIES)[number];
type OperateAction = (typeof OPERATE_NODEFLOW_ACTIONS)[number];
type OperateNodeKind = (typeof OPERATE_NODEFLOW_NODE_KINDS)[number];

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
      description: "Atomic NodeFlow action. Nodes support create, update, move, remove. Links support connect, unlink.",
    },
    link_role: {
      type: "string",
      enum: ["connection", "reference"],
      description: "Whether the NodeFlow link is a visible canvas connection or an internal reference relation.",
    },
    node_kind: {
      type: "string",
      description: "NodeFlow node kind to create. Supports text, script_board, character_card, plus aliases script and character.",
    },
    node_id: {
      type: "string",
      description: "Existing NodeFlow node id.",
    },
    node_ref: {
      type: "string",
      description: "Existing NodeFlow node ref.",
    },
    link_id: {
      type: "string",
      description: "Existing NodeFlow link id for unlink.",
    },
    title: {
      type: "string",
      description: "Optional node title.",
    },
    text: {
      type: "string",
      description: "Text content for text nodes or text patches.",
    },
    patch: {
      type: "object",
      description: "Structured NodeFlow node patch for update.",
      additionalProperties: true,
    },
    x: {
      type: "number",
      description: "Target canvas x position for create or move.",
    },
    y: {
      type: "number",
      description: "Target canvas y position for create or move.",
    },
    parent_id: {
      type: "string",
      description: "Optional parent node id when creating a node.",
    },
    episode_id: {
      type: "integer",
      description: "Episode number for script_board nodes, or for node patching.",
    },
    scene_id: {
      type: "string",
      description: "Optional scene id for node patching.",
    },
    character_id: {
      type: "string",
      description: "Character id for character_card nodes, or for node patching.",
    },
    source_ref: {
      type: "string",
      description: "Source node ref when connecting NodeFlow links.",
    },
    target_ref: {
      type: "string",
      description: "Target node ref when connecting NodeFlow links.",
    },
    source_node_id: {
      type: "string",
      description: "Source node id when connecting NodeFlow links.",
    },
    target_node_id: {
      type: "string",
      description: "Target node id when connecting NodeFlow links.",
    },
    source_handle: {
      type: "string",
      description: "Optional explicit source handle for connection links.",
    },
    target_handle: {
      type: "string",
      description: "Optional explicit target handle for connection links.",
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

const normalizeNodeKind = (rawNodeKind: unknown): OperateNodeKind | "" => {
  const value = normalizeString(rawNodeKind);
  if (value === "script") return "script_board";
  if (value === "character") return "character_card";
  if ((OPERATE_NODEFLOW_NODE_KINDS as readonly string[]).includes(value)) {
    return value as OperateNodeKind;
  }
  return "";
};

type ParsedArgs =
  | {
      entity: "node";
      action: "create";
      nodeKind: OperateNodeKind;
      nodeRef?: string;
      parentId?: string;
      title?: string;
      text?: string;
      x?: number;
      y?: number;
      episodeId?: number;
      sceneId?: string;
      characterId?: string;
    }
  | {
      entity: "node";
      action: "update";
      nodeId?: string;
      nodeRef?: string;
      patch: Record<string, unknown>;
    }
  | {
      entity: "node";
      action: "move";
      nodeId?: string;
      nodeRef?: string;
      x: number;
      y: number;
    }
  | {
      entity: "node";
      action: "remove";
      nodeId?: string;
      nodeRef?: string;
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
    }
  | {
      entity: "link";
      action: "unlink";
      linkKind: "canvas" | "graph";
      linkId: string;
    };

const buildNodePatch = (raw: Record<string, unknown>) => {
  const explicitPatch =
    raw.patch && typeof raw.patch === "object" && !Array.isArray(raw.patch)
      ? { ...(raw.patch as Record<string, unknown>) }
      : {};

  const title = normalizeString(raw.title);
  const text = normalizeString(raw.text);
  const sceneId = normalizeString(raw.scene_id ?? raw.sceneId);
  const characterId = normalizeString(raw.character_id ?? raw.characterId);
  const episodeId = toPositiveInteger(raw.episode_id ?? raw.episodeId);

  if (title) explicitPatch.title = title;
  if (text) explicitPatch.text = text;
  if (typeof episodeId === "number") explicitPatch.episodeId = episodeId;
  if (sceneId) explicitPatch.sceneId = sceneId;
  if (characterId) {
    explicitPatch.entityId = characterId;
    if (explicitPatch.entityType == null) {
      explicitPatch.entityType = "character";
    }
  }
  return explicitPatch;
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

  if (entity === "node") {
    const nodeId = normalizeString(raw.node_id ?? raw.nodeId) || undefined;
    const nodeRef = normalizeString(raw.node_ref ?? raw.nodeRef) || undefined;

    if (action === "create") {
      const nodeKind = normalizeNodeKind(raw.node_kind ?? raw.nodeKind);
      const parentId = normalizeString(raw.parent_id ?? raw.parentId) || undefined;
      const title = normalizeString(raw.title) || undefined;
      const text = normalizeString(raw.text) || undefined;
      const x = typeof raw.x === "number" ? raw.x : undefined;
      const y = typeof raw.y === "number" ? raw.y : undefined;
      const episodeId = toPositiveInteger(raw.episode_id ?? raw.episodeId);
      const sceneId = normalizeString(raw.scene_id ?? raw.sceneId) || undefined;
      const characterId = normalizeString(raw.character_id ?? raw.characterId) || undefined;

      if (!nodeKind) {
        throw new Error("创建 NodeFlow node 需要合法的 node_kind。");
      }
      if (nodeKind === "text" && !text) {
        throw new Error("创建 text 节点时需要 text。");
      }
      if (nodeKind === "script_board" && !episodeId) {
        throw new Error(`${nodeKind} 需要 episode_id。`);
      }
      if (nodeKind === "character_card" && !characterId) {
        throw new Error("character_card 需要 character_id。");
      }

      return {
        entity: "node",
        action: "create",
        nodeKind,
        nodeRef,
        parentId,
        title,
        text,
        x,
        y,
        episodeId,
        sceneId,
        characterId,
      };
    }

    if (!nodeId && !nodeRef) {
      throw new Error(`NodeFlow node ${action} 需要 node_id 或 node_ref。`);
    }

    if (action === "update") {
      const patch = buildNodePatch(raw);
      if (!Object.keys(patch).length) {
        throw new Error("更新 NodeFlow node 需要 patch 或可映射到 patch 的字段。");
      }
      return {
        entity: "node",
        action: "update",
        nodeId,
        nodeRef,
        patch,
      };
    }

    if (action === "move") {
      const x = typeof raw.x === "number" ? raw.x : undefined;
      const y = typeof raw.y === "number" ? raw.y : undefined;
      if (typeof x !== "number" || typeof y !== "number") {
        throw new Error("移动 NodeFlow node 需要明确的 x 和 y。");
      }
      return {
        entity: "node",
        action: "move",
        nodeId,
        nodeRef,
        x,
        y,
      };
    }

    if (action === "remove") {
      return {
        entity: "node",
        action: "remove",
        nodeId,
        nodeRef,
      };
    }

    throw new Error(`NodeFlow node 当前不支持 action=${action}`);
  }

  if (action === "connect") {
    const linkRole = (normalizeString(raw.link_role ?? raw.linkRole) || "connection") as
      | "connection"
      | "reference";
    const sourceRef = normalizeString(raw.source_ref ?? raw.sourceRef) || undefined;
    const targetRef = normalizeString(raw.target_ref ?? raw.targetRef) || undefined;
    const sourceNodeId = normalizeString(raw.source_node_id ?? raw.sourceNodeId) || undefined;
    const targetNodeId = normalizeString(raw.target_node_id ?? raw.targetNodeId) || undefined;
    const sourceHandle = normalizeString(raw.source_handle ?? raw.sourceHandle) || undefined;
    const targetHandle = normalizeString(raw.target_handle ?? raw.targetHandle) || undefined;

    if ((!sourceRef && !sourceNodeId) || (!targetRef && !targetNodeId)) {
      throw new Error("连接 NodeFlow link 时需要为两端分别提供 ref 或 node_id。");
    }
    if ((sourceRef || sourceNodeId) === (targetRef || targetNodeId)) {
      throw new Error("NodeFlow link 不能连接同一个节点到自己。");
    }

    return {
      entity: "link",
      action: "connect",
      linkKind: linkRole === "reference" ? "graph" : "canvas",
      sourceRef,
      targetRef,
      sourceNodeId,
      targetNodeId,
      sourceHandle,
      targetHandle,
    };
  }

  if (action === "unlink") {
    const linkId = normalizeString(raw.link_id ?? raw.linkId);
    const linkRole = (normalizeString(raw.link_role ?? raw.linkRole) || "connection") as
      | "connection"
      | "reference";
    if (!linkId) {
      throw new Error("断开 NodeFlow link 需要 link_id。");
    }
    return {
      entity: "link",
      action: "unlink",
      linkKind: linkRole === "reference" ? "graph" : "canvas",
      linkId,
    };
  }

  throw new Error(`NodeFlow link 当前不支持 action=${action}`);
};

const resolveNodeType = (nodeKind: OperateNodeKind) => {
  if (nodeKind === "script_board") return "scriptBoard" as const;
  if (nodeKind === "character_card") return "identityCard" as const;
  return "text" as const;
};

const defaultTitle = (args: Extract<ParsedArgs, { entity: "node"; action: "create" }>) => {
  if (args.title) return args.title;
  if (args.nodeKind === "script_board") return args.episodeId ? `第 ${args.episodeId} 集剧本` : "剧本";
  if (args.nodeKind === "character_card") return "角色卡片";
  return args.text?.slice(0, 24) || "文本";
};

const defaultNodeRef = (args: Extract<ParsedArgs, { entity: "node"; action: "create" }>) => {
  if (args.nodeRef) return args.nodeRef;
  if (args.nodeKind === "script_board") return `ep${args.episodeId || "x"}_script_board`;
  if (args.nodeKind === "character_card") {
    return `${slugifyRefToken(args.characterId || args.title || "character", "character")}_card`;
  }
  return `text_${slugifyRefToken(args.title || args.text || Date.now().toString(), "note")}`;
};

const resolveNodeFlowRefForGraph = (
  bridge: QalamAgentBridge,
  workflow: ReturnType<QalamAgentBridge["getNodeFlowSnapshot"]>,
  nodeId?: string,
  nodeRef?: string
) => {
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

export const operateProjectResourceToolDef = {
  name: "operate_project_resource",
  description:
    "Operate the NodeFlow layer by performing atomic node or link actions on the visible working canvas. Use this tool only for the NodeFlow side of the central graph world.",
  parameters: operateProjectResourceParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const workflow = bridge.getNodeFlowSnapshot();
    const expectedRevision = workflow.revision;

    if (args.entity === "node" && args.action === "create") {
      const nodeType = resolveNodeType(args.nodeKind);
      const created = bridge.createNodeFlowNode({
        expectedRevision,
        type: nodeType,
        nodeRef: defaultNodeRef(args),
        title: defaultTitle(args),
        text: args.nodeKind === "text" ? args.text : undefined,
        x: args.x,
        y: args.y,
        parentId: args.parentId,
        episodeId: args.nodeKind === "script_board" ? args.episodeId : undefined,
        sceneId: undefined,
        entityType: args.nodeKind === "character_card" ? "character" : undefined,
        entityId: args.nodeKind === "character_card" ? args.characterId : undefined,
      });
      return {
        layer: "nodeflow",
        entity: "node",
        target: "nodeflow:node",
        action: "create",
        artifact: {
          kind: "node",
          target: "nodeflow:node",
          id: created.nodeId,
          ref: created.nodeRef || defaultNodeRef(args),
          title: created.title,
          node_kind: args.nodeKind,
        },
        item: {
          node_kind: args.nodeKind,
          node_id: created.nodeId,
          node_ref: created.nodeRef || defaultNodeRef(args),
          title: created.title,
        },
      };
    }

    if (args.entity === "node" && args.action === "update") {
      const updated = bridge.updateNodeFlowNode({
        expectedRevision,
        nodeId: args.nodeId,
        nodeRef: args.nodeRef,
        patch: args.patch,
      });
      return {
        layer: "nodeflow",
        entity: "node",
        target: "nodeflow:node",
        action: "update",
        artifact: {
          kind: "node",
          target: "nodeflow:node",
          id: updated.nodeId,
          ref: updated.nodeRef,
          title: updated.title,
          node_kind: updated.nodeType,
        },
        item: {
          node_id: updated.nodeId,
          node_ref: updated.nodeRef,
          node_kind: updated.nodeType,
          title: updated.title,
          patch: updated.patch,
        },
      };
    }

    if (args.entity === "node" && args.action === "move") {
      const moved = bridge.moveNodeFlowNode({
        expectedRevision,
        nodeId: args.nodeId,
        nodeRef: args.nodeRef,
        x: args.x,
        y: args.y,
      });
      return {
        layer: "nodeflow",
        entity: "node",
        target: "nodeflow:node",
        action: "move",
        artifact: {
          kind: "node",
          target: "nodeflow:node",
          id: moved.nodeId,
          ref: moved.nodeRef,
          title: moved.title,
          node_kind: moved.nodeType,
        },
        item: {
          node_id: moved.nodeId,
          node_ref: moved.nodeRef,
          node_kind: moved.nodeType,
          title: moved.title,
          position: moved.position,
        },
      };
    }

    if (args.entity === "node" && args.action === "remove") {
      const removed = bridge.removeNodeFlowNode({
        expectedRevision,
        nodeId: args.nodeId,
        nodeRef: args.nodeRef,
      });
      return {
        layer: "nodeflow",
        entity: "node",
        target: "nodeflow:node",
        action: "remove",
        removed: true,
        artifact: {
          kind: "node",
          target: "nodeflow:node",
          id: removed.nodeId,
          ref: removed.nodeRef,
          title: removed.title,
          node_kind: removed.nodeType,
        },
        item: {
          node_id: removed.nodeId,
          node_ref: removed.nodeRef,
          node_kind: removed.nodeType,
          title: removed.title,
        },
      };
    }

    if (args.entity === "link" && args.action === "connect" && args.linkKind === "canvas") {
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
        target: "nodeflow:link",
        action: "connect",
        role: "connection",
        artifact: {
          kind: "link",
          target: "nodeflow:link",
          id: connected.linkId,
          title: "connection",
          source: {
            node_id: connected.sourceNodeId,
            node_ref: connected.sourceRef,
            handle: connected.sourceHandle,
          },
          destination: {
            node_id: connected.targetNodeId,
            node_ref: connected.targetRef,
            handle: connected.targetHandle,
          },
        },
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

    if (args.entity === "link" && args.action === "connect" && args.linkKind === "graph") {
      const sourceRef = resolveNodeFlowRefForGraph(bridge, workflow, args.sourceNodeId, args.sourceRef);
      const targetRef = resolveNodeFlowRefForGraph(bridge, workflow, args.targetNodeId, args.targetRef);
      if (!sourceRef || !targetRef) {
        throw new Error("创建 NodeFlow graph link 需要可解析的 source_ref 和 target_ref。");
      }
      const created = bridge.createNodeFlowGraphLink({
        expectedRevision,
        sourceRef,
        targetRef,
      });
      return {
        layer: "nodeflow",
        entity: "link",
        target: "nodeflow:link",
        action: "connect",
        role: "reference",
        artifact: {
          kind: "link",
          target: "nodeflow:link",
          id: created.linkId,
          title: "reference",
          source: {
            node_ref: created.sourceRef,
          },
          destination: {
            node_ref: created.targetRef,
          },
        },
        item: {
          link_id: created.linkId,
          source_ref: created.sourceRef,
          target_ref: created.targetRef,
        },
      };
    }

    const removed = bridge.removeNodeFlowLink({
      expectedRevision,
      linkId: args.linkId,
      linkKind: args.linkKind,
    });
    return {
      layer: "nodeflow",
      entity: "link",
      target: "nodeflow:link",
      action: "unlink",
      role: removed.linkKind === "graph" ? "reference" : "connection",
      removed: true,
      artifact: {
        kind: "link",
        target: "nodeflow:link",
        id: removed.linkId,
        title: removed.linkKind === "graph" ? "reference" : "connection",
        source:
          removed.linkKind === "graph"
            ? {
                node_ref: removed.sourceRef,
              }
            : {
                node_id: removed.sourceNodeId,
                node_ref: removed.sourceRef,
                handle: removed.sourceHandle,
              },
        destination:
          removed.linkKind === "graph"
            ? {
                node_ref: removed.targetRef,
              }
            : {
                node_id: removed.targetNodeId,
                node_ref: removed.targetRef,
                handle: removed.targetHandle,
              },
      },
      item:
        removed.linkKind === "graph"
          ? {
              link_id: removed.linkId,
              source_ref: removed.sourceRef,
              target_ref: removed.targetRef,
            }
          : {
              link_id: removed.linkId,
              source_node_id: removed.sourceNodeId,
              target_node_id: removed.targetNodeId,
              source_ref: removed.sourceRef,
              target_ref: removed.targetRef,
              source_handle: removed.sourceHandle,
              target_handle: removed.targetHandle,
            },
    };
  },
  summarize: (output: any) => {
    if (output?.entity === "node" && output?.action === "create") {
      return `创建 NodeFlow 节点 ${output?.item?.title || output?.item?.node_ref || output?.item?.node_id}`;
    }
    if (output?.entity === "node" && output?.action === "update") {
      return `更新 NodeFlow 节点 ${output?.item?.title || output?.item?.node_ref || output?.item?.node_id}`;
    }
    if (output?.entity === "node" && output?.action === "move") {
      return `移动 NodeFlow 节点 ${output?.item?.title || output?.item?.node_ref || output?.item?.node_id}`;
    }
    if (output?.entity === "node" && output?.action === "remove") {
      return `删除 NodeFlow 节点 ${output?.item?.title || output?.item?.node_ref || output?.item?.node_id}`;
    }
    if (output?.entity === "link" && output?.action === "connect") {
      return `连接 NodeFlow ${output?.role === "reference" ? "引用关系" : "连接关系"} ${output?.item?.link_id || ""}`.trim();
    }
    return `断开 NodeFlow ${output?.role === "reference" ? "引用关系" : "连接关系"} ${output?.item?.link_id || ""}`.trim();
  },
};
