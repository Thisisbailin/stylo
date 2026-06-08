import type { Connection } from "@xyflow/react";
import type { ProjectData } from "../../types";
import type {
  KnowledgeAnchor,
  KnowledgeLink,
  KnowledgeNode,
  KnowledgeNodeConfidence,
  KnowledgeNodeStatus,
  KnowledgeSnapshot,
} from "../../node-workspace/knowledge/types";
import type { NodeFlowFile, NodeFlowNodeData, NodeFlowViewport, NodeType } from "../../node-workspace/types";
import { buildNodeFlowLinkId } from "../../node-workspace/nodeflow/links";
import { buildNodeFlowGraphLinkId } from "../../node-workspace/nodeflow/graphLinks";
import { findProjectGraphNodeByRef } from "../../node-workspace/nodeflow/projectGraph";
import { buildConnectedInputs } from "../../node-workspace/nodeflow/queries";
import {
  buildNodeFlowExecutionApprovalProposal,
  inferExecutionApprovalAction,
  type NodeFlowExecutionApprovalProposal,
} from "../../node-workspace/nodeflow/approvals";
import { getNodeHandles, isValidConnection } from "../../node-workspace/utils/handles";
import { ensureUniqueNodeRef, getNodeFlowRef, normalizeNodeRef, setNodeFlowRef } from "../runtime/nodeFlowRefs";
import { createNodeFlowMapWithBridge } from "./nodeFlowBuilder";
import type {
  CreateNodeFlowGraphLinkInput,
  CreateNodeFlowGraphLinkResult,
  CreateNodeFlowMapInput,
  CreateNodeFlowMapResult,
  CreateNodeFlowNodeInput,
  CreateNodeFlowNodeResult,
  CreateTextNodeInput,
  CreateTextNodeResult,
  ConnectNodeFlowNodesInput,
  ConnectNodeFlowNodesResult,
  MoveNodeFlowNodeInput,
  MoveNodeFlowNodeResult,
  NodeFlowHandle,
  NodeFlowNodeLookupInput,
  NodeFlowNodeLookupResult,
  QalamAgentBridge,
  RemoveNodeFlowLinkInput,
  RemoveNodeFlowLinkResult,
  RemoveNodeFlowNodeInput,
  RemoveNodeFlowNodeResult,
  UpdateNodeFlowNodeInput,
  UpdateNodeFlowNodeResult,
} from "./qalamBridge";

type NodeFlowBridgeDeps = {
  getProjectData: () => ProjectData;
  getNodeFlowSnapshot: () => NodeFlowFile;
  getKnowledgeSnapshot: () => KnowledgeSnapshot;
  getPendingExecutionApprovals?: () => NodeFlowExecutionApprovalProposal[];
  createDerivedKnowledgeNode: (input: {
    id?: string;
    ref?: string;
    kind: string;
    title: string;
    content?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    status?: KnowledgeNodeStatus;
    confidence?: KnowledgeNodeConfidence;
    anchors?: KnowledgeAnchor[];
    anchorType?: KnowledgeAnchor["type"];
    anchorRef?: string;
    anchorSpan?: string;
    createdAt?: number;
    updatedAt?: number;
  }) => KnowledgeNode;
  createDerivedKnowledgeLink: (input: {
    id?: string;
    fromNodeId: string;
    toNodeId: string;
    type: string;
    weight?: number;
    status?: "active" | "superseded";
    createdAt?: number;
    updatedAt?: number;
  }) => KnowledgeLink;
  removeDerivedKnowledgeLink: (input: {
    linkId: string;
  }) => KnowledgeLink;
  supersedeDerivedKnowledgeNode: (input: {
    nodeId?: string;
    nodeRef?: string;
    id?: string;
    ref?: string;
    kind?: string;
    title?: string;
    content?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    status?: KnowledgeNodeStatus;
    confidence?: KnowledgeNodeConfidence;
    anchors?: KnowledgeAnchor[];
    anchorType?: KnowledgeAnchor["type"];
    anchorRef?: string;
    anchorSpan?: string;
    relationType?: string;
    createdAt?: number;
    updatedAt?: number;
  }) => { previousNode: KnowledgeNode; node: KnowledgeNode; link: KnowledgeLink };
  updateProjectData: (updater: (prev: ProjectData) => ProjectData) => void;
  addNode: (type: NodeType, position: { x: number; y: number }, parentId?: string, extraData?: Partial<NodeFlowNodeData>) => string;
  updateNodeData: (nodeId: string, data: Partial<NodeFlowNodeData>) => void;
  moveNode: (nodeId: string, position: { x: number; y: number }) => void;
  addGraphLink: (sourceRef: string, targetRef: string) => string;
  removeGraphLink: (linkId: string) => void;
  updateNodeStyle: (nodeId: string, style: Record<string, unknown>) => void;
  connectNodes: (connection: Connection) => void;
  removeNode: (nodeId: string) => void;
  removeLink: (linkId: string) => void;
  toggleLinkPause: (linkId: string) => void;
  requestExecutionApproval?: (proposal: NodeFlowExecutionApprovalProposal) => void;
  clearExecutionApproval?: (nodeId: string) => void;
};

const SUPPORTED_NODE_TYPES = new Set<CreateNodeFlowNodeInput["type"]>([
  "knowledge",
  "text",
  "imageGen",
  "scriptBoard",
  "storyboardBoard",
  "identityCard",
]);

const getNodeFlowPlacement = (
  snapshot: NodeFlowFile,
  x?: number,
  y?: number
) => {
  if (typeof x === "number" && typeof y === "number") {
    return { x, y };
  }
  const activeViewport = snapshot.viewport || null;
  const baseX = activeViewport ? (-activeViewport.x + 120) / activeViewport.zoom : 120;
  const baseY = activeViewport ? (-activeViewport.y + 120) / activeViewport.zoom : 120;
  const offset = (snapshot.nodes.length % 5) * 24;
  return {
    x: Math.round(baseX + offset),
    y: Math.round(baseY + offset),
  };
};

const resolveNodeTitle = (type: CreateNodeFlowNodeInput["type"], title?: string) =>
  (title || "").trim() ||
  (type === "knowledge"
    ? "Knowledge Asset"
    : type === "text"
    ? "文本节点"
    : type === "imageGen"
      ? "Img Gen"
      : type === "scriptBoard"
        ? "剧本卡片"
        : type === "storyboardBoard"
          ? "分镜表格卡片"
          : "身份卡片");

const buildNodeExtraData = (
  input: CreateNodeFlowNodeInput,
  resolvedTitle: string
): Partial<NodeFlowNodeData> => {
  const { type, text, content, plane, assetType, tags, sourceRefs, status, confidence, locked, fields, aspectRatio, episodeId, sceneId, displayMode, entityType, entityId } = input;
  if (type === "knowledge") {
    return {
      title: resolvedTitle,
      plane: plane || "semantic",
      assetType: (assetType || "semantic.note").trim() || "semantic.note",
      content: (content || "").trim(),
      tags: Array.isArray(tags) ? tags.filter(Boolean) : [],
      sourceRefs: Array.isArray(sourceRefs) ? sourceRefs.filter(Boolean) : [],
      status: status || "draft",
      confidence: confidence || "medium",
      locked: Boolean(locked),
      fields: fields || {},
    } as Partial<NodeFlowNodeData>;
  }
  if (type === "text") {
    const trimmedText = (text || "").trim();
    if (!trimmedText) {
      throw new Error("createNodeFlowNode 创建文本节点时缺少 text。");
    }
    return {
      title: resolvedTitle,
      text: trimmedText,
    } as Partial<NodeFlowNodeData>;
  }
  if (type === "imageGen") {
    return {
      title: resolvedTitle,
      aspectRatio: (aspectRatio || "1:1").trim() || "1:1",
    } as Partial<NodeFlowNodeData>;
  }
  if (type === "scriptBoard") {
    return {
      title: resolvedTitle,
      episodeId,
    } as Partial<NodeFlowNodeData>;
  }
  if (type === "storyboardBoard") {
    return {
      title: resolvedTitle,
      episodeId,
      sceneId: (sceneId || "").trim() || undefined,
      displayMode: displayMode === "workflow" ? "workflow" : "table",
    } as Partial<NodeFlowNodeData>;
  }
  return {
    title: resolvedTitle,
    entityType: entityType === "scene" ? "scene" : "character",
    entityId: (entityId || "").trim() || undefined,
  } as Partial<NodeFlowNodeData>;
};

export const assertExpectedRevision = (currentRevision: number, expectedRevision?: number) => {
  if (typeof expectedRevision !== "number") return;
  if (expectedRevision !== currentRevision) {
    throw new Error(
      `NodeFlow revision mismatch: expected ${expectedRevision}, current ${currentRevision}. 请先重新读取最新 NodeFlow 再执行修改。`
    );
  }
};

export const lookupNodeFlowNodeInSnapshot = (
  snapshot: NodeFlowFile,
  input: NodeFlowNodeLookupInput
): NodeFlowNodeLookupResult | null => {
  const resolvedRef = normalizeNodeRef(input.nodeRef);
  const node = resolvedRef
    ? snapshot.nodes.find((item) => getNodeFlowRef(item) === resolvedRef)
    : snapshot.nodes.find((item) => item.id === input.nodeId);
  if (!node) return null;
  const handles = getNodeHandles(node.type);
  return {
    nodeId: node.id,
    nodeRef: getNodeFlowRef(node),
    nodeType: node.type,
    inputHandles: handles.inputs as NodeFlowHandle[],
    outputHandles: handles.outputs as NodeFlowHandle[],
  };
};

export const resolvePreferredConnectionHandles = (sourceType: string, targetType: string) => {
  const sourceOutputs = getNodeHandles(sourceType).outputs;
  const targetInputs = getNodeHandles(targetType).inputs;
  const multimodalSourceHandle = sourceOutputs.find((handle) => handle === "image" || handle === "text" || handle === "audio");
  if (multimodalSourceHandle && targetInputs.includes("multi")) {
    return {
      sourceHandle: multimodalSourceHandle as "image" | "text" | "audio",
      targetHandle: "multi" as const,
    };
  }
  if (sourceOutputs.includes("text") && targetInputs.includes("text")) {
    return { sourceHandle: "text" as const, targetHandle: "text" as const };
  }
  if (sourceOutputs.includes("audio") && targetInputs.includes("audio")) {
    return { sourceHandle: "audio" as const, targetHandle: "audio" as const };
  }
  return null;
};

const createNodeFlowNode = (
  deps: NodeFlowBridgeDeps,
  input: CreateNodeFlowNodeInput
): CreateNodeFlowNodeResult & Record<string, unknown> => {
  const snapshot = deps.getNodeFlowSnapshot();
  assertExpectedRevision(snapshot.revision, input.expectedRevision);
  if (!SUPPORTED_NODE_TYPES.has(input.type)) {
    throw new Error("createNodeFlowNode 当前仅支持 knowledge、text、imageGen、scriptBoard、storyboardBoard、identityCard。");
  }
  const position = getNodeFlowPlacement(snapshot, input.x, input.y);
  const resolvedTitle = resolveNodeTitle(input.type, input.title);
  const desiredNodeRef = normalizeNodeRef(input.nodeRef);
  const resolvedNodeRef = ensureUniqueNodeRef({
    desiredRef: desiredNodeRef,
    nodes: snapshot.nodes,
  }) || undefined;
  const extraData = setNodeFlowRef(buildNodeExtraData(input, resolvedTitle), resolvedNodeRef);
  const nodeId = deps.addNode(input.type, position, input.parentId, extraData);
  const nodeHandles = getNodeHandles(input.type);
  return {
    nodeId,
    node_id: nodeId,
    nodeRef: resolvedNodeRef || undefined,
    node_ref: resolvedNodeRef || undefined,
    nodeType: input.type,
    node_type: input.type,
    node_kind: input.type,
    title: resolvedTitle,
    defaultOutputHandle: (nodeHandles.outputs[0] as NodeFlowHandle | undefined) ?? null,
    default_output_handle: (nodeHandles.outputs[0] as NodeFlowHandle | undefined) ?? null,
    defaultInputHandles: nodeHandles.inputs as NodeFlowHandle[],
    default_input_handles: nodeHandles.inputs as NodeFlowHandle[],
  };
};

const resolveNodeFlowNode = (
  snapshot: NodeFlowFile,
  input: { nodeId?: string; nodeRef?: string },
  errorPrefix: string
) => {
  const resolved = lookupNodeFlowNodeInSnapshot(snapshot, input);
  if (!resolved) {
    throw new Error(`${errorPrefix} 引用了不存在的节点。请确认 node_id 或 node_ref 指向已创建的 nodeflow node。`);
  }
  const node = snapshot.nodes.find((item) => item.id === resolved.nodeId);
  if (!node) {
    throw new Error(`${errorPrefix} 找到了节点标识，但快照中缺少节点实体。`);
  }
  return { resolved, node };
};

const updateNodeFlowNode = (
  deps: NodeFlowBridgeDeps,
  input: UpdateNodeFlowNodeInput
): UpdateNodeFlowNodeResult & Record<string, unknown> => {
  const snapshot = deps.getNodeFlowSnapshot();
  assertExpectedRevision(snapshot.revision, input.expectedRevision);
  const { resolved, node } = resolveNodeFlowNode(snapshot, input, "updateNodeFlowNode");
  deps.updateNodeData(resolved.nodeId, input.patch as Partial<NodeFlowNodeData>);
  const nextTitle =
    typeof input.patch.title === "string" && input.patch.title.trim()
      ? input.patch.title.trim()
      : (node.data?.title as string | undefined) || resolved.nodeRef || resolved.nodeId;
  return {
    nodeId: resolved.nodeId,
    node_id: resolved.nodeId,
    nodeRef: resolved.nodeRef || undefined,
    node_ref: resolved.nodeRef || undefined,
    nodeType: resolved.nodeType,
    node_type: resolved.nodeType,
    node_kind: resolved.nodeType,
    title: nextTitle,
    patch: input.patch,
  };
};

const moveNodeFlowNode = (
  deps: NodeFlowBridgeDeps,
  input: MoveNodeFlowNodeInput
): MoveNodeFlowNodeResult & Record<string, unknown> => {
  const snapshot = deps.getNodeFlowSnapshot();
  assertExpectedRevision(snapshot.revision, input.expectedRevision);
  const { resolved, node } = resolveNodeFlowNode(snapshot, input, "moveNodeFlowNode");
  deps.moveNode(resolved.nodeId, { x: input.x, y: input.y });
  return {
    nodeId: resolved.nodeId,
    node_id: resolved.nodeId,
    nodeRef: resolved.nodeRef || undefined,
    node_ref: resolved.nodeRef || undefined,
    nodeType: resolved.nodeType,
    node_type: resolved.nodeType,
    node_kind: resolved.nodeType,
    title: (node.data?.title as string | undefined) || resolved.nodeRef || resolved.nodeId,
    position: {
      x: input.x,
      y: input.y,
    },
  };
};

const removeNodeFlowNode = (
  deps: NodeFlowBridgeDeps,
  input: RemoveNodeFlowNodeInput
): RemoveNodeFlowNodeResult & Record<string, unknown> => {
  const snapshot = deps.getNodeFlowSnapshot();
  assertExpectedRevision(snapshot.revision, input.expectedRevision);
  const { resolved, node } = resolveNodeFlowNode(snapshot, input, "removeNodeFlowNode");
  deps.removeNode(resolved.nodeId);
  return {
    nodeId: resolved.nodeId,
    node_id: resolved.nodeId,
    nodeRef: resolved.nodeRef || undefined,
    node_ref: resolved.nodeRef || undefined,
    nodeType: resolved.nodeType,
    node_type: resolved.nodeType,
    node_kind: resolved.nodeType,
    title: (node.data?.title as string | undefined) || resolved.nodeRef || resolved.nodeId,
  };
};

const createNodeFlowGraphLink = (
  deps: NodeFlowBridgeDeps,
  input: CreateNodeFlowGraphLinkInput
): CreateNodeFlowGraphLinkResult => {
  const snapshot = deps.getNodeFlowSnapshot();
  const projectData = deps.getProjectData();
  assertExpectedRevision(snapshot.revision, input.expectedRevision);
  const sourceRef = normalizeNodeRef(input.sourceRef);
  const targetRef = normalizeNodeRef(input.targetRef);
  if (!sourceRef || !targetRef) {
    throw new Error("createNodeFlowGraphLink 需要合法的 sourceRef 和 targetRef。");
  }
  if (sourceRef === targetRef) {
    throw new Error("createNodeFlowGraphLink 不能连接同一个 ref 到自己。");
  }
  const sourceNode = findProjectGraphNodeByRef(projectData, snapshot, sourceRef);
  const targetNode = findProjectGraphNodeByRef(projectData, snapshot, targetRef);
  if (!sourceNode || !targetNode) {
    throw new Error("createNodeFlowGraphLink 只能连接已存在的 source/graph 节点。");
  }
  const linkId = deps.addGraphLink(sourceRef, targetRef);
  return {
    linkId: linkId || buildNodeFlowGraphLinkId(sourceRef, targetRef),
    sourceRef,
    targetRef,
  };
};

const connectNodeFlowNodes = (
  deps: NodeFlowBridgeDeps,
  input: ConnectNodeFlowNodesInput
): ConnectNodeFlowNodesResult & Record<string, unknown> => {
  const snapshot = deps.getNodeFlowSnapshot();
  assertExpectedRevision(snapshot.revision, input.expectedRevision);
  const sourceNode = lookupNodeFlowNodeInSnapshot(snapshot, {
    nodeId: input.sourceNodeId,
    nodeRef: input.sourceRef,
  });
  const targetNode = lookupNodeFlowNodeInSnapshot(snapshot, {
    nodeId: input.targetNodeId,
    nodeRef: input.targetRef,
  });
  if (!sourceNode || !targetNode) {
    throw new Error("connectNodeFlowNodes 引用了不存在的节点。请确认 source_ref/target_ref 指向已创建的 nodeflow node。");
  }
  const sourceHandles = sourceNode.outputHandles;
  const targetHandles = targetNode.inputHandles;
  if (sourceHandles.length === 0 || targetHandles.length === 0) {
    throw new Error("当前节点类型不存在可用的输入/输出 handle。");
  }
  const preferred = resolvePreferredConnectionHandles(sourceNode.nodeType, targetNode.nodeType);
  const resolvedSourceHandle = input.sourceHandle || preferred?.sourceHandle;
  const resolvedTargetHandle = input.targetHandle || preferred?.targetHandle;
  if (!resolvedSourceHandle || !resolvedTargetHandle) {
    throw new Error(
      `connectNodeFlowNodes 无法自动推断 ${sourceNode.nodeType} -> ${targetNode.nodeType} 的连接端口。请显式提供 source_handle 和 target_handle。`
    );
  }
  if (!sourceHandles.includes(resolvedSourceHandle) || !targetHandles.includes(resolvedTargetHandle)) {
    throw new Error("connectNodeFlowNodes 收到无效的 handle。");
  }
  if (!isValidConnection({ sourceHandle: resolvedSourceHandle, targetHandle: resolvedTargetHandle })) {
    throw new Error("connectNodeFlowNodes 收到不合法的连线类型。");
  }
  deps.connectNodes({
    source: sourceNode.nodeId,
    target: targetNode.nodeId,
    sourceHandle: resolvedSourceHandle,
    targetHandle: resolvedTargetHandle,
  });
  const resolvedLinkId = buildNodeFlowLinkId(
    sourceNode.nodeId,
    targetNode.nodeId,
    resolvedSourceHandle,
    resolvedTargetHandle
  );
  return {
    linkId: resolvedLinkId,
    link_id: resolvedLinkId,
    edge_id: resolvedLinkId,
    sourceNodeId: sourceNode.nodeId,
    source_node_id: sourceNode.nodeId,
    targetNodeId: targetNode.nodeId,
    target_node_id: targetNode.nodeId,
    sourceRef: sourceNode.nodeRef || undefined,
    source_ref: sourceNode.nodeRef || undefined,
    targetRef: targetNode.nodeRef || undefined,
    target_ref: targetNode.nodeRef || undefined,
    sourceHandle: resolvedSourceHandle as NodeFlowHandle,
    source_handle: resolvedSourceHandle as NodeFlowHandle,
    targetHandle: resolvedTargetHandle as NodeFlowHandle,
    target_handle: resolvedTargetHandle as NodeFlowHandle,
  };
};

const removeNodeFlowLink = (
  deps: NodeFlowBridgeDeps,
  input: RemoveNodeFlowLinkInput
): RemoveNodeFlowLinkResult & Record<string, unknown> => {
  const snapshot = deps.getNodeFlowSnapshot();
  assertExpectedRevision(snapshot.revision, input.expectedRevision);
  if (input.linkKind === "graph") {
    const graphLink = snapshot.graphLinks.find((link) => link.id === input.linkId);
    if (!graphLink) {
      throw new Error("removeNodeFlowLink 找不到指定的 nodeflow graph link。");
    }
    deps.removeGraphLink(graphLink.id);
    return {
      linkId: graphLink.id,
      link_id: graphLink.id,
      linkKind: "graph",
      link_kind: "graph",
      sourceRef: graphLink.sourceRef,
      source_ref: graphLink.sourceRef,
      targetRef: graphLink.targetRef,
      target_ref: graphLink.targetRef,
    };
  }

  const link = snapshot.links.find((item) => item.id === input.linkId);
  if (!link) {
    throw new Error("removeNodeFlowLink 找不到指定的 nodeflow canvas link。");
  }
  const sourceNode = snapshot.nodes.find((node) => node.id === link.source);
  const targetNode = snapshot.nodes.find((node) => node.id === link.target);
  deps.removeLink(link.id);
  return {
    linkId: link.id,
    link_id: link.id,
    linkKind: "canvas",
    link_kind: "canvas",
    sourceNodeId: link.source,
    source_node_id: link.source,
    targetNodeId: link.target,
    target_node_id: link.target,
    sourceRef: sourceNode ? getNodeFlowRef(sourceNode) || undefined : undefined,
    source_ref: sourceNode ? getNodeFlowRef(sourceNode) || undefined : undefined,
    targetRef: targetNode ? getNodeFlowRef(targetNode) || undefined : undefined,
    target_ref: targetNode ? getNodeFlowRef(targetNode) || undefined : undefined,
    sourceHandle: (link.sourceHandle as NodeFlowHandle | null | undefined) ?? null,
    source_handle: (link.sourceHandle as NodeFlowHandle | null | undefined) ?? null,
    targetHandle: (link.targetHandle as NodeFlowHandle | null | undefined) ?? null,
    target_handle: (link.targetHandle as NodeFlowHandle | null | undefined) ?? null,
  };
};

const createTextNode = (
  deps: NodeFlowBridgeDeps,
  input: CreateTextNodeInput
): CreateTextNodeResult => {
  const snapshot = deps.getNodeFlowSnapshot();
  const position = getNodeFlowPlacement(snapshot, input.x, input.y);
  const nodeId = deps.addNode("text", position, input.parentId, { title: input.title, text: input.text });
  return { id: nodeId, title: input.title };
};

const createNodeFlowMap = (
  deps: NodeFlowBridgeDeps,
  input: CreateNodeFlowMapInput
): CreateNodeFlowMapResult => {
  const snapshot = deps.getNodeFlowSnapshot();
  assertExpectedRevision(snapshot.revision, input.expectedRevision);
  const origin = getNodeFlowPlacement(snapshot, input.originX, input.originY);
  return createNodeFlowMapWithBridge(
    {
      ...input,
      originX: origin.x,
      originY: origin.y,
    },
    {
      addNode: deps.addNode,
      updateNodeStyle: deps.updateNodeStyle,
      connectNodes: deps.connectNodes,
      toggleLinkPause: deps.toggleLinkPause,
      removeNode: deps.removeNode,
      removeLink: deps.removeLink,
    }
  );
};

const resolveExecutionApprovalNode = (snapshot: NodeFlowFile, input: { nodeId?: string; nodeRef?: string }) => {
  const resolvedRef = normalizeNodeRef(input.nodeRef);
  return resolvedRef
    ? snapshot.nodes.find((node) => getNodeFlowRef(node) === resolvedRef)
    : snapshot.nodes.find((node) => node.id === input.nodeId);
};

const requestNodeFlowExecutionApproval = (
  deps: NodeFlowBridgeDeps,
  input: { nodeId?: string; nodeRef?: string }
) => {
  const snapshot = deps.getNodeFlowSnapshot();
  const node = resolveExecutionApprovalNode(snapshot, input);
  if (!node) {
    throw new Error("requestNodeFlowExecutionApproval 引用了不存在的节点。");
  }
  if (!inferExecutionApprovalAction(node.type)) {
    throw new Error(`节点 ${node.type} 不是可审批的生成节点。`);
  }
  const proposal = buildNodeFlowExecutionApprovalProposal({
    node,
    connectedInputs: buildConnectedInputs({
      nodeId: node.id,
      nodes: snapshot.nodes,
      links: snapshot.links,
      nodeFlowContext: snapshot.nodeFlowContext,
    }),
  });
  deps.requestExecutionApproval?.(proposal);
  return proposal;
};

const clearNodeFlowExecutionApproval = (
  deps: NodeFlowBridgeDeps,
  input: { nodeId?: string; nodeRef?: string }
) => {
  const snapshot = deps.getNodeFlowSnapshot();
  const node = resolveExecutionApprovalNode(snapshot, input);
  if (!node) {
    throw new Error("clearNodeFlowExecutionApproval 引用了不存在的节点。");
  }
  deps.clearExecutionApproval?.(node.id);
  return { nodeId: node.id };
};

export const createQalamAgentBridge = (deps: NodeFlowBridgeDeps): QalamAgentBridge => ({
  getProjectData: deps.getProjectData,
  getNodeFlowSnapshot: deps.getNodeFlowSnapshot,
  getKnowledgeSnapshot: deps.getKnowledgeSnapshot,
  getPendingNodeFlowExecutionApprovals: () => deps.getPendingExecutionApprovals?.() || [],
  createDerivedKnowledgeNode: (input) => deps.createDerivedKnowledgeNode(input),
  createDerivedKnowledgeLink: (input) => deps.createDerivedKnowledgeLink(input),
  removeDerivedKnowledgeLink: (input) => deps.removeDerivedKnowledgeLink(input),
  supersedeDerivedKnowledgeNode: (input) => deps.supersedeDerivedKnowledgeNode(input),
  updateProjectData: deps.updateProjectData,
  addTextNode: (input) => createTextNode(deps, input),
  createNodeFlowNode: (input) => createNodeFlowNode(deps, input),
  updateNodeFlowNode: (input) => updateNodeFlowNode(deps, input),
  moveNodeFlowNode: (input) => moveNodeFlowNode(deps, input),
  removeNodeFlowNode: (input) => removeNodeFlowNode(deps, input),
  updateNodeFlowNodeData: (nodeId, data) => deps.updateNodeData(nodeId, data as Partial<NodeFlowNodeData>),
  createNodeFlowGraphLink: (input) => createNodeFlowGraphLink(deps, input),
  connectNodeFlowNodes: (input) => connectNodeFlowNodes(deps, input),
  removeNodeFlowLink: (input) => removeNodeFlowLink(deps, input),
  getNodeFlowNode: (input) => lookupNodeFlowNodeInSnapshot(deps.getNodeFlowSnapshot(), input),
  createNodeFlowMap: (input) => createNodeFlowMap(deps, input),
  requestNodeFlowExecutionApproval: (input) => requestNodeFlowExecutionApproval(deps, input),
  clearNodeFlowExecutionApproval: (input) => clearNodeFlowExecutionApproval(deps, input),
  getViewport: () => (deps.getNodeFlowSnapshot().viewport || null) as NodeFlowViewport | null,
  getNodeCount: () => deps.getNodeFlowSnapshot().nodes.length,
});
