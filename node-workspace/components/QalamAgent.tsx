import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  At,
  ArrowUp,
  CaretUp,
  CircleNotch,
  GlobeHemisphereWest,
  Lightbulb,
  Paperclip,
  Question,
  Robot,
  SidebarSimple,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import { useConfig } from "../../hooks/useConfig";
import { usePersistedState } from "../../hooks/usePersistedState";
import { ProjectData } from "../../types";
import type { WorkflowFile } from "../types";
import { createStableId } from "../../utils/id";
import { ARK_DEFAULT_MODEL, QWEN_DEFAULT_MODEL } from "../../constants";
import { QalamChatContent } from "./qalam/QalamChatContent";
import type { ChatMessage, Message } from "./qalam/types";
import { useWorkflowStore } from "../store/workflowStore";
import type { QalamAgentBridge, WorkflowBuilderHandle, WorkflowNodeLookupInput } from "../../agents/bridge/qalamBridge";
import { createNodeWorkflowWithBridge } from "../../agents/bridge/workflowBuilder";
import { createHttpQalamAgentRuntime } from "../../agents/runtime/httpClient";
import { useQalamAgent } from "../../agents/react/useQalamAgent";
import { getWorkflowNodeRef, normalizeNodeRef, setWorkflowNodeRef } from "../../agents/runtime/workflowRefs";
import { getNodeHandles, isValidConnection } from "../utils/handles";
import type { QalamAgentRuntime } from "../../agents/runtime/types";

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  getAuthToken?: () => Promise<string | null>;
  onOpenStats?: () => void;
  onToggleAgentSettings?: () => void;
  openRequest?: number;
  submitRequest?: { id: number; text: string } | null;
  onCollapsedChange?: (collapsed: boolean) => void;
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

const edgeIdFromConnection = (sourceNodeId: string, targetNodeId: string, sourceHandle: string, targetHandle: string) =>
  `edge-${sourceNodeId}-${targetNodeId}-${sourceHandle || "default"}-${targetHandle || "default"}`;

const getWorkflowSnapshot = () => useWorkflowStore.getState();

const lookupWorkflowNodeSnapshot = (input: WorkflowNodeLookupInput) => {
  const snapshot = getWorkflowSnapshot();
  const resolvedRef = normalizeNodeRef(input.nodeRef);
  const node = resolvedRef
    ? snapshot.nodes.find((item) => getWorkflowNodeRef(item) === resolvedRef)
    : snapshot.nodes.find((item) => item.id === input.nodeId);
  if (!node) return null;
  const handles = getNodeHandles(node.type);
  return {
    nodeId: node.id,
    nodeRef: getWorkflowNodeRef(node),
    nodeType: node.type,
    inputHandles: handles.inputs as WorkflowBuilderHandle[],
    outputHandles: handles.outputs as WorkflowBuilderHandle[],
  };
};

const resolvePreferredConnectionHandles = (sourceType: string, targetType: string) => {
  const sourceOutputs = getNodeHandles(sourceType).outputs;
  const targetInputs = getNodeHandles(targetType).inputs;
  const multimodalSourceHandle = sourceOutputs.find((handle) => handle === "image" || handle === "text" || handle === "audio");
  if (multimodalSourceHandle && targetInputs.includes("multi")) {
    return { sourceHandle: multimodalSourceHandle as "image" | "text" | "audio", targetHandle: "multi" as const };
  }
  if (sourceOutputs.includes("text") && targetInputs.includes("text")) {
    return { sourceHandle: "text" as const, targetHandle: "text" as const };
  }
  if (sourceOutputs.includes("audio") && targetInputs.includes("audio")) {
    return { sourceHandle: "audio" as const, targetHandle: "audio" as const };
  }
  return null;
};

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
  onToggleAgentSettings,
  openRequest = 0,
  submitRequest = null,
  onCollapsedChange,
  renderCollapsedTrigger = true,
}) => {
  const { config } = useConfig("qalam_config_v1");
  const addNode = useWorkflowStore((state) => state.addNode);
  const updateNodeStyle = useWorkflowStore((state) => state.updateNodeStyle);
  const onConnect = useWorkflowStore((state) => state.onConnect);
  const toggleEdgePause = useWorkflowStore((state) => state.toggleEdgePause);
  const removeNode = useWorkflowStore((state) => state.removeNode);
  const removeEdge = useWorkflowStore((state) => state.removeEdge);
  const loadWorkflow = useWorkflowStore((state) => state.loadWorkflow);
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const edgeStyle = useWorkflowStore((state) => state.edgeStyle);
  const globalAssetHistory = useWorkflowStore((state) => state.globalAssetHistory);
  const labContext = useWorkflowStore((state) => state.labContext);
  const activeView = useWorkflowStore((state) => state.activeView);
  const viewport = useWorkflowStore((state) => state.viewport);
  const [collapsed, setCollapsed] = useState(true);
  const [mood, setMood] = useState<"default" | "thinking" | "loading" | "playful" | "question">("default");
  const [input, setInput] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [isInputFocused, setIsInputFocused] = useState(false);
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [layoutMode, setLayoutMode] = useState<"floating" | "split">("floating");
  const [splitWidth, setSplitWidth] = useState(560);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const handledSubmitRequestRef = useRef<number>(0);
  const bridge = useMemo<QalamAgentBridge>(
    () => ({
      getProjectData: () => projectData,
      updateProjectData: (updater) => setProjectData((prev) => updater(prev)),
      addTextNode: ({ title, text, x, y, parentId }) => {
        const snapshot = getWorkflowSnapshot();
        const hasXY = typeof x === "number" && typeof y === "number";
        const activeViewport = snapshot.viewport || viewport;
        const baseX = activeViewport ? (-activeViewport.x + 120) / activeViewport.zoom : 120;
        const baseY = activeViewport ? (-activeViewport.y + 120) / activeViewport.zoom : 120;
        const offset = (snapshot.nodes.length % 5) * 24;
        const position = hasXY
          ? { x: x as number, y: y as number }
          : { x: Math.round(baseX + offset), y: Math.round(baseY + offset) };
        const nodeId = addNode("text", position, parentId, { title, text });
        return { id: nodeId, title };
      },
      createWorkflowNode: ({ type, nodeRef, title, text, aspectRatio, episodeId, sceneId, displayMode, entityType, entityId, x, y, parentId }) => {
        const snapshot = getWorkflowSnapshot();
        const hasXY = typeof x === "number" && typeof y === "number";
        const activeViewport = snapshot.viewport || viewport;
        const baseX = activeViewport ? (-activeViewport.x + 120) / activeViewport.zoom : 120;
        const baseY = activeViewport ? (-activeViewport.y + 120) / activeViewport.zoom : 120;
        const offset = (snapshot.nodes.length % 5) * 24;
        const position = hasXY
          ? { x: x as number, y: y as number }
          : { x: Math.round(baseX + offset), y: Math.round(baseY + offset) };
        if (!["text", "imageGen", "scriptBoard", "storyboardBoard", "identityCard"].includes(type)) {
          throw new Error("createWorkflowNode 当前仅支持 text、imageGen、scriptBoard、storyboardBoard、identityCard。");
        }
        const resolvedTitle =
          (title || "").trim() ||
          (type === "text"
            ? "文本节点"
            : type === "imageGen"
              ? "Img Gen"
              : type === "scriptBoard"
                ? "剧本卡片"
                : type === "storyboardBoard"
                  ? "分镜表格卡片"
                  : "身份卡片");
        const extraData =
          type === "text"
            ? {
                title: resolvedTitle,
                text: (text || "").trim(),
              }
            : type === "imageGen"
              ? {
                  title: resolvedTitle,
                  aspectRatio: (aspectRatio || "1:1").trim() || "1:1",
                }
              : type === "scriptBoard"
                ? {
                    title: resolvedTitle,
                    episodeId,
                  }
                : type === "storyboardBoard"
                  ? {
                      title: resolvedTitle,
                      episodeId,
                      sceneId: (sceneId || "").trim() || undefined,
                      displayMode: displayMode === "workflow" ? "workflow" : "table",
                    }
                  : {
                      title: resolvedTitle,
                      entityType: entityType === "scene" ? "scene" : "character",
                      entityId: (entityId || "").trim() || undefined,
                    };
        if (type === "text" && !String((extraData as any).text || "").trim()) {
          throw new Error("createWorkflowNode 创建文本节点时缺少 text。");
        }
        const resolvedNodeRef = normalizeNodeRef(nodeRef);
        const nodeId = addNode(type, position, parentId, setWorkflowNodeRef(extraData, resolvedNodeRef));
        const nodeHandles = getNodeHandles(type);
        return {
          nodeId,
          node_id: nodeId,
          nodeRef: resolvedNodeRef || undefined,
          node_ref: resolvedNodeRef || undefined,
          nodeType: type,
          node_type: type,
          title: resolvedTitle,
          defaultOutputHandle: (nodeHandles.outputs[0] as WorkflowBuilderHandle | undefined) ?? null,
          default_output_handle: (nodeHandles.outputs[0] as WorkflowBuilderHandle | undefined) ?? null,
          defaultInputHandles: nodeHandles.inputs as WorkflowBuilderHandle[],
          default_input_handles: nodeHandles.inputs as WorkflowBuilderHandle[],
        };
      },
      getWorkflowNode: ({ nodeId, nodeRef }) =>
        lookupWorkflowNodeSnapshot({
          nodeId,
          nodeRef,
        }),
      connectWorkflowNodes: ({ sourceNodeId, targetNodeId, sourceRef, targetRef, sourceHandle, targetHandle }) => {
        const sourceNode = lookupWorkflowNodeSnapshot({ nodeId: sourceNodeId, nodeRef: sourceRef });
        const targetNode = lookupWorkflowNodeSnapshot({ nodeId: targetNodeId, nodeRef: targetRef });
        if (!sourceNode || !targetNode) {
          throw new Error("connectWorkflowNodes 引用了不存在的节点。请确认 source_ref/target_ref 指向已创建的 workflow_node。");
        }
        const sourceHandles = sourceNode.outputHandles;
        const targetHandles = targetNode.inputHandles;
        if (sourceHandles.length === 0 || targetHandles.length === 0) {
          throw new Error("当前节点类型不存在可用的输入/输出 handle。");
        }
        const preferred = resolvePreferredConnectionHandles(sourceNode.nodeType, targetNode.nodeType);
        const resolvedSourceHandle = sourceHandle || preferred?.sourceHandle;
        const resolvedTargetHandle = targetHandle || preferred?.targetHandle;
        if (!resolvedSourceHandle || !resolvedTargetHandle) {
          throw new Error(
            `connectWorkflowNodes 无法自动推断 ${sourceNode.nodeType} -> ${targetNode.nodeType} 的连接端口。请显式提供 source_handle 和 target_handle。`
          );
        }
        if (!sourceHandles.includes(resolvedSourceHandle) || !targetHandles.includes(resolvedTargetHandle)) {
          throw new Error("connectWorkflowNodes 收到无效的 handle。");
        }
        if (!isValidConnection({ sourceHandle: resolvedSourceHandle, targetHandle: resolvedTargetHandle })) {
          throw new Error("connectWorkflowNodes 收到不合法的连线类型。");
        }
        onConnect({
          source: sourceNode.nodeId,
          target: targetNode.nodeId,
          sourceHandle: resolvedSourceHandle,
          targetHandle: resolvedTargetHandle,
        });
        return {
          edgeId: edgeIdFromConnection(sourceNode.nodeId, targetNode.nodeId, resolvedSourceHandle, resolvedTargetHandle),
          edge_id: edgeIdFromConnection(sourceNode.nodeId, targetNode.nodeId, resolvedSourceHandle, resolvedTargetHandle),
          sourceNodeId: sourceNode.nodeId,
          source_node_id: sourceNode.nodeId,
          targetNodeId: targetNode.nodeId,
          target_node_id: targetNode.nodeId,
          sourceRef: sourceNode.nodeRef || undefined,
          source_ref: sourceNode.nodeRef || undefined,
          targetRef: targetNode.nodeRef || undefined,
          target_ref: targetNode.nodeRef || undefined,
          sourceHandle: resolvedSourceHandle as WorkflowBuilderHandle,
          source_handle: resolvedSourceHandle as WorkflowBuilderHandle,
          targetHandle: resolvedTargetHandle as WorkflowBuilderHandle,
          target_handle: resolvedTargetHandle as WorkflowBuilderHandle,
        };
      },
      createNodeWorkflow: (input) => {
        const baseX = viewport ? (-viewport.x + 120) / viewport.zoom : 120;
        const baseY = viewport ? (-viewport.y + 120) / viewport.zoom : 120;
        const offset = (nodes.length % 5) * 24;
        return createNodeWorkflowWithBridge(
          {
            ...input,
            originX: input.originX ?? Math.round(baseX + offset),
            originY: input.originY ?? Math.round(baseY + offset),
          },
          {
            addNode,
            updateNodeStyle,
            onConnect,
            toggleEdgePause,
            removeNode,
            removeEdge,
          }
        );
      },
      getViewport: () => viewport,
      getNodeCount: () => nodes.length,
    }),
    [addNode, nodes.length, onConnect, projectData, removeEdge, removeNode, setProjectData, toggleEdgePause, updateNodeStyle, viewport]
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
        getWorkflowSnapshot: () =>
          ({
            version: 1,
            name: projectData.fileName || "Qalam Workflow",
            nodes,
            edges,
            edgeStyle,
            globalAssetHistory,
            labContext,
            viewport: viewport || undefined,
            activeView: activeView ?? null,
          }) satisfies WorkflowFile,
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
      edgeStyle,
      edges,
      getAuthToken,
      globalAssetHistory,
      labContext,
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
  const mentionState = useMemo(() => {
    const pos = Math.min(cursorPos, input.length);
    const textBefore = input.slice(0, pos);
    const match = textBefore.match(/@([\w\u4e00-\u9fa5\-\/]*)$/);
    if (!match) return null;
    return {
      query: match[1] || "",
      start: textBefore.lastIndexOf("@"),
      end: pos,
    };
  }, [input, cursorPos]);
  const filteredMentions = useMemo(() => {
    if (!mentionState) return mentionTargets;
    const query = toSearch(mentionState.query.trim());
    if (!query) return mentionTargets;
    return mentionTargets.filter((item) => item.search.includes(query));
  }, [mentionState, mentionTargets]);
  const showMentionPicker = isInputFocused && !!mentionState;
  const mentionTags = useMemo(() => {
    const names = parseMentions(input);
    return names
      .map((name) => mentionIndex.get(toSearch(name)) || null)
      .filter(Boolean) as Array<{ kind: "character" | "location"; name: string; label: string; id?: string }>;
  }, [input, mentionIndex]);
  const currentModelLabel = useMemo(() => {
    const raw = resolveAgentRuntimeModel(config.textConfig);
    return raw || "model";
  }, [config.textConfig]);
  const canSend = input.trim().length > 0 && !isSending;
  const resizeInput = useCallback((el?: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "0px";
    const nextHeight = Math.min(Math.max(el.scrollHeight, 30), 132);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > 132 ? "auto" : "hidden";
  }, []);
  const { sendMessage: runAgentMessage, cancel: cancelAgentRun } = useQalamAgent({
    runtime,
    sessionId: activeConversation?.id || conversationState.activeId || "qalam-default",
    setMessages,
  });
  const splitMinWidth = Math.min(360, Math.max(280, Math.round(viewportWidth * 0.4)));
  const splitMaxWidth = viewportWidth;
  const splitThreshold = 0.72;
  const handleSplitToggle = () => {
    setLayoutMode((prev) => (prev === "split" ? "floating" : "split"));
    setIsFullscreen(false);
    if (typeof window !== "undefined") {
      const width = window.innerWidth;
      setViewportWidth(width);
      if (layoutMode !== "split") {
        const target = Math.round(width * 0.5);
        const localMin = Math.min(360, Math.max(280, Math.round(width * 0.4)));
        const nextWidth = Math.min(Math.max(target, localMin), width);
        setSplitWidth(nextWidth);
        setIsFullscreen(nextWidth >= width * splitThreshold);
      }
    }
  };

  useEffect(() => {
    if (layoutMode !== "split") return;
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
      setIsFullscreen(splitWidth >= window.innerWidth * splitThreshold);
    };
    const handleMove = (e: MouseEvent) => {
      if (!dragStateRef.current) return;
      const delta = e.clientX - dragStateRef.current.startX;
      const nextWidth = Math.min(splitMaxWidth, Math.max(splitMinWidth, dragStateRef.current.startWidth + delta));
      const isWide = nextWidth >= window.innerWidth * splitThreshold;
      setSplitWidth(nextWidth);
      setIsFullscreen(isWide);
    };
    const handleUp = () => {
      dragStateRef.current = null;
      if (typeof document !== "undefined") {
        document.body.classList.remove("qalam-resizing");
      }
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("resize", handleResize);
    };
  }, [layoutMode, splitMaxWidth, splitMinWidth, splitThreshold, splitWidth]);

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
    setInput("");
  }, [activeConversation?.id]);

  useEffect(() => {
    onCollapsedChange?.(collapsed);
  }, [collapsed, onCollapsedChange]);

  useEffect(() => {
    resizeInput(inputRef.current);
  }, [input, resizeInput]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const className = "qalam-split";
    const shouldSplit = layoutMode === "split" && !collapsed;
    if (shouldSplit) {
      root.classList.add(className);
      const width = isFullscreen ? viewportWidth : splitWidth;
      root.style.setProperty("--qalam-split-width", `${width}px`);
    } else {
      root.classList.remove(className);
      root.style.removeProperty("--qalam-split-width");
    }
    return () => {
      root.classList.remove(className);
      root.style.removeProperty("--qalam-split-width");
    };
  }, [layoutMode, splitWidth, isFullscreen, viewportWidth, collapsed]);
  const submitText = useCallback(async (rawText: string) => {
    const cleanedInput = rawText.trim();
    if (!cleanedInput || isSending) return;
    setMood("loading");
    setMessages((prev) => {
      const nextOrder = prev.reduce((max, message) => Math.max(max, message.order || 0), 0) + 1;
      const userMsg: Message = { role: "user", text: cleanedInput, kind: "chat", order: nextOrder };
      return [...prev, userMsg];
    });
    setInput("");
    setIsSending(true);
    try {
      const runResult = await runAgentMessage({
        userText: cleanedInput,
        enabledSkillIds: config.textConfig?.agentSkillIds || [],
        uiContext: {
          mentionTags: mentionTags.map((tag) => ({
            kind: tag.kind,
            name: tag.name,
            id: tag.id,
          })),
        },
      });
      if (runResult.updatedProjectData) {
        setProjectData(runResult.updatedProjectData);
      }
      if (runResult.updatedWorkflow) {
        loadWorkflow(runResult.updatedWorkflow);
      }
    } catch (err: any) {
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
      setMood("thinking");
    }
  }, [config.textConfig?.agentSkillIds, isSending, loadWorkflow, mentionTags, runAgentMessage, setMessages, setProjectData]);

  const sendMessage = useCallback(async () => {
    if (!canSend) return;
    const nextInput = input;
    setInput("");
    await submitText(nextInput);
  }, [canSend, input, submitText]);

  const handleComposerAction = useCallback(() => {
    if (isSending) {
      cancelAgentRun();
      return;
    }
    void sendMessage();
  }, [cancelAgentRun, isSending, sendMessage]);

  const moodVisual = () => {
    if (isSending || mood === "loading") {
      return { icon: <CircleNotch size={16} className="animate-spin text-sky-300" weight="bold" />, bg: "bg-sky-500/20", ring: "ring-sky-300/30" };
    }
    switch (mood) {
      case "thinking":
        return { icon: <Lightbulb size={16} className="text-amber-300" weight="regular" />, bg: "bg-amber-500/15", ring: "ring-amber-300/30" };
      case "playful":
        return { icon: <Sparkle size={16} className="text-sky-300" weight="regular" />, bg: "bg-sky-500/15", ring: "ring-sky-300/30" };
      case "question":
        return { icon: <Question size={16} className="text-stone-300" weight="regular" />, bg: "bg-stone-500/10", ring: "ring-stone-300/30" };
      default:
        return { icon: <Robot size={16} className="text-emerald-300" weight="regular" />, bg: "bg-emerald-500/15", ring: "ring-emerald-300/30" };
    }
  };
  const moodState = moodVisual();
  const isSplit = layoutMode === "split";
  const panelClassName = isSplit
    ? "pointer-events-auto qalam-surface flex flex-col overflow-hidden qalam-panel border-r border-[var(--app-border)] rounded-none"
    : "pointer-events-auto qalam-surface w-[420px] max-w-[95vw] rounded-[30px] flex flex-col overflow-hidden qalam-panel";
  const panelStyle: React.CSSProperties | undefined = isSplit
    ? {
        position: "fixed",
        top: 0,
        bottom: 0,
        left: 0,
        right: isFullscreen ? 0 : undefined,
        width: isFullscreen ? "100vw" : splitWidth,
        maxWidth: "100vw",
        zIndex: 80,
      }
    : {
        position: "fixed",
        top: 16,
        bottom: 16,
        left: 16,
        width: Math.min(420, Math.max(320, viewportWidth - 32)),
        maxWidth: "calc(100vw - 32px)",
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
  useEffect(() => {
    if (isSending) return;
    const order: Array<typeof mood> = ["default", "thinking", "playful", "question"];
    const timer = setInterval(() => {
      setMood((prev) => {
        const next = order[(order.indexOf(prev) + 1) % order.length];
        return next;
      });
    }, 6000);
    return () => clearInterval(timer);
  }, [isSending]);

  useEffect(() => {
    if (!openRequest) return;
    setCollapsed(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      resizeInput(inputRef.current);
    });
  }, [openRequest, resizeInput]);

  useEffect(() => {
    if (!submitRequest?.id || !submitRequest.text.trim()) return;
    if (handledSubmitRequestRef.current === submitRequest.id) return;
    handledSubmitRequestRef.current = submitRequest.id;
    setCollapsed(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      resizeInput(inputRef.current);
    });
    void submitText(submitRequest.text);
  }, [submitRequest, submitText, resizeInput]);

  if (collapsed) {
    if (!renderCollapsedTrigger) return null;
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="qalam-surface flex h-11 items-center gap-2 rounded-full px-3.5 transition-all duration-300 ease-out"
        style={{ fontFamily: '"Geist", "Avenir Next", "SF Pro Display", "Segoe UI", sans-serif' }}
      >
        <span className={`flex items-center justify-center h-7 w-7 rounded-full ${moodState.bg} transition-all duration-300 ease-out`}>
          {moodState.icon}
        </span>
        <span className="text-xs font-semibold tracking-[0.01em]">Qalam</span>
        <CaretUp size={14} className="text-[var(--app-text-secondary)]" weight="bold" />
      </button>
    );
  }

  return (
    <div
      className={panelClassName}
      style={{
        ...panelStyle,
        fontFamily: '"Geist", "Avenir Next", "SF Pro Display", "Segoe UI", sans-serif',
      }}
    >
      {isSplit && !isFullscreen && (
        <div
          className="absolute right-0 top-0 h-full w-2 cursor-col-resize z-20"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragStateRef.current = { startX: e.clientX, startWidth: splitWidth };
            if (typeof document !== "undefined") {
              document.body.classList.add("qalam-resizing");
            }
          }}
        />
      )}
      <div className="qalam-header-shell relative z-20 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="text-[20px] font-semibold tracking-[-0.03em] text-[var(--app-text-primary)]">Qalam</div>
          <button
            type="button"
            onClick={onOpenStats}
            className="rounded-full bg-[var(--app-panel-muted)] px-2.5 py-1 text-[11px] text-[var(--app-text-muted)] transition hover:bg-[var(--app-panel-soft)] hover:text-[var(--app-text-secondary)]"
            title="查看 Dashboard"
          >
            {formatNumber(tokenUsage)}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleAgentSettings}
            className="h-9 w-9 rounded-full border border-[var(--app-border)] bg-[var(--app-panel)]/72 text-[var(--app-text-secondary)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-muted)] hover:text-[var(--app-text-primary)]"
            title="服务商设置"
          >
            <GlobeHemisphereWest size={14} className="mx-auto" weight="regular" />
          </button>
          <button
            onClick={handleSplitToggle}
            className="h-9 w-9 rounded-full border border-[var(--app-border)] bg-[var(--app-panel)]/72 text-[var(--app-text-secondary)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-muted)] hover:text-[var(--app-text-primary)]"
            title={isSplit ? "Exit Split View" : "Split View"}
          >
            <SidebarSimple size={14} className="mx-auto" weight="regular" />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="h-9 w-9 rounded-full border border-[var(--app-border)] bg-[var(--app-panel)]/72 text-[var(--app-text-secondary)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-muted)] hover:text-[var(--app-text-primary)]"
            title="Close"
          >
            <X size={14} className="mx-auto" weight="bold" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <QalamChatContent messages={messages} isSending={isSending} />
      </div>

      <div className="qalam-composer-shell relative shrink-0 px-4 pb-4 pt-3">
        <div
          className="qalam-subtle-surface rounded-[24px] p-3"
          style={{
            boxShadow: "0 18px 40px -30px rgba(44, 72, 47, 0.24), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          <textarea
            ref={inputRef}
            className="qalam-scrollbar w-full bg-transparent text-[13px] leading-6 text-[var(--app-text-primary)] placeholder:text-[var(--app-text-secondary)] resize-none focus:outline-none"
            rows={1}
            placeholder="Ask Qalam about scenes, roles, nodes, workflow changes, or anything in this project."
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setCursorPos(e.target.selectionStart ?? e.target.value.length);
              resizeInput(e.currentTarget);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            onKeyUp={(e) => {
              setCursorPos((e.currentTarget as HTMLTextAreaElement).selectionStart ?? input.length);
            }}
            onClick={(e) => {
              setCursorPos((e.currentTarget as HTMLTextAreaElement).selectionStart ?? input.length);
            }}
            onFocus={(e) => {
              setIsInputFocused(true);
              setCursorPos((e.currentTarget as HTMLTextAreaElement).selectionStart ?? input.length);
            }}
            onBlur={() => {
              setIsInputFocused(false);
            }}
          />

          {showMentionPicker && (
            <div className="qalam-subtle-surface mt-3 rounded-[20px] px-3 py-3 space-y-2">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                <At size={11} weight="regular" />
                选择绑定数据
                {mentionState?.query ? <span className="text-[var(--app-text-muted)]">@{mentionState.query}</span> : null}
              </div>
              {filteredMentions.length > 0 ? (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filteredMentions.map((item) => (
                    <button
                      key={`${item.kind}-${item.name}-${item.id || "none"}`}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const start = mentionState ? mentionState.start : cursorPos;
                        const end = mentionState ? mentionState.end : cursorPos;
                        const before = input.slice(0, start);
                        const after = input.slice(end);
                        const insertion = `@${item.name} `;
                        const next = `${before}${insertion}${after}`;
                        const nextPos = start + insertion.length;
                        setInput(next);
                        setCursorPos(nextPos);
                        requestAnimationFrame(() => {
                          if (!inputRef.current) return;
                          inputRef.current.focus();
                          inputRef.current.setSelectionRange(nextPos, nextPos);
                        });
                      }}
                      className="w-full flex items-center gap-2 rounded-[16px] border border-transparent px-2.5 py-2.5 transition text-left hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-muted)]"
                    >
                      <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">
                        {item.kind === "character" ? "角色" : "场景"}
                      </span>
                      <span className="text-[12px] text-[var(--app-text-primary)]">{item.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-[12px] text-[var(--app-text-secondary)]">未找到匹配项</div>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-text-secondary)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)] hover:text-[var(--app-text-primary)]"
                title="Attachments offline"
              >
                <Paperclip size={14} weight="regular" />
              </button>
              <div className="inline-flex h-9 items-center rounded-full border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-[11px] text-[var(--app-text-secondary)]">
                {currentModelLabel}
              </div>
            </div>
            <button
              onClick={handleComposerAction}
              disabled={!isSending && !canSend}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--app-accent-strong)] text-white transition hover:brightness-105 active:translate-y-px disabled:cursor-not-allowed disabled:bg-[var(--app-accent)]/60 disabled:text-white/75"
              title={isSending ? "停止生成" : "发送"}
              aria-label={isSending ? "停止生成" : "发送"}
            >
              {isSending ? (
                <CircleNotch size={16} className="animate-spin" weight="bold" />
              ) : (
                <ArrowUp size={16} weight="bold" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
