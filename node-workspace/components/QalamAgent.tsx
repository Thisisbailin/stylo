import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfig } from "../../hooks/useConfig";
import { usePersistedState } from "../../hooks/usePersistedState";
import { ProjectData } from "../../types";
import type { NodeFlowFile } from "../types";
import { createStableId } from "../../utils/id";
import { ARK_DEFAULT_MODEL, QWEN_DEFAULT_MODEL } from "../../constants";
import { GLASS_DIFFUSION_PRESETS, GlassDiffusionField } from "./GlassDiffusionField";
import { QalamChatContent } from "./qalam/QalamChatContent";
import type { ApprovalChoice, ApprovalMessage, ApprovalStatus, ChatMessage, Message } from "./qalam/types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import type { QalamAgentBridge } from "../../agents/bridge/qalamBridge";
import { createQalamAgentBridge } from "../../agents/bridge/nodeFlowBridgeCore";
import { createHttpQalamAgentRuntime } from "../../agents/runtime/httpClient";
import { useQalamAgent } from "../../agents/react/useQalamAgent";
import type { QalamAgentRuntime } from "../../agents/runtime/types";
import { useNodeFlowExecutor } from "../store/useNodeFlowExecutor";
import type { NodeFlowExecutionApprovalProposal } from "../nodeflow/approvals";

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  getAuthToken?: (options?: { skipCache?: boolean }) => Promise<string | null>;
  onOpenStats?: () => void;
  settingsOpen?: boolean;
  openRequest?: number;
  closeRequest?: number;
  submitRequest?: { id: number; text: string } | null;
  cancelRequest?: number;
  onCollapsedChange?: (collapsed: boolean) => void;
  onDockFrameChange?: (frame: { dockWidth: number; isSplit: boolean; collapsed: boolean }) => void;
  onSendingChange?: (sending: boolean) => void;
  renderCollapsedTrigger?: boolean;
  agentFirstMode?: boolean;
  conversationStorageKey?: string;
  conversationResetToken?: number;
  panelStyleOverride?: React.CSSProperties;
  showUsageBadge?: boolean;
};

const WORK_HINT_KEYWORDS = [
  "剧本",
  "剧情",
  "场景",
  "角色",
  "剧集",
  "镜头",
  "分镜",
  "对白",
  "台词",
  "理解",
  "understanding",
  "角色库",
  "场景库",
  "总结",
  "梳理",
  "分析",
  "查阅",
  "搜索",
  "提取",
  "生成",
  "写作",
  "改写",
  "优化",
  "Prompt",
  "Sora",
  "节点",
  "工作流",
  "workflow",
];

const toSearch = (value: string) => value.toLowerCase().replace(/\s+/g, "");

const getNodeFlowSnapshot = () => useNodeFlowStore.getState();

const parseMentions = (text: string) => {
  const matches: string[] = text.match(/@([\w\u4e00-\u9fa5\-\/]+)/g) || [];
  const names: string[] = [];
  matches.forEach((m) => {
    const name = m.slice(1);
    if (!names.includes(name)) names.push(name);
  });
  return names;
};

const resolveAgentRuntimeModel = (textConfig: any) => {
  const provider = textConfig?.agentProvider || textConfig?.provider || "qwen";
  const explicitAgentModel = (textConfig?.agentModel || "").trim();
  if (provider === "ark") {
    if (
      !explicitAgentModel ||
      explicitAgentModel === QWEN_DEFAULT_MODEL ||
      explicitAgentModel.startsWith("qwen") ||
      explicitAgentModel.startsWith("doubao-lite-") ||
      explicitAgentModel.startsWith("doubao-pro-")
    ) {
      return ARK_DEFAULT_MODEL;
    }
    return explicitAgentModel;
  }
  if (provider === "qwen") {
    if (!explicitAgentModel || explicitAgentModel.startsWith("doubao-")) {
      const sharedModel = !textConfig?.agentProvider || textConfig?.agentProvider === textConfig?.provider
        ? (textConfig?.model || "").trim()
        : "";
      return sharedModel && !sharedModel.startsWith("doubao-") ? sharedModel : QWEN_DEFAULT_MODEL;
    }
    return explicitAgentModel;
  }
  return explicitAgentModel || (textConfig?.model || "").trim() || "";
};

const resolveAgentProviderConfig = async (textConfig: any) => {
  const provider = textConfig?.agentProvider || textConfig?.provider || "qwen";
  const model = resolveAgentRuntimeModel(textConfig);
  const baseUrl = textConfig?.agentBaseUrl || textConfig?.baseUrl;
  return {
    provider,
    apiKey: textConfig?.apiKey,
    baseUrl,
    model,
    qalamTools: textConfig?.qalamTools,
    tracingDisabled: true,
  };
};

const isBrowserRuntimeDebugEnabled = () =>
  typeof window !== "undefined" &&
  import.meta.env.DEV &&
  window.localStorage.getItem("qalam_agent_runtime_target") === "browser";

const createBrowserRuntimeOverride = (
  bridge: QalamAgentBridge,
  getConfig: () => Promise<any>
): QalamAgentRuntime => {
  let runtimePromise: Promise<QalamAgentRuntime> | null = null;

  const loadRuntime = async () => {
    const [{ createQalamAgentRuntime }, { StaticSkillLoader }, { LocalStorageSessionStore }] = await Promise.all([
      import("../../agents/runtime/agent"),
      import("../../agents/runtime/skills"),
      import("../../agents/runtime/session"),
    ]);
    return createQalamAgentRuntime({
      bridge,
      skillLoader: new StaticSkillLoader(),
      sessionStore: new LocalStorageSessionStore(),
      configProvider: {
        getConfig: async () => ({
          ...(await getConfig()),
          runtimeTarget: "browser" as const,
        }),
      },
    });
  };

  return {
    async run(input, options) {
      if (!isBrowserRuntimeDebugEnabled()) {
        throw new Error("Browser runtime 仅作为本地开发调试入口保留，当前产品路径固定走 edge。");
      }
      if (!runtimePromise) {
        runtimePromise = loadRuntime();
      }
      const runtime = await runtimePromise;
      return runtime.run(input, options);
    },
  };
};

const hasEpisodeSceneRef = (text: string) => {
  if (!text) return false;
  if (/第\s*\d+\s*集/.test(text)) return true;
  if (/\d+\s*[-－–—]\s*\d+/.test(text)) return true; // scene id like 12-3
  return false;
};

const detectWorkIntent = (text: string, hasAttachments: boolean) => {
  if (!text) return false;
  const lowered = text.toLowerCase();
  if (hasAttachments) return true;
  if (hasEpisodeSceneRef(text)) return true;
  return WORK_HINT_KEYWORDS.some((kw) => lowered.includes(kw.toLowerCase()));
};

type ConversationRecord = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
};

type ConversationState = {
  activeId: string;
  items: ConversationRecord[];
};

type ApprovalPreferenceState = Partial<Record<"image_generation" | "video_generation", true>>;

const createApprovalStep = (
  id: string,
  label: string,
  status: "info" | "running" | "success" | "error",
  detail?: string
) => ({
  id,
  label,
  status,
  detail,
  at: Date.now(),
});

const buildApprovalPayload = (
  proposal: NodeFlowExecutionApprovalProposal,
  status: ApprovalMessage["approval"]["status"]
): ApprovalMessage["approval"] => ({
  id: proposal.id,
  nodeId: proposal.nodeId,
  nodeRef: proposal.nodeRef,
  nodeTitle: proposal.nodeTitle,
  action: proposal.action,
  providerLabel: proposal.providerLabel,
  modelLabel: proposal.modelLabel,
  promptPreview: proposal.promptPreview,
  inputSummary: proposal.inputSummary,
  status,
  summary: "等待你的批准后启动执行。",
  steps: [
    createApprovalStep(
      "created",
      "已创建审批请求",
      "info",
      `Agent 已为 ${proposal.nodeTitle} 准备好${proposal.action === "video_generation" ? "视频" : "图片"}生成提案，正在等待你的决定。`
    ),
  ],
  createdAt: proposal.createdAt,
  updatedAt: Date.now(),
});

const upsertApprovalMessage = (
  messages: Message[],
  approval: ApprovalMessage["approval"]
) => {
  const index = messages.findIndex(
    (message) => message.kind === "approval" && message.approval.nodeId === approval.nodeId
  );
  const next: ApprovalMessage = {
    role: "assistant",
    kind: "approval",
    order: index >= 0 ? messages[index].order : messages.reduce((max, message) => Math.max(max, message.order || 0), 0) + 1,
    approval,
  };
  if (index >= 0) {
    const clone = [...messages];
    clone[index] = next;
    return clone;
  }
  return [...messages, next];
};

const patchApprovalMessage = (
  messages: Message[],
  nodeId: string,
  patch: Partial<ApprovalMessage["approval"]>,
  options?: {
    appendStep?: ApprovalMessage["approval"]["steps"][number];
  }
) =>
  messages.map((message) => {
    if (message.kind !== "approval" || message.approval.nodeId !== nodeId) return message;
    const existingSteps = Array.isArray(message.approval.steps) ? message.approval.steps : [];
    const nextSteps =
      options?.appendStep && !existingSteps.some((step) => step.id === options.appendStep!.id)
        ? [...existingSteps, options.appendStep]
        : existingSteps;
    return {
      ...message,
      approval: {
        ...message.approval,
        ...patch,
        steps: nextSteps,
        updatedAt: Date.now(),
      },
    };
  });

const summarizeApprovedExecutionResult = (
  nodeId: string,
  fallbackTitle: string
): { status: ApprovalStatus; summary: string } => {
  const node = useNodeFlowStore.getState().getNodeById(nodeId);
  if (!node) {
    return {
      status: "failed",
      summary: `已批准执行 ${fallbackTitle}，但节点已不存在。请在 NodeFlow 中检查该任务是否被删除。`,
    };
  }
  const title = String((node.data as Record<string, unknown>)?.title || fallbackTitle || node.type);
  const status = String((node.data as Record<string, unknown>)?.status || "");
  const error = String((node.data as Record<string, unknown>)?.error || "").trim();
  const outputImage = String((node.data as Record<string, unknown>)?.outputImage || "").trim();
  const videoUrl = String((node.data as Record<string, unknown>)?.videoUrl || "").trim();

  if (status === "complete") {
    if (outputImage) {
      return {
        status: "completed",
        summary: `已批准并完成图片生成：${title}。结果已经写回节点，当前可以继续围绕这张图进行后续编辑或连线操作。`,
      };
    }
    if (videoUrl) {
      return {
        status: "completed",
        summary: `已批准并完成视频生成：${title}。结果已经写回节点，当前可以继续围绕这段视频进行后续编辑或串联工作流。`,
      };
    }
    return {
      status: "completed",
      summary: `已批准并完成执行：${title}。结果已经写回对应节点。`,
    };
  }

  if (status === "error") {
    return {
      status: "failed",
      summary: `已批准执行 ${title}，但任务失败了。${error || "请检查该节点的配置、输入素材或服务端返回信息。"}`,
    };
  }

  if (status === "loading") {
    return {
      status: "executing",
      summary: `已批准执行 ${title}，任务已经启动，当前仍在处理中。结果会持续写回该节点。`,
    };
  }

  return {
    status: "approved",
    summary: `已批准执行 ${title}。当前节点状态为 ${status || "unknown"}，请继续观察结果回写。`,
  };
};

const buildConversationTitle = (messages: Message[]) => {
  const firstUser = messages.find((m) => m.role === "user" && (m as ChatMessage).text?.trim()) as ChatMessage | undefined;
  if (!firstUser) return "新对话";
  const text = firstUser.text.trim();
  return text.length > 20 ? `${text.slice(0, 20)}...` : text;
};

const createConversationRecord = (messages: Message[] = []): ConversationRecord => {
  const now = Date.now();
  const title = buildConversationTitle(messages);
  return {
    id: createStableId("chat"),
    title,
    createdAt: now,
    updatedAt: now,
    messages,
  };
};

export const QalamAgent: React.FC<Props> = ({
  projectData,
  setProjectData,
  getAuthToken,
  onOpenStats,
  settingsOpen = false,
  openRequest = 0,
  closeRequest = 0,
  submitRequest = null,
  cancelRequest = 0,
  onCollapsedChange,
  onDockFrameChange,
  onSendingChange,
  renderCollapsedTrigger = true,
  agentFirstMode = false,
  conversationStorageKey = "qalam_conversations_v1",
  conversationResetToken,
  panelStyleOverride,
  showUsageBadge = true,
}) => {
  const PANEL_ANIMATION_MS = 460;
  const { config } = useConfig("qalam_config_v1");
  const addNode = useNodeFlowStore((state) => state.addNode);
  const updateNodeData = useNodeFlowStore((state) => state.updateNodeData);
  const addGraphLink = useNodeFlowStore((state) => state.addGraphLink);
  const updateNodeStyle = useNodeFlowStore((state) => state.updateNodeStyle);
  const connectNodes = useNodeFlowStore((state) => state.connectNodes);
  const toggleLinkPause = useNodeFlowStore((state) => state.toggleLinkPause);
  const removeNode = useNodeFlowStore((state) => state.removeNode);
  const removeLink = useNodeFlowStore((state) => state.removeLink);
  const importNodeFlow = useNodeFlowStore((state) => state.importNodeFlow);
  const requestExecutionApproval = useNodeFlowStore((state) => state.requestExecutionApproval);
  const clearExecutionApproval = useNodeFlowStore((state) => state.clearExecutionApproval);
  const setExecutionApprovals = useNodeFlowStore((state) => state.setExecutionApprovals);
  const pendingExecutionApprovals = useNodeFlowStore((state) => state.pendingExecutionApprovals);
  const nodes = useNodeFlowStore((state) => state.nodes);
  const links = useNodeFlowStore((state) => state.links);
  const graphLinks = useNodeFlowStore((state) => state.graphLinks);
  const revision = useNodeFlowStore((state) => state.revision);
  const linkStyle = useNodeFlowStore((state) => state.linkStyle);
  const globalAssetHistory = useNodeFlowStore((state) => state.globalAssetHistory);
  const nodeFlowContext = useNodeFlowStore((state) => state.nodeFlowContext);
  const activeView = useNodeFlowStore((state) => state.activeView);
  const viewport = useNodeFlowStore((state) => state.viewport);
  const [collapsed, setCollapsed] = useState(true);
  const [isRevealing, setIsRevealing] = useState(false);
  const [panelPhase, setPanelPhase] = useState<"collapsed" | "opening" | "open" | "closing">("collapsed");
  const [conversationState, setConversationState] = usePersistedState<ConversationState>({
    key: conversationStorageKey,
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
        return { activeId: "", items: [] };
      } catch {
        return { activeId: "", items: [] };
      }
    },
  });
  const [approvalPreferences, setApprovalPreferences] = usePersistedState<ApprovalPreferenceState>({
    key: "qalam_execution_approval_prefs_v1",
    initialValue: {},
    serialize: (value) => JSON.stringify(value),
    deserialize: (value) => {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    },
  });
  const { approveExecution, dismissExecutionApproval } = useNodeFlowExecutor();
  const clampMessages = useCallback((items: Message[]) => items.slice(-120), []);
  const activeConversation = useMemo(() => {
    if (!conversationState.items.length) return null;
    return (
      conversationState.items.find((item) => item.id === conversationState.activeId) ||
      conversationState.items[0] ||
      null
    );
  }, [conversationState.items, conversationState.activeId]);
  const messages = activeConversation?.messages || [];
  const setMessages = useCallback(
    (updater: Message[] | ((prev: Message[]) => Message[])) => {
      setConversationState((prev) => {
        let items = [...prev.items];
        let activeId = prev.activeId;
        if (!items.length) {
          const created = createConversationRecord();
          items = [created];
          activeId = created.id;
        }
        if (!activeId && items.length) activeId = items[0].id;
        let idx = items.findIndex((item) => item.id === activeId);
        if (idx < 0) {
          const created = createConversationRecord();
          items = [created, ...items];
          activeId = created.id;
          idx = 0;
        }
        const current = items[idx];
        const currentMessages = Array.isArray(current.messages) ? current.messages : [];
        const nextMessages =
          typeof updater === "function" ? (updater as (p: Message[]) => Message[])(currentMessages) : updater;
        const clamped = clampMessages(nextMessages);
        const nextTitle = current.title && current.title !== "新对话" ? current.title : buildConversationTitle(clamped);
        items[idx] = {
          ...current,
          title: nextTitle,
          messages: clamped,
          updatedAt: Date.now(),
        };
        return { ...prev, activeId, items };
      });
    },
    [setConversationState, clampMessages]
  );
  const [isSending, setIsSending] = useState(false);
  const [viewportSize, setViewportSize] = useState(
    typeof window !== "undefined"
      ? { width: window.innerWidth, height: window.innerHeight }
      : { width: 1200, height: 900 }
  );
  const handledSubmitRequestRef = useRef<number>(0);
  const phaseTimerRef = useRef<number | null>(null);
  const messagePanelRef = useRef<HTMLDivElement | null>(null);
  const approvalSyncRef = useRef<string[]>([]);
  const handledConversationResetRef = useRef<number | null>(null);
  const [messagePanelSize, setMessagePanelSize] = useState({ width: 0, height: 0 });
  const effectiveCollapsed = collapsed;
  const bridge = useMemo<QalamAgentBridge>(
    () => createQalamAgentBridge({
      getProjectData: () => projectData,
      getNodeFlowSnapshot: () => ({
        version: 2,
        revision,
        name: projectData.fileName || "Qalam NodeFlow",
        nodes,
        links,
        graphLinks,
        linkStyle,
        globalAssetHistory,
        nodeFlowContext,
        viewport: viewport || undefined,
        activeView,
      }),
      getPendingExecutionApprovals: () => Object.values(pendingExecutionApprovals),
      updateProjectData: (updater) => setProjectData((prev) => updater(prev)),
      addNode,
      updateNodeData: (nodeId, data) => updateNodeData(nodeId, data),
      addGraphLink: (sourceRef, targetRef) => addGraphLink(sourceRef, targetRef),
      updateNodeStyle: (nodeId, style) => updateNodeStyle(nodeId, style),
      connectNodes,
      removeNode,
      removeLink,
      toggleLinkPause,
      requestExecutionApproval,
      clearExecutionApproval,
    }),
    [activeView, addNode, updateNodeData, addGraphLink, graphLinks, linkStyle, links, revision, globalAssetHistory, nodeFlowContext, nodes, connectNodes, pendingExecutionApprovals, projectData, removeLink, removeNode, requestExecutionApproval, clearExecutionApproval, setProjectData, toggleLinkPause, updateNodeStyle, viewport]
  );
  const browserRuntimeOverride = useMemo(
    () =>
      import.meta.env.DEV
        ? createBrowserRuntimeOverride(bridge, () => resolveAgentProviderConfig(config.textConfig))
        : null,
    [bridge, config.textConfig]
  );
  const edgeRuntime = useMemo(
    () =>
      createHttpQalamAgentRuntime({
        endpoint: "/api/agent",
        getRuntimeConfig: () => ({
          provider: config.textConfig?.agentProvider || config.textConfig?.provider,
          model: resolveAgentRuntimeModel(config.textConfig),
          baseUrl: config.textConfig?.agentBaseUrl || config.textConfig?.baseUrl || undefined,
          qalamTools: config.textConfig?.qalamTools,
        }),
        getProjectDataSnapshot: () => projectData,
        getAuthToken,
        getNodeFlowSnapshot: () =>
          ({
            version: 2,
            revision,
            name: projectData.fileName || "Qalam NodeFlow",
            nodes,
            links,
            graphLinks,
            linkStyle,
            globalAssetHistory,
            nodeFlowContext,
            viewport: viewport || undefined,
            activeView: activeView ?? null,
          }) satisfies NodeFlowFile,
      }),
    [
      activeView,
      config.textConfig?.agentBaseUrl,
      config.textConfig?.agentModel,
      config.textConfig?.agentProvider,
      config.textConfig?.baseUrl,
      config.textConfig?.model,
      config.textConfig?.provider,
      config.textConfig?.qalamTools,
      linkStyle,
      links,
      graphLinks,
      revision,
      getAuthToken,
      globalAssetHistory,
      nodeFlowContext,
      nodes,
      projectData,
      viewport,
    ]
  );
  const runtime = useMemo(
    () => ({
      run: (input: any, options?: any) => {
        if (browserRuntimeOverride && isBrowserRuntimeDebugEnabled()) {
          return browserRuntimeOverride.run(input, options);
        }
        return edgeRuntime.run(input, options);
      },
    }),
    [browserRuntimeOverride, edgeRuntime]
  );
  const mentionTargets = useMemo(() => {
    const targets: Array<{ kind: "character" | "location"; name: string; label: string; search: string; id?: string }> = [];
    (projectData.context?.characters || []).forEach((c) => {
      if (!c?.name) return;
      const aliases = [c.name, ...((c.aliases || []).map((item) => item.value))].filter(Boolean);
      const seen = new Set<string>();
      aliases.forEach((alias) => {
        const key = toSearch(alias);
        if (!key || seen.has(key)) return;
        seen.add(key);
        targets.push({
          kind: "character",
          name: alias,
          label: alias === c.name ? `角色 · ${c.name}` : `角色 · ${c.name}（别名）`,
          search: toSearch([alias, c.name, c.role, c.bio, ...(c.tags || [])].filter(Boolean).join(" ")),
          id: c.id,
        });
      });
    });
    (projectData.context?.locations || []).forEach((l) => {
      if (!l?.name) return;
      targets.push({
        kind: "location",
        name: l.name,
        label: `场景 · ${l.name}`,
        search: toSearch(l.name),
        id: l.id,
      });
    });
    return targets;
  }, [projectData.context?.characters, projectData.context?.locations]);
  const mentionIndex = useMemo(() => {
    const map = new Map<string, { kind: "character" | "location"; name: string; label: string; id?: string }>();
    mentionTargets.forEach((item) => {
      const key = toSearch(item.name);
      if (!key || map.has(key)) return;
      map.set(key, item);
    });
    return map;
  }, [mentionTargets]);
  const resolveMentionTags = useCallback(
    (text: string) =>
      parseMentions(text)
        .map((name) => mentionIndex.get(toSearch(name)) || null)
        .filter(Boolean)
        .map((tag) => ({
          kind: tag.kind,
          name: tag.name,
          id: tag.id,
        })),
    [mentionIndex]
  );
  const { sendMessage: runAgentMessage, cancel: cancelAgentRun } = useQalamAgent({
    runtime,
    sessionId: activeConversation?.id || conversationState.activeId || "qalam-default",
    setMessages,
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const node = messagePanelRef.current;
    if (!node) return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      setMessagePanelSize({ width: rect.width, height: rect.height });
    };

    update();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => update());
    observer.observe(node);
    return () => observer.disconnect();
  }, [collapsed, messages.length, panelPhase]);

  useEffect(() => {
    if (conversationState.items.length) return;
    try {
      const stored = localStorage.getItem("qalam_messages_v1");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length) {
          const migrated = createConversationRecord(clampMessages(parsed));
          setConversationState({ activeId: migrated.id, items: [migrated] });
          localStorage.removeItem("qalam_messages_v1");
          return;
        }
      }
    } catch {}
    if (!conversationState.items.length) {
      const created = createConversationRecord();
      setConversationState({ activeId: created.id, items: [created] });
    }
  }, [conversationState.items.length, setConversationState, clampMessages]);

  useEffect(() => {
    if (!conversationState.items.length) return;
    if (!conversationState.activeId) {
      setConversationState((prev) => ({ ...prev, activeId: prev.items[0]?.id || "" }));
      return;
    }
    if (!conversationState.items.find((item) => item.id === conversationState.activeId)) {
      setConversationState((prev) => ({ ...prev, activeId: prev.items[0]?.id || "" }));
    }
  }, [conversationState.activeId, conversationState.items, setConversationState]);

  useEffect(() => {
    if (typeof conversationResetToken !== "number" || conversationResetToken <= 0) return;
    if (handledConversationResetRef.current === conversationResetToken) return;
    handledConversationResetRef.current = conversationResetToken;
    const created = createConversationRecord();
    setConversationState((prev) => ({
      activeId: created.id,
      items: [created, ...prev.items.filter((item) => item.id !== created.id)].slice(0, 12),
    }));
  }, [conversationResetToken, setConversationState]);

  useEffect(() => {
    onCollapsedChange?.(effectiveCollapsed);
  }, [effectiveCollapsed, onCollapsedChange]);

  useEffect(() => {
    onSendingChange?.(isSending);
  }, [isSending, onSendingChange]);

  useEffect(() => {
    return () => {
      if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
    };
  }, []);

  const triggerReveal = useCallback(() => {
    setIsRevealing(true);
    setTimeout(() => setIsRevealing(false), 900);
  }, []);

  const openPanel = useCallback(() => {
    if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
    setCollapsed(false);
    setPanelPhase((prev) => (prev === "open" ? "open" : "opening"));
    triggerReveal();
    phaseTimerRef.current = window.setTimeout(() => {
      setPanelPhase("open");
      phaseTimerRef.current = null;
    }, PANEL_ANIMATION_MS);
  }, [triggerReveal]);

  const closePanel = useCallback(() => {
    if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
    setPanelPhase("closing");
    phaseTimerRef.current = window.setTimeout(() => {
      setCollapsed(true);
      setPanelPhase("collapsed");
      phaseTimerRef.current = null;
    }, PANEL_ANIMATION_MS);
  }, []);

  useEffect(() => {
    if (phaseTimerRef.current) {
      window.clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
    if (!agentFirstMode || !collapsed) return;
    openPanel();
  }, [agentFirstMode, collapsed, openPanel]);

  useEffect(() => {
    if (!settingsOpen) return;
    openPanel();
  }, [openPanel, settingsOpen]);

  useEffect(() => {
    if (!cancelRequest || !isSending) return;
    cancelAgentRun();
  }, [cancelAgentRun, cancelRequest, isSending]);

  useEffect(() => {
    onDockFrameChange?.({
      dockWidth: 0,
      isSplit: false,
      collapsed: effectiveCollapsed,
    });
  }, [effectiveCollapsed, onDockFrameChange]);

  useEffect(() => {
    const proposals = Object.values(pendingExecutionApprovals).sort((a, b) => a.createdAt - b.createdAt);
    const previousNodeIds = new Set(approvalSyncRef.current);
    const newProposals = proposals.filter((proposal) => !previousNodeIds.has(proposal.nodeId));
    approvalSyncRef.current = proposals.map((proposal) => proposal.nodeId);

    if (!proposals.length) return;

    setMessages((prev) => {
      let next = prev;
      proposals.forEach((proposal) => {
        const existing = next.find(
          (message): message is ApprovalMessage =>
            message.kind === "approval" && message.approval.nodeId === proposal.nodeId
        );
        const isSameProposal = existing?.approval.id === proposal.id;
        if (isSameProposal && existing) {
          next = patchApprovalMessage(next, proposal.nodeId, {
            nodeTitle: proposal.nodeTitle,
            providerLabel: proposal.providerLabel,
            modelLabel: proposal.modelLabel,
            promptPreview: proposal.promptPreview,
            inputSummary: proposal.inputSummary,
          });
          return;
        }
        next = upsertApprovalMessage(next, buildApprovalPayload(proposal, "pending"));
      });
      return next;
    });

    if (newProposals.some((proposal) => !approvalPreferences[proposal.action])) {
      openPanel();
    }

    newProposals
      .filter((proposal) => approvalPreferences[proposal.action])
      .forEach((proposal) => {
        setMessages((prev) =>
          patchApprovalMessage(
            prev,
            proposal.nodeId,
            {
              status: "executing",
              summary: `已按你的默认偏好自动批准，正在执行 ${proposal.nodeTitle} 的${proposal.action === "video_generation" ? "视频" : "图片"}生成。`,
            },
            {
              appendStep: createApprovalStep(
                "approved-auto",
                "已自动批准",
                "success",
                "系统根据你的默认偏好自动通过了这次执行请求。"
              ),
            }
          )
        );
        void approveExecution(proposal.nodeId)
          .then(() => {
            const result = summarizeApprovedExecutionResult(proposal.nodeId, proposal.nodeTitle);
            setMessages((prev) => {
              return patchApprovalMessage(
                prev,
                proposal.nodeId,
                { status: result.status, summary: result.summary },
                {
                  appendStep: createApprovalStep(
                    result.status === "failed" ? "completed-error" : "completed-success",
                    result.status === "failed" ? "执行失败" : "执行完成",
                    result.status === "failed" ? "error" : "success",
                    result.summary
                  ),
                }
              );
            });
          })
          .catch((error: any) => {
            const message = `已批准执行 ${proposal.nodeTitle}，但执行过程中出现错误：${String(error?.message || error || "未知错误")}`;
            setMessages((prev) => {
              return patchApprovalMessage(
                prev,
                proposal.nodeId,
                { status: "failed", summary: message },
                {
                  appendStep: createApprovalStep("execution-error", "执行失败", "error", message),
                }
              );
            });
          });
      });
  }, [approvalPreferences, approveExecution, openPanel, pendingExecutionApprovals, setMessages]);

  const submitText = useCallback(async (rawText: string) => {
    const cleanedInput = rawText.trim();
    if (!cleanedInput || isSending) return;
    setMessages((prev) => {
      const nextOrder = prev.reduce((max, message) => Math.max(max, message.order || 0), 0) + 1;
      const userMsg: Message = { role: "user", text: cleanedInput, kind: "chat", order: nextOrder };
      return [...prev, userMsg];
    });
    setIsSending(true);
    try {
      const runResult = await runAgentMessage({
        userText: cleanedInput,
        enabledSkillIds: [],
        uiContext: {
          mentionTags: resolveMentionTags(cleanedInput),
        },
      });
      if (runResult.updatedProjectData) {
        setProjectData(runResult.updatedProjectData);
      }
      if (runResult.updatedNodeFlow) {
        importNodeFlow(runResult.updatedNodeFlow);
      }
      if (runResult.updatedExecutionApprovals) {
        setExecutionApprovals(runResult.updatedExecutionApprovals);
      }
    } catch (err: any) {
      if (err?.qalamAlreadyDisplayed) {
        return;
      }
      const message = String(err?.message || err || "");
      const isAborted =
        err?.name === "AbortError" ||
        message.includes("aborted") ||
        message.includes("AbortError") ||
        message.includes("用户已停止") ||
        message.includes("已取消");
      if (isAborted) {
        setMessages((prev) => {
          const nextOrder = prev.reduce((max, message) => Math.max(max, message.order || 0), 0) + 1;
          return [
            ...prev,
            { role: "assistant", text: "已停止当前任务。", kind: "chat", order: nextOrder },
          ];
        });
        return;
      }
      setMessages((prev) => {
        const nextOrder = prev.reduce((max, message) => Math.max(max, message.order || 0), 0) + 1;
        return [
          ...prev,
          { role: "assistant", text: `请求失败: ${err?.message || err}`, kind: "chat", order: nextOrder },
        ];
      });
    } finally {
      setIsSending(false);
    }
  }, [isSending, importNodeFlow, resolveMentionTags, runAgentMessage, setExecutionApprovals, setMessages, setProjectData]);

  const panelClassName = "pointer-events-auto isolate qalam-panel";
  const dockInset = 16;
  const titleOrigin = { x: 16, y: 10, width: 126, height: 42, radius: 12 };
  const handleApprovalChoice = useCallback(
    async (approval: ApprovalMessage["approval"], choice: ApprovalChoice) => {
      if (choice === "reject_once") {
        dismissExecutionApproval(approval.nodeId);
        setMessages((prev) =>
          patchApprovalMessage(
            prev,
            approval.nodeId,
            {
              status: "rejected",
              summary: `已拒绝本次 ${approval.nodeTitle} 的执行请求。该节点配置会保留，但不会启动生成。`,
            },
            {
              appendStep: createApprovalStep(
                "rejected",
                "已拒绝",
                "error",
                "本次请求不会执行，你可以稍后调整节点配置后再重新发起。"
              ),
            }
          )
        );
        return;
      }
      if (choice === "approve_always") {
        setApprovalPreferences((prev) => ({ ...prev, [approval.action]: true }));
      }
      setMessages((prev) =>
        patchApprovalMessage(
          prev,
          approval.nodeId,
          {
            status: "executing",
            summary:
              choice === "approve_always"
                ? `已批准本次请求，并记住你对${approval.action === "video_generation" ? "视频" : "图片"}生成的默认同意偏好。`
                : `已批准 ${approval.nodeTitle} 的${approval.action === "video_generation" ? "视频" : "图片"}生成请求，正在执行。`,
          },
          {
            appendStep: createApprovalStep(
              choice === "approve_always" ? "approved-always" : "approved-once",
              choice === "approve_always" ? "已批准并记住偏好" : "已批准执行",
              "success",
              choice === "approve_always"
                ? "后续同类 Agent 生成请求会自动通过。"
                : "本次请求已经通过，系统正在启动执行。"
            ),
          }
        )
      );
      try {
        await approveExecution(approval.nodeId);
        const result = summarizeApprovedExecutionResult(approval.nodeId, approval.nodeTitle);
        setMessages((prev) => {
          return patchApprovalMessage(
            prev,
            approval.nodeId,
            { status: result.status, summary: result.summary },
            {
              appendStep: createApprovalStep(
                result.status === "failed" ? "completed-error" : "completed-success",
                result.status === "failed" ? "执行失败" : "执行完成",
                result.status === "failed" ? "error" : "success",
                result.summary
              ),
            }
          );
        });
      } catch (error: any) {
        const message = `已批准执行 ${approval.nodeTitle}，但执行过程中出现错误：${String(error?.message || error || "未知错误")}`;
        setMessages((prev) => {
          return patchApprovalMessage(
            prev,
            approval.nodeId,
            { status: "failed", summary: message },
            {
              appendStep: createApprovalStep("execution-error", "执行失败", "error", message),
            }
          );
        });
      }
    },
    [approveExecution, dismissExecutionApproval, setApprovalPreferences, setMessages]
  );
  const qalamVisibleMaxHeight = Math.max(280, Math.floor(viewportSize.height * 0.65));
  const qalamChromeHeight = 62;
  const messageViewportHeight = Math.max(180, qalamVisibleMaxHeight - qalamChromeHeight);
  const qalamGlassConfig = useMemo(
    () => ({
      ...GLASS_DIFFUSION_PRESETS.mist,
    }),
    []
  );
  const qalamGlassScale = 1.3;
  const qalamTitleBandHeight = titleOrigin.y + titleOrigin.height + 10;
  const qalamUnifiedBaseWidth = Math.max(0, messagePanelSize.width);
  const qalamGlassBaseHeight = Math.min(
    qalamVisibleMaxHeight,
    Math.max(qalamChromeHeight + 12, qalamChromeHeight + messagePanelSize.height)
  );
  const qalamUnifiedBaseHeight = qalamGlassBaseHeight + qalamTitleBandHeight;
  const qalamGlassWidth = Math.max(0, Math.round(qalamUnifiedBaseWidth * qalamGlassScale));
  const qalamGlassHeight = Math.max(0, Math.round(qalamUnifiedBaseHeight * qalamGlassScale));
  const qalamGlassOffsetX = Math.round((qalamGlassWidth - qalamUnifiedBaseWidth) / -2);
  const qalamGlassOffsetY =
    -qalamTitleBandHeight - Math.round((qalamGlassHeight - qalamUnifiedBaseHeight) / 2);
  const panelStyle: React.CSSProperties | undefined = {
    position: "fixed",
    top: dockInset,
    left: dockInset,
    width: agentFirstMode
      ? Math.max(320, viewportSize.width - dockInset * 2)
      : Math.min(420, Math.max(320, viewportSize.width - dockInset * 2)),
    maxWidth: `calc(100vw - ${dockInset * 2}px)`,
    zIndex: 80,
  };
  const resolvedPanelStyle: React.CSSProperties = {
    ...panelStyle,
    ...(panelStyleOverride || {}),
  };

  const tokenUsage = useMemo(() => {
    const sumPhase = (obj: any): number => {
      if (!obj) return 0;
      return Object.keys(obj).reduce((acc: number, key) => acc + (obj[key]?.totalTokens || 0), 0);
    };
    return (
      (projectData.contextUsage?.totalTokens || 0) +
      sumPhase(projectData.phase1Usage) +
      (projectData.phase4Usage?.totalTokens || 0) +
      (projectData.phase5Usage?.totalTokens || 0)
    );
  }, [projectData]);

  const formatNumber = (n: number) => n.toLocaleString();
  const qalamMark = (
    <span
      className={`qalam-wordmark inline-block text-[30px] font-semibold tracking-[-0.065em] transition duration-500 ${
        !effectiveCollapsed || isSending || isRevealing ? "qalam-wordmark--active opacity-100 blur-0" : "opacity-96"
      }`}
    >
      Qalam
    </span>
  );

  useEffect(() => {
    if (!openRequest) return;
    openPanel();
  }, [openPanel, openRequest]);

  useEffect(() => {
    if (!closeRequest) return;
    closePanel();
  }, [closePanel, closeRequest]);

  useEffect(() => {
    if (!submitRequest?.id || !submitRequest.text.trim()) return;
    if (handledSubmitRequestRef.current === submitRequest.id) return;
    handledSubmitRequestRef.current = submitRequest.id;
    openPanel();
    void submitText(submitRequest.text);
  }, [openPanel, submitRequest, submitText]);

  const isOpenPhase = panelPhase === "open";

  return (
    <div
      className={panelClassName}
      style={{
        ...resolvedPanelStyle,
        transition: `opacity ${PANEL_ANIMATION_MS}ms cubic-bezier(0.16,1,0.3,1)`,
        pointerEvents: "none",
        overflow: "visible",
        background: "transparent",
        boxShadow: "none",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        fontFamily: '"Geist", "Avenir Next", "SF Pro Display", "Segoe UI", sans-serif',
      }}
    >
      <div className="relative">
        <div
          className="qalam-header-shell absolute left-4 right-4 z-20 flex items-center justify-between gap-3"
          style={{ top: titleOrigin.y, minHeight: titleOrigin.height }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={collapsed ? openPanel : closePanel}
              className="pointer-events-auto inline-flex items-center transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-px"
              aria-label={collapsed ? "Open Qalam" : "Close Qalam"}
              title={collapsed ? "Open Qalam" : "Close Qalam"}
            >
              {qalamMark}
            </button>
            {!effectiveCollapsed && showUsageBadge && (
              <button
                type="button"
                onClick={onOpenStats}
                className="pointer-events-auto inline-flex h-8 items-center rounded-full border border-white/8 bg-white/6 px-3 text-[11px] text-[var(--app-text-secondary)] backdrop-blur-md transition hover:border-white/12 hover:bg-white/9 hover:text-[var(--app-text-primary)]"
                title="打开 Agent Setting"
              >
                <span>{formatNumber(tokenUsage)}</span>
              </button>
            )}
          </div>
        </div>
        <div
          className={`px-4 pb-4 pt-[46px] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            effectiveCollapsed ? "pointer-events-none translate-y-2 opacity-0" : "pointer-events-auto translate-y-0 opacity-100"
          }`}
        >
          <div className="relative">
            <div
              className="pointer-events-none absolute z-0 transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                left: qalamGlassOffsetX,
                top: qalamGlassOffsetY,
                width: qalamGlassWidth,
                height: qalamGlassHeight,
                opacity: effectiveCollapsed ? 0 : 1,
              }}
            >
              <GlassDiffusionField
                className="absolute inset-0"
                width={qalamGlassWidth}
                height={qalamGlassHeight}
                config={{
                  blur: qalamGlassConfig.blur,
                  fillAlpha: qalamGlassConfig.fillAlpha,
                  saturate: qalamGlassConfig.saturate,
                  fadeInsetX: qalamGlassConfig.fadeInsetX,
                  fadeInsetY: qalamGlassConfig.fadeInsetY,
                  fade: qalamGlassConfig.fade,
                  edgeAlpha: qalamGlassConfig.edgeAlpha,
                  curve: qalamGlassConfig.curve,
                }}
                showBoundary={false}
              />
            </div>
            <div ref={messagePanelRef} className="relative z-10 rounded-[30px] bg-transparent">
              <QalamChatContent
                messages={messages}
                isSending={isSending}
                onApprovalChoice={handleApprovalChoice}
                className="bg-transparent"
                revealMode="latest"
                latestBlockMaxHeight={messageViewportHeight}
                style={{ maxHeight: `${messageViewportHeight}px` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
