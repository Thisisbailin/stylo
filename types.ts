
import type { NodeFlowFile, NodeFlowNodeDefaults } from "./node-workspace/types";

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

export interface Shot {
  id: string; // e.g., "1-1-01" (SceneID-ShotNumber)
  duration: string;
  shotType: string; // 景别 (Shot Size)
  focalLength: string; // 焦段
  movement: string; // 运镜
  composition: string; // 机位/构图
  blocking: string; // 调度/表演
  dialogue: string; // 台词/OS
  sound: string; // 声音
  lightingVfx: string; // 光色/VFX
  editingNotes: string; // 剪辑
  notes: string; // 备注（氛围/情绪）
  soraPrompt: string;
  storyboardPrompt: string; // Phase 4: GPT-4o-style storyboard prompt (Chinese)

  // Phase 5: Video Gen Fields
  videoStatus?: 'idle' | 'queued' | 'generating' | 'completed' | 'error'; // Added 'queued'
  videoUrl?: string;
  videoId?: string; // New: Store the API ID for Remixing
  videoStartTime?: number; // New: Timestamp when generation started
  videoErrorMsg?: string;

  // User customizations for Video
  finalVideoPrompt?: string; // The actual prompt used (user edited)
  videoParams?: VideoParams;
  isApproved?: boolean; // User marked as satisfied
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
  summary?: string; // Generated summary
  shots: Shot[];
  status:
    | 'pending'
    | 'generating'
    | 'review_shots'
    | 'confirmed_shots'
    | 'generating_storyboard'
    | 'review_storyboard'
    | 'generating_sora'
    | 'review_sora'
    | 'completed'
    | 'error';
  errorMsg?: string;
  shotGenUsage?: TokenUsage;
  soraGenUsage?: TokenUsage;
  storyboardGenUsage?: TokenUsage;
}

export type ActiveTab = 'knowledge' | 'visuals' | 'video' | 'lab' | 'stats' | 'projector';

export interface ScriptCanvasPosition {
  x: number;
  y: number;
}

export interface ScriptCanvasPageNode {
  episodeId: number;
  position: ScriptCanvasPosition;
}

export interface ScriptCanvasImageNode {
  id: string;
  imageUrl: string;
  filename?: string;
  position: ScriptCanvasPosition;
  createdAt: number;
}

export interface ScriptCanvasLink {
  id: string;
  source: string;
  target: string;
  sourceHandle?: "image" | "text";
  targetHandle?: "image" | "text";
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

export interface ScriptTimelineState {
  id: string;
  title: string;
  durationMin: number;
  blocks: ScriptTimelineBlock[];
}

export interface ScriptCanvasState {
  pages: ScriptCanvasPageNode[];
  images: ScriptCanvasImageNode[];
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

export interface ProjectContext {
  projectSummary: string;
  episodeSummaries: { episodeId: number; summary: string }[];
  roles: ProjectRoleIdentity[];
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

export interface Phase1Usage {
  projectSummary: TokenUsage;
  episodeSummaries: TokenUsage;
  charList: TokenUsage;
  charDeepDive: TokenUsage;
  locList: TokenUsage;
  locDeepDive: TokenUsage;
}

export interface PerformanceMetrics {
  context: RequestStats;
  shotGen: RequestStats;
  soraGen: RequestStats;
  storyboardGen: RequestStats;
}

export interface ProjectData {
  fileName: string;
  rawScript: string;
  episodes: Episode[];
  context: ProjectContext;
  designAssets: DesignAssetItem[];
  nodeFlow?: NodeFlowFile | null;
  nodeDefaults?: NodeFlowNodeDefaults;
  scriptCanvas?: ScriptCanvasState;
  contextUsage?: TokenUsage; // Total usage (Phase 1 + Easter Eggs)
  phase1Usage: Phase1Usage; // Detailed breakdown of Phase 1

  // New usage tracking fields
  phase4Usage?: TokenUsage; // Visual Assets (Multimodal)
  phase5Usage?: TokenUsage; // Video Studio (Reserved for Prompt Refinement or API cost mapping)

  // Standard Operating Procedures (SOPs) - Loaded from files
  shotGuide: string;
  soraGuide: string;
  storyboardGuide: string;
  dramaGuide?: string;

  // Project-Specific Assets (User Uploaded)
  globalStyleGuide?: string; // Unified Style Bible for the project

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
  multimodalConfig: MultimodalConfig; // New Phase 4 Config
  viduConfig?: ViduServiceConfig;
  videoProvider?: 'default' | 'vidu' | 'seedance';
  rememberApiKeys?: boolean;
  syncApiKeys?: boolean;
}

export enum WorkflowStep {
  IDLE,
  SETUP_CONTEXT, // Phase 1 (Now Multi-step)
  GENERATE_SHOTS, // Phase 2
  GENERATE_SORA, // Phase 3
  GENERATE_STORYBOARD, // Phase 4 (Storyboard prompts)
  GENERATE_VIDEO, // Phase 5 (New)
  COMPLETED
}

export enum AnalysisSubStep {
  IDLE,
  PROJECT_SUMMARY,    // Step 1: Global Arc
  EPISODE_SUMMARIES,  // Step 2: Batch Episodes
  CHAR_IDENTIFICATION,// Step 3: List
  CHAR_DEEP_DIVE,     // Step 4: Batch Main Characters
  LOC_IDENTIFICATION, // Step 5: List
  LOC_DEEP_DIVE,      // Step 6: Batch Core Locations
  COMPLETE
}
