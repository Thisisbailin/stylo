import type { CSSProperties } from "react";
import { DesignAssetItem, Episode, ProjectContext, SeedanceModel, ViduReferenceMode } from "../../types";

export type HandleType = "image" | "text" | "audio" | "video" | "multi";

export type NodeType =
  | "imageInput"
  | "audioInput"
  | "videoInput"
  | "annotation"
  | "knowledge"
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
export type NodeAssetPlane = "source" | "semantic" | "design";
export type NodeAssetStatus = "draft" | "working" | "approved" | "superseded" | "archived";
export type NodeAssetConfidence = "low" | "medium" | "high";

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

export interface VideoInputNodeData extends BaseNodeData {
  video: string | null;
  filename: string | null;
  mimeType?: string | null;
  durationMs?: number | null;
  dimensions?: { width: number; height: number } | null;
  aspectRatio?: string | null;
  resolution?: string | null;
  model?: string | null;
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

export interface KnowledgeNodeData extends BaseNodeData {
  title: string;
  plane: NodeAssetPlane;
  assetType: string;
  content: string;
  summary?: string;
  tags?: string[];
  sourceRefs?: string[];
  status?: NodeAssetStatus;
  confidence?: NodeAssetConfidence;
  locked?: boolean;
  fields?: Record<string, unknown>;
  view?: string;
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
  nodeFlowLoadedAt?: number;
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
  progressPercent?: number | null;
  progressLabel?: string | null;
  progressHint?: string | null;
  taskState?: string | null;
  taskSubmittedAt?: number | null;
  processingStartedAt?: number | null;
  lastCreditsCost?: number | null;
  authProbeStatus?: 'idle' | 'loading' | 'complete' | 'error';
  authProbeSummary?: string | null;
  authProbeDetail?: string | null;
  mode: ViduReferenceMode;
  useCharacters?: boolean;
  autoSubjects?: boolean;
  subjects?: { name: string; images?: string[]; videos?: string[]; voiceId?: string; serverId?: string }[];
  voiceId?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  audioEnabled?: boolean;
  bgm?: boolean;
  offPeak?: boolean;
  watermark?: boolean;
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

export type NodeFlowNodeData =
  | ImageInputNodeData
  | AudioInputNodeData
  | VideoInputNodeData
  | AnnotationNodeData
  | KnowledgeNodeData
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

export type NodeFlowPosition = {
  x: number;
  y: number;
};

export type NodeFlowMeasured = {
  width?: number;
  height?: number;
};

export type NodeFlowNodeStyle = CSSProperties;

export interface NodeFlowNode {
  id: string;
  type: NodeType;
  position: NodeFlowPosition;
  data: NodeFlowNodeData;
  parentId?: string;
  extent?: "parent";
  style?: NodeFlowNodeStyle;
  measured?: NodeFlowMeasured;
  selected?: boolean;
}

export interface NodeFlowLinkData extends Record<string, unknown> {
  hasPause?: boolean;
}

export interface NodeFlowLink {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: NodeFlowLinkData;
  selected?: boolean;
  type?: string;
  markerEnd?: string;
}

export interface NodeFlowGraphLink {
  id: string;
  sourceRef: string;
  targetRef: string;
}

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

export type NodeFlowContextSnapshot = {
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

export type NodeFlowViewport = {
  x: number;
  y: number;
  zoom: number;
};

export interface NodeFlowFile {
  version: number;
  revision: number;
  name: string;
  nodes: NodeFlowNode[];
  links: NodeFlowLink[];
  graphLinks?: NodeFlowGraphLink[];
  linkStyle?: "angular" | "curved";
  globalAssetHistory?: GlobalAssetHistoryItem[];
  nodeFlowContext?: NodeFlowContextSnapshot;
  viewport?: NodeFlowViewport;
  activeView?: string | null;
}

export type NodeFlowTemplate = {
  id: string;
  name: string;
  createdAt: number;
  nodeFlow: NodeFlowFile;
};
