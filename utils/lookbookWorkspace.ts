import type { FlowLink, ProjectData } from "../types";
import type {
  ImageInputNodeData,
  LookbookLayout,
  NodeFlowNode,
  NodeFlowNodeData,
  TextNodeData,
} from "../node-workspace/types";
import {
  LOOKBOOK_MEMBERSHIP_RELATION,
  getVisibleLookbookMemberNodes,
} from "./lookbookIdentities";

const COLUMN_COUNT = 12;
const BOARD_MARGIN = 0.04;
const BOARD_GAP = 0.018;
const MIN_ITEM_WIDTH = 0.14;
const MAX_ITEM_WIDTH = 0.72;
const MAX_WORLD_Y = 24;

export type LookbookImageAssetInput = {
  id?: string;
  name: string;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  hasAlpha: boolean;
};

export type LookbookBoardItem = {
  node: NodeFlowNode;
  layout: LookbookLayout;
  aspectRatio: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isLookbookLayout = (value: unknown): value is LookbookLayout => {
  if (!value || typeof value !== "object") return false;
  const layout = value as Partial<LookbookLayout>;
  return isFiniteNumber(layout.x) &&
    isFiniteNumber(layout.y) &&
    isFiniteNumber(layout.width) &&
    isFiniteNumber(layout.height) &&
    isFiniteNumber(layout.rotation) &&
    isFiniteNumber(layout.zIndex) &&
    (layout.fit === "cover" || layout.fit === "contain") &&
    layout.width > 0 &&
    layout.height > 0;
};

export const sanitizeLookbookLayout = (layout: LookbookLayout): LookbookLayout => {
  const width = clamp(layout.width, MIN_ITEM_WIDTH, MAX_ITEM_WIDTH);
  return {
    x: clamp(layout.x, 0, 1 - width),
    y: clamp(layout.y, 0, MAX_WORLD_Y),
    width,
    height: clamp(layout.height, 0.1, 1.2),
    rotation: clamp(layout.rotation, -6, 6),
    zIndex: Math.max(1, Math.round(layout.zIndex)),
    fit: layout.fit,
  };
};

const layoutsEqual = (left: LookbookLayout, right: LookbookLayout) =>
  left.x === right.x && left.y === right.y && left.width === right.width &&
  left.height === right.height && left.rotation === right.rotation &&
  left.zIndex === right.zIndex && left.fit === right.fit;

const readDimensions = (node: NodeFlowNode) => {
  const dimensions = node.data?.dimensions;
  if (!dimensions || typeof dimensions !== "object") return null;
  const width = (dimensions as { width?: unknown }).width;
  const height = (dimensions as { height?: unknown }).height;
  if (!isFiniteNumber(width) || !isFiniteNumber(height) || width <= 0 || height <= 0) return null;
  return { width, height };
};

export const getLookbookNodeAspectRatio = (node: NodeFlowNode) => {
  const dimensions = readDimensions(node);
  if (dimensions) return clamp(dimensions.width / dimensions.height, 0.28, 3.4);
  if (node.type === "videoInput") return 16 / 9;
  if (node.type === "audioInput") return 1.8;
  return node.type === "imageInput" ? 4 / 5 : 1.32;
};

const getColumnSpan = (node: NodeFlowNode, aspectRatio: number) => {
  if (node.type === "videoInput") return 6;
  if (node.type === "audioInput") return 4;
  if (node.type === "mdText" || node.type === "text") return 4;
  if (aspectRatio >= 1.48) return 6;
  if (aspectRatio <= 0.78) return 3;
  return 4;
};

const getLayoutHeight = (node: NodeFlowNode, width: number, aspectRatio: number) => {
  if (node.type === "mdText" || node.type === "text") return width * 0.76;
  if (node.type === "audioInput") return width * 0.58;
  return clamp(width / aspectRatio, 0.14, 0.58);
};

const prefersContain = (node: NodeFlowNode) =>
  node.type === "imageInput" && (node.data as ImageInputNodeData).hasAlpha === true;

export const buildAdaptiveLookbookLayouts = (
  nodes: NodeFlowNode[],
  startY = BOARD_MARGIN
): Map<string, LookbookLayout> => {
  const columnWidth = (1 - BOARD_MARGIN * 2 - BOARD_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT;
  const skyline = Array<number>(COLUMN_COUNT).fill(Math.max(BOARD_MARGIN, startY));
  const layouts = new Map<string, LookbookLayout>();

  nodes.forEach((node, index) => {
    const aspectRatio = getLookbookNodeAspectRatio(node);
    const span = getColumnSpan(node, aspectRatio);
    let selectedColumn = 0;
    let selectedY = Number.POSITIVE_INFINITY;

    for (let column = 0; column <= COLUMN_COUNT - span; column += 1) {
      const candidateY = Math.max(...skyline.slice(column, column + span));
      if (candidateY < selectedY) {
        selectedColumn = column;
        selectedY = candidateY;
      }
    }

    const width = columnWidth * span + BOARD_GAP * (span - 1);
    const height = getLayoutHeight(node, width, aspectRatio);
    const layout = sanitizeLookbookLayout({
      x: nodes.length === 1
        ? (1 - width) / 2
        : BOARD_MARGIN + selectedColumn * (columnWidth + BOARD_GAP),
      y: selectedY,
      width,
      height,
      rotation: index % 4 === 1 ? -0.35 : index % 4 === 3 ? 0.35 : 0,
      zIndex: index + 1,
      fit: prefersContain(node) ? "contain" : "cover",
    });
    layouts.set(node.id, layout);
    const nextY = layout.y + layout.height + BOARD_GAP;
    for (let column = selectedColumn; column < selectedColumn + span; column += 1) skyline[column] = nextY;
  });

  return layouts;
};

export const projectLookbookBoardItems = (
  projectData: ProjectData,
  identityNodeId: string
): LookbookBoardItem[] => {
  const nodes = getVisibleLookbookMemberNodes(projectData, identityNodeId);
  const storedLayouts = new Map<string, LookbookLayout>();
  let projectedStartY = BOARD_MARGIN;

  nodes.forEach((node) => {
    if (!isLookbookLayout(node.data?.lookbookLayout)) return;
    const layout = sanitizeLookbookLayout(node.data.lookbookLayout);
    storedLayouts.set(node.id, layout);
    projectedStartY = Math.max(projectedStartY, layout.y + layout.height + BOARD_GAP);
  });

  const missingNodes = nodes.filter((node) => !storedLayouts.has(node.id));
  const projectedLayouts = buildAdaptiveLookbookLayouts(
    missingNodes,
    storedLayouts.size ? projectedStartY : BOARD_MARGIN
  );

  return nodes.map((node) => ({
    node,
    layout: storedLayouts.get(node.id) || projectedLayouts.get(node.id)!,
    aspectRatio: getLookbookNodeAspectRatio(node),
  }));
};

const makeMembershipLink = (
  identityNodeId: string,
  memberNodeId: string,
  memberType: NodeFlowNode["type"]
): FlowLink => {
  const mediaHandle = memberType === "imageInput"
    ? "image"
    : memberType === "audioInput"
      ? "audio"
      : memberType === "videoInput"
        ? "video"
        : null;
  return mediaHandle
    ? {
        id: `link-${memberNodeId}-${identityNodeId}-lookbook`,
        source: memberNodeId,
        target: identityNodeId,
        sourceHandle: mediaHandle,
        targetHandle: mediaHandle,
        data: { relation: LOOKBOOK_MEMBERSHIP_RELATION },
      }
    : {
        id: `link-${identityNodeId}-${memberNodeId}-lookbook`,
        source: identityNodeId,
        target: memberNodeId,
        sourceHandle: "text",
        targetHandle: "text",
        data: { relation: LOOKBOOK_MEMBERSHIP_RELATION },
      };
};

const reserveNodeId = (nodes: NodeFlowNode[], requested: string) => {
  const ids = new Set(nodes.map((node) => node.id));
  if (!ids.has(requested)) return requested;
  let suffix = 2;
  while (ids.has(`${requested}-${suffix}`)) suffix += 1;
  return `${requested}-${suffix}`;
};

const flowPositionForMember = (identityNode: NodeFlowNode, index: number) => ({
  x: identityNode.position.x + 340 + (index % 3) * 310,
  y: identityNode.position.y + 360 + Math.floor(index / 3) * 300,
});

export const addLookbookImageAssets = (
  projectData: ProjectData,
  identityNodeId: string,
  assets: LookbookImageAssetInput[],
  now = Date.now()
): ProjectData => {
  if (!assets.length) return projectData;
  const flow = projectData.flow || { links: [] };
  const nodes = [...(flow.flowNodes || [])];
  const identityNode = nodes.find((node) => node.id === identityNodeId && node.type === "identityCard");
  if (!identityNode) return projectData;

  const existingMembers = projectLookbookBoardItems(projectData, identityNodeId);
  const startY = existingMembers.reduce(
    (bottom, item) => Math.max(bottom, item.layout.y + item.layout.height + BOARD_GAP),
    BOARD_MARGIN
  );
  const reservedNodes = [...nodes];
  const provisionalNodes = assets.map((asset, index): NodeFlowNode => {
    const id = reserveNodeId(reservedNodes, asset.id || `lookbook-image-${now.toString(36)}-${index + 1}`);
    const node: NodeFlowNode = {
      id,
      type: "imageInput",
      position: flowPositionForMember(identityNode, existingMembers.length + index),
      style: {
        width: 260,
        height: clamp(260 / Math.max(0.35, asset.width / asset.height), 180, 420),
      },
      data: {
        image: asset.dataUrl,
        filename: asset.name,
        label: asset.name.replace(/\.[^/.]+$/, ""),
        mimeType: asset.mimeType,
        dimensions: { width: asset.width, height: asset.height },
        hasAlpha: asset.hasAlpha,
        lookbookIdentityId: identityNode.data.identityId as string | undefined,
        lookbookRole: "member",
        assetAuditStatus: "idle",
        assetAuditMessage: null,
        assetAuditCheckedAt: null,
        assetId: null,
        assetUri: null,
        assetGroupId: null,
        assetSourceUrl: null,
      } as ImageInputNodeData,
    };
    reservedNodes.push(node);
    return node;
  });
  const layouts = buildAdaptiveLookbookLayouts(provisionalNodes, startY);
  const createdNodes = provisionalNodes.map((node) => ({
    ...node,
    data: { ...node.data, lookbookLayout: layouts.get(node.id) } as NodeFlowNodeData,
  }));
  const nextLinks = [...flow.links];
  createdNodes.forEach((node) => {
    const link = makeMembershipLink(identityNodeId, node.id, node.type);
    if (!nextLinks.some((existing) => existing.id === link.id)) nextLinks.push(link);
  });

  return {
    ...projectData,
    flow: {
      ...flow,
      revision: (flow.revision || 0) + 1,
      flowNodes: [...nodes, ...createdNodes],
      links: nextLinks,
    },
  };
};

export const addLookbookTextCard = (
  projectData: ProjectData,
  identityNodeId: string,
  now = Date.now(),
  requestedNodeId?: string
): { projectData: ProjectData; nodeId: string | null } => {
  const flow = projectData.flow || { links: [] };
  const nodes = [...(flow.flowNodes || [])];
  const identityNode = nodes.find((node) => node.id === identityNodeId && node.type === "identityCard");
  if (!identityNode) return { projectData, nodeId: null };

  const members = projectLookbookBoardItems(projectData, identityNodeId);
  const nodeId = reserveNodeId(nodes, requestedNodeId || `lookbook-note-${now.toString(36)}`);
  const provisionalNode: NodeFlowNode = {
    id: nodeId,
    type: "text",
    position: flowPositionForMember(identityNode, members.length),
    style: { width: 280, height: 220 },
    data: {
      title: "视觉笔记",
      text: "",
      documentId: nodeId,
      documentKind: "note",
      format: "markdown",
      lookbookIdentityId: identityNode.data.identityId as string | undefined,
      lookbookRole: "member",
    } as TextNodeData,
  };
  const startY = members.reduce(
    (bottom, item) => Math.max(bottom, item.layout.y + item.layout.height + BOARD_GAP),
    BOARD_MARGIN
  );
  const layout = buildAdaptiveLookbookLayouts([provisionalNode], startY).get(nodeId)!;
  const createdNode = {
    ...provisionalNode,
    data: { ...provisionalNode.data, lookbookLayout: layout } as NodeFlowNodeData,
  };
  const link = makeMembershipLink(identityNodeId, nodeId, createdNode.type);
  return {
    nodeId,
    projectData: {
      ...projectData,
      flow: {
        ...flow,
        revision: (flow.revision || 0) + 1,
        flowNodes: [...nodes, createdNode],
        links: [...flow.links.filter((item) => item.id !== link.id), link],
      },
    },
  };
};

const updateLookbookNode = (
  projectData: ProjectData,
  nodeId: string,
  update: (node: NodeFlowNode) => NodeFlowNode
) => {
  const flow = projectData.flow;
  if (!flow?.flowNodes) return projectData;
  let didUpdate = false;
  const flowNodes = flow.flowNodes.map((node) => {
    if (node.id !== nodeId) return node;
    const nextNode = update(node);
    if (nextNode !== node) didUpdate = true;
    return nextNode;
  });
  if (!didUpdate) return projectData;
  return {
    ...projectData,
    flow: {
      ...flow,
      revision: (flow.revision || 0) + 1,
      flowNodes,
    },
  };
};

export const updateLookbookNodeLayout = (
  projectData: ProjectData,
  nodeId: string,
  layout: LookbookLayout
) => {
  const sanitized = sanitizeLookbookLayout(layout);
  return updateLookbookNode(projectData, nodeId, (node) => {
    const current = node.data?.lookbookLayout;
    if (isLookbookLayout(current) && layoutsEqual(sanitizeLookbookLayout(current), sanitized)) return node;
    return {
      ...node,
      data: { ...node.data, lookbookLayout: sanitized } as NodeFlowNodeData,
    };
  });
};

export const updateLookbookTextCard = (
  projectData: ProjectData,
  nodeId: string,
  patch: { title?: string; text?: string }
) => updateLookbookNode(projectData, nodeId, (node) => {
  const titleUnchanged = patch.title === undefined || patch.title === node.data.title;
  const textUnchanged = patch.text === undefined || patch.text === node.data.text;
  if (titleUnchanged && textUnchanged) return node;
  return {
    ...node,
    data: {
      ...node.data,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.text !== undefined ? { text: patch.text } : {}),
    } as NodeFlowNodeData,
  };
});

export const reflowLookbookLayouts = (
  projectData: ProjectData,
  identityNodeId: string
): ProjectData => {
  const flow = projectData.flow;
  if (!flow?.flowNodes) return projectData;
  const members = getVisibleLookbookMemberNodes(projectData, identityNodeId);
  if (!members.length) return projectData;
  const layouts = buildAdaptiveLookbookLayouts(members);
  const memberIds = new Set(members.map((node) => node.id));
  return {
    ...projectData,
    flow: {
      ...flow,
      revision: (flow.revision || 0) + 1,
      flowNodes: flow.flowNodes.map((node) => memberIds.has(node.id)
        ? { ...node, data: { ...node.data, lookbookLayout: layouts.get(node.id) } as NodeFlowNodeData }
        : node),
    },
  };
};

export const getLookbookWorldHeight = (items: LookbookBoardItem[]) =>
  Math.max(0.72, ...items.map((item) => item.layout.y + item.layout.height + BOARD_MARGIN));
