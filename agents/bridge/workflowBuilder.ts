import type { Connection } from "@xyflow/react";
import { isValidConnection } from "../../node-workspace/utils/handles";
import type {
  CreateNodeWorkflowInput,
  CreateNodeWorkflowNodeInput,
  CreateNodeWorkflowResult,
} from "./script2videoBridge";
import type { NodeType, WorkflowNodeData } from "../../node-workspace/types";

type WorkflowBuilderDeps = {
  addNode: (type: NodeType, position: { x: number; y: number }, parentId?: string, extraData?: Partial<WorkflowNodeData>) => string;
  updateNodeStyle: (nodeId: string, style: Record<string, unknown>) => void;
  onConnect: (connection: Connection) => void;
  toggleEdgePause: (edgeId: string) => void;
  removeNode: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
};

const NODE_DIMENSIONS: Record<CreateNodeWorkflowNodeInput["type"], { width: number; height: number }> = {
  text: { width: 320, height: 240 },
  shot: { width: 360, height: 320 },
  annotation: { width: 320, height: 240 },
  imageGen: { width: 320, height: 420 },
  wanImageGen: { width: 320, height: 420 },
  soraVideoGen: { width: 320, height: 360 },
  wanVideoGen: { width: 320, height: 360 },
  wanReferenceVideoGen: { width: 340, height: 460 },
  viduVideoGen: { width: 320, height: 420 },
  seedanceVideoGen: { width: 360, height: 520 },
};

const GROUP_PADDING = { x: 80, y: 96 };
const GAP = { x: 72, y: 56 };
const NODE_HANDLES: Record<CreateNodeWorkflowNodeInput["type"], { inputs: string[]; outputs: string[] }> = {
  text: { inputs: ["text"], outputs: ["text"] },
  shot: { inputs: ["image"], outputs: ["text"] },
  annotation: { inputs: ["image"], outputs: ["image"] },
  imageGen: { inputs: ["image", "text"], outputs: ["image"] },
  wanImageGen: { inputs: ["image", "text"], outputs: ["image"] },
  soraVideoGen: { inputs: ["image", "text"], outputs: [] },
  wanVideoGen: { inputs: ["image", "text"], outputs: [] },
  wanReferenceVideoGen: { inputs: ["image", "text"], outputs: [] },
  viduVideoGen: { inputs: ["image", "text"], outputs: [] },
  seedanceVideoGen: { inputs: ["image", "text", "audio"], outputs: [] },
};

const buildNodeData = (node: CreateNodeWorkflowNodeInput): Partial<WorkflowNodeData> => {
  const data = { ...(node.data || {}) } as Record<string, unknown>;
  if (node.title !== undefined) data.title = node.title;
  if (node.type === "text" && node.text !== undefined) {
    data.text = node.text;
    if (data.title == null && node.title == null) data.title = "Agent Note";
  }
  return data as Partial<WorkflowNodeData>;
};

const layoutNodePosition = (
  index: number,
  layout: NonNullable<CreateNodeWorkflowInput["layout"]>
): { x: number; y: number } => {
  if (layout === "vertical") {
    return { x: 0, y: index * (NODE_DIMENSIONS.text.height + GAP.y) };
  }
  if (layout === "fanout") {
    if (index === 0) return { x: 0, y: 0 };
    const row = Math.floor((index - 1) / 2);
    const lane = (index - 1) % 2;
    return {
      x: 360 + row * 280,
      y: lane * 260 + row * 40,
    };
  }
  return { x: index * (NODE_DIMENSIONS.text.width + GAP.x), y: 0 };
};

const edgeIdFromConnection = (connection: Connection) =>
  `edge-${connection.source}-${connection.target}-${connection.sourceHandle || "default"}-${connection.targetHandle || "default"}`;

const resolveHandle = ({
  requested,
  available,
  counterpart,
}: {
  requested?: string;
  available: string[];
  counterpart?: string;
}) => {
  if (requested) {
    if (!available.includes(requested)) {
      throw new Error(`工作流连线使用了无效 handle: ${requested}`);
    }
    return requested;
  }
  if (counterpart && available.includes(counterpart)) {
    return counterpart;
  }
  if (available.length === 1) {
    return available[0];
  }
  throw new Error("工作流连线缺少明确的 handle，且无法自动推断。");
};

const normalizeEdges = (input: CreateNodeWorkflowInput) => {
  const nodeByKey = new Map(input.nodes.map((node) => [node.key, node]));
  const seenKeys = new Set<string>();
  input.nodes.forEach((node) => {
    if (seenKeys.has(node.key)) {
      throw new Error(`工作流节点 key 重复: ${node.key}`);
    }
    seenKeys.add(node.key);
  });

  return (input.edges || []).map((edge) => {
    const sourceNode = nodeByKey.get(edge.from);
    const targetNode = nodeByKey.get(edge.to);
    if (!sourceNode || !targetNode) {
      throw new Error(`工作流连线引用了不存在的节点 key: ${edge.from} -> ${edge.to}`);
    }
    const sourceHandle = resolveHandle({
      requested: edge.fromHandle,
      available: NODE_HANDLES[sourceNode.type].outputs,
      counterpart: edge.toHandle,
    });
    const targetHandle = resolveHandle({
      requested: edge.toHandle,
      available: NODE_HANDLES[targetNode.type].inputs,
      counterpart: sourceHandle,
    });
    if (!isValidConnection({ sourceHandle, targetHandle })) {
      throw new Error(`工作流连线类型不合法: ${edge.from}.${sourceHandle} -> ${edge.to}.${targetHandle}`);
    }
    return {
      ...edge,
      fromHandle: sourceHandle as "image" | "text",
      toHandle: targetHandle as "image" | "text",
    };
  });
};

export const createNodeWorkflowWithBridge = (
  input: CreateNodeWorkflowInput,
  deps: WorkflowBuilderDeps
): CreateNodeWorkflowResult => {
  const layout = input.layout || "horizontal";
  const wrapInGroup = input.wrapInGroup !== false;
  const normalizedEdges = normalizeEdges(input);
  const groupOrigin = {
    x: Math.round(input.originX || 0),
    y: Math.round(input.originY || 0),
  };

  let groupId: string | undefined;
  const keyToNodeId = new Map<string, string>();
  const createdNodes: CreateNodeWorkflowResult["nodes"] = [];
  const createdEdgeIds: string[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  try {
    if (wrapInGroup) {
      groupId = deps.addNode("group", groupOrigin, input.parentId, {
        title: input.title || "Agent Workflow",
        description: input.description || "",
      } as Partial<WorkflowNodeData>);
    }

    input.nodes.forEach((node, index) => {
      const dim = NODE_DIMENSIONS[node.type];
      const autoPosition = layoutNodePosition(index, layout);
      const position = {
        x: Math.round(node.x ?? autoPosition.x),
        y: Math.round(node.y ?? autoPosition.y),
      };
      const nodeId = deps.addNode(node.type, position, groupId || input.parentId, buildNodeData(node));
      if (node.width || node.height) {
        deps.updateNodeStyle(nodeId, {
          ...(node.width ? { width: node.width } : {}),
          ...(node.height ? { height: node.height } : {}),
        });
      }
      keyToNodeId.set(node.key, nodeId);
      createdNodes.push({
        key: node.key,
        id: nodeId,
        type: node.type,
        title: node.title,
      });
      minX = Math.min(minX, position.x);
      minY = Math.min(minY, position.y);
      maxX = Math.max(maxX, position.x + (node.width || dim.width));
      maxY = Math.max(maxY, position.y + (node.height || dim.height));
    });

    if (groupId && Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
      const width = Math.max(720, maxX - minX + GROUP_PADDING.x * 2);
      const height = Math.max(520, maxY - minY + GROUP_PADDING.y * 2);
      deps.updateNodeStyle(groupId, { width, height });
    }

    let edgeCount = 0;
    for (const edge of normalizedEdges) {
      const source = keyToNodeId.get(edge.from);
      const target = keyToNodeId.get(edge.to);
      if (!source || !target) {
        throw new Error(`工作流连线引用了不存在的节点 key: ${edge.from} -> ${edge.to}`);
      }
      const connection: Connection = {
        source,
        target,
        sourceHandle: edge.fromHandle,
        targetHandle: edge.toHandle,
      };
      deps.onConnect(connection);
      const edgeId = edgeIdFromConnection(connection);
      createdEdgeIds.push(edgeId);
      edgeCount += 1;
      if (edge.paused) {
        deps.toggleEdgePause(edgeId);
      }
    }

    return {
      groupId,
      nodes: createdNodes,
      edgeCount,
    };
  } catch (error) {
    createdEdgeIds.slice().reverse().forEach((edgeId) => deps.removeEdge(edgeId));
    createdNodes.slice().reverse().forEach((node) => deps.removeNode(node.id));
    if (groupId) deps.removeNode(groupId);
    throw error;
  }
};
