import type { Connection } from "@xyflow/react";
import { isValidConnection } from "../../node-workspace/utils/handles";
import type {
  CreateNodeFlowMapInput,
  CreateNodeFlowMapNodeInput,
  CreateNodeFlowMapResult,
} from "./qalamBridge";
import type { NodeType, NodeFlowNodeData } from "../../node-workspace/types";
import { buildNodeFlowLinkId } from "../../node-workspace/nodeflow/links";

type NodeFlowBuilderDeps = {
  addNode: (type: NodeType, position: { x: number; y: number }, parentId?: string, extraData?: Partial<NodeFlowNodeData>) => string;
  updateNodeStyle: (nodeId: string, style: Record<string, unknown>) => void;
  connectNodes: (connection: Connection) => void;
  toggleLinkPause: (linkId: string) => void;
  removeNode: (nodeId: string) => void;
  removeLink: (linkId: string) => void;
};

const NODE_DIMENSIONS: Record<CreateNodeFlowMapNodeInput["type"], { width: number; height: number }> = {
  scriptPage: { width: 320, height: 249 },
  mdText: { width: 320, height: 252 },
  folder: { width: 230, height: 128 },
  text: { width: 320, height: 240 },
  imageInput: { width: 320, height: 240 },
  audioInput: { width: 320, height: 180 },
  videoInput: { width: 340, height: 260 },
};

const GAP = { x: 72, y: 56 };
const NODE_HANDLES: Record<CreateNodeFlowMapNodeInput["type"], { inputs: string[]; outputs: string[] }> = {
  scriptPage: { inputs: ["text"], outputs: ["text"] },
  mdText: { inputs: ["text"], outputs: ["text"] },
  folder: { inputs: ["text"], outputs: ["text"] },
  text: { inputs: ["text"], outputs: ["text"] },
  imageInput: { inputs: [], outputs: ["image"] },
  audioInput: { inputs: [], outputs: ["audio"] },
  videoInput: { inputs: ["multi", "image", "text", "audio", "video"], outputs: ["video"] },
};

const buildNodeData = (node: CreateNodeFlowMapNodeInput): Partial<NodeFlowNodeData> => {
  const data = { ...(node.data || {}) } as Record<string, unknown>;
  if (node.title !== undefined) data.title = node.title;
  if ((node.type === "text" || node.type === "scriptPage" || node.type === "mdText") && (node.text !== undefined || node.content !== undefined)) {
    const text = node.text ?? node.content ?? "";
    data.text = text;
    if (node.type === "mdText") data.content = text;
    if (data.title == null && node.title == null) data.title = "Agent Note";
  }
  return data as Partial<NodeFlowNodeData>;
};

const layoutNodePosition = (
  index: number,
  layout: NonNullable<CreateNodeFlowMapInput["layout"]>
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
      throw new Error(`NodeFlow 连线使用了无效 handle: ${requested}`);
    }
    return requested;
  }
  if (counterpart && counterpart !== "multi" && available.includes("multi")) {
    return "multi";
  }
  if (counterpart && available.includes(counterpart)) {
    return counterpart;
  }
  if (available.length === 1) {
    return available[0];
  }
  throw new Error("NodeFlow 连线缺少明确的 handle，且无法自动推断。");
};

const normalizeLinks = (input: CreateNodeFlowMapInput) => {
  const nodeByKey = new Map(input.nodes.map((node) => [node.key, node]));
  const seenKeys = new Set<string>();
  input.nodes.forEach((node) => {
    if (seenKeys.has(node.key)) {
      throw new Error(`NodeFlow 节点 key 重复: ${node.key}`);
    }
    seenKeys.add(node.key);
  });

  return (input.links || []).map((edge) => {
    const sourceNode = nodeByKey.get(edge.from);
    const targetNode = nodeByKey.get(edge.to);
    if (!sourceNode || !targetNode) {
      throw new Error(`NodeFlow 连线引用了不存在的节点 key: ${edge.from} -> ${edge.to}`);
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
      throw new Error(`NodeFlow 连线类型不合法: ${edge.from}.${sourceHandle} -> ${edge.to}.${targetHandle}`);
    }
    return {
      ...edge,
      fromHandle: sourceHandle as "image" | "text" | "audio" | "video" | "multi",
      toHandle: targetHandle as "image" | "text" | "audio" | "video" | "multi",
    };
  });
};

export const createNodeFlowMapWithBridge = (
  input: CreateNodeFlowMapInput,
  deps: NodeFlowBuilderDeps
): CreateNodeFlowMapResult => {
  const layout = input.layout || "horizontal";
  const normalizedLinks = normalizeLinks(input);

  const keyToNodeId = new Map<string, string>();
  const createdNodes: CreateNodeFlowMapResult["nodes"] = [];
  const createdLinkIds: string[] = [];

  try {
    input.nodes.forEach((node, index) => {
      const dim = NODE_DIMENSIONS[node.type];
      const autoPosition = layoutNodePosition(index, layout);
      const position = {
        x: Math.round(node.x ?? autoPosition.x),
        y: Math.round(node.y ?? autoPosition.y),
      };
      const nodeId = deps.addNode(node.type, position, input.parentId, buildNodeData(node));
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
    });

    let linkCount = 0;
    for (const link of normalizedLinks) {
      const source = keyToNodeId.get(link.from);
      const target = keyToNodeId.get(link.to);
      if (!source || !target) {
        throw new Error(`NodeFlow 连线引用了不存在的节点 key: ${link.from} -> ${link.to}`);
      }
      const connection: Connection = {
        source,
        target,
        sourceHandle: link.fromHandle,
        targetHandle: link.toHandle,
      };
      deps.connectNodes(connection);
      const linkId = buildNodeFlowLinkId(
        connection.source,
        connection.target,
        connection.sourceHandle,
        connection.targetHandle
      );
      createdLinkIds.push(linkId);
      linkCount += 1;
      if (link.paused) {
        deps.toggleLinkPause(linkId);
      }
    }

    return {
      nodes: createdNodes,
      linkCount,
    };
  } catch (error) {
    createdLinkIds.slice().reverse().forEach((linkId) => deps.removeLink(linkId));
    createdNodes.slice().reverse().forEach((node) => deps.removeNode(node.id));
    throw error;
  }
};
