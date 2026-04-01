import type {
  NodeFlowLink,
  NodeFlowFile,
  NodeFlowNode,
} from "../types";
import { getNodeHandles } from "../utils/handles";

export type NodeFlowNodeRecord = {
  id: string;
  ref: string;
  kind: string;
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

export const getNodeFlowNodeRef = (node: NodeFlowNode) => trimString(getNodeData(node).qalamNodeRef) || node.id;

export const getNodeFlowNodeTitle = (node: NodeFlowNode) => {
  const data = getNodeData(node);
  return (
    trimString(data.title) ||
    trimString(data.label) ||
    trimString(data.shotId) ||
    trimString(data.filename) ||
    node.id
  );
};

const summarizeNodeBody = (node: NodeFlowNode): Record<string, unknown> => {
  const data = getNodeData(node);

  switch (node.type) {
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
    case "annotation":
      return {
        sourceImage: data.sourceImage ?? null,
        outputImage: data.outputImage ?? null,
        annotationCount: Array.isArray(data.annotations) ? data.annotations.length : 0,
      };
    case "group":
      return {
        description: trimString(data.description) || "",
        isExpanded: Boolean(data.isExpanded),
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
    case "wanVideoGen":
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
    selected: Boolean(node.selected),
    width: typeof node.style?.width === "number" ? node.style.width : node.style?.width ?? null,
    height: typeof node.style?.height === "number" ? node.style.height : node.style?.height ?? null,
    hasViewBinding: Boolean(trimString(data.view)),
  };
};

export const toNodeFlowNodeRecord = (node: NodeFlowNode): NodeFlowNodeRecord => {
  const handles = getNodeHandles(node.type);
  return {
    id: node.id,
    ref: getNodeFlowNodeRef(node),
    kind: node.type,
    title: getNodeFlowNodeTitle(node),
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
    nodes: workflow.nodes.map(toNodeFlowNodeRecord),
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

export const buildNodeFlowSearchText = (node: NodeFlowNode) => {
  const record = toNodeFlowNodeRecord(node);
  return [
    record.id,
    record.ref,
    record.kind,
    record.title,
    JSON.stringify(record.body),
  ]
    .filter(Boolean)
    .join(" ");
};
