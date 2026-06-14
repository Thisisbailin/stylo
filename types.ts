
import type {
  GlobalAssetHistoryItem,
  HandleType,
  NodeFlowFile,
  NodeFlowGraphLink,
  NodeFlowNode,
  NodeFlowNodeDefaults,
} from "./node-workspace/types";

export interface BaseNodeData extends Record<string, unknown> {
  label?: string;
  title?: string;
}

export interface TokenUsage {
  promptTokens: number;
  responseTokens: number;
  totalTokens: number;
}

export type SyncStatus = 'idle' | 'loading' | 'syncing' | 'synced' | 'conflict' | 'error' | 'offline' | 'disabled';

export type SyncChannelState = {
  status: SyncStatus;
  lastSyncAt?: number;
  lastError?: string;
  pendingOps?: number;
  retryCount?: number;
  lastAttemptAt?: number;
};

export type SyncState = {
  project: SyncChannelState;
  secrets: SyncChannelState;
};

export interface VideoParams {
  aspectRatio: string; // "16:9", "9:16"
  quality: 'standard' | 'high'; // New: Maps to specific resolutions
  resolution?: string; // "1280x720", "1792x1024", etc.
  duration?: string; // "4s", "8s", "12s"
  inputImage?: File | null; // New: For Sora input_reference
  inputImageUrl?: string; // Optional: URL reference for image-to-video endpoints
}

export interface SceneMetadata {
  rawTitle: string;
  tokens: string[];
}

export interface Scene {
  id: string; // e.g., "1-1"
  title: string; // e.g., "Inside Cafe - Day"
  content: string;
  partition?: string;
  timeOfDay?: string;
  location?: string;
  metadata?: SceneMetadata;
}

export interface Episode {
  id: number;
  title: string;
  content: string; // Original text
  scenes: Scene[]; // Parsed scenes
  characters?: string[]; // Parsed character list for this episode (optional)
  status:
    | 'pending'
    | 'generating'
    | 'completed'
    | 'error';
  errorMsg?: string;
}

export type ActiveTab = 'visuals' | 'video' | 'lab' | 'stats';

export interface ScriptCanvasPosition {
  x: number;
  y: number;
}

export interface ScriptCanvasMeasuredSize {
  width?: number;
  height?: number;
}

export interface ScriptCanvasPageNode {
  episodeId: number;
  position: ScriptCanvasPosition;
  measured?: ScriptCanvasMeasuredSize;
}

export interface ScriptCanvasImageNode {
  id: string;
  imageUrl: string;
  filename?: string;
  position: ScriptCanvasPosition;
  measured?: ScriptCanvasMeasuredSize;
  createdAt: number;
}

export interface ScriptCanvasTextNode {
  id: string;
  title: string;
  content: string;
  position: ScriptCanvasPosition;
  measured?: ScriptCanvasMeasuredSize;
  createdAt: number;
}

export interface ScriptCanvasLink {
  id: string;
  source: string;
  target: string;
  sourceHandle?: HandleType;
  targetHandle?: HandleType;
}

export interface ScriptTimelineBlock {
  id: string;
  title: string;
  content: string;
  startMin: number;
  durationMin: number;
  color: string;
  order: number;
  linkedNodeIds: string[];
}

export interface ScriptTimelineHead {
  title: string;
  content: string;
  linkedNodeIds: string[];
}

export interface ScriptSpatialBlock {
  id: string;
  title: string;
  content: string;
  color: string;
  order: number;
  width: number;
  linkedNodeIds: string[];
}

export interface ScriptTimelineState {
  id: string;
  title: string;
  durationMin: number;
  head?: ScriptTimelineHead;
  spaceBlocks?: ScriptSpatialBlock[];
  blocks: ScriptTimelineBlock[];
}

export interface ScriptCanvasState {
  revision?: number;
  pages: ScriptCanvasPageNode[];
  images: ScriptCanvasImageNode[];
  textNodes?: ScriptCanvasTextNode[];
  flowNodes?: NodeFlowNode[];
  graphLinks?: NodeFlowGraphLink[];
  globalAssetHistory?: GlobalAssetHistoryItem[];
  linkStyle?: "angular" | "curved";
  activeView?: string | null;
  links: ScriptCanvasLink[];
  timeline?: ScriptTimelineState;
}

// --- Unified Role Identity Types ---

export type ProjectRoleKind = "person" | "scene";

export type ProjectRoleTone = "emerald" | "sky";

export interface ProjectRoleAlias {
  id: string;
  value: string;
  normalized?: string;
}

export interface ProjectRoleBindingProfile {
  mention: string;
  aliases?: string[];
}

export interface ProjectRolePortrait {
  id: string;
  name: string;
  mention: string;
  imageUrl: string;
  createdAt: number;
  summary?: string;
  isPrimary?: boolean;
}

export interface ProjectRoleIdentity {
  id: string;
  name: string;
  displayName: string;
  mention: string;
  slug?: string;
  kind: ProjectRoleKind;
  tone: ProjectRoleTone;
  isMain?: boolean;
  isCore?: boolean;
  title?: string;
  summary: string;
  description: string;
  visualTags?: string;
  episodeUsage?: string;
  tags?: string[];
  status?: "draft" | "verified" | "locked" | "archived";
  aliases?: ProjectRoleAlias[];
  binding?: ProjectRoleBindingProfile;
  voiceId?: string;
  voicePrompt?: string;
  previewAudioUrl?: string;
  voiceReferenceAudioUrl?: string;
  designPrompt?: string;
  designNotes?: string;
  lightingPalette?: string;
  props?: string;
  assetPriority?: "high" | "medium" | "low";
  avatarUrl?: string;
  portraits: ProjectRolePortrait[];
}

export type DesignAssetCategory = "identity";

export interface DesignAssetItem {
  id: string;
  category: DesignAssetCategory;
  refId: string;
  url: string;
  createdAt: number;
  label?: string;
}

export interface RequestStats {
  total: number;
  success: number;
  error: number;
}

export interface PerformanceMetrics {
  context: RequestStats;
}

export interface ProjectData {
  fileName: string;
  rawScript: string;
  episodes: Episode[];
  roles: ProjectRoleIdentity[];
  designAssets: DesignAssetItem[];
  nodeFlow?: NodeFlowFile | null;
  nodeDefaults?: NodeFlowNodeDefaults;
  scriptCanvas?: ScriptCanvasState;

  phase5Usage?: TokenUsage; // Video Studio (Reserved for Prompt Refinement or API cost mapping)

  stats: PerformanceMetrics;
}

export interface VideoServiceConfig {
  baseUrl: string;
  apiKey: string;
  model?: string;
}

export type SeedanceModel =
  | "doubao-seedance-2-0-260128"
  | "doubao-seedance-2-0-fast-260128";

export type SeedanceContentRole =
  | "reference_image"
  | "reference_video"
  | "reference_audio"
  | "first_frame"
  | "last_frame";

export interface SeedanceContentItem {
  type: "text" | "image_url" | "video_url" | "audio_url";
  text?: string;
  image_url?: { url: string };
  video_url?: { url: string };
  audio_url?: { url: string };
  role?: SeedanceContentRole;
}

export interface SeedanceTaskCreateParams {
  model: SeedanceModel;
  content: SeedanceContentItem[];
  generateAudio?: boolean;
  resolution?: "480p" | "720p";
  ratio?: "adaptive" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9";
  duration?: number;
  watermark?: boolean;
  useWebSearch?: boolean;
}

export interface SeedanceTaskSubmissionResult {
  id: string;
  status?: string;
}

export interface SeedanceTaskStatusResult {
  id: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  url?: string;
  ratio?: string;
  duration?: number;
  errorMsg?: string;
}

export type SeedanceKeyProbeStatus = "valid" | "invalid" | "unknown";

export interface SeedanceKeyProbeResult {
  status: SeedanceKeyProbeStatus;
  message: string;
  keySource: "config" | "env" | "missing";
  baseUrl: string;
  configuredModel?: string;
  models: string[];
  modelAvailable?: boolean;
  capabilities: string[];
}

export type SeedanceAssetStatus = "Processing" | "Active" | "Failed" | string;

export interface SeedanceAssetCreateResult {
  assetId: string;
  groupId: string;
  assetUri: string;
  status?: SeedanceAssetStatus;
  failedReason?: string;
}

export interface SeedanceAssetStatusResult extends SeedanceAssetCreateResult {
  status: SeedanceAssetStatus;
  name?: string;
  url?: string;
}

// Vidu service config and task types
export interface ViduServiceConfig {
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
}

export type ViduTaskState = 'created' | 'scheduled' | 'processing' | 'success' | 'failed' | 'canceled';

export interface ViduCreationItem {
  id?: string;
  url?: string;
  cover_url?: string;
  watermarked_url?: string;
}

export interface ViduTaskResult {
  id: string;
  state: ViduTaskState;
  rawState?: string;
  err_code?: string;
  credits?: number;
  payload?: string;
  creations?: ViduCreationItem[];
}

export interface ViduSubject {
  name: string;
  images?: string[];
  videos?: string[];
  voiceId?: string;
  serverId?: string;
}

export interface ViduReferenceVideoSubjectParams {
  model?: string;
  subjects: ViduSubject[];
  prompt: string;
  autoSubjects?: boolean;
  duration?: number;
  seed?: number;
  aspectRatio?: string;
  resolution?: string;
  audio?: boolean;
  offPeak?: boolean;
  watermark?: boolean;
  wmPosition?: number;
  wmUrl?: string;
  metaData?: string;
  callbackUrl?: string;
  payload?: string;
}

export interface ViduReferenceVideoNonSubjectParams {
  model?: string;
  images: string[];
  videos?: string[];
  sounds?: string[];
  prompt: string;
  bgm?: boolean;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  seed?: number;
  offPeak?: boolean;
  audio?: boolean;
  watermark?: boolean;
  wmPosition?: number;
  wmUrl?: string;
  metaData?: string;
  callbackUrl?: string;
  payload?: string;
}

export type ViduReferenceMode = 'subject' | 'nonSubject' | 'audioVideo' | 'videoOnly';

export interface ViduReferenceRequest {
  mode: ViduReferenceMode;
  subjectParams?: ViduReferenceVideoSubjectParams;
  nonSubjectParams?: ViduReferenceVideoNonSubjectParams;
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
  mode: ViduReferenceMode;
  subjects?: ViduSubject[];
  useCharacters?: boolean;
  autoSubjects?: boolean;
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

export type TextProvider = 'openrouter' | 'qwen';
export type AgentTextProvider = TextProvider | 'ark' | 'deepseek';

export interface TextServiceConfig {
  provider: TextProvider;
  agentProvider?: AgentTextProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  agentBaseUrl?: string;
  agentModel?: string;
  workModel?: string;
  workBaseUrl?: string;
  qwenModels?: Array<Record<string, any>>;
  voiceDesignModel?: string;
  voiceDubbingModel?: string;
  // Tooling / advanced options (provider-specific)
  tools?: any[];
  qalamTools?: QalamToolSettings;
}

export type QalamToolSettings = {
  projectData?: {
    enabled?: boolean;
  };
  workflowBuilder?: {
    enabled?: boolean;
  };
  characterLocation?: {
    enabled?: boolean;
    mergeStrategy?: "patch" | "replace";
    formsMode?: "merge" | "replace";
    zonesMode?: "merge" | "replace";
  };
};

export interface MultimodalConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider?: 'standard' | 'nanobanana' | 'wuyinkeji' | 'seedream' | 'wan';
}

export interface AppConfig {
  textConfig: TextServiceConfig;
  videoConfig: VideoServiceConfig;
  multimodalConfig: MultimodalConfig;
  viduConfig?: ViduServiceConfig;
  videoProvider?: 'default' | 'vidu' | 'seedance';
  rememberApiKeys?: boolean;
  syncApiKeys?: boolean;
}
