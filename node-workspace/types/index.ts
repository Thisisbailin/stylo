import { Node, Edge } from "@xyflow/react";
import { DesignAssetItem, Episode, ProjectContext, SeedanceModel, ViduReferenceMode } from "../../types";

export type HandleType = "image" | "text" | "audio" | "multi";

export type NodeType =
  | "imageInput"
  | "audioInput"
  | "annotation"
  | "text"
  | "scriptBoard"
  | "storyboardBoard"
  | "identityCard"
  | "imageGen"
  | "nanoBananaImageGen"
  | "wanImageGen"
  | "soraVideoGen"
  | "wanVideoGen"
  | "wanReferenceVideoGen"
  | "viduVideoGen"
  | "seedanceVideoGen"
  | "group"
  | "shot";

export type NodeStatus = "idle" | "loading" | "complete" | "error";

export interface BaseNodeData extends Record<string, unknown> {
  label?: string;
  title?: string;
  qalamNodeRef?: string;
}

export interface ImageInputNodeData extends BaseNodeData {
  image: string | null;
  filename: string | null;
  dimensions: { width: number; height: number } | null;
  identityTag?: string;
  identityId?: string;
  label?: string;
  atMentions?: TextNodeData['atMentions'];
  entityBindings?: EntityBinding[];
}

export interface AudioInputNodeData extends BaseNodeData {
  audio: string | null;
  filename: string | null;
  mimeType?: string | null;
  durationMs?: number | null;
  label?: string;
}

export type ShapeType = "rectangle" | "circle" | "arrow" | "freehand" | "text";

export interface BaseShape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

export interface RectangleShape extends BaseShape {
  type: "rectangle";
  width: number;
  height: number;
  fill: string | null;
}

export interface CircleShape extends BaseShape {
  type: "circle";
  radiusX: number;
  radiusY: number;
  fill: string | null;
}

export interface ArrowShape extends BaseShape {
  type: "arrow";
  points: number[];
}

export interface FreehandShape extends BaseShape {
  type: "freehand";
  points: number[];
}

export interface TextShape extends BaseShape {
  type: "text";
  text: string;
  fontSize: number;
  fill: string;
}

export type AnnotationShape =
  | RectangleShape
  | CircleShape
  | ArrowShape
  | FreehandShape
  | TextShape;

export interface AnnotationNodeData extends BaseNodeData {
  sourceImage: string | null;
  annotations: AnnotationShape[];
  outputImage: string | null;
}

export interface EntityBinding {
  id: string;
  rawText: string;
  status: "resolved" | "missing";
  entityType: "identity" | "unknown";
  entityId?: string;
  identityId?: string;
  portraitId?: string;
  mention?: string;
  aliasValue?: string;
  summary?: string;
  detail?: string;
  tone?: "emerald" | "sky";
  roleKind?: "person" | "scene";
  start: number;
  end: number;
  resolutionSource?: "manual" | "auto";
  version?: number;
}

export interface TextNodeData extends BaseNodeData {
  title: string;
  text: string;
  refId?: string;
  atMentions?: {
    name: string;
    status: 'match' | 'missing';
    kind?: 'identity' | 'unknown';
    identityId?: string;
    portraitId?: string;
    mention?: string;
    summary?: string;
    image?: string;
    detail?: string;
    tone?: "emerald" | "sky";
    roleKind?: "person" | "scene";
  }[];
  entityBindings?: EntityBinding[];
}

export interface ScriptBoardNodeData extends BaseNodeData {
  title: string;
  episodeId?: number;
  sceneId?: string;
}

export interface StoryboardBoardNodeData extends BaseNodeData {
  title: string;
  episodeId?: number;
  sceneId?: string;
  displayMode?: "table" | "workflow";
  columnWidths?: number[];
  rowHeights?: Record<string, number>;
  workflowLoadedAt?: number;
}

export interface IdentityCardNodeData extends BaseNodeData {
  title: string;
  identityId?: string;
  avatarOverrides?: Record<string, string>;
}

export interface ImageGenNodeData extends BaseNodeData {
  inputImages: string[];
  outputImage: string | null;
  versionHistory?: Array<{
    id: string;
    src: string;
    createdAt: number;
  }>;
  status: 'idle' | 'loading' | 'complete' | 'error';
  error: string | null;
  model?: string;
  aspectRatio: string;
  quality?: string;
  enableInterleave?: boolean;
  outputCount?: number;
  maxImages?: number;
  seed?: number;
  watermark?: boolean;
  size?: string;
  designCategory?: "identity";
  designRefId?: string;
  identityTag?: string;
  identityId?: string;
}

export interface VideoGenNodeData extends BaseNodeData {
  inputImages: string[];
  referenceImages?: string[];
  referenceVideos?: string[];
  projectReferenceTargets?: {
    category: "identity";
    refId: string;
    label?: string;
  }[];
  videoId?: string;
  videoUrl?: string; // For polling result
  status: 'idle' | 'loading' | 'complete' | 'error';
  error: string | null;
  aspectRatio: string;
  duration?: string;
  model?: string;
  quality?: string;
  resolution?: string;
  size?: string;
  seed?: number;
  watermark?: boolean;
  shotType?: "single" | "multi";
  audioEnabled?: boolean;
  audioUrl?: string;
}

export interface ViduVideoGenNodeData extends BaseNodeData {
  inputImages: string[];
  videoId?: string;
  videoUrl?: string;
  status: 'idle' | 'loading' | 'complete' | 'error';
  error: string | null;
  mode: ViduReferenceMode;
  useCharacters?: boolean;
  subjects?: { id?: string; images: string[]; voiceId?: string }[];
  voiceId?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  movementAmplitude?: string;
  offPeak?: boolean;
  model?: string;
  seed?: number;
}

export interface SeedanceVideoGenNodeData extends BaseNodeData {
  inputImages: string[];
  referenceVideos: string[];
  referenceAudios: string[];
  videoId?: string;
  videoUrl?: string;
  status: "idle" | "loading" | "complete" | "error";
  error: string | null;
  model: SeedanceModel;
  mode: "multimodalReference";
  resolution?: "480p" | "720p";
  ratio?: "adaptive" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9";
  duration?: number;
  generateAudio?: boolean;
  watermark?: boolean;
}

export interface OutputNodeData extends BaseNodeData {
  image: string | null;
  text?: string | null;
}

export interface GroupNodeData extends BaseNodeData {
  title: string;
  description?: string;
  isExpanded?: boolean;
}

export interface NoteNodeData extends BaseNodeData {
  title?: string;
  text: string;
  color?: string;
}

export interface ShotNodeData extends BaseNodeData {
  shotId: string;
  duration: string;
  shotType: string;
  focalLength: string;
  movement: string;
  composition: string;
  blocking: string;
  dialogue: string;
  sound: string;
  lightingVfx: string;
  editingNotes: string;
  notes: string;
  soraPrompt: string;
  storyboardPrompt: string;
  viewMode?: "card" | "table";
}

export type WorkflowNodeData =
  | ImageInputNodeData
  | AudioInputNodeData
  | AnnotationNodeData
  | TextNodeData
  | ScriptBoardNodeData
  | StoryboardBoardNodeData
  | IdentityCardNodeData
  | ImageGenNodeData
  | VideoGenNodeData
  | ViduVideoGenNodeData
  | SeedanceVideoGenNodeData
  | GroupNodeData
  | ShotNodeData;

export type WorkflowNode = Node<WorkflowNodeData, NodeType>;

export interface WorkflowEdgeData extends Record<string, unknown> {
  hasPause?: boolean;
}

export type WorkflowEdge = Edge<WorkflowEdgeData>;

export type GlobalAssetType = "image" | "video" | "audio";

export type GlobalAssetHistoryItem = {
  id: string;
  type: GlobalAssetType;
  src: string;
  prompt: string;
  aspectRatio?: string;
  model?: string;
  timestamp: number;
  sourceId?: string;
};

export type LabContextSnapshot = {
  rawScript: string;
  episodes: Episode[];
  designAssets: DesignAssetItem[];
  globalStyleGuide: string;
  shotGuide: string;
  soraGuide: string;
  storyboardGuide: string;
  dramaGuide: string;
  context: ProjectContext;
};

export type WorkflowViewport = {
  x: number;
  y: number;
  zoom: number;
};

export interface WorkflowFile {
  version: number;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  edgeStyle?: "angular" | "curved";
  globalAssetHistory?: GlobalAssetHistoryItem[];
  labContext?: LabContextSnapshot;
  viewport?: WorkflowViewport;
  activeView?: string | null;
}

export type WorkflowTemplate = {
  id: string;
  name: string;
  createdAt: number;
  workflow: WorkflowFile;
};
