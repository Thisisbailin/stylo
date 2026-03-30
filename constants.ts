
import { ProjectData, TextServiceConfig, VideoServiceConfig, MultimodalConfig, ViduServiceConfig, QalamToolSettings } from './types';

export const INITIAL_PROJECT_DATA: ProjectData = {
  fileName: '',
  rawScript: '',
  episodes: [],
  context: {
    projectSummary: '',
    episodeSummaries: [],
    roles: []
  },
  designAssets: [],
  shotGuide: '',
  soraGuide: '',
  storyboardGuide: '',
  dramaGuide: '',
  globalStyleGuide: '', // Initialize as empty

  contextUsage: { promptTokens: 0, responseTokens: 0, totalTokens: 0 },
  phase1Usage: {
    projectSummary: { promptTokens: 0, responseTokens: 0, totalTokens: 0 },
    episodeSummaries: { promptTokens: 0, responseTokens: 0, totalTokens: 0 },
    charList: { promptTokens: 0, responseTokens: 0, totalTokens: 0 },
    charDeepDive: { promptTokens: 0, responseTokens: 0, totalTokens: 0 },
    locList: { promptTokens: 0, responseTokens: 0, totalTokens: 0 },
    locDeepDive: { promptTokens: 0, responseTokens: 0, totalTokens: 0 },
  },
  phase4Usage: { promptTokens: 0, responseTokens: 0, totalTokens: 0 },
  phase5Usage: { promptTokens: 0, responseTokens: 0, totalTokens: 0 },

  stats: {
    context: { total: 0, success: 0, error: 0 },
    shotGen: { total: 0, success: 0, error: 0 },
    soraGen: { total: 0, success: 0, error: 0 },
    storyboardGen: { total: 0, success: 0, error: 0 }
  }
};

export const QWEN_RESPONSES_BASE_URL = 'https://dashscope.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1';
export const OPENROUTER_RESPONSES_BASE_URL = 'https://openrouter.ai/api/v1';
export const CODEX_RESPONSES_BASE_URL = 'https://chatgpt.com/backend-api/codex';
export const QWEN_DEFAULT_MODEL = 'qwen-plus';
export const CODEX_DEFAULT_MODEL = 'gpt-5-codex';
export const CODEX_MODEL_OPTIONS = [
  {
    id: 'gpt-5-codex',
    label: 'GPT-5-Codex',
    summary: 'OpenAI 当前 Codex 产品默认模型，适合大多数日常 agentic coding 任务。',
    tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/30',
  },
  {
    id: 'gpt-5.3-codex',
    label: 'GPT-5.3-Codex',
    summary: '当前最强的 agentic coding 模型，适合你主动追求更高能力时切换使用。',
    tone: 'text-teal-300 bg-teal-500/10 border-teal-400/30',
  },
  {
    id: 'gpt-5.2-codex',
    label: 'GPT-5.2-Codex',
    summary: '偏长链路编码任务，适合复杂 repo 操作与多步工具调用。',
    tone: 'text-sky-300 bg-sky-500/10 border-sky-400/30',
  },
  {
    id: 'gpt-5.1-codex',
    label: 'GPT-5.1-Codex',
    summary: '稳定的一般型 Codex 版本，适合作为兼容回退。',
    tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-400/30',
  },
  {
    id: 'gpt-5.1-codex-max',
    label: 'GPT-5.1-Codex-Max',
    summary: '更适合长时间运行与更重任务的 Codex 变体。',
    tone: 'text-violet-300 bg-violet-500/10 border-violet-400/30',
  },
  {
    id: 'gpt-5.1-codex-mini',
    label: 'GPT-5.1-Codex mini',
    summary: '成本更低、速度更快，但能力明显更轻。',
    tone: 'text-amber-300 bg-amber-500/10 border-amber-400/30',
  },
  {
    id: 'codex-mini-latest',
    label: 'codex-mini-latest',
    summary: 'Codex CLI 优化的小模型；官方已标记 deprecated，不建议默认使用。',
    tone: 'text-rose-300 bg-rose-500/10 border-rose-400/30',
  },
] as const;
export const isKnownCodexModel = (model?: string) =>
  typeof model === 'string' && CODEX_MODEL_OPTIONS.some((item) => item.id === model);
export const QWEN_WAN_IMAGE_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
export const QWEN_WAN_VIDEO_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis';
export const QWEN_WAN_IMAGE_MODEL = 'wan2.6-image';
export const QWEN_WAN_VIDEO_MODEL = 'wan2.6-i2v';
export const QWEN_WAN_REFERENCE_VIDEO_MODEL = 'wan2.6-r2v';
export const QWEN_WAN_REFERENCE_VIDEO_FLASH_MODEL = 'wan2.6-r2v-flash';

export const DEFAULT_QALAM_TOOL_SETTINGS: QalamToolSettings = {
  projectData: {
    enabled: true,
  },
  workflowBuilder: {
    enabled: true,
  },
  characterLocation: {
    enabled: true,
    mergeStrategy: "patch",
    formsMode: "merge",
    zonesMode: "merge",
  },
};

export const INITIAL_TEXT_CONFIG: TextServiceConfig = {
  provider: 'qwen',
  agentProvider: 'qwen',
  agentRuntimeTarget: 'edge',
  baseUrl: QWEN_RESPONSES_BASE_URL,
  apiKey: '',
  model: QWEN_DEFAULT_MODEL,
  agentBaseUrl: QWEN_RESPONSES_BASE_URL,
  agentModel: QWEN_DEFAULT_MODEL,
  codexConnection: {
    status: 'disconnected',
  },
  workModel: '',
  workBaseUrl: '',
  qwenModels: [],
  voiceDesignModel: "",
  voiceDubbingModel: "",
  qalamTools: DEFAULT_QALAM_TOOL_SETTINGS,
};

export const SORA_DEFAULT_BASE_URL = "https://api.wuyinkeji.com/api/sora2/submit";
export const SORA_DEFAULT_MODEL = "sora-2";
export const SEEDANCE_DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
export const SEEDANCE_DEFAULT_MODEL = "doubao-seedance-2-0-260128";
export const SEEDANCE_FAST_MODEL = "doubao-seedance-2-0-fast-260128";

export const INITIAL_VIDEO_CONFIG: VideoServiceConfig = {
  baseUrl: SORA_DEFAULT_BASE_URL,
  apiKey: '',
  model: SORA_DEFAULT_MODEL
};

export const INITIAL_VIDU_CONFIG: ViduServiceConfig = {
  baseUrl: '',
  apiKey: '',
  defaultModel: 'viduq2-pro'
};

export const INITIAL_MULTIMODAL_CONFIG: MultimodalConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
  provider: 'standard'
};

export const INITIAL_REMEMBER_KEYS = false;
export const INITIAL_SYNC_KEYS = false;
