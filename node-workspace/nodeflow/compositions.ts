import { buildNodeFlowLinkId } from "./links";
import { appendNodesAndLinksToNodeFlow } from "./mutations";
import { getNodeFlowAbsolutePosition, getNodeFlowNodeDimensions, normalizeNodeFlowData, normalizeNodeFlowGroupBindings } from "./state";
import type {
  GroupNodeData,
  NodeFlowFile,
  NodeFlowLink,
  NodeFlowNode,
  NodeFlowNodeData,
  NodeFlowTemplate,
} from "../types";
import { buildNodeFlowFile } from "./serialization";

type NodeFlowLinkStyle = "angular" | "curved";

type BuildTemplateFromGroupInput = {
  groupId: string;
  revision: number;
  nodes: NodeFlowNode[];
  links: NodeFlowLink[];
  linkStyle: NodeFlowLinkStyle;
  name?: string;
};

export const buildTemplateFromGroup = ({
  groupId,
  revision,
  nodes,
  links,
  linkStyle,
  name,
}: BuildTemplateFromGroupInput): NodeFlowTemplate | null => {
  const groupNode = nodes.find((node) => node.id === groupId && node.type === "group");
  if (!groupNode) return null;
  const childNodes = nodes.filter((node) => node.parentId === groupId);
  const templateNodes = [groupNode, ...childNodes].map((node) => ({
    ...node,
    position: node.id === groupId ? { x: 0, y: 0 } : node.position,
    selected: false,
  }));
  const nodeIds = new Set(templateNodes.map((node) => node.id));
  const templateLinks = links
    .filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target))
    .map((link) => ({ ...link }));
  const nodeFlow = buildNodeFlowFile({
    revision,
    name: name || String(groupNode.data?.title || "Group Template"),
    nodes: templateNodes,
    links: templateLinks,
    linkStyle,
  });
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: nodeFlow.name,
    createdAt: Date.now(),
    nodeFlow,
  };
};

type ApplyTemplateToNodeFlowInput = {
  template: NodeFlowTemplate;
  offset: { x: number; y: number };
  activeView?: string | null;
  state: {
    revision: number;
    nodes: NodeFlowNode[];
    links: NodeFlowLink[];
  };
  allocateNodeId: (nodeType: NodeFlowNode["type"]) => string;
};

export const applyTemplateToNodeFlow = ({
  template,
  offset,
  activeView,
  state,
  allocateNodeId,
}: ApplyTemplateToNodeFlowInput) => {
  const normalizedTemplate = normalizeNodeFlowData(template.nodeFlow);
  const idMapping = new Map<string, string>();
  normalizedTemplate.nodes.forEach((node) => {
    idMapping.set(node.id, allocateNodeId(node.type));
  });

  const appendedNodes: NodeFlowNode[] = normalizedTemplate.nodes.map((node) => {
    const parentId = node.parentId ? idMapping.get(node.parentId) : undefined;
    const position = parentId
      ? node.position
      : { x: node.position.x + offset.x, y: node.position.y + offset.y };
    const newData = { ...node.data } as NodeFlowNodeData & { view?: string };
    if (activeView) newData.view = activeView;
    return {
      ...node,
      id: idMapping.get(node.id)!,
      position,
      parentId,
      extent: parentId ? "parent" : undefined,
      selected: true,
      data: newData,
    };
  });

  const appendedLinks: NodeFlowLink[] = normalizedTemplate.links.map((link) => ({
    ...link,
    id: buildNodeFlowLinkId(
      idMapping.get(link.source)!,
      idMapping.get(link.target)!,
      link.sourceHandle,
      link.targetHandle
    ),
    source: idMapping.get(link.source)!,
    target: idMapping.get(link.target)!,
  }));

  const deselectedNodes = state.nodes.map((node) => ({ ...node, selected: false }));
  return appendNodesAndLinksToNodeFlow(
    {
      ...state,
      nodes: deselectedNodes,
    },
    appendedNodes,
    appendedLinks
  );
};

type BuildViduReferenceDemoInput = {
  offset: { x: number; y: number };
  activeView?: string | null;
  state: {
    revision: number;
    nodes: NodeFlowNode[];
    links: NodeFlowLink[];
  };
  allocateNodeId: (nodeType: NodeFlowNode["type"]) => string;
};

export const buildViduReferenceDemoState = ({
  offset,
  activeView,
  state,
  allocateNodeId,
}: BuildViduReferenceDemoInput) => {
  const deselectedNodes = state.nodes.map((n) => ({ ...n, selected: false }));
  const groupId = allocateNodeId("group");
  const groupNode: NodeFlowNode = {
    id: groupId,
    type: "group",
    position: offset,
    data: {
      title: "Vidu 参考生视频演示",
      description: "音视频直出默认启用，1080p，错峰开启，示例含 3 主体与场景参考。",
      view: activeView || undefined,
    } as GroupNodeData,
    style: { width: 1100, height: 900 },
  };

  const promptText = "@Chef 和 @Guest 在一起吃火锅，并且旁白音说火锅大家都爱吃。";
  const textNodeId = allocateNodeId("text");
  const textNode: NodeFlowNode = {
    id: textNodeId,
    type: "text",
    position: { x: 80, y: 120 },
    parentId: groupId,
    extent: "parent",
    data: {
      title: "参考提示词",
      text: promptText,
      atMentions: [
        { name: "Chef", status: "match" },
        { name: "Guest", status: "match" },
        { name: "Narrator", status: "missing" },
      ],
      view: activeView || undefined,
    } as any,
  };

  const imageUrls = [
    { url: "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png", identityTag: "chef_normal" },
    { url: "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-2.png", identityTag: "chef_normal" },
    { url: "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-3.png", identityTag: "chef_normal" },
    { url: "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/startend2video-1.jpeg", identityTag: "guest_normal" },
    { url: "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/startend2video-2.jpeg", identityTag: "guest_normal" },
    { url: "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/scene-template/hug.jpeg", identityTag: "narrator_normal" },
    { url: "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/image2video.png", identityTag: "chef_normal" },
  ];

  const imageNodes: NodeFlowNode[] = imageUrls.map((img, idx) => ({
    id: allocateNodeId("imageInput"),
    type: "imageInput",
    position: { x: 80 + (idx % 3) * 180, y: 260 + Math.floor(idx / 3) * 180 },
    parentId: groupId,
    extent: "parent",
    data: {
      image: img.url,
      filename: `ref-${idx + 1}.png`,
      dimensions: null,
      identityTag: img.identityTag,
      view: activeView || undefined,
    } as any,
  }));

  const viduNodeId = allocateNodeId("viduVideoGen");
  const viduNode: NodeFlowNode = {
    id: viduNodeId,
    type: "viduVideoGen",
    position: { x: 620, y: 260 },
    parentId: groupId,
    extent: "parent",
    data: {
      title: "Vidu 参考生视频",
      mode: "subject",
      aspectRatio: "16:9",
      resolution: "720p",
      duration: 5,
      audioEnabled: true,
      offPeak: false,
      watermark: false,
      bgm: false,
      model: "viduq3",
      subjects: [],
      status: "idle",
      error: null,
      authProbeStatus: "idle",
      authProbeSummary: null,
      authProbeDetail: null,
      inputImages: imageUrls.map((i) => i.url),
      view: activeView || undefined,
    } as any,
    style: { width: 360 },
  };

  const newLinks: NodeFlowLink[] = [
    {
      id: buildNodeFlowLinkId(textNode.id, viduNode.id, undefined, "text"),
      source: textNode.id,
      target: viduNode.id,
      targetHandle: "text",
    },
    ...imageNodes.map((img) => ({
      id: buildNodeFlowLinkId(img.id, viduNode.id, undefined, "image"),
      source: img.id,
      target: viduNode.id,
      targetHandle: "image",
    })),
  ];

  return appendNodesAndLinksToNodeFlow(
    {
      ...state,
      nodes: deselectedNodes,
    },
    [groupNode, textNode, ...imageNodes, viduNode],
    newLinks
  );
};

type CreateGroupFromSelectionInput = {
  state: {
    revision: number;
    nodes: NodeFlowNode[];
    links: NodeFlowLink[];
  };
  allocateNodeId: (nodeType: NodeFlowNode["type"]) => string;
};

export const createGroupFromSelectionState = ({
  state,
  allocateNodeId,
}: CreateGroupFromSelectionInput): { ok: true; state: typeof state } | { ok: false; error: string } => {
  const selectedNodes = state.nodes.filter((node) => node.selected && node.type !== "group");
  if (selectedNodes.length === 0) {
    return { ok: false, error: "未选中可分组的节点。" };
  }

  const nodeMap = new Map(state.nodes.map((node) => [node.id, node]));
  const bounds = selectedNodes.reduce(
    (acc, node) => {
      const abs = getNodeFlowAbsolutePosition(node, nodeMap);
      const size = getNodeFlowNodeDimensions(node);
      return {
        minX: Math.min(acc.minX, abs.x),
        minY: Math.min(acc.minY, abs.y),
        maxX: Math.max(acc.maxX, abs.x + size.width),
        maxY: Math.max(acc.maxY, abs.y + size.height),
      };
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );

  const paddingX = 80;
  const paddingY = 100;
  const groupPosition = { x: bounds.minX - paddingX, y: bounds.minY - paddingY };
  const groupSize = {
    width: bounds.maxX - bounds.minX + paddingX * 2,
    height: bounds.maxY - bounds.minY + paddingY * 2,
  };

  const groupId = allocateNodeId("group");
  const groupNode: NodeFlowNode = {
    id: groupId,
    type: "group",
    position: groupPosition,
    data: { title: "New Group" } as GroupNodeData,
    style: { width: groupSize.width, height: groupSize.height },
    selected: true,
  };

  const selectedIds = new Set(selectedNodes.map((node) => node.id));
  const nextNodes = state.nodes.map((node) => {
    if (!selectedIds.has(node.id)) {
      return { ...node, selected: false };
    }
    const abs = getNodeFlowAbsolutePosition(node, nodeMap);
    return {
      ...node,
      parentId: groupId,
      extent: "parent" as const,
      position: { x: abs.x - groupPosition.x, y: abs.y - groupPosition.y },
      selected: true,
    };
  });

  return {
    ok: true,
    state: {
      ...state,
      revision: state.revision + 1,
      nodes: normalizeNodeFlowGroupBindings([...nextNodes, groupNode], state.links),
    },
  };
};
