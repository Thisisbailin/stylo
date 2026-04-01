import { createNodeFlowMapWithBridge } from "../../agents/bridge/nodeFlowBuilder";
import { runQalamAgentCore } from "../../agents/runtime/core";
import {
  AGENT_HTTP_STREAM_CONTENT_TYPE,
  serializeAgentStreamPacket,
  type AgentHttpRunRequest,
} from "../../agents/runtime/httpProtocol";
import { resolveAgentProvider, resolveBaseUrl, resolveProviderModel } from "../../agents/runtime/providerConfig";
import { resolveActivatedSkills, StaticSkillLoader } from "../../agents/runtime/skills";
import { buildDisabledTools } from "../../agents/runtime/toolPolicy";
import { getNodeFlowRef, normalizeNodeRef, setNodeFlowRef } from "../../agents/runtime/nodeFlowRefs";
import type { AgentRuntimeEvent, QalamRunResult } from "../../agents/runtime/types";
import { createAgentSessionKey, D1EdgeSession, QalamResponsesCompactionSession, readD1SessionMessages, resolveAgentSessionOwner } from "./_agentSessions";
import { ensureQalamTraceProcessor, forceFlushAgentTracing, persistBufferedTrace } from "./_agentTracing";
import type { ProjectData } from "../../types";
import type { NodeFlowFile, NodeFlowNode, NodeFlowNodeData, NodeFlowViewport, NodeType } from "../../node-workspace/types";
import type {
  CreateNodeFlowMapInput,
  WorkflowBuilderHandle,
  NodeFlowNodeLookupInput,
  NodeFlowNodeLookupResult,
} from "../../agents/bridge/qalamBridge";
import { getNodeHandles, isValidConnection } from "../../node-workspace/utils/handles";
import {
  buildNodeFlowLinkId,
  createNodeFlowLink,
  removeNodeFlowLink,
  toggleNodeFlowLinkPause,
} from "../../node-workspace/nodeflow/links";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

const EDGE_AGENT_MAX_TURNS = 50;

const resolveApiKey = (env: Record<string, unknown>, provider: "qwen" | "openrouter" | "ark") => {
  const value =
    provider === "openrouter"
      ? env.OPENROUTER_API_KEY
      : provider === "ark"
        ? env.ARK_API_KEY
      : env.QWEN_API_KEY || env.DASHSCOPE_API_KEY || env.OPENAI_API_KEY;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Pages Functions 未配置 ${provider} 的可用 API Key。`);
  }
  return value.trim();
};

const isDebugEnabled = (env: Record<string, unknown>) => {
  const value = env.AGENT_DEBUG_LOGS;
  return value === "1" || value === "true";
};

const debugLog = (enabled: boolean, runId: string, label: string, payload?: unknown) => {
  if (!enabled || typeof console === "undefined") return;
  const prefix = `[Qalam][edge][${runId}] ${label}`;
  if (payload === undefined) {
    console.log(prefix);
    return;
  }
  console.log(prefix, payload);
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

const createNodeFlowDefaultNodeData = (type: NodeType): NodeFlowNodeData => {
  switch (type) {
    case "text":
      return { title: "", text: "" } as NodeFlowNodeData;
    case "scriptBoard":
      return { title: "剧本面板" } as NodeFlowNodeData;
    case "storyboardBoard":
      return {
        title: "分镜表面板",
        displayMode: "table",
        columnWidths: [96, 280, 170, 220, 220, 200, 180, 180, 280, 280],
        rowHeights: {},
      } as NodeFlowNodeData;
    case "identityCard":
      return {
        title: "角色 / 场景身份卡片",
        avatarOverrides: {},
      } as NodeFlowNodeData;
    case "imageGen":
      return {
        inputImages: [],
        outputImage: null,
        status: "idle",
        error: null,
        aspectRatio: "1:1",
      } as NodeFlowNodeData;
    case "wanImageGen":
      return {
        inputImages: [],
        outputImage: null,
        status: "idle",
        error: null,
        aspectRatio: "1:1",
        model: "wan2.6-image",
        enableInterleave: false,
        watermark: false,
        outputCount: 1,
      } as NodeFlowNodeData;
    case "soraVideoGen":
      return {
        inputImages: [],
        status: "idle",
        error: null,
        aspectRatio: "16:9",
      } as NodeFlowNodeData;
    case "wanVideoGen":
      return {
        inputImages: [],
        status: "idle",
        error: null,
        aspectRatio: "16:9",
        duration: "10s",
        model: "wan2.6-i2v",
        quality: "standard",
        resolution: "720P",
        shotType: "multi",
        watermark: false,
        audioEnabled: false,
        audioUrl: "",
      } as NodeFlowNodeData;
    case "wanReferenceVideoGen":
      return {
        inputImages: [],
        referenceImages: [],
        referenceVideos: [],
        projectReferenceTargets: [],
        status: "idle",
        error: null,
        aspectRatio: "16:9",
        duration: "5s",
        model: "wan2.6-r2v",
        quality: "standard",
        resolution: "720P",
        shotType: "single",
        watermark: false,
        audioEnabled: true,
      } as NodeFlowNodeData;
    case "viduVideoGen":
      return {
        inputImages: [],
        status: "idle",
        error: null,
        mode: "audioVideo",
        useCharacters: true,
        aspectRatio: "16:9",
        resolution: "1080p",
        duration: 10,
        movementAmplitude: "auto",
        offPeak: true,
      } as NodeFlowNodeData;
    case "seedanceVideoGen":
      return {
        inputImages: [],
        referenceVideos: [],
        referenceAudios: [],
        status: "idle",
        error: null,
        model: "doubao-seedance-2-0-260128",
        mode: "multimodalReference",
        resolution: "720p",
        ratio: "adaptive",
        duration: 5,
        generateAudio: true,
        watermark: false,
      } as NodeFlowNodeData;
    case "annotation":
      return {
        sourceImage: null,
        annotations: [],
        outputImage: null,
      } as NodeFlowNodeData;
    case "shot":
      return {
        shotId: "S-1",
        duration: "3s",
        shotType: "Medium Shot",
        focalLength: "",
        movement: "Static",
        composition: "",
        blocking: "",
        dialogue: "",
        sound: "",
        lightingVfx: "",
        editingNotes: "",
        notes: "",
        soraPrompt: "",
        storyboardPrompt: "",
        viewMode: "card",
      } as NodeFlowNodeData;
    case "group":
      return {
        title: "Node Group",
        isExpanded: true,
      } as NodeFlowNodeData;
    default:
      return {} as NodeFlowNodeData;
  }
};

const createNodeFlowBridgeState = (projectData: ProjectData, nodeFlow?: NodeFlowFile) => {
  let currentProjectData = projectData;
  let projectDataUpdated = false;
  let currentNodeFlow: NodeFlowFile = structuredClone(
    nodeFlow || {
      version: 2,
      revision: 0,
      name: projectData.fileName || "Qalam NodeFlow",
      nodes: [],
      links: [],
      linkStyle: "angular",
      globalAssetHistory: [],
      viewport: null,
      activeView: null,
    }
  );
  let nodeFlowUpdated = false;
  let nodeIdCounter = (currentNodeFlow.nodes || []).reduce((max, node) => {
    const match = String(node.id || "").match(/-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  const getViewport = () => currentNodeFlow.viewport || null;
  const getNodeCount = () => currentNodeFlow.nodes.length;
  const getNodeFlowNode = (input: NodeFlowNodeLookupInput): NodeFlowNodeLookupResult | null => {
    const resolvedRef = normalizeNodeRef(input.nodeRef);
    const node = resolvedRef
      ? currentNodeFlow.nodes.find((item) => getNodeFlowRef(item) === resolvedRef)
      : currentNodeFlow.nodes.find((item) => item.id === input.nodeId);
    if (!node) return null;
    const handles = getNodeHandles(node.type);
    return {
      nodeId: node.id,
      nodeRef: getNodeFlowRef(node),
      nodeType: node.type,
      inputHandles: handles.inputs as WorkflowBuilderHandle[],
      outputHandles: handles.outputs as WorkflowBuilderHandle[],
    };
  };

  const addNode = (type: NodeType, position: { x: number; y: number }, parentId?: string, extraData?: Partial<NodeFlowNodeData>) => {
    const id = `${type}-${++nodeIdCounter}`;
    const defaultDimensions: Partial<Record<NodeType, { width: number; height?: number }>> = {
      group: { width: 1100, height: 900 },
      scriptBoard: { width: 920 },
      storyboardBoard: { width: 1080 },
      identityCard: { width: 760 },
      seedanceVideoGen: { width: 380 },
    };
    const dim = defaultDimensions[type];
    const newNode: NodeFlowNode = {
      id,
      type,
      position,
      parentId,
      extent: parentId ? "parent" : undefined,
      data: { ...createNodeFlowDefaultNodeData(type), ...(extraData || {}) } as NodeFlowNodeData,
      style: dim ? { width: dim.width, height: dim.height } : undefined,
    };
    currentNodeFlow = {
      ...currentNodeFlow,
      revision: currentNodeFlow.revision + 1,
      nodes: [...currentNodeFlow.nodes, newNode],
    };
    nodeFlowUpdated = true;
    return id;
  };

  const updateNodeStyle = (nodeId: string, style: Record<string, unknown>) => {
    currentNodeFlow = {
      ...currentNodeFlow,
      revision: currentNodeFlow.revision + 1,
      nodes: currentNodeFlow.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, style: { ...(node.style || {}), ...(style || {}) } }
          : node
      ),
    };
    nodeFlowUpdated = true;
  };

  const removeNode = (nodeId: string) => {
    currentNodeFlow = {
      ...currentNodeFlow,
      revision: currentNodeFlow.revision + 1,
      nodes: currentNodeFlow.nodes.filter((node) => node.id !== nodeId),
      links: currentNodeFlow.links.filter((link) => link.source !== nodeId && link.target !== nodeId),
    };
    nodeFlowUpdated = true;
  };

  const connectNodes = (connection: { source: string; target: string; sourceHandle?: string; targetHandle?: string }) => {
    currentNodeFlow = {
      ...currentNodeFlow,
      revision: currentNodeFlow.revision + 1,
      links: createNodeFlowLink(connection, currentNodeFlow.links),
    };
    nodeFlowUpdated = true;
  };

  const removeLink = (linkId: string) => {
    currentNodeFlow = {
      ...currentNodeFlow,
      revision: currentNodeFlow.revision + 1,
      links: removeNodeFlowLink(currentNodeFlow.links, linkId),
    };
    nodeFlowUpdated = true;
  };

  const toggleLinkPause = (linkId: string) => {
    currentNodeFlow = {
      ...currentNodeFlow,
      revision: currentNodeFlow.revision + 1,
      links: toggleNodeFlowLinkPause(currentNodeFlow.links, linkId),
    };
    nodeFlowUpdated = true;
  };

  return {
    bridge: {
      getProjectData: () => currentProjectData,
      getNodeFlowSnapshot: () => currentNodeFlow,
      updateProjectData: (updater: (prev: ProjectData) => ProjectData) => {
        currentProjectData = updater(currentProjectData);
        projectDataUpdated = true;
      },
      addTextNode: ({ title, text, x, y, parentId }) => {
        const activeViewport = getViewport();
        const baseX = activeViewport ? (-activeViewport.x + 120) / activeViewport.zoom : 120;
        const baseY = activeViewport ? (-activeViewport.y + 120) / activeViewport.zoom : 120;
        const offset = (getNodeCount() % 5) * 24;
        const position =
          typeof x === "number" && typeof y === "number"
            ? { x, y }
            : { x: Math.round(baseX + offset), y: Math.round(baseY + offset) };
        const nodeId = addNode("text", position, parentId, { title, text });
        return { id: nodeId, title };
      },
      createNodeFlowNode: ({ type, nodeRef, title, text, aspectRatio, episodeId, sceneId, displayMode, entityType, entityId, x, y, parentId }) => {
        const activeViewport = getViewport();
        const baseX = activeViewport ? (-activeViewport.x + 120) / activeViewport.zoom : 120;
        const baseY = activeViewport ? (-activeViewport.y + 120) / activeViewport.zoom : 120;
        const offset = (getNodeCount() % 5) * 24;
        const position =
          typeof x === "number" && typeof y === "number"
            ? { x, y }
            : { x: Math.round(baseX + offset), y: Math.round(baseY + offset) };
        if (!["text", "imageGen", "scriptBoard", "storyboardBoard", "identityCard"].includes(type)) {
          throw new Error("createNodeFlowNode 当前仅支持 text、imageGen、scriptBoard、storyboardBoard、identityCard。");
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
            ? { title: resolvedTitle, text: (text || "").trim() }
            : type === "imageGen"
              ? { title: resolvedTitle, aspectRatio: (aspectRatio || "1:1").trim() || "1:1" }
              : type === "scriptBoard"
                ? { title: resolvedTitle, episodeId }
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
          throw new Error("createNodeFlowNode 创建文本节点时缺少 text。");
        }
        const resolvedNodeRef = normalizeNodeRef(nodeRef);
        const nodeId = addNode(
          type as NodeType,
          position,
          parentId,
          setNodeFlowRef(extraData as Partial<NodeFlowNodeData>, resolvedNodeRef)
        );
        const nodeHandles = getNodeHandles(type);
        return {
          nodeId,
          nodeRef: resolvedNodeRef || undefined,
          nodeType: type,
          title: resolvedTitle,
          defaultOutputHandle: (nodeHandles.outputs[0] as WorkflowBuilderHandle | undefined) ?? null,
          defaultInputHandles: nodeHandles.inputs as WorkflowBuilderHandle[],
        };
      },
      connectNodeFlowNodes: ({ sourceNodeId, targetNodeId, sourceRef, targetRef, sourceHandle, targetHandle }) => {
        const sourceNode = getNodeFlowNode({ nodeId: sourceNodeId, nodeRef: sourceRef });
        const targetNode = getNodeFlowNode({ nodeId: targetNodeId, nodeRef: targetRef });
        if (!sourceNode || !targetNode) {
          throw new Error("connectNodeFlowNodes 引用了不存在的节点。请确认 source_ref/target_ref 指向已创建的 workflow_node。");
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
            `connectNodeFlowNodes 无法自动推断 ${sourceNode.nodeType} -> ${targetNode.nodeType} 的连接端口。请显式提供 source_handle 和 target_handle。`
          );
        }
        if (!sourceHandles.includes(resolvedSourceHandle) || !targetHandles.includes(resolvedTargetHandle)) {
          throw new Error("connectNodeFlowNodes 收到无效的 handle。");
        }
        if (!isValidConnection({ sourceHandle: resolvedSourceHandle, targetHandle: resolvedTargetHandle })) {
          throw new Error("connectNodeFlowNodes 收到不合法的连线类型。");
        }
        connectNodes({
          source: sourceNode.nodeId,
          target: targetNode.nodeId,
          sourceHandle: resolvedSourceHandle,
          targetHandle: resolvedTargetHandle,
        });
        return {
          linkId: buildNodeFlowLinkId(sourceNode.nodeId, targetNode.nodeId, resolvedSourceHandle, resolvedTargetHandle),
          sourceNodeId: sourceNode.nodeId,
          targetNodeId: targetNode.nodeId,
          sourceRef: sourceNode.nodeRef || undefined,
          targetRef: targetNode.nodeRef || undefined,
          sourceHandle: resolvedSourceHandle as WorkflowBuilderHandle,
          targetHandle: resolvedTargetHandle as WorkflowBuilderHandle,
        };
      },
      getNodeFlowNode,
      createNodeFlowMap: (input: CreateNodeFlowMapInput) => {
        const activeViewport = getViewport();
        const baseX = activeViewport ? (-activeViewport.x + 120) / activeViewport.zoom : 120;
        const baseY = activeViewport ? (-activeViewport.y + 120) / activeViewport.zoom : 120;
        const offset = (getNodeCount() % 5) * 24;
        return createNodeFlowMapWithBridge(
          {
            ...input,
            originX: input.originX ?? Math.round(baseX + offset),
            originY: input.originY ?? Math.round(baseY + offset),
          },
          {
            addNode,
            updateNodeStyle,
            connectNodes,
            toggleLinkPause,
            removeNode,
            removeLink,
          }
        );
      },
      getViewport: () => getViewport() as NodeFlowViewport | null,
      getNodeCount,
    },
    getProjectData: () => currentProjectData,
    hasUpdatedProjectData: () => projectDataUpdated,
    getNodeFlow: () => currentNodeFlow,
    hasUpdatedNodeFlow: () => nodeFlowUpdated,
  };
};

const createSseResponse = (stream: ReadableStream<Uint8Array>) =>
  new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": AGENT_HTTP_STREAM_CONTENT_TYPE,
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });

const emitEvent = (controller: ReadableStreamDefaultController<Uint8Array>, event: AgentRuntimeEvent) => {
  try {
    controller.enqueue(
      new TextEncoder().encode(serializeAgentStreamPacket({ kind: "event", event }))
    );
    return true;
  } catch (error: any) {
    if (!String(error?.message || error).includes("Unable to enqueue")) {
      throw error;
    }
    return false;
  }
};

const emitResult = (controller: ReadableStreamDefaultController<Uint8Array>, result: QalamRunResult) => {
  try {
    controller.enqueue(
      new TextEncoder().encode(serializeAgentStreamPacket({ kind: "result", result }))
    );
    return true;
  } catch (error: any) {
    if (!String(error?.message || error).includes("Unable to enqueue")) {
      throw error;
    }
    return false;
  }
};

const emitError = (controller: ReadableStreamDefaultController<Uint8Array>, error: string) => {
  try {
    controller.enqueue(
      new TextEncoder().encode(serializeAgentStreamPacket({ kind: "error", error }))
    );
    return true;
  } catch (errorLike: any) {
    if (!String(errorLike?.message || errorLike).includes("Unable to enqueue")) {
      throw errorLike;
    }
    return false;
  }
};

const emitTrace = (
  controller: ReadableStreamDefaultController<Uint8Array>,
  runId: string,
  stage: "runtime" | "session" | "model" | "tool" | "result",
  status: "info" | "running" | "success" | "error",
  title: string,
  detail?: string,
  payload?: string
) => {
  return emitEvent(controller, {
    type: "trace",
    runId,
    entry: {
      id: `${stage}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      stage,
      status,
      title,
      detail,
      payload,
    },
  });
};

export const onRequestOptions = async () =>
  new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });

export const onRequestPost = async (context: any) => {
  const body = (await context.request.json().catch(() => null)) as AgentHttpRunRequest | null;
  if (!body?.run?.sessionId || !body?.run?.userText || !body?.runtime?.model || !body?.projectData) {
    return new Response(JSON.stringify({ error: "请求缺少 run.sessionId、run.userText、runtime.model 或 projectData。" }), {
      status: 400,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }

  const provider = resolveAgentProvider(body.runtime.provider);
  let sessionOwner: string | null = null;
  try {
    sessionOwner = await resolveAgentSessionOwner(context.request, context.env || {});
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  const sessionKey = createAgentSessionKey(body.run.sessionId, sessionOwner);

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const debugEnabled = isDebugEnabled(context.env || {});
      ensureQalamTraceProcessor();
      const tracingEnabled = true;
      const traceId = `edge-trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const wrapperRunId = `edge-wrapper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const workflowName = "Qalam Edge Agent";
      const groupId = sessionKey;
      const bridgeState = createNodeFlowBridgeState(body.projectData, body.nodeFlow);
      const skillLoader = new StaticSkillLoader();
      const requestAbortSignal = context.request.signal;
      const emitWrapperTrace = (
        stage: "runtime" | "session" | "model" | "tool" | "result",
        status: "info" | "running" | "success" | "error",
        title: string,
        detail?: string,
        payload?: string
      ) => emitTrace(controller, wrapperRunId, stage, status, title, detail, payload);
      const onAbort = () => {
        debugLog(debugEnabled, traceId, "request aborted", {
          reason: String((requestAbortSignal as any)?.reason || ""),
        });
        emitWrapperTrace("runtime", "error", "Request aborted", String((requestAbortSignal as any)?.reason || ""));
      };
      requestAbortSignal?.addEventListener("abort", onAbort, { once: true });
      try {
        emitWrapperTrace("runtime", "running", "Edge request accepted", `session=${body.run.sessionId}`);
        debugLog(debugEnabled, traceId, "request received", {
          provider,
          runtime: body.runtime,
          sessionId: body.run.sessionId,
          userText: body.run.userText,
        });
        const effectiveModel = resolveProviderModel(provider, body.runtime.model);
        const resolvedBaseUrl = resolveBaseUrl(provider, body.runtime.baseUrl);
        const resolvedApiKey = resolveApiKey(context.env || {}, provider);
        const {
          skills: enabledSkills,
          explicitSkillIds,
          implicitSkillIds,
        } = await resolveActivatedSkills({
          explicitSkillIds: body.run.enabledSkillIds || [],
          loader: skillLoader,
        });
        const disabledTools = buildDisabledTools({ qalamTools: body.runtime.qalamTools }, enabledSkills as Array<{ disabledTools?: string[] }>);
        debugLog(debugEnabled, traceId, "provider resolved", {
          provider,
          model: effectiveModel,
          baseURL: resolvedBaseUrl,
          hasApiKey: Boolean(resolvedApiKey),
          enabledSkills: enabledSkills.map((skill) => skill.id),
          explicitSkillIds,
          implicitSkillIds,
        });
        emitWrapperTrace(
          "runtime",
          "info",
          "Edge runtime prepared",
          `${provider} · ${effectiveModel}`,
          JSON.stringify({
            explicitSkillIds,
            implicitSkillIds,
            enabledSkills: enabledSkills.map((skill) => skill.id),
          })
        );
        const session = new QalamResponsesCompactionSession({
          underlyingSession: new D1EdgeSession(context.env || {}, body.run.sessionId, sessionKey, sessionOwner),
          model: effectiveModel,
          apiKey: resolvedApiKey,
          baseUrl: resolvedBaseUrl,
        });
        const sessionMessages = await readD1SessionMessages(context.env || {}, sessionKey);
        emitWrapperTrace("session", "info", "Session snapshot loaded", `items=${sessionMessages.length}`);
        emitWrapperTrace("runtime", "running", "Delegating to agent core");
        const runResult = await runQalamAgentCore({
          input: body.run,
          config: {
            provider,
            model: effectiveModel,
            apiKey: resolvedApiKey,
            baseUrl: resolvedBaseUrl,
          },
          bridge: bridgeState.bridge,
          session,
          sessionMessages,
          runtimeMode: "edge_full",
          runtimeLabel: "Qalam Edge Agent",
          workflowName,
          enabledSkills: enabledSkills as any,
          disabledTools,
          maxTurns: EDGE_AGENT_MAX_TURNS,
          signal: context.request.signal,
          onEvent: (event) => emitEvent(controller, event),
          onDebug: (label, payload) => debugLog(debugEnabled, traceId, label, payload),
          traceId,
          groupId,
          traceMetadata: {
            sessionId: body.run.sessionId,
            sessionKey,
            provider,
            model: effectiveModel,
            userId: sessionOwner || "anonymous",
            runtimeMode: "edge_full",
            skillIds: enabledSkills.map((skill) => skill.id).join(","),
            skillVersions: enabledSkills.map((skill) => `${skill.id}:${skill.version || "0"}`).join(","),
            explicitSkillIds: explicitSkillIds.join(","),
            implicitSkillIds: implicitSkillIds.join(","),
          },
          tracingDisabled: false,
          traceIncludeSensitiveData: false,
          getExtraResult: () => ({
            updatedProjectData: bridgeState.hasUpdatedProjectData() ? bridgeState.getProjectData() : undefined,
            updatedNodeFlow: bridgeState.hasUpdatedNodeFlow() ? bridgeState.getNodeFlow() : undefined,
            tracing: {
              enabled: tracingEnabled,
              traceId,
            },
          }),
          runStartedMeta: {
            traceId,
            tracingEnabled,
          },
          recoverFallbackOnAnyError: true,
        });
        emitWrapperTrace("result", "success", "Agent core returned", `text=${runResult.finalText.length} chars · tools=${runResult.toolCalls.length}`);
        const emitted = emitResult(controller, runResult);
        debugLog(debugEnabled, traceId, "emit result packet", { emitted });
        emitWrapperTrace("result", emitted ? "success" : "error", emitted ? "Final result packet emitted" : "Final result packet dropped");
      } catch (error: any) {
        const message = error?.message || "Cloudflare Agent runtime 执行失败";
        debugLog(debugEnabled, traceId, "run error", message);
        emitWrapperTrace("result", "error", "Wrapper catch", message);
        const emitted = emitError(controller, message);
        debugLog(debugEnabled, traceId, "emit error packet", { emitted, message });
      } finally {
        try {
          controller.close();
        } catch (error: any) {
          if (!String(error?.message || error).includes("Controller is already closed")) {
            throw error;
          }
        } finally {
          requestAbortSignal?.removeEventListener("abort", onAbort);
        }
        const persistTracePromise = (async () => {
          try {
            await forceFlushAgentTracing();
            await persistBufferedTrace(context.env || {}, {
              traceId,
              sessionId: body.run.sessionId,
              sessionKey,
              userId: sessionOwner,
              provider,
              model: resolveProviderModel(provider, body.runtime.model),
              workflowName,
              groupId,
              metadata: {
                sessionId: body.run.sessionId,
                sessionKey,
                provider,
                model: resolveProviderModel(provider, body.runtime.model),
                userId: sessionOwner || "anonymous",
                runtimeMode: "edge_full",
              },
            });
          } catch (traceError: any) {
            debugLog(debugEnabled, traceId, "trace persistence error", traceError?.message || String(traceError));
          }
        })();
        if (typeof context.waitUntil === "function") {
          context.waitUntil(persistTracePromise);
        } else {
          void persistTracePromise;
        }
      }
    },
  });

  return createSseResponse(stream);
};
