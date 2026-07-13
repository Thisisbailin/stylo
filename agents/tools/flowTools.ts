import type { NodeFlowHandle, StyloAgentBridge } from "../bridge/styloBridge";
import { assertGenericWriteAllowedForNode, findNodeByIdOrRef } from "./foundationAccess";

const HANDLE_VALUES = ["image", "text", "audio", "video", "multi"] as const;

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const normalizeHandle = (value: unknown): NodeFlowHandle | undefined => {
  const handle = trim(value);
  return (HANDLE_VALUES as readonly string[]).includes(handle) ? (handle as NodeFlowHandle) : undefined;
};

const moveFlowNodeParameters = {
  type: "object",
  properties: {
    node_id: {
      type: "string",
      description: "Existing Flow node id.",
    },
    node_ref: {
      type: "string",
      description: "Stable Flow node ref.",
    },
    x: {
      type: "number",
      description: "Target canvas x position.",
    },
    y: {
      type: "number",
      description: "Target canvas y position.",
    },
  },
  additionalProperties: false,
  required: ["x", "y"],
} as const;

const connectFlowNodesParameters = {
  type: "object",
  properties: {
    source_node_id: {
      type: "string",
      description: "Source Flow node id.",
    },
    target_node_id: {
      type: "string",
      description: "Target Flow node id.",
    },
    source_ref: {
      type: "string",
      description: "Source stable Flow node ref.",
    },
    target_ref: {
      type: "string",
      description: "Target stable Flow node ref.",
    },
    source_handle: {
      type: "string",
      enum: [...HANDLE_VALUES],
      description: "Optional explicit source handle.",
    },
    target_handle: {
      type: "string",
      enum: [...HANDLE_VALUES],
      description: "Optional explicit target handle.",
    },
    connection_kind: {
      type: "string",
      enum: ["canvas", "reference"],
      description: "Use canvas for visible node connections, reference for semantic graph links.",
    },
  },
  additionalProperties: false,
} as const;

const parseMoveArgs = (input: unknown) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("move_flow_node needs an object argument.");
  }
  const raw = input as Record<string, unknown>;
  const nodeId = trim(raw.node_id ?? raw.nodeId);
  const nodeRef = trim(raw.node_ref ?? raw.nodeRef);
  const x = typeof raw.x === "number" ? raw.x : Number.NaN;
  const y = typeof raw.y === "number" ? raw.y : Number.NaN;
  if (!nodeId && !nodeRef) throw new Error("move_flow_node needs node_id or node_ref.");
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("move_flow_node needs finite x and y.");
  return { nodeId: nodeId || undefined, nodeRef: nodeRef || undefined, x, y };
};

const parseConnectArgs = (input: unknown) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("connect_flow_nodes needs an object argument.");
  }
  const raw = input as Record<string, unknown>;
  const sourceNodeId = trim(raw.source_node_id ?? raw.sourceNodeId);
  const targetNodeId = trim(raw.target_node_id ?? raw.targetNodeId);
  const sourceRef = trim(raw.source_ref ?? raw.sourceRef);
  const targetRef = trim(raw.target_ref ?? raw.targetRef);
  const connectionKind = trim(raw.connection_kind ?? raw.connectionKind) === "reference" ? "reference" : "canvas";
  if ((!sourceNodeId && !sourceRef) || (!targetNodeId && !targetRef)) {
    throw new Error("connect_flow_nodes needs source and target node_id or node_ref.");
  }
  if ((sourceNodeId || sourceRef) === (targetNodeId || targetRef)) {
    throw new Error("connect_flow_nodes cannot connect a node to itself.");
  }
  return {
    sourceNodeId: sourceNodeId || undefined,
    targetNodeId: targetNodeId || undefined,
    sourceRef: sourceRef || undefined,
    targetRef: targetRef || undefined,
    sourceHandle: normalizeHandle(raw.source_handle ?? raw.sourceHandle),
    targetHandle: normalizeHandle(raw.target_handle ?? raw.targetHandle),
    connectionKind,
  };
};

export const moveFlowNodeToolDef = {
  name: "move_flow_node",
  description: "Move an existing Flow node to an explicit canvas position.",
  parameters: moveFlowNodeParameters,
  execute: (input: unknown, bridge: StyloAgentBridge) => {
    const args = parseMoveArgs(input);
    const workflow = bridge.getNodeFlowSnapshot();
    assertGenericWriteAllowedForNode(
      findNodeByIdOrRef(workflow, { nodeId: args.nodeId, nodeRef: args.nodeRef }),
      "move_flow_node"
    );
    const moved = bridge.moveNodeFlowNode({
      expectedRevision: bridge.getNodeFlowSnapshot().revision,
      nodeId: args.nodeId,
      nodeRef: args.nodeRef,
      x: args.x,
      y: args.y,
    });
    return {
      target: "flow:node",
      action: "move",
      item: {
        node_id: moved.nodeId,
        node_ref: moved.nodeRef || null,
        node_kind: moved.nodeType,
        title: moved.title,
        position: moved.position,
      },
    };
  },
  summarize: (output: any) =>
    `Moved ${output?.item?.title || output?.item?.node_ref || output?.item?.node_id || "Flow node"}`,
};

export const connectFlowNodesToolDef = {
  name: "connect_flow_nodes",
  description: "Connect two existing Flow nodes with a visible canvas connection or semantic reference link.",
  parameters: connectFlowNodesParameters,
  execute: (input: unknown, bridge: StyloAgentBridge) => {
    const args = parseConnectArgs(input);
    const workflow = bridge.getNodeFlowSnapshot();
    assertGenericWriteAllowedForNode(
      findNodeByIdOrRef(workflow, { nodeId: args.sourceNodeId, nodeRef: args.sourceRef }),
      "connect_flow_nodes source"
    );
    assertGenericWriteAllowedForNode(
      findNodeByIdOrRef(workflow, { nodeId: args.targetNodeId, nodeRef: args.targetRef }),
      "connect_flow_nodes target"
    );
    if (args.connectionKind === "reference") {
      if (!args.sourceRef || !args.targetRef) {
        throw new Error("connect_flow_nodes connection_kind=reference needs source_ref and target_ref.");
      }
      const linked = bridge.createNodeFlowGraphLink({
        expectedRevision: bridge.getNodeFlowSnapshot().revision,
        sourceRef: args.sourceRef,
        targetRef: args.targetRef,
      });
      return {
        target: "flow:link",
        action: "connect",
        connection_kind: "reference",
        item: {
          link_id: linked.linkId,
          source_ref: linked.sourceRef,
          target_ref: linked.targetRef,
        },
      };
    }

    const connected = bridge.connectNodeFlowNodes({
      expectedRevision: bridge.getNodeFlowSnapshot().revision,
      sourceNodeId: args.sourceNodeId,
      targetNodeId: args.targetNodeId,
      sourceRef: args.sourceRef,
      targetRef: args.targetRef,
      sourceHandle: args.sourceHandle,
      targetHandle: args.targetHandle,
    });
    return {
      target: "flow:link",
      action: "connect",
      connection_kind: "canvas",
      item: {
        link_id: connected.linkId,
        source_node_id: connected.sourceNodeId,
        target_node_id: connected.targetNodeId,
        source_ref: connected.sourceRef || null,
        target_ref: connected.targetRef || null,
        source_handle: connected.sourceHandle,
        target_handle: connected.targetHandle,
      },
    };
  },
  summarize: (output: any) =>
    `Connected Flow nodes${output?.item?.link_id ? ` (${output.item.link_id})` : ""}`,
};
