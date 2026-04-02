import type {
  KnowledgeNodeData,
  NodeFlowContextSnapshot,
  NodeFlowLink,
  NodeFlowFile,
  NodeFlowNode,
} from "../types";
import { getNodeHandles } from "../utils/handles";
import { resolveNodeFlowNodeStatus, resolveNodeFlowNodeTitle } from "./titles";

export type NodeFlowNodeRecord = {
  id: string;
  ref: string;
  kind: string;
  plane: "source" | "semantic" | "design" | "execution";
  assetType: string;
  title?: string;
  body: Record<string, unknown>;
  meta: Record<string, unknown>;
  inputs: string[];
  outputs: string[];
  x: number;
  y: number;
  parentId?: string | null;
};

export type NodeFlowLinkRecord = {
  id: string;
  fromNodeId: string;
  fromPort?: string | null;
  toNodeId: string;
  toPort?: string | null;
  paused: boolean;
};

export type NodeFlowMapView = {
  name: string;
  revision: number;
  nodes: NodeFlowNodeRecord[];
  links: NodeFlowLinkRecord[];
  viewport: NodeFlowFile["viewport"] | null;
  activeView: string | null;
};

const trimString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const getNodeData = (node: NodeFlowNode) => (node.data || {}) as Record<string, unknown>;
const getKnowledgeNodeData = (node: NodeFlowNode) => getNodeData(node) as KnowledgeNodeData;

export const getNodeFlowNodeRef = (node: NodeFlowNode) => trimString(getNodeData(node).qalamNodeRef) || node.id;

export const getNodeFlowNodePlane = (node: NodeFlowNode): NodeFlowNodeRecord["plane"] => {
  if (node.type !== "knowledge") return "execution";
  return getKnowledgeNodeData(node).plane || "semantic";
};

export const getNodeFlowNodeAssetType = (node: NodeFlowNode) => {
  if (node.type !== "knowledge") return `execution.${node.type}`;
  return trimString(getKnowledgeNodeData(node).assetType) || `semantic.${node.type}`;
};

export const getNodeFlowNodeTitle = (node: NodeFlowNode, context?: NodeFlowContextSnapshot) =>
  resolveNodeFlowNodeTitle(node, context);

const summarizeNodeBody = (node: NodeFlowNode): Record<string, unknown> => {
  const data = getNodeData(node);

  switch (node.type) {
    case "knowledge":
      return {
        content: trimString(data.content) || "",
        summary: trimString(data.summary) || null,
        tags: Array.isArray(data.tags) ? data.tags.slice(0, 12) : [],
        sourceRefs: Array.isArray(data.sourceRefs) ? data.sourceRefs.slice(0, 12) : [],
        fields: data.fields ?? {},
      };
    case "text":
      return {
        text: trimString(data.text) || "",
      };
    case "scriptBoard":
      return {
        episodeId: data.episodeId ?? null,
        sceneId: data.sceneId ?? null,
      };
    case "storyboardBoard":
      return {
        episodeId: data.episodeId ?? null,
        sceneId: data.sceneId ?? null,
        displayMode: data.displayMode ?? null,
      };
    case "identityCard":
      return {
        identityId: data.identityId ?? null,
      };
    case "imageInput":
      return {
        filename: data.filename ?? null,
        image: data.image ?? null,
        dimensions: data.dimensions ?? null,
        identityId: data.identityId ?? null,
        identityTag: data.identityTag ?? null,
      };
    case "audioInput":
      return {
        filename: data.filename ?? null,
        audio: data.audio ?? null,
        durationMs: data.durationMs ?? null,
      };
    case "videoInput":
      return {
        filename: data.filename ?? null,
        video: data.video ?? null,
        durationMs: data.durationMs ?? null,
        dimensions: data.dimensions ?? null,
        aspectRatio: data.aspectRatio ?? null,
        resolution: data.resolution ?? null,
        model: data.model ?? null,
      };
    case "annotation":
      return {
        sourceImage: data.sourceImage ?? null,
        outputImage: data.outputImage ?? null,
        annotationCount: Array.isArray(data.annotations) ? data.annotations.length : 0,
      };
    case "shot":
      return {
        shotId: data.shotId ?? null,
        duration: data.duration ?? "",
        shotType: data.shotType ?? "",
        focalLength: data.focalLength ?? "",
        movement: data.movement ?? "",
        composition: data.composition ?? "",
        blocking: data.blocking ?? "",
        dialogue: data.dialogue ?? "",
        sound: data.sound ?? "",
        soraPrompt: data.soraPrompt ?? "",
        storyboardPrompt: data.storyboardPrompt ?? "",
      };
    case "imageGen":
    case "nanoBananaImageGen":
    case "wanImageGen":
      return {
        inputImages: Array.isArray(data.inputImages) ? data.inputImages.length : 0,
        outputImage: data.outputImage ?? null,
        model: data.model ?? null,
        aspectRatio: data.aspectRatio ?? null,
        status: data.status ?? null,
        error: data.error ?? null,
        identityId: data.identityId ?? null,
        identityTag: data.identityTag ?? null,
      };
    case "soraVideoGen":
    case "wanReferenceVideoGen":
    case "viduVideoGen":
    case "seedanceVideoGen":
      return {
        inputImages: Array.isArray(data.inputImages) ? data.inputImages.length : 0,
        referenceImages: Array.isArray(data.referenceImages) ? data.referenceImages.length : 0,
        referenceVideos: Array.isArray(data.referenceVideos) ? data.referenceVideos.length : 0,
        referenceAudios: Array.isArray(data.referenceAudios) ? data.referenceAudios.length : 0,
        model: data.model ?? null,
        aspectRatio: data.aspectRatio ?? data.ratio ?? null,
        duration: data.duration ?? null,
        status: data.status ?? null,
        error: data.error ?? null,
        videoUrl: data.videoUrl ?? null,
      };
    default:
      return Object.fromEntries(
        Object.entries(data).filter(([key]) => key !== "qalamNodeRef" && key !== "title" && key !== "label")
      );
  }
};

const summarizeNodeMeta = (node: NodeFlowNode): Record<string, unknown> => {
  const data = getNodeData(node);
  return {
    plane: getNodeFlowNodePlane(node),
    assetType: getNodeFlowNodeAssetType(node),
    status: resolveNodeFlowNodeStatus(node),
    selected: Boolean(node.selected),
    width: typeof node.style?.width === "number" ? node.style.width : node.style?.width ?? null,
    height: typeof node.style?.height === "number" ? node.style.height : node.style?.height ?? null,
    hasViewBinding: Boolean(trimString(data.view)),
  };
};

export const toNodeFlowNodeRecord = (
  node: NodeFlowNode,
  context?: NodeFlowContextSnapshot
): NodeFlowNodeRecord => {
  const handles = getNodeHandles(node.type);
  return {
    id: node.id,
    ref: getNodeFlowNodeRef(node),
    kind: node.type,
    plane: getNodeFlowNodePlane(node),
    assetType: getNodeFlowNodeAssetType(node),
    title: getNodeFlowNodeTitle(node, context),
    body: summarizeNodeBody(node),
    meta: summarizeNodeMeta(node),
    inputs: handles.inputs,
    outputs: handles.outputs,
    x: node.position?.x ?? 0,
    y: node.position?.y ?? 0,
    parentId: node.parentId ?? null,
  };
};

export const toNodeFlowLinkRecord = (edge: NodeFlowLink): NodeFlowLinkRecord => {
  return {
    id: edge.id,
    fromNodeId: edge.source,
    fromPort: edge.sourceHandle ?? null,
    toNodeId: edge.target,
    toPort: edge.targetHandle ?? null,
    paused: Boolean(edge.data?.hasPause),
  };
};

export const toNodeFlowMapView = (workflow: NodeFlowFile): NodeFlowMapView => {
  return {
    name: workflow.name,
    revision: workflow.revision,
    nodes: workflow.nodes.map((node) => toNodeFlowNodeRecord(node, workflow.nodeFlowContext)),
    links: workflow.links.map(toNodeFlowLinkRecord),
    viewport: workflow.viewport ?? null,
    activeView: workflow.activeView ?? null,
  };
};

export const findNodeFlowNode = (workflow: NodeFlowFile, args: { nodeId?: string; nodeRef?: string }) => {
  if (args.nodeRef) {
    return workflow.nodes.find((node) => getNodeFlowNodeRef(node) === args.nodeRef);
  }
  if (args.nodeId) {
    return workflow.nodes.find((node) => node.id === args.nodeId);
  }
  return undefined;
};

export const getNodeFlowLinksForNode = (workflow: NodeFlowFile, nodeId: string) => {
  return workflow.links
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .map((edge) => ({
      ...toNodeFlowLinkRecord(edge),
      direction: edge.source === nodeId ? "outgoing" : "incoming",
    }));
};

export const getNodeFlowLinkRelationsForNode = (workflow: NodeFlowFile, nodeId: string) => {
  const nodeMap = new Map(workflow.nodes.map((node) => [node.id, node]));
  const rawLinks = getNodeFlowLinksForNode(workflow, nodeId);

  const toRelatedNode = (relatedNodeId: string) => {
    const related = nodeMap.get(relatedNodeId);
    if (!related) {
      return {
        nodeId: relatedNodeId,
        nodeRef: relatedNodeId,
        nodeTitle: relatedNodeId,
      };
    }
    return {
      nodeId: related.id,
      nodeRef: getNodeFlowNodeRef(related),
      nodeTitle: getNodeFlowNodeTitle(related, workflow.nodeFlowContext),
    };
  };

  const incomingLinks = rawLinks
    .filter((link) => link.direction === "incoming")
    .map((link) => {
      const related = toRelatedNode(link.fromNodeId);
      return {
        linkId: link.id,
        fromNodeId: related.nodeId,
        fromRef: related.nodeRef,
        fromTitle: related.nodeTitle,
        fromPort: link.fromPort ?? null,
        toPort: link.toPort ?? null,
        paused: link.paused,
      };
    });

  const outgoingLinks = rawLinks
    .filter((link) => link.direction === "outgoing")
    .map((link) => {
      const related = toRelatedNode(link.toNodeId);
      return {
        linkId: link.id,
        toNodeId: related.nodeId,
        toRef: related.nodeRef,
        toTitle: related.nodeTitle,
        fromPort: link.fromPort ?? null,
        toPort: link.toPort ?? null,
        paused: link.paused,
      };
    });

  return { incomingLinks, outgoingLinks };
};

export const buildNodeFlowSearchText = (node: NodeFlowNode) => {
  const record = toNodeFlowNodeRecord(node);
  return [
    record.id,
    record.ref,
    record.kind,
    record.plane,
    record.assetType,
    record.title,
    JSON.stringify(record.body),
  ]
    .filter(Boolean)
    .join(" ");
};
