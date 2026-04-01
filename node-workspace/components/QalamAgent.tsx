import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
} from "@phosphor-icons/react";
import { useConfig } from "../../hooks/useConfig";
import { usePersistedState } from "../../hooks/usePersistedState";
import { ProjectData } from "../../types";
import type { NodeFlowFile } from "../types";
import { createStableId } from "../../utils/id";
import { ARK_DEFAULT_MODEL, QWEN_DEFAULT_MODEL } from "../../constants";
import { QalamChatContent } from "./qalam/QalamChatContent";
import type { ChatMessage, Message } from "./qalam/types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import type { QalamAgentBridge } from "../../agents/bridge/qalamBridge";
import { createQalamAgentBridge } from "../../agents/bridge/nodeFlowBridgeCore";
import { createHttpQalamAgentRuntime } from "../../agents/runtime/httpClient";
import { useQalamAgent } from "../../agents/react/useQalamAgent";
import type { QalamAgentRuntime } from "../../agents/runtime/types";

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  getAuthToken?: (options?: { skipCache?: boolean }) => Promise<string | null>;
  onOpenStats?: () => void;
  settingsOpen?: boolean;
  openRequest?: number;
  submitRequest?: { id: number; text: string } | null;
  cancelRequest?: number;
  onCollapsedChange?: (collapsed: boolean) => void;
  onDockFrameChange?: (frame: { dockWidth: number; isSplit: boolean; collapsed: boolean }) => void;
  onSendingChange?: (sending: boolean) => void;
  renderCollapsedTrigger?: boolean;
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
  submitRequest = null,
  cancelRequest = 0,
  onCollapsedChange,
  onDockFrameChange,
  onSendingChange,
  renderCollapsedTrigger = true,
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
        return { activeId: "", items: [] };
      } catch {
        return { activeId: "", items: [] };
      }
    },
  });
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
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );
  const handledSubmitRequestRef = useRef<number>(0);
  const phaseTimerRef = useRef<number | null>(null);
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
      updateProjectData: (updater) => setProjectData((prev) => updater(prev)),
      addNode,
      updateNodeData: (nodeId, data) => updateNodeData(nodeId, data),
      addGraphLink: (sourceRef, targetRef) => addGraphLink(sourceRef, targetRef),
      updateNodeStyle: (nodeId, style) => updateNodeStyle(nodeId, style),
      connectNodes,
      removeNode,
      removeLink,
      toggleLinkPause,
    }),
    [activeView, addNode, updateNodeData, addGraphLink, graphLinks, linkStyle, links, revision, globalAssetHistory, nodeFlowContext, nodes, connectNodes, projectData, removeLink, removeNode, setProjectData, toggleLinkPause, updateNodeStyle, viewport]
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
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
    onCollapsedChange?.(collapsed);
  }, [collapsed, onCollapsedChange]);

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
      collapsed,
    });
  }, [collapsed, onDockFrameChange]);
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
  }, [isSending, importNodeFlow, resolveMentionTags, runAgentMessage, setMessages, setProjectData]);

  const panelClassName = "pointer-events-auto qalam-panel-cloud w-[420px] max-w-[95vw] qalam-panel";
  const dockInset = 16;
  const titleOrigin = { x: 16, y: 10, width: 126, height: 42, radius: 12 };
  const panelStyle: React.CSSProperties | undefined = {
    position: "fixed",
    top: dockInset,
    bottom: dockInset,
    left: dockInset,
    width: Math.min(420, Math.max(320, viewportWidth - dockInset * 2)),
    maxWidth: `calc(100vw - ${dockInset * 2}px)`,
    zIndex: 80,
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
  const wordmarkTone = isSending ? "text-[#eef8f2]" : "text-[var(--app-text-primary)]";
  const qalamMark = (
    <div className="relative inline-flex h-10 items-center">
      <span
        className={`pointer-events-none absolute -inset-x-3 -inset-y-2 rounded-[14px] bg-[radial-gradient(circle_at_20%_50%,rgba(122,183,160,0.18),transparent_30%),radial-gradient(circle_at_75%_25%,rgba(255,255,255,0.1),transparent_42%)] transition-all duration-700 ${isRevealing ? "scale-100 opacity-100" : "scale-95 opacity-35"}`}
      />
      <span className={`relative text-[30px] font-semibold tracking-[-0.065em] transition-colors duration-300 ${wordmarkTone}`}>Qalam</span>
    </div>
  );

  useEffect(() => {
    if (!openRequest) return;
    openPanel();
  }, [openPanel, openRequest]);

  useEffect(() => {
    if (!submitRequest?.id || !submitRequest.text.trim()) return;
    if (handledSubmitRequestRef.current === submitRequest.id) return;
    handledSubmitRequestRef.current = submitRequest.id;
    openPanel();
    void submitText(submitRequest.text);
  }, [openPanel, submitRequest, submitText]);

  if (panelPhase === "collapsed") {
    if (!renderCollapsedTrigger) return null;
    return (
      <button
        onClick={openPanel}
        className="fixed z-[82] pointer-events-auto transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-px"
        aria-label="Open Qalam"
        style={{ left: dockInset + titleOrigin.x, top: dockInset + titleOrigin.y }}
      >
        <span
          style={{ fontFamily: '"Geist", "Avenir Next", "SF Pro Display", "Segoe UI", sans-serif' }}
          className="block"
        >
          {qalamMark}
        </span>
      </button>
    );
  }

  const collapsedClipPath = `inset(${titleOrigin.y}px calc(100% - ${titleOrigin.x + titleOrigin.width}px) calc(100% - ${titleOrigin.y + titleOrigin.height}px) ${titleOrigin.x}px round ${titleOrigin.radius}px)`;

  return (
    <div
      className={panelClassName}
      style={{
        ...panelStyle,
        clipPath:
          panelPhase === "open"
            ? "inset(-56px -72px -180px -36px round 0px)"
            : collapsedClipPath,
        borderRadius: panelPhase === "open" ? 0 : titleOrigin.radius,
        transition: `clip-path ${PANEL_ANIMATION_MS}ms cubic-bezier(0.16,1,0.3,1), border-radius ${PANEL_ANIMATION_MS}ms cubic-bezier(0.16,1,0.3,1), box-shadow ${PANEL_ANIMATION_MS}ms cubic-bezier(0.16,1,0.3,1)`,
        pointerEvents: panelPhase === "closing" ? "none" : "auto",
        overflow: panelPhase === "open" ? "visible" : "hidden",
        fontFamily: '"Geist", "Avenir Next", "SF Pro Display", "Segoe UI", sans-serif',
      }}
    >
      <div
        className={`pointer-events-none absolute left-0 top-0 h-36 w-56 bg-[radial-gradient(circle_at_top_left,rgba(122,183,160,0.22),transparent_62%)] blur-2xl transition-opacity duration-700 ${isRevealing ? "opacity-100" : "opacity-55"}`}
      />
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
        <div className="qalam-header-shell relative z-20 shrink-0 flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {qalamMark}
            <button
              type="button"
              onClick={onOpenStats}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 text-[11px] text-[var(--app-text-muted)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)] hover:text-[var(--app-text-secondary)]"
              title="打开 Agent Setting"
            >
              <span className="text-[var(--app-text-primary)]">Agent Setting</span>
              <span>{formatNumber(tokenUsage)}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={closePanel}
              className="h-9 w-9 rounded-full border border-[var(--app-border)] bg-[var(--app-panel)]/72 text-[var(--app-text-secondary)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-muted)] hover:text-[var(--app-text-primary)]"
              title="Close"
            >
              <X size={14} className="mx-auto" weight="bold" />
            </button>
          </div>
        </div>
        <div className="flex min-h-0 overflow-hidden">
          <QalamChatContent messages={messages} isSending={isSending} />
        </div>
      </div>
    </div>
  );
};
