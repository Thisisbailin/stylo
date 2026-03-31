import { createNodeWorkflowWithBridge } from "../../agents/bridge/workflowBuilder";
import { EdgeMemorySession, readEdgeSessionMessages } from "../../agents/runtime/edgeSession";
import { runQalamAgentCore } from "../../agents/runtime/core";
import {
  AGENT_HTTP_STREAM_CONTENT_TYPE,
  serializeAgentStreamPacket,
  type AgentHttpRunRequest,
} from "../../agents/runtime/httpProtocol";
import { resolveAgentProvider, resolveBaseUrl, resolveProviderModel } from "../../agents/runtime/providerConfig";
import type { AgentRuntimeEvent, QalamRunResult } from "../../agents/runtime/types";
import type { ProjectData } from "../../types";
import type { WorkflowFile, WorkflowNode, WorkflowNodeData, WorkflowViewport, NodeType } from "../../node-workspace/types";
import type {
  CreateNodeWorkflowInput,
  WorkflowBuilderHandle,
  WorkflowNodeLookupInput,
  WorkflowNodeLookupResult,
} from "../../agents/bridge/qalamBridge";
import { getNodeHandles, isValidConnection } from "../../node-workspace/utils/handles";

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


const edgeIdFromConnection = (sourceNodeId: string, targetNodeId: string, sourceHandle: string, targetHandle: string) =>
  `edge-${sourceNodeId}-${targetNodeId}-${sourceHandle || "default"}-${targetHandle || "default"}`;

const normalizeNodeRef = (value?: string | null) => {
  if (typeof value !== "string") return "";
  return value.trim();
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

const createEdgeDefaultNodeData = (type: NodeType): WorkflowNodeData => {
  switch (type) {
    case "text":
      return { title: "", text: "" } as WorkflowNodeData;
    case "scriptBoard":
      return { title: "剧本面板" } as WorkflowNodeData;
    case "storyboardBoard":
      return {
        title: "分镜表面板",
        displayMode: "table",
        columnWidths: [96, 280, 170, 220, 220, 200, 180, 180, 280, 280],
        rowHeights: {},
      } as WorkflowNodeData;
    case "identityCard":
      return {
        title: "角色 / 场景身份卡片",
        avatarOverrides: {},
      } as WorkflowNodeData;
    case "imageGen":
      return {
        inputImages: [],
        outputImage: null,
        status: "idle",
        error: null,
        aspectRatio: "1:1",
      } as WorkflowNodeData;
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
      } as WorkflowNodeData;
    case "soraVideoGen":
      return {
        inputImages: [],
        status: "idle",
        error: null,
        aspectRatio: "16:9",
      } as WorkflowNodeData;
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
      } as WorkflowNodeData;
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
      } as WorkflowNodeData;
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
      } as WorkflowNodeData;
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
      } as WorkflowNodeData;
    case "annotation":
      return {
        sourceImage: null,
        annotations: [],
        outputImage: null,
      } as WorkflowNodeData;
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
      } as WorkflowNodeData;
    case "group":
      return {
        title: "Node Group",
        isExpanded: true,
      } as WorkflowNodeData;
    default:
      return {} as WorkflowNodeData;
  }
};

const createEdgeBridgeState = (projectData: ProjectData, workflow?: WorkflowFile) => {
  let currentProjectData = projectData;
  let projectDataUpdated = false;
  let currentWorkflow: WorkflowFile = structuredClone(
    workflow || {
      version: 1,
      name: projectData.fileName || "Qalam Workflow",
      nodes: [],
      edges: [],
      edgeStyle: "angular",
      globalAssetHistory: [],
      viewport: null,
      activeView: null,
    }
  );
  let workflowUpdated = false;
  const workflowNodeRefs: Record<string, string> = {};
  let nodeIdCounter = (currentWorkflow.nodes || []).reduce((max, node) => {
    const match = String(node.id || "").match(/-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  const getViewport = () => currentWorkflow.viewport || null;
  const getNodeCount = () => currentWorkflow.nodes.length;
  const getWorkflowNode = (input: WorkflowNodeLookupInput): WorkflowNodeLookupResult | null => {
    const resolvedRef = normalizeNodeRef(input.nodeRef);
    const resolvedNodeId = resolvedRef ? workflowNodeRefs[resolvedRef] : input.nodeId;
    if (!resolvedNodeId) return null;
    const node = currentWorkflow.nodes.find((item) => item.id === resolvedNodeId);
    if (!node) return null;
    const handles = getNodeHandles(node.type);
    return {
      nodeId: node.id,
      nodeRef: resolvedRef || Object.entries(workflowNodeRefs).find(([, value]) => value === node.id)?.[0],
      nodeType: node.type,
      inputHandles: handles.inputs as WorkflowBuilderHandle[],
      outputHandles: handles.outputs as WorkflowBuilderHandle[],
    };
  };

  const addNode = (type: NodeType, position: { x: number; y: number }, parentId?: string, extraData?: Partial<WorkflowNodeData>) => {
    const id = `${type}-${++nodeIdCounter}`;
    const defaultDimensions: Partial<Record<NodeType, { width: number; height?: number }>> = {
      group: { width: 1100, height: 900 },
      scriptBoard: { width: 920 },
      storyboardBoard: { width: 1080 },
      identityCard: { width: 760 },
      seedanceVideoGen: { width: 380 },
    };
    const dim = defaultDimensions[type];
    const newNode: WorkflowNode = {
      id,
      type,
      position,
      parentId,
      extent: parentId ? "parent" : undefined,
      data: { ...createEdgeDefaultNodeData(type), ...(extraData || {}) } as WorkflowNodeData,
      style: dim ? { width: dim.width, height: dim.height } : undefined,
    };
    currentWorkflow = {
      ...currentWorkflow,
      nodes: [...currentWorkflow.nodes, newNode],
    };
    workflowUpdated = true;
    return id;
  };

  const updateNodeStyle = (nodeId: string, style: Record<string, unknown>) => {
    currentWorkflow = {
      ...currentWorkflow,
      nodes: currentWorkflow.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, style: { ...(node.style || {}), ...(style || {}) } }
          : node
      ),
    };
    workflowUpdated = true;
  };

  const removeNode = (nodeId: string) => {
    currentWorkflow = {
      ...currentWorkflow,
      nodes: currentWorkflow.nodes.filter((node) => node.id !== nodeId),
      edges: currentWorkflow.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    };
    Object.entries(workflowNodeRefs).forEach(([key, value]) => {
      if (value === nodeId) delete workflowNodeRefs[key];
    });
    workflowUpdated = true;
  };

  const onConnect = (connection: { source: string; target: string; sourceHandle?: string; targetHandle?: string }) => {
    const edgeId = edgeIdFromConnection(
      connection.source,
      connection.target,
      connection.sourceHandle || "default",
      connection.targetHandle || "default"
    );
    currentWorkflow = {
      ...currentWorkflow,
      edges: [
        ...currentWorkflow.edges.filter((edge) => edge.id !== edgeId),
        {
          id: edgeId,
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
        },
      ],
    };
    workflowUpdated = true;
  };

  const removeEdge = (edgeId: string) => {
    currentWorkflow = {
      ...currentWorkflow,
      edges: currentWorkflow.edges.filter((edge) => edge.id !== edgeId),
    };
    workflowUpdated = true;
  };

  const toggleEdgePause = (edgeId: string) => {
    currentWorkflow = {
      ...currentWorkflow,
      edges: currentWorkflow.edges.map((edge) =>
        edge.id === edgeId
          ? { ...edge, data: { ...edge.data, hasPause: !edge.data?.hasPause } }
          : edge
      ),
    };
    workflowUpdated = true;
  };

  return {
    bridge: {
      getProjectData: () => currentProjectData,
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
      createWorkflowNode: ({ type, nodeRef, title, text, aspectRatio, episodeId, sceneId, displayMode, entityType, entityId, x, y, parentId }) => {
        const activeViewport = getViewport();
        const baseX = activeViewport ? (-activeViewport.x + 120) / activeViewport.zoom : 120;
        const baseY = activeViewport ? (-activeViewport.y + 120) / activeViewport.zoom : 120;
        const offset = (getNodeCount() % 5) * 24;
        const position =
          typeof x === "number" && typeof y === "number"
            ? { x, y }
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
          throw new Error("createWorkflowNode 创建文本节点时缺少 text。");
        }
        const nodeId = addNode(type as NodeType, position, parentId, extraData as Partial<WorkflowNodeData>);
        const resolvedNodeRef = normalizeNodeRef(nodeRef);
        if (resolvedNodeRef) {
          workflowNodeRefs[resolvedNodeRef] = nodeId;
        }
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
      connectWorkflowNodes: ({ sourceNodeId, targetNodeId, sourceRef, targetRef, sourceHandle, targetHandle }) => {
        const sourceNode = getWorkflowNode({ nodeId: sourceNodeId, nodeRef: sourceRef });
        const targetNode = getWorkflowNode({ nodeId: targetNodeId, nodeRef: targetRef });
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
          sourceNodeId: sourceNode.nodeId,
          targetNodeId: targetNode.nodeId,
          sourceRef: sourceNode.nodeRef || undefined,
          targetRef: targetNode.nodeRef || undefined,
          sourceHandle: resolvedSourceHandle as WorkflowBuilderHandle,
          targetHandle: resolvedTargetHandle as WorkflowBuilderHandle,
        };
      },
      getWorkflowNode,
      createNodeWorkflow: (input: CreateNodeWorkflowInput) => {
        const activeViewport = getViewport();
        const baseX = activeViewport ? (-activeViewport.x + 120) / activeViewport.zoom : 120;
        const baseY = activeViewport ? (-activeViewport.y + 120) / activeViewport.zoom : 120;
        const offset = (getNodeCount() % 5) * 24;
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
      getViewport: () => getViewport() as WorkflowViewport | null,
      getNodeCount,
    },
    getProjectData: () => currentProjectData,
    hasUpdatedProjectData: () => projectDataUpdated,
    getWorkflow: () => currentWorkflow,
    hasUpdatedWorkflow: () => workflowUpdated,
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
  } catch (error: any) {
    if (!String(error?.message || error).includes("Unable to enqueue")) {
      throw error;
    }
  }
};

const emitResult = (controller: ReadableStreamDefaultController<Uint8Array>, result: QalamRunResult) => {
  try {
    controller.enqueue(
      new TextEncoder().encode(serializeAgentStreamPacket({ kind: "result", result }))
    );
  } catch (error: any) {
    if (!String(error?.message || error).includes("Unable to enqueue")) {
      throw error;
    }
  }
};

const emitError = (controller: ReadableStreamDefaultController<Uint8Array>, error: string) => {
  try {
    controller.enqueue(
      new TextEncoder().encode(serializeAgentStreamPacket({ kind: "error", error }))
    );
  } catch (errorLike: any) {
    if (!String(errorLike?.message || errorLike).includes("Unable to enqueue")) {
      throw errorLike;
    }
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
  emitEvent(controller, {
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

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const debugEnabled = isDebugEnabled(context.env || {});
      const tracingEnabled = false;
      const traceId = `local-trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const bridgeState = createEdgeBridgeState(body.projectData, body.workflow);
      try {
        debugLog(debugEnabled, traceId, "request received", {
          provider,
          runtime: body.runtime,
          sessionId: body.run.sessionId,
          userText: body.run.userText,
        });
        const effectiveModel = resolveProviderModel(provider, body.runtime.model);
        const resolvedBaseUrl = resolveBaseUrl(provider, body.runtime.baseUrl);
        const resolvedApiKey = resolveApiKey(context.env || {}, provider);
        debugLog(debugEnabled, traceId, "provider resolved", {
          provider,
          model: effectiveModel,
          baseURL: resolvedBaseUrl,
          hasApiKey: Boolean(resolvedApiKey),
        });
        const session = new EdgeMemorySession(body.run.sessionId);
        const sessionMessages = readEdgeSessionMessages(body.run.sessionId);
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
          workflowName: "Qalam Edge Agent",
          enabledSkills: [],
          disabledTools: ["ping_tool"],
          maxTurns: EDGE_AGENT_MAX_TURNS,
          signal: context.request.signal,
          onEvent: (event) => emitEvent(controller, event),
          onDebug: (label, payload) => debugLog(debugEnabled, traceId, label, payload),
          getExtraResult: () => ({
            updatedProjectData: bridgeState.hasUpdatedProjectData() ? bridgeState.getProjectData() : undefined,
            updatedWorkflow: bridgeState.hasUpdatedWorkflow() ? bridgeState.getWorkflow() : undefined,
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
        emitResult(controller, runResult);
      } catch (error: any) {
        const message = error?.message || "Cloudflare Agent runtime 执行失败";
        debugLog(debugEnabled, traceId, "run error", message);
        emitError(controller, message);
      } finally {
        try {
          controller.close();
        } catch (error: any) {
          if (!String(error?.message || error).includes("Controller is already closed")) {
            throw error;
          }
        }
      }
    },
  });

  return createSseResponse(stream);
};
