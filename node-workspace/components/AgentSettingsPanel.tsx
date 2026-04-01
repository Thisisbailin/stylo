import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  Code2,
  Eye,
  Globe,
  Layers,
  Loader2,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import { useConfig } from "../../hooks/useConfig";
import { usePersistedState } from "../../hooks/usePersistedState";
import { useAuth } from "../../lib/auth";
import { AgentTextProvider, ProjectData } from "../../types";
import { Dashboard } from "../../components/Dashboard";
import {
  ARK_DEFAULT_MODEL,
  ARK_RESPONSES_BASE_URL,
  DEFAULT_QALAM_TOOL_SETTINGS,
  INITIAL_VIDU_CONFIG,
  NANOBANANA_PRO_ENDPOINT,
  NANOBANANA_PRO_MODEL,
  OPENROUTER_RESPONSES_BASE_URL,
  QWEN_DEFAULT_MODEL,
  QWEN_RESPONSES_BASE_URL,
  QWEN_WAN_IMAGE_ENDPOINT,
  QWEN_WAN_IMAGE_MODEL,
  QWEN_WAN_VIDEO_MODEL,
  SEEDANCE_DEFAULT_BASE_URL,
  SEEDANCE_DEFAULT_MODEL,
  SEEDANCE_FAST_MODEL,
  SORA_DEFAULT_BASE_URL,
  SORA_DEFAULT_MODEL,
} from "../../constants";
import {
  AGENT_ACTIVITY_STORAGE_UPDATED_EVENT,
  readAgentToolActivity,
  type AgentToolActivityRecord,
} from "../../agents/runtime/activity";
import { listBuiltinSkills } from "../../agents/runtime/skills";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { fetchArkModels, type ArkModel } from "../../services/arkResponsesService";
import { fetchTextModels } from "../../services/responsesTextService";
import { fetchQwenModels, type QwenModel } from "../../services/qwenResponsesService";
import { createStableId } from "../../utils/id";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  leftOffset?: number;
  projectData: ProjectData;
  isDarkMode?: boolean;
  requestedPanel?: "provider" | "tools" | "skills" | "dashboard" | "history";
};

type ConversationRecord = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Array<{ role?: string; text?: string }>;
};

type ConversationState = {
  activeId: string;
  items: ConversationRecord[];
};

type CloudSessionSummary = {
  sessionKey: string;
  sessionId: string;
  updatedAt: number;
  itemCount: number;
  messageCount: number;
  preview: string;
};

type SkillReadRecord = {
  id: string;
  title: string;
  version: string;
  createdAt: number;
};

type CloudTraceSummary = {
  traceId: string;
  sessionId: string;
  provider: string;
  model: string;
  workflowName: string;
  groupId?: string | null;
  updatedAt: number;
  spanCount: number;
  errorCount: number;
  metadata?: Record<string, string>;
  trace?: Record<string, unknown>;
};

type CloudSessionDetail = {
  sessionKey: string;
  sessionId: string;
  updatedAt: number;
  items: any[];
  messages: Array<any>;
  skillReads: SkillReadRecord[];
};

type CloudSpanRecord = {
  spanId: string;
  parentId?: string | null;
  spanType: string;
  spanName: string;
  startedAt?: string | null;
  endedAt?: string | null;
  error?: string | null;
  span?: Record<string, unknown>;
};

type CloudTraceDetail = CloudTraceSummary & {
  spans: CloudSpanRecord[];
  skillReads: SkillReadRecord[];
};

type AgentObservabilityPayload = {
  sessions: CloudSessionSummary[];
  traces: CloudTraceSummary[];
  selectedSession: CloudSessionDetail | null;
  selectedTrace: CloudTraceDetail | null;
};

type ToolKey = "project-data" | "asset-library" | "workflow-builder";

type ToolItem = {
  key: ToolKey;
  capability: string;
  title: string;
  description: string;
  tools: string[];
  surfaces: string[];
  boundary: string;
  artifact: string;
  note: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
};

type MultiProviderKey = "openrouter" | "qwen" | "nanobanana";

const TOOL_ITEMS: ToolItem[] = [
  {
    key: "project-data",
    capability: "read",
    title: "read",
    description: "Agent 通过统一的目录、读取与搜索接口查阅项目资料，包括剧本、理解资产、内部 skill 包，以及当前节点工作流。",
    tools: ["list_project_resources", "read_project_resource", "search_project_resource"],
    surfaces: ["skill package", "episode script", "episode storyboard", "project summary", "character profile", "scene profile", "workflow node", "workflow connection"],
    boundary: "只读，不允许直接修改项目状态。",
    artifact: "返回方法指导、项目证据、工作流结构和结构化片段，作为理解与操作的前置输入。",
    note: "负责读取内部方法、项目证据与节点工作流。",
    Icon: Eye,
  },
  {
    key: "asset-library",
    capability: "edit",
    title: "edit",
    description: "Agent 通过统一编辑接口写回项目摘要、分集摘要、角色档案、场景档案与整集分镜表，不再暴露多套专用写入工具。",
    tools: ["edit_project_resource"],
    surfaces: ["project summary", "episode summary", "character profile", "scene profile", "episode storyboard"],
    boundary: "只允许通过结构化 resource write 写入，不允许绕过 schema 直接改项目状态。",
    artifact: "形成可持续迭代的长期事实层，供后续查阅、分镜和 workflow 创建继续使用。",
    note: "负责把结构化理解写回项目资产。",
    Icon: Layers,
  },
  {
    key: "workflow-builder",
    capability: "operate",
    title: "operate",
    description: "Agent 通过统一操作接口创建文本节点、剧本面板、分镜表板、角色卡片，并连接这些节点形成最小工作流骨架。",
    tools: ["operate_project_resource"],
    surfaces: ["text node", "script board", "storyboard board", "character card", "workflow connection"],
    boundary: "创建前校验 ref 与资源定位；连线前校验节点存在与 handle 合法性。",
    artifact: "输出可继续编辑和执行的 workflow scaffold，承接“查阅”和“编辑”的结果。",
    note: "负责把事实与资产变成可执行节点流。",
    Icon: Code2,
  },
];

const OPENROUTER_BASE_URL = OPENROUTER_RESPONSES_BASE_URL;

const QwenIcon: React.FC<{ size?: number; className?: string }> = ({ size = 12, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="7.5" />
    <path d="M16.5 16.5l4 4" />
  </svg>
);

const normalizeModalities = (value: any): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).toLowerCase());
  if (typeof value === "string") return value.split(/[,/ ]+/).map((v) => v.trim().toLowerCase()).filter(Boolean);
  return [];
};

const getModalities = (model: QwenModel) => {
  const input =
    normalizeModalities(model.modalities) ||
    normalizeModalities(model.capabilities?.modalities) ||
    normalizeModalities((model as any).input_modalities) ||
    normalizeModalities((model as any).architecture?.input_modalities);
  const output =
    normalizeModalities((model as any).output_modalities) ||
    normalizeModalities((model as any).architecture?.output_modalities);
  return { input, output };
};

const getQwenCategory = (model: QwenModel) => {
  const id = model.id.toLowerCase();
  if (id.includes("video") || id.includes("t2v") || id.includes("i2v") || id.includes("v2v")) {
    return { key: "video", label: "Video", Icon: Video, tone: "text-cyan-300 bg-cyan-500/10 border-cyan-400/30" };
  }
  if (id.includes("image") || id.includes("z-image")) {
    return { key: "image", label: "Image", Icon: Eye, tone: "text-sky-300 bg-sky-500/10 border-sky-400/30" };
  }
  if (id.includes("vl")) {
    return { key: "vision", label: "Vision", Icon: Eye, tone: "text-sky-300 bg-sky-500/10 border-sky-400/30" };
  }
  if (id.includes("tts") || id.includes("audio") || id.includes("speech")) {
    return { key: "audio", label: "Audio", Icon: AudioLines, tone: "text-pink-300 bg-pink-500/10 border-pink-400/30" };
  }
  if (id.includes("coder") || id.includes("code")) {
    return { key: "code", label: "Code", Icon: Code2, tone: "text-amber-300 bg-amber-500/10 border-amber-400/30" };
  }
  if (id.includes("embed")) {
    return { key: "embedding", label: "Embedding", Icon: Layers, tone: "text-emerald-300 bg-emerald-500/10 border-emerald-400/30" };
  }
  if (id.includes("rerank")) {
    return { key: "rerank", label: "Rerank", Icon: Layers, tone: "text-indigo-300 bg-indigo-500/10 border-indigo-400/30" };
  }
  return { key: "chat", label: "Chat", Icon: Sparkles, tone: "text-violet-300 bg-violet-500/10 border-violet-400/30" };
};

const getQwenTags = (model: QwenModel) => {
  const tags: string[] = [];
  const { input, output } = getModalities(model);
  if (input.length) tags.push(`in:${input.join("/")}`);
  if (output.length) tags.push(`out:${output.join("/")}`);
  const contextLength = model.context_length || model.contextLength || model.max_context_length || model.maxTokens;
  if (typeof contextLength === "number") {
    tags.push(`ctx:${contextLength}`);
  }
  const tools = model.capabilities?.tools || (model as any).supports_tools || (model as any).tool_calls;
  if (tools) tags.push("tools");
  const reasoning = model.capabilities?.reasoning || (model as any).supports_reasoning || (model as any).reasoning;
  if (reasoning) tags.push("reasoning");
  return tags.slice(0, 4);
};

const formatEpochDate = (value?: number) => {
  if (!value) return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
};

const formatTimestamp = (value?: number) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
};

const formatRelativeTime = (value?: number) => {
  if (!value) return "暂无";
  const diff = Date.now() - value;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} 小时前`;
  return `${Math.max(1, Math.floor(diff / 86_400_000))} 天前`;
};

const formatIsoTimestamp = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const getLatestActivityTimestamp = (records: AgentToolActivityRecord[]) =>
  records.reduce((latest, record) => Math.max(latest, record.lastFailedAt || 0, record.lastCompletedAt || 0, record.lastCalledAt || 0), 0);

const getLastFailure = (records: AgentToolActivityRecord[]) =>
  records
    .filter((record) => record.lastFailedAt && record.lastError)
    .sort((a, b) => (b.lastFailedAt || 0) - (a.lastFailedAt || 0))[0];

const getLastArtifact = (records: AgentToolActivityRecord[]) =>
  records
    .filter((record) => record.lastCompletedAt && record.lastArtifact)
    .sort((a, b) => (b.lastCompletedAt || 0) - (a.lastCompletedAt || 0))[0];

const resolveAgentModelForProvider = (provider: AgentTextProvider, configured?: string) => {
  const model = (configured || "").trim();
  if (provider === "qwen") {
    if (!model || model.startsWith("doubao-")) return QWEN_DEFAULT_MODEL;
    return model;
  }
  if (provider === "ark") {
    if (!model || model === QWEN_DEFAULT_MODEL || model.startsWith("qwen")) return ARK_DEFAULT_MODEL;
    return model;
  }
  return model;
};

const resolveConfiguredAgentModel = (textConfig: {
  agentProvider?: AgentTextProvider;
  provider?: string;
  agentModel?: string;
  model?: string;
}) => {
  const provider = textConfig.agentProvider || (textConfig.provider as AgentTextProvider) || "qwen";
  const explicitAgentModel = (textConfig.agentModel || "").trim();
  if (explicitAgentModel) {
    return resolveAgentModelForProvider(provider, explicitAgentModel);
  }
  const canFallbackToSharedModel = !textConfig.agentProvider || textConfig.agentProvider === textConfig.provider;
  const sharedModel = canFallbackToSharedModel ? (textConfig.model || "").trim() : "";
  return resolveAgentModelForProvider(provider, sharedModel);
};

const resolveMultiProviderKey = (provider?: string): MultiProviderKey => {
  if (provider === "wan") return "qwen";
  if (provider === "nanobanana" || provider === "wuyinkeji") return "nanobanana";
  return "openrouter";
};

const summarizeRuntimeToolOutput = (value: unknown) => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 220 ? `${serialized.slice(0, 220)}...` : serialized;
  } catch {
    return "tool output";
  }
};

const buildConversationTitle = (messages: Array<{ role?: string; text?: string }>) => {
  const firstUser = messages.find((m) => m.role === "user" && m.text && m.text.trim());
  if (!firstUser?.text) return "新对话";
  const text = firstUser.text.trim();
  return text.length > 20 ? `${text.slice(0, 20)}...` : text;
};

export const AgentSettingsPanel: React.FC<Props> = ({
  isOpen,
  onClose,
  leftOffset = 0,
  projectData,
  isDarkMode = true,
  requestedPanel = "provider",
}) => {
  const { config, setConfig } = useConfig("qalam_config_v1");
  const { getToken, isSignedIn: isAuthSignedIn } = useAuth();
  const { applyViduReferenceDemo } = useNodeFlowStore();
  const [activeType, setActiveType] = useState<"chat" | "multi" | "video">("chat");
  const [activeMultiProvider, setActiveMultiProvider] = useState<MultiProviderKey>(resolveMultiProviderKey(config.multimodalConfig.provider));
  const [activeVideoProvider, setActiveVideoProvider] = useState<"sora" | "qwen" | "vidu" | "seedance">("sora");
  const [selectedPanel, setSelectedPanel] = useState<"provider" | "tools" | "skills" | "dashboard" | "history">("provider");
  const [activeTool, setActiveTool] = useState<ToolKey>("asset-library");
  const [activeSkillId, setActiveSkillId] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | "user" | "assistant" | "tool">("all");
  const [isLoadingTextModels, setIsLoadingTextModels] = useState(false);
  const [textModelFetchMessage, setTextModelFetchMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [availableTextModels, setAvailableTextModels] = useState<string[]>([]);

  const [isLoadingQwenChatModels, setIsLoadingQwenChatModels] = useState(false);
  const [qwenChatFetchMessage, setQwenChatFetchMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [qwenChatModels, setQwenChatModels] = useState<QwenModel[]>([]);
  const [qwenModelsRaw, setQwenModelsRaw] = useState<string>("");
  const [showQwenRaw, setShowQwenRaw] = useState(false);
  const [isLoadingArkChatModels, setIsLoadingArkChatModels] = useState(false);
  const [arkChatFetchMessage, setArkChatFetchMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [arkChatModels, setArkChatModels] = useState<ArkModel[]>([]);
  const [arkModelsRaw, setArkModelsRaw] = useState<string>("");
  const [showArkRaw, setShowArkRaw] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [runtimeMetaVersion, setRuntimeMetaVersion] = useState(0);
  const [observabilityData, setObservabilityData] = useState<AgentObservabilityPayload | null>(null);
  const [observabilityLoading, setObservabilityLoading] = useState(false);
  const [observabilityError, setObservabilityError] = useState<string | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string>("");
  const [traceProviderFilter, setTraceProviderFilter] = useState<string>("all");
  const [traceStatusFilter, setTraceStatusFilter] = useState<"all" | "failed">("all");
  const [traceSpanFilter, setTraceSpanFilter] = useState<"all" | "error">("all");
  const [traceSearch, setTraceSearch] = useState("");
  const [conversationState, setConversationState] = usePersistedState<ConversationState>({
    key: "qalam_conversations_v1",
    initialValue: { activeId: "", items: [] },
    serialize: (value) => JSON.stringify(value),
    deserialize: (value) => {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) {
          return {
            activeId: typeof parsed.activeId === "string" ? parsed.activeId : "",
            items: parsed.items,
          } as ConversationState;
        }
      } catch {}
      return { activeId: "", items: [] };
    },
  });
  const qalamToolSettings = useMemo(() => {
    const base = DEFAULT_QALAM_TOOL_SETTINGS;
    const current = config.textConfig.qalamTools || {};
    const baseProject = base.projectData || {};
    const currentProject = current.projectData || {};
    const baseWorkflow = base.workflowBuilder || {};
    const currentWorkflow = current.workflowBuilder || {};
    const baseCharacter = base.characterLocation || {};
    const currentCharacter = current.characterLocation || {};
    return {
      projectData: {
        enabled: currentProject.enabled ?? baseProject.enabled ?? true,
      },
      workflowBuilder: {
        enabled: currentWorkflow.enabled ?? baseWorkflow.enabled ?? true,
      },
      characterLocation: {
        enabled: currentCharacter.enabled ?? baseCharacter.enabled ?? true,
        mergeStrategy: currentCharacter.mergeStrategy || baseCharacter.mergeStrategy || "patch",
        formsMode: currentCharacter.formsMode || baseCharacter.formsMode || "merge",
        zonesMode: currentCharacter.zonesMode || baseCharacter.zonesMode || "merge",
      },
    };
  }, [config.textConfig.qalamTools]);
  const availableAgentSkills = useMemo(() => listBuiltinSkills(), []);
  const activeSkill = useMemo(
    () => availableAgentSkills.find((skill) => skill.id === activeSkillId) || availableAgentSkills[0] || null,
    [activeSkillId, availableAgentSkills]
  );
  const activeAgentProvider: AgentTextProvider = config.textConfig.agentProvider || config.textConfig.provider || "qwen";
  const activeAgentBaseUrl =
    config.textConfig.agentBaseUrl ||
    config.textConfig.baseUrl ||
    (activeAgentProvider === "ark" ? ARK_RESPONSES_BASE_URL : QWEN_RESPONSES_BASE_URL);
  const activeAgentModel = resolveAgentModelForProvider(
    activeAgentProvider,
    resolveConfiguredAgentModel(config.textConfig)
  );
  const activeConversation = useMemo(
    () => conversationState.items.find((item) => item.id === conversationState.activeId) || null,
    [conversationState.activeId, conversationState.items]
  );
  const selectedCloudSession = observabilityData?.selectedSession || null;
  const selectedCloudTrace = observabilityData?.selectedTrace || null;
  const cloudSessions = observabilityData?.sessions || [];
  const cloudTraces = observabilityData?.traces || [];
  const traceProviderOptions = useMemo(
    () => ["all", ...Array.from(new Set(cloudTraces.map((item) => item.provider).filter(Boolean)))],
    [cloudTraces]
  );
  const filteredTraceSummaries = useMemo(() => {
    const keyword = traceSearch.trim().toLowerCase();
    return cloudTraces.filter((trace) => {
      if (traceProviderFilter !== "all" && trace.provider !== traceProviderFilter) return false;
      if (traceStatusFilter === "failed" && trace.errorCount <= 0) return false;
      if (!keyword) return true;
      return [trace.traceId, trace.model, trace.workflowName, trace.sessionId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [cloudTraces, traceProviderFilter, traceSearch, traceStatusFilter]);
  const visibleSelectedTraceSpans = useMemo(() => {
    const spans = selectedCloudTrace?.spans || [];
    if (traceSpanFilter === "error") return spans.filter((span) => span.error);
    return spans;
  }, [selectedCloudTrace?.spans, traceSpanFilter]);
  const activeToolItem = useMemo(
    () => TOOL_ITEMS.find((item) => item.key === activeTool) || TOOL_ITEMS[0],
    [activeTool]
  );
  const toolActivityMap = useMemo(() => readAgentToolActivity(), [runtimeMetaVersion]);
  const activeToolActivity = useMemo(() => {
    const records = activeToolItem.tools
      .map((toolName) => toolActivityMap[toolName])
      .filter(Boolean) as AgentToolActivityRecord[];
    const latest = getLatestActivityTimestamp(records);
    const lastFailure = getLastFailure(records);
    const lastArtifact = getLastArtifact(records);
    return {
      records,
      totalCalls: records.reduce((sum, record) => sum + record.totalCalls, 0),
      totalSuccesses: records.reduce((sum, record) => sum + record.totalSuccesses, 0),
      totalFailures: records.reduce((sum, record) => sum + record.totalFailures, 0),
      latest,
      lastFailure,
      lastArtifact,
    };
  }, [activeToolItem.tools, toolActivityMap]);
  const filteredConversationMessages = useMemo(() => {
    const messages = activeConversation?.messages || [];
    if (historyFilter === "all") return messages;
    return messages.filter((message) => message.role === historyFilter);
  }, [activeConversation?.messages, historyFilter]);
  const filteredCloudSessionMessages = useMemo(() => {
    const messages = selectedCloudSession?.messages || [];
    if (historyFilter === "all") return messages;
    return messages.filter((message) => message.role === historyFilter);
  }, [historyFilter, selectedCloudSession?.messages]);
  const ActiveToolIcon = activeToolItem.Icon;
  useEffect(() => {
    const onUpdated = () => setRuntimeMetaVersion((value) => value + 1);
    if (typeof window === "undefined") return;
    window.addEventListener(AGENT_ACTIVITY_STORAGE_UPDATED_EVENT, onUpdated);
    return () => {
      window.removeEventListener(AGENT_ACTIVITY_STORAGE_UPDATED_EVENT, onUpdated);
    };
  }, []);

  const getAuthToken = useCallback(async () => {
    try {
      return await getToken({ template: "default" });
    } catch {
      return null;
    }
  }, [getToken]);

  const loadObservability = useCallback(async (traceIdOverride?: string) => {
    if (!isAuthSignedIn || !activeConversation?.id) {
      setObservabilityData(null);
      setObservabilityError(null);
      return;
    }
    setObservabilityLoading(true);
    setObservabilityError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("缺少登录态，无法读取云端 Agent 观测数据。");
      const params = new URLSearchParams({ sessionId: activeConversation.id });
      const traceId = (traceIdOverride || selectedTraceId || "").trim();
      if (traceId) params.set("traceId", traceId);
      const response = await fetch(`/api/agent-observability?${params.toString()}`, {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as any)?.error || `HTTP ${response.status}`));
      }
      setObservabilityData(payload as AgentObservabilityPayload);
    } catch (error: any) {
      setObservabilityError(error?.message || "无法加载 Agent 观测数据。");
      setObservabilityData(null);
    } finally {
      setObservabilityLoading(false);
    }
  }, [activeConversation?.id, getAuthToken, isAuthSignedIn, selectedTraceId]);

  useEffect(() => {
    if (!isOpen || selectedPanel !== "history") return;
    void loadObservability();
  }, [isOpen, loadObservability, runtimeMetaVersion, selectedPanel]);

  useEffect(() => {
    setSelectedTraceId("");
    setTraceProviderFilter("all");
    setTraceStatusFilter("all");
    setTraceSpanFilter("all");
    setTraceSearch("");
  }, [activeConversation?.id]);
  const updateProjectToolSettings = (patch: Partial<typeof qalamToolSettings.projectData>) => {
    setConfig((prev) => {
      const existing = prev.textConfig.qalamTools?.projectData || {};
      const next = { ...existing, ...patch };
      return {
        ...prev,
        textConfig: {
          ...prev.textConfig,
          qalamTools: {
            ...(prev.textConfig.qalamTools || {}),
            projectData: next,
          },
        },
      };
    });
  };

  const updateAssetToolSettings = (patch: Partial<typeof qalamToolSettings.characterLocation>) => {
    setConfig((prev) => {
      const existing = prev.textConfig.qalamTools?.characterLocation || {};
      const next = { ...existing, ...patch };
      return {
        ...prev,
        textConfig: {
          ...prev.textConfig,
          qalamTools: {
            ...(prev.textConfig.qalamTools || {}),
            characterLocation: next,
          },
        },
      };
    });
  };

  const updateWorkflowToolSettings = (patch: Partial<typeof qalamToolSettings.workflowBuilder>) => {
    setConfig((prev) => {
      const existing = prev.textConfig.qalamTools?.workflowBuilder || {};
      const next = { ...existing, ...patch };
      return {
        ...prev,
        textConfig: {
          ...prev.textConfig,
          qalamTools: {
            ...(prev.textConfig.qalamTools || {}),
            workflowBuilder: next,
          },
        },
      };
    });
  };

  const qwenGroups = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; Icon: React.ComponentType<{ size?: number }>; tone: string; items: QwenModel[] }>();
    qwenChatModels.forEach((model) => {
      const category = getQwenCategory(model);
      if (!groups.has(category.key)) {
        groups.set(category.key, { ...category, items: [] });
      }
      groups.get(category.key)!.items.push(model);
    });
    const order = ["chat", "code", "image", "video", "vision", "audio", "embedding", "rerank"];
    return Array.from(groups.values()).sort((a, b) => {
      const ai = order.indexOf(a.key);
      const bi = order.indexOf(b.key);
      if (ai === -1 && bi === -1) return a.label.localeCompare(b.label);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [qwenChatModels]);

  useEffect(() => {
    if (!qwenChatModels.length && config.textConfig.qwenModels?.length) {
      setQwenChatModels(config.textConfig.qwenModels as QwenModel[]);
    }
  }, [config.textConfig.qwenModels, qwenChatModels.length]);

  useEffect(() => {
    if (!conversationState.items.length) return;
    if (!conversationState.activeId || !conversationState.items.find((item) => item.id === conversationState.activeId)) {
      setConversationState((prev) => ({ ...prev, activeId: prev.items[0]?.id || "" }));
    }
  }, [conversationState.activeId, conversationState.items, setConversationState]);

  useEffect(() => {
    if (!config.textConfig.agentProvider) {
      setConfig((prev) => ({
        ...prev,
        textConfig: {
          ...prev.textConfig,
          agentProvider: "qwen",
          agentBaseUrl: prev.textConfig.agentBaseUrl || QWEN_RESPONSES_BASE_URL,
          agentModel: prev.textConfig.agentModel || QWEN_DEFAULT_MODEL,
        },
      }));
    }
  }, [config.textConfig.agentBaseUrl, config.textConfig.agentModel, config.textConfig.agentProvider, setConfig]);

  useEffect(() => {
    setActiveMultiProvider(resolveMultiProviderKey(config.multimodalConfig.provider));
  }, [config.multimodalConfig.provider]);

  useEffect(() => {
    if (!availableAgentSkills.length) return;
    if (!activeSkillId || !availableAgentSkills.some((skill) => skill.id === activeSkillId)) {
      setActiveSkillId(availableAgentSkills[0].id);
    }
  }, [activeSkillId, availableAgentSkills]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedPanel(requestedPanel);
  }, [isOpen, requestedPanel]);

  const setProvider = (p: AgentTextProvider) => {
    setConfig((prev) => {
      const currentProvider = prev.textConfig.agentProvider || prev.textConfig.provider || "qwen";
      const providerChanged = currentProvider !== p;
      const nextConfig = { ...prev.textConfig };
      if (p === "openrouter") {
        nextConfig.agentBaseUrl = OPENROUTER_BASE_URL;
        nextConfig.agentModel = providerChanged ? "" : resolveAgentModelForProvider(p, nextConfig.agentModel);
      } else if (p === "ark") {
        nextConfig.agentBaseUrl = ARK_RESPONSES_BASE_URL;
        nextConfig.agentModel = providerChanged ? ARK_DEFAULT_MODEL : resolveAgentModelForProvider(p, nextConfig.agentModel);
      } else {
        nextConfig.agentBaseUrl = QWEN_RESPONSES_BASE_URL;
        nextConfig.agentModel = providerChanged ? QWEN_DEFAULT_MODEL : resolveAgentModelForProvider(p, nextConfig.agentModel);
      }

      return {
        ...prev,
        textConfig: {
          ...nextConfig,
          agentProvider: p,
        },
      };
    });
  };

  const setMultiProvider = (provider: MultiProviderKey) => {
    setActiveMultiProvider(provider);
    setConfig((prev) => {
      const nextMulti = { ...prev.multimodalConfig };
      if (provider === "qwen") {
        nextMulti.provider = "wan";
        nextMulti.baseUrl = QWEN_WAN_IMAGE_ENDPOINT;
        nextMulti.model = QWEN_WAN_IMAGE_MODEL;
      } else if (provider === "nanobanana") {
        nextMulti.provider = "nanobanana";
        nextMulti.baseUrl = resolveMultiProviderKey(prev.multimodalConfig.provider) === "nanobanana"
          ? (prev.multimodalConfig.baseUrl || NANOBANANA_PRO_ENDPOINT)
          : NANOBANANA_PRO_ENDPOINT;
        nextMulti.model = NANOBANANA_PRO_MODEL;
        nextMulti.apiKey = "";
      } else {
        nextMulti.provider = "standard";
        nextMulti.baseUrl = OPENROUTER_BASE_URL;
        nextMulti.model = "openrouter-managed";
      }
      return {
        ...prev,
        multimodalConfig: nextMulti,
      };
    });
  };

  const handleNewConversation = () => {
    const id = createStableId("chat");
    const now = Date.now();
    const next: ConversationRecord = {
      id,
      title: "新对话",
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    setConversationState((prev) => ({
      activeId: id,
      items: [next, ...prev.items],
    }));
    setSelectedPanel("history");
  };

  const handleSelectConversation = (id: string) => {
    setConversationState((prev) => ({ ...prev, activeId: id }));
  };

  const handleClearConversation = (id: string) => {
    setConversationState((prev) => {
      const remaining = prev.items.filter((item) => item.id !== id);
      const nextActive =
        prev.activeId === id ? (remaining[0]?.id || "") : prev.activeId;
      if (!remaining.length) {
        const created = {
          id: createStableId("chat"),
          title: "新对话",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
        };
        return { activeId: created.id, items: [created] };
      }
      return { ...prev, activeId: nextActive, items: remaining };
    });
  };

  const handleFetchTextModels = async () => {
    const envKey =
      (typeof import.meta !== "undefined"
        ? (import.meta.env.OPENROUTER_API_KEY || import.meta.env.VITE_OPENROUTER_API_KEY)
        : undefined) ||
      (typeof process !== "undefined"
        ? (process.env?.OPENROUTER_API_KEY || process.env?.VITE_OPENROUTER_API_KEY)
        : undefined);
    const apiKey = config.textConfig.apiKey || envKey;
    const baseUrl = activeAgentBaseUrl || OPENROUTER_BASE_URL;
    if (!apiKey) {
      setTextModelFetchMessage({ type: "error", text: "未检测到 OpenRouter API Key 环境变量。" });
      return;
    }
    setIsLoadingTextModels(true);
    setTextModelFetchMessage(null);
    try {
      const models = await fetchTextModels(baseUrl, apiKey);
      if (models.length > 0) {
        setAvailableTextModels(models);
        setTextModelFetchMessage({ type: "success", text: `获取成功，${models.length} 个模型` });
      } else {
        setTextModelFetchMessage({ type: "success", text: "连接成功，但未返回模型列表" });
      }
    } catch (e: any) {
      setTextModelFetchMessage({ type: "error", text: e.message || "拉取失败" });
    } finally {
      setIsLoadingTextModels(false);
    }
  };

  const handleFetchQwenModels = async () => {
    setIsLoadingQwenChatModels(true);
    setQwenChatFetchMessage(null);
    try {
      const { models, raw } = await fetchQwenModels({
        apiKey: config.textConfig.apiKey || undefined,
        baseUrl: activeAgentBaseUrl || QWEN_RESPONSES_BASE_URL,
      });
      setQwenChatModels(models);
      setQwenModelsRaw(JSON.stringify(raw, null, 2));
      setQwenChatFetchMessage({
        type: "success",
        text: models.length ? `获取成功，${models.length} 个模型` : "获取成功，但返回为空",
      });
      setConfig((prev) => {
        const nextText = {
          ...prev.textConfig,
          qwenModels: models,
        };
        if (models.length) {
          const audioIds = models
            .map((m) => m.id)
            .filter(Boolean)
            .filter((id) => {
              const lower = id.toLowerCase();
              return lower.includes("tts") || lower.includes("audio") || lower.includes("speech");
            });
          const designDefault = audioIds.find((id) => id.toLowerCase().includes("tts-vd")) || audioIds[0];
          const dubbingDefault = audioIds.find((id) => id.toLowerCase().includes("tts-vc")) || audioIds[0];
          if (!nextText.agentModel || !models.find((m) => m.id === nextText.agentModel)) {
            nextText.agentModel = models.find((m) => m.id === QWEN_DEFAULT_MODEL)?.id || QWEN_DEFAULT_MODEL;
          }
          if (designDefault && (!nextText.voiceDesignModel || !audioIds.includes(nextText.voiceDesignModel))) {
            nextText.voiceDesignModel = designDefault;
          }
          if (dubbingDefault && (!nextText.voiceDubbingModel || !audioIds.includes(nextText.voiceDubbingModel))) {
            nextText.voiceDubbingModel = dubbingDefault;
          }
        }
        return { ...prev, textConfig: nextText };
      });
    } catch (e: any) {
      setQwenChatFetchMessage({ type: "error", text: e.message || "拉取失败" });
      setQwenModelsRaw("");
    } finally {
      setIsLoadingQwenChatModels(false);
    }
  };

  const handleFetchArkModels = async () => {
    setIsLoadingArkChatModels(true);
    setArkChatFetchMessage(null);
    try {
      const { models, raw } = await fetchArkModels(activeAgentBaseUrl || ARK_RESPONSES_BASE_URL);
      setArkChatModels(models);
      setArkModelsRaw(JSON.stringify(raw, null, 2));
      setArkChatFetchMessage({
        type: "success",
        text: models.length ? `获取成功，${models.length} 个模型` : "获取成功，但返回为空",
      });
    } catch (e: any) {
      setArkChatFetchMessage({ type: "error", text: e.message || "拉取失败" });
      setArkModelsRaw("");
    } finally {
      setIsLoadingArkChatModels(false);
    }
  };

  const renderCompatibleModelCard = (model: QwenModel | ArkModel, isActive: boolean, onSelect: () => void) => {
    const category = getQwenCategory(model);
    const tags = getQwenTags(model);
    const description = model.description || (model as any).summary || (model as any).display_name || "";
    const owner = model.owned_by || (model as any).provider || (model as any).vendor;
    const createdAt = formatEpochDate((model as any).created);
    return (
      <button
        key={model.id}
        type="button"
        onClick={onSelect}
        className={`text-left rounded-2xl border bg-[var(--app-panel-muted)] p-3 space-y-2 transition ${
          isActive ? "border-amber-300/60 shadow-[0_0_0_1px_rgba(251,191,36,0.35)]" : "border-[var(--app-border)] hover:border-[var(--app-border-strong)]"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-[var(--app-text-primary)]">{model.id}</div>
          <span className={`text-[10px] px-2 py-1 rounded-full border ${category.tone} flex items-center gap-1`}>
            <category.Icon size={10} />
            {category.label}
          </span>
        </div>
        {description && (
          <div className="text-[11px] text-[var(--app-text-secondary)] line-clamp-2">{description}</div>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={`${model.id}-${tag}`}
                className="px-2 py-0.5 rounded-full border border-[var(--app-border)] text-[10px] text-[var(--app-text-secondary)]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {(owner || createdAt) && (
          <div className="text-[10px] text-[var(--app-text-muted)] flex flex-wrap gap-2">
            {owner && <span>owner: {owner}</span>}
            {createdAt && <span>created: {createdAt}</span>}
          </div>
        )}
      </button>
    );
  };

  if (!isOpen) return null;

  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1440;
  const dockLeft = leftOffset > 0 ? Math.min(leftOffset, Math.max(0, viewportWidth - 360)) : 0;
  const panelMeta =
    selectedPanel === "provider"
      ? {
          label: "Provider",
          title: activeType === "chat" ? "Chat Providers" : activeType === "multi" ? "Multi Providers" : "Video Providers",
          description: "统一管理 Agent 路线、模型和 runtime 基线，不再单独悬浮成居中弹窗。",
        }
      : selectedPanel === "tools"
        ? {
            label: "Tools",
            title: activeToolItem.title,
            description: "查看 read / edit / operate 三个能力面的工具构成、边界和最近活动。",
          }
        : selectedPanel === "skills"
          ? {
              label: "Skills",
              title: activeSkill?.title || "Skills",
              description: "内建 skill 作为按需方法包存在，Agent 不会默认预注入，而是在任务需要时检索并读取。",
            }
          : selectedPanel === "dashboard"
            ? {
                label: "Dashboard",
                title: "Project Metrics",
                description: "把 token 用量、项目追踪和 agent setting 合并到同一个侧栏工作面。",
              }
        : {
            label: "History",
            title: "Conversation & Trace",
            description: "在同一块工作台里追踪对话、session 和 SDK tracing 生命周期。",
          };

  return (
    <div
      className="fixed inset-y-0 right-0 z-[75] min-w-0 border-l border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-text-primary)]"
      style={{ left: dockLeft }}
    >
      <div className="grid h-full min-w-0 grid-cols-1 xl:grid-cols-[292px_minmax(0,1fr)]">
        <aside className="min-w-0 overflow-y-auto border-r border-[var(--app-border)] px-5 py-5">
          <div className="space-y-4">
            <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--app-text-secondary)]">
                    Agent Settings
                  </div>
                  <div className="mt-2 text-[13px] leading-6 text-[var(--app-text-secondary)]">
                    和 workspace 一样使用常驻侧栏结构，左边切换 provider / tools / skills / dashboard / history，右边展开当前工作面。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 w-9 shrink-0 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-text-secondary)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)]"
                  title="Close"
                >
                  <X size={14} className="mx-auto" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
                <div className="text-[11px] uppercase tracking-widest app-text-muted">Provider</div>
                <div className="flex flex-col gap-2">
                  {[
                    { key: "chat" as const, label: "Chat", Icon: Sparkles },
                    { key: "multi" as const, label: "Multi", Icon: Eye },
                    { key: "video" as const, label: "Video", Icon: Video },
                  ].map(({ key, label, Icon }) => {
                    const active = activeType === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setActiveType(key);
                          setSelectedPanel("provider");
                        }}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[12px] border transition ${
                          active
                            ? "bg-[var(--app-panel-soft)] border-[var(--app-border-strong)] text-[var(--app-text-primary)]"
                            : "border-[var(--app-border)] text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)]"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Icon size={14} className={active ? "text-[var(--app-text-primary)]" : "text-[var(--app-text-secondary)]"} />
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
                <div className="text-[11px] uppercase tracking-widest app-text-muted">Tools</div>
                <div className="flex flex-col gap-2">
                  {TOOL_ITEMS.map(({ key, title, Icon, tools }) => {
                    const active = activeTool === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setActiveTool(key);
                          setSelectedPanel("tools");
                        }}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[12px] border transition ${
                          active
                            ? "bg-[var(--app-panel-soft)] border-[var(--app-border-strong)] text-[var(--app-text-primary)]"
                            : "border-[var(--app-border)] text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)]"
                        }`}
                      >
                        <span className="flex items-center gap-3 text-left">
                          <span className={`h-8 w-8 rounded-2xl border flex items-center justify-center ${active ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)]" : "border-[var(--app-border)] bg-transparent"}`}>
                            <Icon size={14} className={active ? "text-[var(--app-text-primary)]" : "text-[var(--app-text-secondary)]"} />
                          </span>
                          <span className="text-[12px] font-semibold text-[var(--app-text-primary)]">{title}</span>
                        </span>
                        <span className="shrink-0 rounded-full border border-[var(--app-border)] px-2 py-0.5 text-[10px] text-[var(--app-text-secondary)]">
                          {tools.length} tools
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-widest app-text-muted">Skills</div>
                  <span className="rounded-full border border-[var(--app-border)] px-2 py-0.5 text-[10px] text-[var(--app-text-secondary)]">
                    {availableAgentSkills.length || 0} internal
                  </span>
                </div>
                {availableAgentSkills.length ? (
                  <div className="flex flex-col gap-2">
                    {availableAgentSkills.map((skill) => {
                      const active = activeSkill?.id === skill.id;
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          onClick={() => {
                            setActiveSkillId(skill.id);
                            setSelectedPanel("skills");
                          }}
                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[12px] border transition ${
                            active
                              ? "bg-[var(--app-panel-soft)] border-[var(--app-border-strong)] text-[var(--app-text-primary)]"
                              : "border-[var(--app-border)] text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)]"
                          }`}
                        >
                          <span className="flex items-center gap-3 text-left">
                            <span className={`h-8 w-8 rounded-2xl border flex items-center justify-center ${active ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)]" : "border-[var(--app-border)] bg-transparent"}`}>
                              <Sparkles size={14} className={active ? "text-[var(--app-text-primary)]" : "text-[var(--app-text-secondary)]"} />
                            </span>
                            <span className="text-[12px] font-semibold text-[var(--app-text-primary)]">{skill.title}</span>
                          </span>
                          <span className="rounded-full border border-[var(--app-border)] px-2 py-0.5 text-[10px] text-[var(--app-text-secondary)]">
                            {skill.tags?.length || 0} tags
                          </span>
                        </button>
                      );
                    })}
                    <div className="rounded-xl border border-dashed border-[var(--app-border)] px-3 py-2 text-[11px] leading-5 text-[var(--app-text-muted)]">
                      这些 skill 不会预先注入到系统提示词里。Agent 会在任务需要时先调用 skill catalog / read 工具，再按需学习并应用对应方法。
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-[var(--app-text-muted)]">当前没有可启用的内建 skill。</div>
                )}
              </div>

              <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
                <div className="text-[11px] uppercase tracking-widest app-text-muted">Dashboard</div>
                <button
                  type="button"
                  onClick={() => setSelectedPanel("dashboard")}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 rounded-xl text-[12px] border transition ${
                    selectedPanel === "dashboard"
                      ? "bg-[var(--app-panel-soft)] border-[var(--app-border-strong)] text-[var(--app-text-primary)]"
                      : "border-[var(--app-border)] text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)]"
                  }`}
                >
                  <span className="flex items-center gap-3 text-left">
                    <span className={`h-8 w-8 rounded-2xl border flex items-center justify-center ${selectedPanel === "dashboard" ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)]" : "border-[var(--app-border)] bg-transparent"}`}>
                      <Layers size={14} className={selectedPanel === "dashboard" ? "text-[var(--app-text-primary)]" : "text-[var(--app-text-secondary)]"} />
                    </span>
                    <span className="text-[12px] font-semibold text-[var(--app-text-primary)]">dashboard</span>
                  </span>
                  <span className="rounded-full border border-[var(--app-border)] px-2 py-0.5 text-[10px] text-[var(--app-text-secondary)]">
                    metrics
                  </span>
                </button>
              </div>

              <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-widest app-text-muted">History</div>
                  <button
                    type="button"
                    onClick={handleNewConversation}
                    className="px-2 py-1 rounded-full text-[11px] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)] transition"
                  >
                    新对话
                  </button>
                </div>
                {conversationState.items.length ? (
                  <div className="space-y-2">
                    {conversationState.items
                      .slice()
                      .sort((a, b) => b.updatedAt - a.updatedAt)
                      .map((item) => {
                        const active = item.id === conversationState.activeId;
                        const title = item.title || buildConversationTitle(item.messages || []);
                        const preview = (item.messages || [])
                          .filter((m) => m.role === "user" && m.text)
                          .slice(-1)[0]?.text;
                        return (
                          <div
                            key={item.id}
                            className={`rounded-xl border px-3 py-2 text-left transition ${
                              active
                                ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)]"
                                : "border-[var(--app-border)] hover:border-[var(--app-border-strong)]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              handleSelectConversation(item.id);
                              setSelectedPanel("history");
                            }}
                            className="text-[12px] font-semibold text-[var(--app-text-primary)] hover:underline"
                          >
                            {title || "新对话"}
                          </button>
                              <button
                                type="button"
                                onClick={() => handleClearConversation(item.id)}
                                className="text-[11px] text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
                              >
                                清除
                              </button>
                            </div>
                            {preview ? (
                              <div className="mt-1 text-[11px] text-[var(--app-text-secondary)] truncate">
                                {preview}
                              </div>
                            ) : null}
                            <div className="mt-1 text-[10px] text-[var(--app-text-muted)]">
                              {formatTimestamp(item.updatedAt || item.createdAt)}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="text-[11px] app-text-muted">暂无对话记录。</div>
                )}
                <div className="text-[11px] app-text-muted">仅对 Qalam 对话生效。</div>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            <div className="rounded-[30px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-5">
              <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--app-text-secondary)]">
                {panelMeta.label}
              </div>
              <div className="mt-2 flex items-center gap-2 text-[20px] font-semibold tracking-[-0.03em] text-[var(--app-text-primary)]">
                {panelMeta.title}
              </div>
              <div className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--app-text-secondary)]">
                {panelMeta.description}
              </div>
            </div>

            <div className="space-y-4">
              {selectedPanel === "provider" && (
                <>
                  {activeType === "chat" && (
                    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
                      <div className="text-[11px] uppercase tracking-widest app-text-muted">Chat Providers</div>
                      <div className="text-[11px] text-[var(--app-text-muted)]">
                        Qalam Agent 已切换到 OpenAI Agents SDK runtime。当前支持 `Qwen`、`Seed / Ark` 与 `OpenRouter` 三条常规 API 路线。
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { key: "qwen" as AgentTextProvider, label: "Qwen", Icon: QwenIcon },
                          { key: "ark" as AgentTextProvider, label: "Seed / Ark", Icon: Sparkles },
                          { key: "openrouter" as AgentTextProvider, label: "OpenRouter", Icon: Globe },
                        ].map(({ key, label, Icon }) => {
                          const active = activeAgentProvider === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setProvider(key)}
                              className={`flex items-center gap-2 px-3 py-2 rounded-full text-[11px] border transition ${
                                active
                                  ? "bg-[var(--app-panel-soft)] border-[var(--app-border-strong)] text-[var(--app-text-primary)]"
                                  : "border-[var(--app-border)] text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)]"
                              }`}
                            >
                              <Icon size={12} className={active ? "text-[var(--app-text-primary)]" : "text-[var(--app-text-secondary)]"} />
                              {label}
                              {active && <span className="ml-1 text-[10px] text-emerald-400">Active</span>}
                            </button>
                          );
                        })}
                      </div>
                      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-2 text-[11px] text-[var(--app-text-secondary)]">
                        <div>Effective provider: <span className="text-[var(--app-text-primary)]">{activeAgentProvider}</span></div>
                        <div>Effective model: <span className="text-[var(--app-text-primary)]">{activeAgentModel || "unset"}</span></div>
                        <div className="truncate">Effective baseUrl: <span className="text-[var(--app-text-primary)]">{activeAgentBaseUrl || "unset"}</span></div>
                      </div>
                    </div>
                  )}

                  {activeType === "multi" && (
                    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
                      <div className="text-[11px] uppercase tracking-widest app-text-muted">Multi Providers</div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { key: "openrouter" as const, label: "OpenRouter", Icon: Globe },
                          { key: "qwen" as const, label: "Qwen", Icon: QwenIcon },
                          { key: "nanobanana" as const, label: "Nano Banana", Icon: Sparkles },
                        ].map(({ key, label, Icon }) => {
                          const active = activeMultiProvider === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setMultiProvider(key)}
                              className={`flex items-center gap-2 px-3 py-2 rounded-full text-[11px] border transition ${
                                active
                                  ? "bg-[var(--app-panel-soft)] border-[var(--app-border-strong)] text-[var(--app-text-primary)]"
                                  : "border-[var(--app-border)] text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)]"
                              }`}
                            >
                              <Icon size={12} className={active ? "text-[var(--app-text-primary)]" : "text-[var(--app-text-secondary)]"} />
                              {label}
                              {active && <span className="ml-1 text-[10px] text-emerald-400">Active</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeType === "video" && (
                    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
                      <div className="text-[11px] uppercase tracking-widest app-text-muted">Video Providers</div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { key: "sora" as const, label: "Sora", Icon: Sparkles },
                          { key: "qwen" as const, label: "Qwen", Icon: QwenIcon },
                          { key: "vidu" as const, label: "Vidu", Icon: Video },
                          { key: "seedance" as const, label: "Seedance", Icon: Video },
                        ].map(({ key, label, Icon }) => {
                          const active = activeVideoProvider === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setActiveVideoProvider(key)}
                              className={`flex items-center gap-2 px-3 py-2 rounded-full text-[11px] border transition ${
                                active
                                  ? "bg-[var(--app-panel-soft)] border-[var(--app-border-strong)] text-[var(--app-text-primary)]"
                                  : "border-[var(--app-border)] text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)]"
                              }`}
                            >
                              <Icon size={12} className={active ? "text-[var(--app-text-primary)]" : "text-[var(--app-text-secondary)]"} />
                              {label}
                              {active && <span className="ml-1 text-[10px] text-emerald-400">Active</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

          {activeType === "chat" && activeAgentProvider === "openrouter" && (
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
              <div>
                <div className="text-xs text-[var(--app-text-secondary)] mb-1">API Endpoint</div>
                <div className="text-sm text-[var(--app-text-secondary)]">{activeAgentBaseUrl || OPENROUTER_BASE_URL}</div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-[var(--app-text-secondary)]">Target Model</label>
                  <button
                    type="button"
                    onClick={handleFetchTextModels}
                    disabled={isLoadingTextModels}
                    className="text-[11px] flex items-center gap-1 text-sky-300 hover:text-sky-200 disabled:opacity-50"
                  >
                    {isLoadingTextModels ? <Loader2 size={12} className="animate-spin" /> : "拉取模型"}
                  </button>
                </div>
                {textModelFetchMessage && (
                  <div className={`text-[11px] mb-2 flex items-center gap-1 ${textModelFetchMessage.type === "error" ? "text-red-400" : "text-emerald-300"}`}>
                    {textModelFetchMessage.type === "error" ? <AlertCircle size={10} /> : <CheckCircle size={10} />}
                    {textModelFetchMessage.text}
                  </div>
                )}
                {availableTextModels.length > 0 ? (
                  <select
                    value={activeAgentModel}
                    onChange={(e) => setConfig({ ...config, textConfig: { ...config.textConfig, agentModel: e.target.value } })}
                    className="w-full bg-[var(--app-panel-muted)] border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm text-[var(--app-text-primary)] focus:ring-2 focus:ring-sky-400 focus:outline-none"
                  >
                    {availableTextModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. openai/gpt-4.1-mini"
                    value={activeAgentModel}
                    onChange={(e) => setConfig({ ...config, textConfig: { ...config.textConfig, agentModel: e.target.value } })}
                    className="w-full bg-[var(--app-panel-muted)] border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm text-[var(--app-text-primary)] focus:ring-2 focus:ring-sky-400 focus:outline-none"
                  />
                )}
              </div>
              <div className="text-[11px] text-[var(--app-text-muted)]">
                备用路线。使用环境变量 OPENROUTER_API_KEY / VITE_OPENROUTER_API_KEY。
              </div>
            </div>
          )}

          {activeType === "chat" && activeAgentProvider === "ark" && (
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-[var(--app-text-secondary)]">Volcengine Ark</div>
              </div>
              <div className="text-[11px] text-[var(--app-text-muted)]">
                主选路线之一。edge runtime 仅读取 Cloudflare Pages Functions 环境变量 `ARK_API_KEY`，不会把密钥下发到浏览器。Agent 建议优先使用 `doubao-seed-*` 或已开通权限的 `ep-*` 接入点 ID，旧的 `doubao-lite/pro-*` 常会在 Responses 路线上直接 404。
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-xs text-[var(--app-text-secondary)] mb-1">API Endpoint</div>
                  <div className="text-sm text-[var(--app-text-secondary)]">{activeAgentBaseUrl || ARK_RESPONSES_BASE_URL}</div>
                </div>
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] uppercase tracking-widest text-[var(--app-text-muted)]">
                      chat · {arkChatModels.length}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleFetchArkModels}
                        disabled={isLoadingArkChatModels}
                        className="text-[11px] flex items-center gap-1 text-emerald-300 hover:text-emerald-200 disabled:opacity-50"
                      >
                        {isLoadingArkChatModels ? <Loader2 size={12} className="animate-spin" /> : "拉取模型"}
                      </button>
                      {arkModelsRaw && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(arkModelsRaw);
                            } catch {
                              // Ignore clipboard failures.
                            }
                          }}
                          className="text-[11px] flex items-center gap-1 text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
                        >
                          复制原始返回
                        </button>
                      )}
                    </div>
                  </div>
                  {arkChatFetchMessage && (
                    <div className={`text-[11px] flex items-center gap-1 ${arkChatFetchMessage.type === "error" ? "text-red-400" : "text-emerald-300"}`}>
                      {arkChatFetchMessage.type === "error" ? <AlertCircle size={10} /> : <CheckCircle size={10} />}
                      {arkChatFetchMessage.text}
                    </div>
                  )}
                  <select
                    value={activeAgentModel || ARK_DEFAULT_MODEL}
                    onChange={(e) => setConfig({ ...config, textConfig: { ...config.textConfig, agentModel: e.target.value } })}
                    className="w-full bg-[var(--app-panel-muted)] border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm text-[var(--app-text-primary)] focus:ring-2 focus:ring-emerald-300 focus:outline-none"
                  >
                    {(
                      arkChatModels.length
                        ? [
                            ...(activeAgentModel && !arkChatModels.find((m) => m.id === activeAgentModel)
                              ? [{ id: activeAgentModel } as ArkModel]
                              : []),
                            ...arkChatModels,
                          ]
                        : [{ id: ARK_DEFAULT_MODEL } as ArkModel]
                    ).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}
                      </option>
                    ))}
                  </select>
                  {arkChatModels.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {arkChatModels.map((model) =>
                        renderCompatibleModelCard(model, activeAgentModel === model.id, () =>
                          setConfig({ ...config, textConfig: { ...config.textConfig, agentModel: model.id } })
                        )
                      )}
                    </div>
                  ) : (
                    <div className="text-[12px] text-[var(--app-text-muted)]">暂无模型信息，请先拉取。</div>
                  )}
                  {arkModelsRaw && (
                    <div className="pt-3 border-t border-[var(--app-border)]">
                      <button
                        type="button"
                        onClick={() => setShowArkRaw((prev) => !prev)}
                        className="text-[11px] text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
                      >
                        {showArkRaw ? "隐藏原始返回" : "查看原始返回"}
                      </button>
                      {showArkRaw && (
                        <pre className="mt-2 max-h-56 overflow-auto rounded-xl border border-[var(--app-border)] bg-black/30 p-3 text-[10px] text-[var(--app-text-secondary)] whitespace-pre-wrap">
                          {arkModelsRaw}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-[var(--app-text-muted)]">
                  使用方舟 OpenAI 兼容 / Responses 路线。默认基址为 `{ARK_RESPONSES_BASE_URL}`。
                </div>
              </div>
            </div>
          )}

          {activeType === "chat" && activeAgentProvider === "qwen" && (
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-[var(--app-text-secondary)]">Aliyun Qwen</div>
              </div>
              <div className="text-[11px] text-[var(--app-text-muted)]">
                主选路线。使用环境变量 QWEN_API_KEY / VITE_QWEN_API_KEY。模型列表接口返回的是平台可见模型，不等于当前 API Key 一定已开通全部权限；若 404，请先回退到 `qwen-plus`。
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] uppercase tracking-widest text-[var(--app-text-muted)]">
                      chat · {qwenChatModels.length}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleFetchQwenModels}
                        disabled={isLoadingQwenChatModels}
                        className="text-[11px] flex items-center gap-1 text-amber-300 hover:text-amber-200 disabled:opacity-50"
                      >
                        {isLoadingQwenChatModels ? <Loader2 size={12} className="animate-spin" /> : "拉取模型"}
                      </button>
                      {qwenModelsRaw && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(qwenModelsRaw);
                            } catch {
                              // Ignore clipboard failures.
                            }
                          }}
                          className="text-[11px] flex items-center gap-1 text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
                        >
                          复制原始返回
                        </button>
                      )}
                    </div>
                  </div>
                  {qwenChatFetchMessage && (
                    <div className={`text-[11px] flex items-center gap-1 ${qwenChatFetchMessage.type === "error" ? "text-red-400" : "text-emerald-300"}`}>
                      {qwenChatFetchMessage.type === "error" ? <AlertCircle size={10} /> : <CheckCircle size={10} />}
                      {qwenChatFetchMessage.text}
                    </div>
                  )}
                  <select
                    value={activeAgentModel || QWEN_DEFAULT_MODEL}
                    onChange={(e) => setConfig({ ...config, textConfig: { ...config.textConfig, agentModel: e.target.value } })}
                    className="w-full bg-[var(--app-panel-muted)] border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm text-[var(--app-text-primary)] focus:ring-2 focus:ring-amber-300 focus:outline-none"
                  >
                    {(qwenChatModels.length ? qwenChatModels : [{ id: QWEN_DEFAULT_MODEL }]).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}
                      </option>
                    ))}
                  </select>
                  <div className="pt-2 border-t border-[var(--app-border)]">
                    <div className="text-[11px] uppercase tracking-widest text-[var(--app-text-muted)] mb-2">Models</div>
                    {qwenChatModels.length === 0 ? (
                      <div className="text-[12px] text-[var(--app-text-muted)]">暂无模型信息，请先拉取。</div>
                    ) : (
                      <div className="space-y-4">
                        {qwenGroups.map((group) => {
                          const isCollapsed = collapsedGroups[group.key] ?? false;
                          return (
                            <div key={group.key} className="space-y-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setCollapsedGroups((prev) => ({ ...prev, [group.key]: !isCollapsed }))
                                }
                                className="w-full flex items-center justify-between text-[11px] uppercase tracking-widest text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
                              >
                                <span className="flex items-center gap-2">
                                  <group.Icon size={12} />
                                  {group.label} · {group.items.length}
                                </span>
                                <ChevronDown size={12} className={`transition ${isCollapsed ? "-rotate-90" : "rotate-0"}`} />
                              </button>
                              {!isCollapsed && (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                  {group.items.map((model) =>
                                    renderCompatibleModelCard(model, activeAgentModel === model.id, () =>
                                      setConfig({ ...config, textConfig: { ...config.textConfig, agentModel: model.id } })
                                    )
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {qwenModelsRaw && (
                      <div className="pt-3">
                        <button
                          type="button"
                          onClick={() => setShowQwenRaw((prev) => !prev)}
                          className="text-[11px] text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
                        >
                          {showQwenRaw ? "隐藏原始返回" : "查看原始返回"}
                        </button>
                        {showQwenRaw && (
                          <pre className="mt-2 max-h-56 overflow-auto rounded-xl border border-[var(--app-border)] bg-black/30 p-3 text-[10px] text-[var(--app-text-secondary)] whitespace-pre-wrap">
                            {qwenModelsRaw}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}


          {activeType === "multi" && activeMultiProvider === "openrouter" && (
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
              <div className="text-xs text-[var(--app-text-secondary)]">OpenRouter</div>
              <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3 space-y-3">
                <div className="text-[11px] uppercase tracking-widest text-[var(--app-text-muted)]">multimodal-generation · 1</div>
                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3 text-[12px] text-[var(--app-text-secondary)]">
                  固定模型：<span className="text-[var(--app-text-primary)] font-semibold">openrouter-managed</span>
                </div>
                <div className="text-[11px] text-[var(--app-text-muted)]">用于多模态图片生成，占位可替换。</div>
              </div>
              <div className="text-[11px] text-[var(--app-text-muted)]">
                使用环境变量 OPENROUTER_API_KEY / VITE_OPENROUTER_API_KEY。
              </div>
            </div>
          )}

          {activeType === "multi" && activeMultiProvider === "qwen" && (
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
              <div className="text-xs text-[var(--app-text-secondary)]">Aliyun Qwen</div>
              <div className="text-[11px] text-[var(--app-text-muted)]">
                使用环境变量 QWEN_API_KEY / VITE_QWEN_API_KEY。
              </div>
              <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3 space-y-3">
                <div className="text-[11px] uppercase tracking-widest text-[var(--app-text-muted)]">multimodal-generation · 1</div>
                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3 text-[12px] text-[var(--app-text-secondary)]">
                  固定模型：<span className="text-[var(--app-text-primary)] font-semibold">{QWEN_WAN_IMAGE_MODEL}</span>
                </div>
                <div className="text-[11px] text-[var(--app-text-muted)]">用于 WAN Image 节点，端口已固定。</div>
              </div>
            </div>
          )}

          {activeType === "multi" && activeMultiProvider === "nanobanana" && (
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-4">
              <div className="text-xs text-[var(--app-text-secondary)]">Nano Banana</div>
              <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3 space-y-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-[var(--app-text-muted)]">
                  <Sparkles size={12} />
                  async-image-generation · 1
                </div>
                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3 text-[12px] text-[var(--app-text-secondary)]">
                  固定模型：<span className="text-[var(--app-text-primary)] font-semibold">{NANOBANANA_PRO_MODEL}</span>
                </div>
                <div className="text-[11px] text-[var(--app-text-muted)]">
                  按文档走 `application/json` + `Authorization` Header，请求入口固定为异步图片接口。
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-[var(--app-text-secondary)] flex items-center gap-2">
                  <Globe size={12} />
                  API Endpoint
                </label>
                <input
                  type="text"
                  value={config.multimodalConfig.baseUrl || NANOBANANA_PRO_ENDPOINT}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      multimodalConfig: {
                        ...prev.multimodalConfig,
                        provider: "nanobanana",
                        model: NANOBANANA_PRO_MODEL,
                        baseUrl: e.target.value,
                      },
                    }))
                  }
                  className="w-full bg-[var(--app-panel-muted)] border border-[var(--app-border)] rounded-xl px-3 py-2 text-sm text-[var(--app-text-primary)] focus:ring-2 focus:ring-amber-300 focus:outline-none"
                />
              </div>
              <div className="text-[11px] text-[var(--app-text-muted)]">
                API Key 由 Cloudflare Pages Functions 从环境变量自动注入，用户侧不再填写。支持文生图，也支持通过 `urls` 传单张参考图到专属的 Nano Banana 节点。
              </div>
            </div>
          )}

          {activeType === "video" && activeVideoProvider === "sora" && (
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
              <div className="text-sm font-semibold text-[var(--app-text-primary)]">Sora</div>
              <div className="text-[11px] text-[var(--app-text-muted)]">
                Base URL: {SORA_DEFAULT_BASE_URL}
              </div>
              <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-2 text-[12px] text-[var(--app-text-secondary)]">
                固定模型：<span className="text-[var(--app-text-primary)] font-semibold">{SORA_DEFAULT_MODEL}</span>
              </div>
              <div className="text-[11px] text-[var(--app-text-muted)]">
                使用 Video API Key（可通过设置模块/Secrets 同步或在配置文件里填入）。
              </div>
            </div>
          )}

          {activeType === "video" && activeVideoProvider === "qwen" && (
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
              <div className="text-xs text-[var(--app-text-secondary)]">Aliyun Qwen</div>
              <div className="text-[11px] text-[var(--app-text-muted)]">
                使用环境变量 QWEN_API_KEY / VITE_QWEN_API_KEY。
              </div>
              <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3 space-y-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-[var(--app-text-muted)]">
                  <Video size={12} />
                  video-generation · 1
                </div>
                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3 text-[12px] text-[var(--app-text-secondary)]">
                  固定模型：<span className="text-[var(--app-text-primary)] font-semibold">{QWEN_WAN_VIDEO_MODEL}</span>
                </div>
                <div className="text-[11px] text-[var(--app-text-muted)]">用于 WAN Video 节点，端口已固定。</div>
              </div>
            </div>
          )}

          {activeType === "video" && activeVideoProvider === "vidu" && (
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-2">
              <div className="text-sm font-semibold text-[var(--app-text-primary)]">Vidu</div>
              <div className="text-[11px] text-[var(--app-text-muted)]">
                Base URL: {INITIAL_VIDU_CONFIG.baseUrl}
              </div>
              <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-2 text-[12px] text-[var(--app-text-secondary)]">
                固定模型：<span className="text-[var(--app-text-primary)] font-semibold">{INITIAL_VIDU_CONFIG.defaultModel}</span>
              </div>
              <div className="text-[11px] text-[var(--app-text-muted)]">
                使用环境变量 VIDU_API_KEY / VITE_VIDU_API_KEY。
              </div>
              <button
                type="button"
                onClick={() => applyViduReferenceDemo()}
                className="inline-flex items-center justify-center px-3 py-2 rounded-full text-[10px] font-semibold uppercase tracking-widest text-[var(--app-text-secondary)] bg-white/5 hover:bg-white/10 transition"
              >
                载入 Vidu 参考演示
              </button>
            </div>
          )}

          {activeType === "video" && activeVideoProvider === "seedance" && (
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
              <div className="text-sm font-semibold text-[var(--app-text-primary)]">Seedance</div>
              <div className="text-[11px] text-[var(--app-text-muted)]">
                Base URL: {SEEDANCE_DEFAULT_BASE_URL}
              </div>
              <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3 space-y-3">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-[var(--app-text-muted)]">
                  <Video size={12} />
                  video-generation · 2
                </div>
                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3 text-[12px] text-[var(--app-text-secondary)] space-y-1">
                  <div>
                    可选模型：<span className="text-[var(--app-text-primary)] font-semibold">Seedance 2.0</span>
                    <span className="text-[var(--app-text-muted)]"> · {SEEDANCE_DEFAULT_MODEL}</span>
                  </div>
                  <div>
                    可选模型：<span className="text-[var(--app-text-primary)] font-semibold">Seedance 2.0 Fast</span>
                    <span className="text-[var(--app-text-muted)]"> · {SEEDANCE_FAST_MODEL}</span>
                  </div>
                </div>
                <div className="text-[11px] leading-5 text-[var(--app-text-muted)]">
                  固定模式：多模态参考生视频。输入参考图片（0~9）+ 参考视频（0~3）+ 参考音频（0~3）+ 文本提示词（可选）生成 1 个目标视频。
                </div>
                <div className="text-[11px] leading-5 text-[var(--app-text-muted)]">
                  注意：不可单独输入音频，应至少包含 1 个参考视频或图片。
                </div>
              </div>
              <div className="text-[11px] text-[var(--app-text-muted)]">
                使用 ARK_API_KEY / VITE_ARK_API_KEY，或沿用 Video API Key。
              </div>
            </div>
          )}
                </>
              )}

              {selectedPanel === "tools" && (
                <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
                  <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                            <ActiveToolIcon size={16} className="text-[var(--app-text-primary)]" />
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--app-text-muted)]">
                              {activeToolItem.capability} capability
                            </div>
                            <div className="text-[13px] font-semibold text-[var(--app-text-primary)]">
                              {activeToolItem.title}
                            </div>
                          </div>
                        </div>
                        <div className="max-w-[62ch] text-[12px] leading-relaxed text-[var(--app-text-secondary)]">
                          {activeToolItem.description}
                        </div>
                      </div>
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
                        已接入
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">Tool Contract</div>
                        <div className="mt-2 text-[16px] font-semibold text-[var(--app-text-primary)]">{activeToolItem.tools.length}</div>
                        <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">真实 runtime tools</div>
                      </div>
                      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">Persistence</div>
                        <div className="mt-2 text-[16px] font-semibold text-[var(--app-text-primary)]">
                          {activeTool === "project-data" ? "Read-only" : activeTool === "asset-library" ? "Asset-backed" : "Workflow-backed"}
                        </div>
                        <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">{activeToolItem.artifact}</div>
                      </div>
                      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">Boundary</div>
                        <div className="mt-2 text-[16px] font-semibold text-[var(--app-text-primary)]">{activeToolItem.capability}</div>
                        <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">{activeToolItem.boundary}</div>
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-4 space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">Runtime Tools</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {activeToolItem.tools.map((toolName) => (
                            <span
                              key={toolName}
                              className="px-3 py-1.5 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] text-[11px] text-[var(--app-text-primary)]"
                            >
                              {toolName}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">作用对象</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {activeToolItem.surfaces.map((surface) => (
                            <span
                              key={surface}
                              className="px-3 py-1.5 rounded-full border border-[var(--app-border)] text-[11px] text-[var(--app-text-secondary)]"
                            >
                              {surface}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {activeTool === "project-data" ? (
                      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[12px] font-semibold text-[var(--app-text-primary)]">查阅开关</div>
                            <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                              控制 Agent 是否可以读取项目事实层，并以证据驱动回答与后续理解。
                            </div>
                          </div>
                          <label className="flex items-center gap-2 text-[11px] text-[var(--app-text-secondary)]">
                            <input
                              type="checkbox"
                              checked={qalamToolSettings.projectData.enabled}
                              onChange={(e) => updateProjectToolSettings({ enabled: e.target.checked })}
                              className="h-4 w-4 text-emerald-400 border-[var(--app-border)] rounded bg-[var(--app-panel-muted)]"
                            />
                            启用
                          </label>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Evidence Rule</div>
                            <div className="mt-2 text-[11px] leading-relaxed text-[var(--app-text-secondary)]">
                              回答优先引用剧本、分集、场景、角色库和场景库，而不是仅依赖短期对话记忆。
                            </div>
                          </div>
                          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Return Shape</div>
                            <div className="mt-2 text-[11px] leading-relaxed text-[var(--app-text-secondary)]">
                              返回结构化片段、检索命中和 evidence-friendly 摘要，供理解与操作继续消费。
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : activeTool === "workflow-builder" ? (
                      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[12px] font-semibold text-[var(--app-text-primary)]">操作开关</div>
                            <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                              控制 Agent 是否可以把理解转成 NodeFlow 中的真实节点与连线。
                            </div>
                          </div>
                          <label className="flex items-center gap-2 text-[11px] text-[var(--app-text-secondary)]">
                            <input
                              type="checkbox"
                              checked={qalamToolSettings.workflowBuilder.enabled}
                              onChange={(e) => updateWorkflowToolSettings({ enabled: e.target.checked })}
                              className="h-4 w-4 text-emerald-400 border-[var(--app-border)] rounded bg-[var(--app-panel-muted)]"
                            />
                            启用
                          </label>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Single Node</div>
                            <div className="mt-2 text-[11px] leading-relaxed text-[var(--app-text-secondary)]">
                              `operate_project_resource` 负责创建 text、script board、storyboard board、character card。
                            </div>
                          </div>
                          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Connection</div>
                            <div className="mt-2 text-[11px] leading-relaxed text-[var(--app-text-secondary)]">
                              同一个 `operate_project_resource` 也负责连接已存在节点，形成最小工作流骨架。
                            </div>
                          </div>
                          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Safety</div>
                            <div className="mt-2 text-[11px] leading-relaxed text-[var(--app-text-secondary)]">
                              创建前校验 ref、剧集与角色定位；连线前校验节点与 handle 合法性。
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : activeTool === "asset-library" ? (
                      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[12px] font-semibold text-[var(--app-text-primary)]">理解写回开关</div>
                            <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                              控制 Agent 是否可以把对角色、场景与定妆照槽位的理解持久化到资产库。
                            </div>
                          </div>
                          <label className="flex items-center gap-2 text-[11px] text-[var(--app-text-secondary)]">
                            <input
                              type="checkbox"
                              checked={qalamToolSettings.characterLocation.enabled}
                              onChange={(e) => updateAssetToolSettings({ enabled: e.target.checked })}
                              className="h-4 w-4 text-emerald-400 border-[var(--app-border)] rounded bg-[var(--app-panel-muted)]"
                            />
                            启用
                          </label>
                        </div>
                        <div className="text-[11px] text-[var(--app-text-muted)]">
                          下列选项作为默认行为，仅在 tool 参数未显式覆盖时生效。
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] text-[var(--app-text-secondary)] mb-1">记录合并策略</label>
                            <select
                              value={qalamToolSettings.characterLocation.mergeStrategy}
                              onChange={(e) => updateAssetToolSettings({ mergeStrategy: e.target.value as any })}
                              className="w-full bg-[var(--app-panel-muted)] border border-[var(--app-border)] rounded-xl px-3 py-2 text-[12px] text-[var(--app-text-primary)] focus:ring-2 focus:ring-emerald-300 focus:outline-none"
                            >
                              <option value="patch">patch（局部更新）</option>
                              <option value="replace">replace（整段替换）</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] text-[var(--app-text-secondary)] mb-1">角色定妆照槽位合并</label>
                            <select
                              value={qalamToolSettings.characterLocation.formsMode}
                              onChange={(e) => updateAssetToolSettings({ formsMode: e.target.value as any })}
                              className="w-full bg-[var(--app-panel-muted)] border border-[var(--app-border)] rounded-xl px-3 py-2 text-[12px] text-[var(--app-text-primary)] focus:ring-2 focus:ring-emerald-300 focus:outline-none"
                            >
                              <option value="merge">merge（合并）</option>
                              <option value="replace">replace（替换）</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] text-[var(--app-text-secondary)] mb-1">场景定妆照槽位合并</label>
                            <select
                              value={qalamToolSettings.characterLocation.zonesMode}
                              onChange={(e) => updateAssetToolSettings({ zonesMode: e.target.value as any })}
                              className="w-full bg-[var(--app-panel-muted)] border border-[var(--app-border)] rounded-xl px-3 py-2 text-[12px] text-[var(--app-text-primary)] focus:ring-2 focus:ring-emerald-300 focus:outline-none"
                            >
                              <option value="merge">merge（合并）</option>
                              <option value="replace">replace（替换）</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-widest app-text-muted">Capability Map</div>
                      <div className="mt-2 text-[12px] leading-relaxed text-[var(--app-text-secondary)]">
                        单一全能型 Agent 沿着查阅、理解、操作三种动作推进工作，而不是通过多个子 Agent 分工。
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">Runtime Activity</div>
                          <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                            当前能力卡对应的真实 tool 调用轨迹与产物摘要。
                          </div>
                        </div>
                        <span className="rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-2.5 py-1 text-[10px] text-[var(--app-text-secondary)]">
                          {activeToolActivity.records.length}/{activeToolItem.tools.length} 已记录
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">最近调用</div>
                          <div className="mt-2 text-[14px] font-semibold text-[var(--app-text-primary)]">
                            {formatRelativeTime(activeToolActivity.latest)}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">累计调用</div>
                          <div className="mt-2 text-[14px] font-semibold text-[var(--app-text-primary)]">
                            {activeToolActivity.totalCalls}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">成功</div>
                          <div className="mt-2 text-[14px] font-semibold text-emerald-300">
                            {activeToolActivity.totalSuccesses}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">失败</div>
                          <div className="mt-2 text-[14px] font-semibold text-rose-300">
                            {activeToolActivity.totalFailures}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">最近失败</div>
                          <div className="mt-2 text-[11px] leading-relaxed text-[var(--app-text-secondary)]">
                            {activeToolActivity.lastFailure?.lastError
                              ? `${activeToolActivity.lastFailure.toolName} · ${activeToolActivity.lastFailure.lastError}`
                              : "暂无失败记录。"}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">最近产物</div>
                          <div className="mt-2 text-[11px] leading-relaxed text-[var(--app-text-secondary)]">
                            {activeToolActivity.lastArtifact?.lastArtifact
                              ? `${activeToolActivity.lastArtifact.toolName} · ${activeToolActivity.lastArtifact.lastArtifact}`
                              : "暂无持久化或节点产物。"}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {TOOL_ITEMS.map((item, index) => {
                        const active = item.key === activeTool;
                        return (
                          <div
                            key={item.key}
                            className={`rounded-2xl border px-3 py-3 transition ${
                              active
                                ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)]"
                                : "border-[var(--app-border)] bg-transparent"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="h-7 w-7 rounded-full border border-[var(--app-border)] flex items-center justify-center text-[11px] font-semibold text-[var(--app-text-primary)]">
                                  {index + 1}
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">{item.capability}</div>
                                  <div className="text-[12px] font-semibold text-[var(--app-text-primary)]">{item.title}</div>
                                </div>
                              </div>
                              <div className="text-[10px] text-[var(--app-text-muted)]">{item.tools.length} tools</div>
                            </div>
                            <div className="mt-2 text-[11px] leading-relaxed text-[var(--app-text-secondary)]">
                              {item.note}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">Execution Principle</div>
                      <div className="mt-2 text-[11px] leading-relaxed text-[var(--app-text-secondary)]">
                        Agent 的状态变更必须通过 tools 完成。查阅负责取证，理解负责沉淀事实，操作负责把事实转成节点工作流。
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedPanel === "skills" && (
                <div className="space-y-4">
                  {activeSkill ? (
                    <>
                      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] flex items-center justify-center">
                                <Sparkles size={16} className="text-[var(--app-text-primary)]" />
                              </div>
                              <div>
                                <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--app-text-muted)]">internal skill</div>
                                <div className="text-[13px] font-semibold text-[var(--app-text-primary)]">{activeSkill.title}</div>
                              </div>
                            </div>
                            <div className="max-w-[62ch] text-[12px] leading-relaxed text-[var(--app-text-secondary)]">
                              {activeSkill.description}
                            </div>
                          </div>
                          <span className="rounded-full border border-[var(--app-border)] px-2.5 py-1 text-[10px] text-[var(--app-text-secondary)]">
                            on-demand
                          </span>
                        </div>
                        {activeSkill.tags?.length ? (
                          <div className="flex flex-wrap gap-2">
                            {activeSkill.tags.map((tag) => (
                              <span
                                key={`${activeSkill.id}-${tag}`}
                                className="rounded-full border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-2.5 py-1 text-[10px] text-[var(--app-text-secondary)]"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-xl border border-dashed border-[var(--app-border)] px-3 py-2 text-[11px] leading-5 text-[var(--app-text-muted)]">
                        这些 skill 不会预先注入到系统提示词里。Agent 会在任务需要时先调用 skill catalog / read 工具，再按需学习并应用对应方法。
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--app-border)] px-3 py-4 text-[11px] text-[var(--app-text-muted)]">
                      当前没有可启用的内建 skill。
                    </div>
                  )}
                </div>
              )}

              {selectedPanel === "dashboard" && (
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4">
                  <Dashboard data={projectData} isDarkMode={isDarkMode} embedded />
                </div>
              )}

              {selectedPanel === "history" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-widest app-text-muted">History</div>
                        <div className="mt-2 text-[12px] leading-relaxed text-[var(--app-text-secondary)]">
                          当前面板展示用户可见的聊天时间线、Cloudflare D1 持久化的 edge session，以及 OpenAI Agents SDK tracing 生命周期。
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-2.5 py-1 text-[10px] text-[var(--app-text-secondary)]">
                          edge {cloudSessions.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => void loadObservability()}
                          disabled={observabilityLoading || !activeConversation?.id || !isAuthSignedIn}
                          className="rounded-full border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-2.5 py-1 text-[10px] text-[var(--app-text-secondary)] transition hover:bg-[var(--app-panel-muted)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {observabilityLoading ? "刷新中" : "刷新"}
                        </button>
                      </div>
                    </div>
                    {!isAuthSignedIn ? (
                      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-3 text-[11px] text-amber-200">
                        登录后可读取 Cloudflare D1 中的 edge session 与 SDK traces。
                      </div>
                    ) : observabilityError ? (
                      <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3 py-3 text-[11px] text-rose-200">
                        {observabilityError}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: "all", label: "全部" },
                        { key: "user", label: "User" },
                        { key: "assistant", label: "Assistant" },
                        { key: "tool", label: "Tool" },
                      ].map((item) => {
                        const active = historyFilter === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setHistoryFilter(item.key as typeof historyFilter)}
                            className={`rounded-full px-3 py-1.5 text-[11px] transition ${
                              active
                                ? "border border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]"
                                : "border border-[var(--app-border)] bg-transparent text-[var(--app-text-secondary)] hover:bg-[var(--app-panel-soft)]"
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                    {activeConversation ? (
                      <>
                        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3 space-y-1">
                          <div className="text-[12px] font-semibold text-[var(--app-text-primary)]">
                            {activeConversation.title || buildConversationTitle(activeConversation.messages || [])}
                          </div>
                          <div className="text-[10px] text-[var(--app-text-muted)]">
                            聊天更新 {formatTimestamp(activeConversation.updatedAt || activeConversation.createdAt)}
                          </div>
                          <div className="text-[10px] text-[var(--app-text-muted)]">
                            Edge Session 更新 {selectedCloudSession ? formatTimestamp(selectedCloudSession.updatedAt) : "尚未写入 D1"}
                          </div>
                          <div className="text-[10px] text-[var(--app-text-muted)]">
                            最新 Trace {selectedCloudTrace ? formatTimestamp(selectedCloudTrace.updatedAt) : "尚未写入 trace"}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Chat Timeline</div>
                            <div className="mt-2 text-[16px] font-semibold text-[var(--app-text-primary)]">
                              {filteredConversationMessages.length}
                            </div>
                            <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">用户可见消息</div>
                          </div>
                          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Edge Session</div>
                            <div className="mt-2 text-[16px] font-semibold text-[var(--app-text-primary)]">
                              {filteredCloudSessionMessages.length}
                            </div>
                            <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">D1 中的多轮 session items</div>
                          </div>
                          <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">SDK Trace</div>
                            <div className="mt-2 text-[16px] font-semibold text-[var(--app-text-primary)]">
                              {selectedCloudTrace?.spans.length || 0}
                            </div>
                            <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                              {selectedCloudTrace ? `${selectedCloudTrace.provider} · ${selectedCloudTrace.model}` : "暂无 trace"}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-[11px] text-[var(--app-text-muted)]">请选择一条对话。</div>
                    )}
                  </div>

                  {activeConversation && (
                    <div className="grid grid-cols-1 xl:grid-cols-[0.85fr_1.15fr] gap-4">
                      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[11px] uppercase tracking-widest app-text-muted">Chat Timeline</div>
                            <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                              用户在聊天面板可直接看到的消息历史。
                            </div>
                          </div>
                          <span className="rounded-full border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-2.5 py-1 text-[10px] text-[var(--app-text-secondary)]">
                            {filteredConversationMessages.length} msgs
                          </span>
                        </div>
                        <div className="space-y-2">
                          {filteredConversationMessages.length ? (
                            filteredConversationMessages.map((message, index) => (
                              <div
                                key={`${activeConversation.id}-${index}`}
                                className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3"
                              >
                                <div className="text-[10px] uppercase tracking-widest text-[var(--app-text-muted)]">
                                  {message.role || "unknown"}
                                </div>
                                <div className="mt-1 text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap">
                                  {message.text || "（空消息）"}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-4 text-[11px] text-[var(--app-text-muted)]">
                              暂无对话内容。
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-[11px] uppercase tracking-widest app-text-muted">Edge Session Memory</div>
                              <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                                D1 中的真实 session items。这里不再手工裁 history，而是读取 compaction 后的当前真相。
                              </div>
                            </div>
                            <span className="rounded-full border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-2.5 py-1 text-[10px] text-[var(--app-text-secondary)]">
                              {filteredCloudSessionMessages.length} entries
                            </span>
                          </div>
                          {selectedCloudSession ? (
                            <div className="space-y-2">
                              <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-[var(--app-text-secondary)]">
                                  <div>
                                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Session Id</div>
                                    <div className="mt-1 break-all">{selectedCloudSession.sessionId}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Items</div>
                                    <div className="mt-1">{selectedCloudSession.items.length}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Updated</div>
                                    <div className="mt-1">{formatTimestamp(selectedCloudSession.updatedAt)}</div>
                                  </div>
                                </div>
                              </div>
                              {selectedCloudSession.skillReads?.length ? (
                                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3 space-y-2">
                                  <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Read Skill Packages</div>
                                  <div className="flex flex-wrap gap-2">
                                    {selectedCloudSession.skillReads.map((skill) => (
                                      <div
                                        key={`${skill.id}:${skill.version}`}
                                        className="rounded-full border border-[var(--app-border)] px-2.5 py-1 text-[10px] text-[var(--app-text-secondary)]"
                                      >
                                        {skill.title}
                                        {skill.version ? ` · ${skill.version}` : ""}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                              {filteredCloudSessionMessages.length ? (
                                filteredCloudSessionMessages.map((message, index) => (
                                  <div
                                    key={`${selectedCloudSession.sessionId}-${index}`}
                                    className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="space-y-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-[10px] uppercase tracking-widest text-[var(--app-text-muted)]">
                                            {message.role || "unknown"}
                                          </span>
                                          {message.type ? (
                                            <span className="rounded-full border border-[var(--app-border)] px-2 py-0.5 text-[10px] text-[var(--app-text-secondary)]">
                                              {message.type}
                                            </span>
                                          ) : null}
                                        </div>
                                        <div className="text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap">
                                          {typeof message.text === "string" && message.text.trim()
                                            ? message.text
                                            : summarizeRuntimeToolOutput(message)}
                                        </div>
                                      </div>
                                      <div className="text-right text-[10px] text-[var(--app-text-muted)]">
                                        {formatTimestamp(message.createdAt)}
                                      </div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-4 text-[11px] text-[var(--app-text-muted)]">
                                  该对话尚未写入 edge session，或当前过滤条件下没有匹配项。
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-4 text-[11px] text-[var(--app-text-muted)]">
                              尚未读取到该对话对应的云端 session。
                            </div>
                          )}
                        </div>

                        <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-[11px] uppercase tracking-widest app-text-muted">SDK Trace</div>
                              <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                                基于 OpenAI Agents SDK tracing processor 落到 D1 的 run/span 视图。
                              </div>
                            </div>
                            <span className="rounded-full border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-2.5 py-1 text-[10px] text-[var(--app-text-secondary)]">
                              {cloudTraces.length} traces
                            </span>
                          </div>
                          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3 space-y-3">
                            <div className="flex flex-wrap gap-2">
                              {[
                                { key: "all", label: `全部 ${cloudTraces.length}` },
                                {
                                  key: "failed",
                                  label: `失败 ${cloudTraces.filter((trace) => trace.errorCount > 0).length}`,
                                },
                              ].map((item) => {
                                const active = traceStatusFilter === item.key;
                                return (
                                  <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => setTraceStatusFilter(item.key as "all" | "failed")}
                                    className={`rounded-full px-3 py-1.5 text-[11px] transition ${
                                      active
                                        ? "border border-[var(--app-border-strong)] bg-[var(--app-panel-muted)] text-[var(--app-text-primary)]"
                                        : "border border-[var(--app-border)] bg-transparent text-[var(--app-text-secondary)] hover:bg-[var(--app-panel-muted)]"
                                    }`}
                                  >
                                    {item.label}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {traceProviderOptions.map((provider) => {
                                const active = traceProviderFilter === provider;
                                return (
                                  <button
                                    key={provider}
                                    type="button"
                                    onClick={() => setTraceProviderFilter(provider)}
                                    className={`rounded-full px-3 py-1.5 text-[11px] transition ${
                                      active
                                        ? "border border-[var(--app-border-strong)] bg-[var(--app-panel-muted)] text-[var(--app-text-primary)]"
                                        : "border border-[var(--app-border)] bg-transparent text-[var(--app-text-secondary)] hover:bg-[var(--app-panel-muted)]"
                                    }`}
                                  >
                                    {provider === "all" ? "全部 provider" : provider}
                                  </button>
                                );
                              })}
                            </div>
                            <input
                              value={traceSearch}
                              onChange={(e) => setTraceSearch(e.target.value)}
                              placeholder="搜索 model / workflow / trace id"
                              className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-2 text-[12px] text-[var(--app-text-primary)] placeholder:text-[var(--app-text-muted)] focus:ring-2 focus:ring-emerald-300 focus:outline-none"
                            />
                            <div className="space-y-2 max-h-56 overflow-auto pr-1">
                              {filteredTraceSummaries.length ? (
                                filteredTraceSummaries.map((trace) => {
                                  const active = selectedCloudTrace?.traceId === trace.traceId;
                                  return (
                                    <button
                                      key={trace.traceId}
                                      type="button"
                                      onClick={() => {
                                        setSelectedTraceId(trace.traceId);
                                        void loadObservability(trace.traceId);
                                      }}
                                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                                        active
                                          ? "border-[var(--app-border-strong)] bg-[var(--app-panel-muted)]"
                                          : "border-[var(--app-border)] bg-transparent hover:bg-[var(--app-panel-muted)]"
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="rounded-full border border-[var(--app-border)] px-2 py-0.5 text-[10px] text-[var(--app-text-secondary)]">
                                              {trace.provider}
                                            </span>
                                            {trace.errorCount > 0 ? (
                                              <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-300">
                                                {trace.errorCount} errors
                                              </span>
                                            ) : null}
                                            <span className="text-[12px] font-semibold text-[var(--app-text-primary)] break-all">
                                              {trace.model}
                                            </span>
                                          </div>
                                          <div className="mt-1 text-[11px] text-[var(--app-text-secondary)] break-all">
                                            {trace.workflowName || "Qalam Edge Agent"}
                                          </div>
                                          <div className="mt-1 text-[10px] text-[var(--app-text-muted)]">
                                            {trace.spanCount} spans
                                          </div>
                                          <div className="mt-1 text-[10px] text-[var(--app-text-muted)] break-all">
                                            {trace.traceId}
                                          </div>
                                        </div>
                                        <div className="text-right text-[10px] text-[var(--app-text-muted)]">
                                          <div>{formatRelativeTime(trace.updatedAt)}</div>
                                          <div className="mt-1">{formatTimestamp(trace.updatedAt)}</div>
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })
                              ) : (
                                <div className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-4 text-[11px] text-[var(--app-text-muted)]">
                                  当前过滤条件下没有 trace。
                                </div>
                              )}
                            </div>
                          </div>
                          {selectedCloudTrace ? (
                            <div className="space-y-3">
                              <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-[var(--app-text-secondary)]">
                                  <div>
                                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Trace Id</div>
                                    <div className="mt-1 break-all">{selectedCloudTrace.traceId}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Provider / Model</div>
                                    <div className="mt-1">{selectedCloudTrace.provider} · {selectedCloudTrace.model}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Workflow</div>
                                    <div className="mt-1">{selectedCloudTrace.workflowName || "Qalam Edge Agent"}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Updated</div>
                                    <div className="mt-1">{formatTimestamp(selectedCloudTrace.updatedAt)}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Span Count</div>
                                    <div className="mt-1">{selectedCloudTrace.spanCount}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Error Count</div>
                                    <div className={`mt-1 ${selectedCloudTrace.errorCount ? "text-rose-300" : ""}`}>
                                      {selectedCloudTrace.errorCount}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              {selectedCloudTrace.skillReads?.length ? (
                                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3 space-y-2">
                                  <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Skill Reads</div>
                                  <div className="flex flex-wrap gap-2">
                                    {selectedCloudTrace.skillReads.map((skill) => (
                                      <div
                                        key={`${skill.id}:${skill.version}`}
                                        className="rounded-full border border-[var(--app-border)] px-2.5 py-1 text-[10px] text-[var(--app-text-secondary)]"
                                      >
                                        {skill.title}
                                        {skill.version ? ` · ${skill.version}` : ""}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                              <div className="flex flex-wrap gap-2">
                                {[
                                  { key: "all", label: `全部 spans ${selectedCloudTrace.spans.length}` },
                                  {
                                    key: "error",
                                    label: `错误 spans ${selectedCloudTrace.spans.filter((span) => span.error).length}`,
                                  },
                                ].map((item) => {
                                  const active = traceSpanFilter === item.key;
                                  return (
                                    <button
                                      key={item.key}
                                      type="button"
                                      onClick={() => setTraceSpanFilter(item.key as "all" | "error")}
                                      className={`rounded-full px-3 py-1.5 text-[11px] transition ${
                                        active
                                          ? "border border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]"
                                          : "border border-[var(--app-border)] bg-transparent text-[var(--app-text-secondary)] hover:bg-[var(--app-panel-soft)]"
                                      }`}
                                    >
                                      {item.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="space-y-2">
                                {visibleSelectedTraceSpans.length ? (
                                  visibleSelectedTraceSpans.map((span) => (
                                    <div
                                      key={span.spanId}
                                      className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[10px] uppercase tracking-widest text-[var(--app-text-muted)]">
                                              {span.spanType}
                                            </span>
                                            <span className="text-[12px] font-semibold text-[var(--app-text-primary)]">
                                              {span.spanName || span.spanId}
                                            </span>
                                            {span.error ? (
                                              <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-300">
                                                error
                                              </span>
                                            ) : null}
                                          </div>
                                          <div className="text-[11px] text-[var(--app-text-secondary)] break-all">
                                            {span.parentId ? `parent: ${span.parentId}` : "root span"}
                                          </div>
                                          {span.error ? (
                                            <div className="text-[11px] text-rose-200 whitespace-pre-wrap">{span.error}</div>
                                          ) : null}
                                        </div>
                                        <div className="text-right text-[10px] text-[var(--app-text-muted)]">
                                          <div>{formatIsoTimestamp(span.startedAt)}</div>
                                          <div className="mt-1">{formatIsoTimestamp(span.endedAt)}</div>
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-4 text-[11px] text-[var(--app-text-muted)]">
                                    当前过滤条件下没有可展示的 span。
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-4 text-[11px] text-[var(--app-text-muted)]">
                              尚未读取到与当前对话关联的 SDK trace。
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="text-[11px] text-[var(--app-text-muted)]">
                    仅对 Qalam 对话生效。当前主链以 Cloudflare edge session 与 SDK trace 为准。
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
