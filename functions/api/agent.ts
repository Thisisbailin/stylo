import {
  Agent,
  InputGuardrailTripwireTriggered,
  OutputGuardrailTripwireTriggered,
  Runner,
  ToolInputGuardrailTripwireTriggered,
  ToolOutputGuardrailTripwireTriggered,
  setDefaultOpenAIClient,
  setOpenAIAPI,
} from "@openai/agents";
import OpenAI from "openai";
import { ARK_DEFAULT_MODEL, ARK_RESPONSES_BASE_URL, OPENROUTER_RESPONSES_BASE_URL, QWEN_DEFAULT_MODEL, QWEN_RESPONSES_BASE_URL } from "../../constants";
import { createNodeWorkflowWithBridge } from "../../agents/bridge/workflowBuilder";
import { createQalamTools } from "../../agents/tools";
import { EdgeMemorySession, readEdgeSessionMessages } from "../../agents/runtime/edgeSession";
import { buildAgentEnvironment } from "../../agents/runtime/environment";
import { createQalamInputGuardrails, createQalamOutputGuardrails } from "../../agents/runtime/guardrails";
import { composeAgentInstructions } from "../../agents/runtime/instructions";
import { buildAgentMemorySnapshot, buildRunInputItems, createAgentSessionInputCallback } from "../../agents/runtime/memory";
import {
  AGENT_HTTP_STREAM_CONTENT_TYPE,
  serializeAgentStreamPacket,
  type AgentHttpRunRequest,
} from "../../agents/runtime/httpProtocol";
import type { AgentRuntimeEvent, QalamRunContext, QalamRunResult } from "../../agents/runtime/types";
import type { AgentExecutedToolCall } from "../../agents/runtime/types";
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
const SUCCESSFUL_ACTION_TOOL_NAMES = new Set([
  "edit_project_resource",
  "operate_project_resource",
]);

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

const resolveBaseUrl = (provider: "qwen" | "openrouter" | "ark", baseUrl?: string) => {
  const configured = (baseUrl || "").trim();
  if (configured) return configured;
  if (provider === "openrouter") return OPENROUTER_RESPONSES_BASE_URL;
  if (provider === "ark") return ARK_RESPONSES_BASE_URL;
  return QWEN_RESPONSES_BASE_URL;
};

const resolveProviderModel = (provider: "qwen" | "openrouter" | "ark", requestedModel?: string) => {
  const model = (requestedModel || "").trim();
  if (provider === "ark") {
    if (!model || model.startsWith("qwen") || model.startsWith("doubao-lite-") || model.startsWith("doubao-pro-")) {
      return ARK_DEFAULT_MODEL;
    }
    return model;
  }
  if (provider === "qwen") {
    if (!model || model.startsWith("doubao-")) {
      return QWEN_DEFAULT_MODEL;
    }
    return model;
  }
  return model;
};

const isModelAccessError = (message: string) =>
  /model or endpoint/i.test(message) &&
  /(does not exist|do not have access)/i.test(message);

const formatModelAccessError = (
  provider: "qwen" | "openrouter" | "ark",
  requestedModel: string,
  effectiveModel: string,
  message: string
) => {
  if (provider === "ark") {
    return `Ark 模型不可用：当前请求使用的是 \`${effectiveModel}\`。方舟 Agent 路线请优先使用 \`doubao-seed-*\` 或已开通权限的 \`ep-*\` 接入点 ID；旧的 \`doubao-lite/pro-*\` 常会在 Responses 路线上 404。原始错误：${message}`;
  }
  if (provider === "qwen") {
    return `Qwen 模型不可用：当前请求使用的是 \`${effectiveModel}\`。这通常表示当前 API Key 对该模型未开通权限，或该模型不在当前兼容路线上可用。建议先切回 \`${QWEN_DEFAULT_MODEL}\` 再试。原始错误：${message}`;
  }
  return message;
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

const clipPayload = (value: unknown, limit = 12000) => {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return text.length <= limit ? text : `${text.slice(0, limit)}\n... [truncated]`;
  } catch {
    const text = String(value);
    return text.length <= limit ? text : `${text.slice(0, limit)}\n... [truncated]`;
  }
};

const instrumentOpenAIResponsesClient = (
  client: OpenAI,
  opts: {
    controller: ReadableStreamDefaultController<Uint8Array>;
    runId: string;
    debugEnabled: boolean;
  }
) => {
  const responsesApi = client.responses as OpenAI["responses"] & {
    create: (...args: any[]) => Promise<any>;
  };
  const originalCreate = responsesApi.create.bind(responsesApi);
  responsesApi.create = (async (...args: any[]) => {
    const [request, options] = args;
    debugLog(opts.debugEnabled, opts.runId, "responses.create request", request);
    emitTrace(
      opts.controller,
      opts.runId,
      "model",
      "info",
      "responses.create request",
      `model=${request?.model || "unknown"} · tools=${Array.isArray(request?.tools) ? request.tools.length : 0} · stream=${Boolean(request?.stream)}`,
      clipPayload({
        model: request?.model,
        instructions: request?.instructions,
        input: request?.input,
        tools: request?.tools,
        tool_choice: request?.tool_choice,
        parallel_tool_calls: request?.parallel_tool_calls,
        previous_response_id: request?.previous_response_id,
        conversation: request?.conversation,
        text: request?.text,
        store: request?.store,
      })
    );
    if (options) {
      debugLog(opts.debugEnabled, opts.runId, "responses.create options", options);
    }
    try {
      const response = await originalCreate(...args);
      debugLog(opts.debugEnabled, opts.runId, "responses.create response", {
        hasWithResponse: typeof response?.withResponse === "function",
        hasAsyncIterator: typeof response?.[Symbol.asyncIterator] === "function",
      });
      return response;
    } catch (error: any) {
      emitTrace(
        opts.controller,
        opts.runId,
        "result",
        "error",
        "responses.create failed",
        error?.message || "unknown error",
        clipPayload({
          message: error?.message,
          status: error?.status,
          code: error?.code,
          type: error?.type,
          cause: error?.cause,
          error: error?.error,
          headers: error?.headers,
        })
      );
      throw error;
    }
  }) as typeof responsesApi.create;
};

const unwrapProviderEvent = (data: any) => {
  if (data && typeof data === "object" && data.event && typeof data.event === "object") return data.event;
  if (data && typeof data === "object" && data.providerData && typeof data.providerData === "object") return data.providerData;
  return data;
};

const extractTextFromResponseOutput = (output: unknown): string => {
  if (!output || !Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    if ((item as any).type === "message" && Array.isArray((item as any).content)) {
      for (const content of (item as any).content) {
        if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
      }
    }
    if ((item as any).type === "output_text" && typeof (item as any).text === "string") {
      parts.push((item as any).text);
    }
  }
  return parts.join("\n").trim();
};

const summarizeSuccessfulToolCalls = (toolCalls: AgentExecutedToolCall[]) => {
  const successfulCalls = toolCalls.filter((toolCall) => toolCall.status === "success" && toolCall.summary?.trim());
  if (!successfulCalls.length) return "";
  const prioritizedCalls = successfulCalls.filter((toolCall) => SUCCESSFUL_ACTION_TOOL_NAMES.has(toolCall.name));
  const source = prioritizedCalls.length ? prioritizedCalls : successfulCalls;
  const uniqueSummaries = Array.from(
    new Map(source.map((toolCall) => [toolCall.summary!.trim(), toolCall.summary!.trim()])).values()
  );
  return uniqueSummaries.slice(-3).join("\n");
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

  const runId = `edge-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const provider =
    body.runtime.provider === "openrouter"
      ? "openrouter"
      : body.runtime.provider === "ark"
        ? "ark"
        : "qwen";

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const debugEnabled = isDebugEnabled(context.env || {});
      const tracingEnabled = false;
      const traceId = `local-trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const bridgeState = createEdgeBridgeState(body.projectData, body.workflow);
      const toolCalls: AgentExecutedToolCall[] = [];
      let accumulatedText = "";
      let accumulatedReasoning = "";
      let streamedResponseText = "";
      try {
        debugLog(debugEnabled, runId, "request received", {
          provider,
          runtime: body.runtime,
          sessionId: body.run.sessionId,
          userText: body.run.userText,
        });
        emitTrace(
          controller,
          runId,
          "runtime",
          "info",
          "Request accepted",
          `provider=${provider} · session=${body.run.sessionId}`,
          JSON.stringify({
            model: body.runtime.model,
            baseUrl: body.runtime.baseUrl || null,
            userTextLength: body.run.userText.length,
            attachmentCount: body.run.attachments?.length || 0,
          }, null, 2)
        );
        const emitRuntimeEvent = (event: AgentRuntimeEvent) => {
          if (event.type === "tool_called") {
            toolCalls.push(event.call);
          } else if (event.type === "tool_completed" || event.type === "tool_failed") {
            const index = toolCalls.findIndex((item) => item.callId === event.call.callId);
            if (index >= 0) toolCalls[index] = event.call;
            else toolCalls.push(event.call);
          }
          emitEvent(controller, event);
        };
        emitEvent(controller, {
          type: "run_started",
          runId,
          sessionId: body.run.sessionId,
          traceId,
          tracingEnabled,
        });

        const effectiveModel = resolveProviderModel(provider, body.runtime.model);
        const resolvedAuth = {
          apiKey: resolveApiKey(context.env || {}, provider),
          baseURL: resolveBaseUrl(provider, body.runtime.baseUrl),
          defaultHeaders: undefined as Record<string, string> | undefined,
        };
        debugLog(debugEnabled, runId, "provider resolved", {
          provider,
          model: effectiveModel,
          baseURL: resolvedAuth.baseURL,
          hasApiKey: Boolean(resolvedAuth.apiKey),
        });
        emitTrace(
          controller,
          runId,
          "runtime",
          "success",
          "Provider resolved",
          `provider=${provider} · model=${effectiveModel}`,
          JSON.stringify({
            requestedModel: body.runtime.model,
            baseURL: resolvedAuth.baseURL,
            hasApiKey: Boolean(resolvedAuth.apiKey),
            tracingEnabled,
          }, null, 2)
        );
        const client = new OpenAI({
          apiKey: resolvedAuth.apiKey,
          baseURL: resolvedAuth.baseURL,
          defaultHeaders: resolvedAuth.defaultHeaders,
        });
        instrumentOpenAIResponsesClient(client, {
          controller,
          runId,
          debugEnabled,
        });
        setOpenAIAPI("responses");
        setDefaultOpenAIClient(client);

        const session = new EdgeMemorySession(body.run.sessionId);
        const sessionId = await session.getSessionId();
        const sessionItems = await session.getItems(24);
        emitTrace(controller, runId, "session", "info", "Session attached", `id=${sessionId} · items=${sessionItems.length}`);

        const enabledTools = createQalamTools({
          bridge: bridgeState.bridge,
          emitEvent: emitRuntimeEvent,
          disabledTools: [
            "ping_tool",
          ],
        });
        const sessionMessages = readEdgeSessionMessages(body.run.sessionId);
        const agentMemory = buildAgentMemorySnapshot(sessionMessages);
        const runContext: QalamRunContext = {
          runtimeMode: "edge_full",
          agentEnvironment: buildAgentEnvironment({
            projectData: bridgeState.bridge.getProjectData(),
            runtimeMode: "edge_full",
            enabledTools: enabledTools.map((tool) => tool.name),
            sessionMessages,
          }),
          agentMemory,
          uiContext: body.run.uiContext,
        };
        const runInputItems = buildRunInputItems(body.run);
        emitTrace(
          controller,
          runId,
          "tool",
          "info",
          "Tools prepared",
          `${enabledTools.length} tools enabled`,
          JSON.stringify(enabledTools.map((tool) => tool.name), null, 2)
        );

        const agent = new Agent<QalamRunContext>({
          name: "Qalam Edge Agent",
          instructions: composeAgentInstructions({
            enabledSkills: [],
          }),
          handoffDescription: "Edge runtime scaffold for Qalam.",
          model: effectiveModel,
          modelSettings: {
            toolChoice: "auto",
            parallelToolCalls: false,
          },
          inputGuardrails: createQalamInputGuardrails(),
          outputGuardrails: createQalamOutputGuardrails(),
          resetToolChoice: true,
          tools: enabledTools,
        });
        emitTrace(
          controller,
          runId,
          "model",
          "running",
          "Agent run started",
          `model=${effectiveModel} · sessionMemory=${sessionMessages.length}`,
          JSON.stringify({
            requestedModel: body.runtime.model,
            runtimeMode: runContext.runtimeMode,
            projectEpisodes: runContext.agentEnvironment.project.episodeCount,
            enabledTools: enabledTools.map((tool) => tool.name),
          }, null, 2)
        );
        const runner = new Runner({
          tracingDisabled: true,
          traceIncludeSensitiveData: false,
          workflowName: "Qalam Edge Agent",
        });
        const result = await runner.run(agent, runInputItems, {
          stream: true,
          maxTurns: EDGE_AGENT_MAX_TURNS,
          signal: context.request.signal,
          session,
          sessionInputCallback: createAgentSessionInputCallback(agentMemory),
          context: runContext,
        });

        const streamReader = result.toStream().getReader();
        try {
          while (true) {
            const { done, value } = await streamReader.read();
            if (done) break;
            if (!value) continue;
            if (value.type !== "raw_model_stream_event") continue;
            const providerEvent = unwrapProviderEvent((value as any).data);
            const rawType = providerEvent?.type || (value as any)?.data?.type;
            if (rawType === "output_text_delta" && typeof providerEvent?.delta === "string") {
              accumulatedText += providerEvent.delta;
              debugLog(debugEnabled, runId, "output_text_delta", {
                delta: providerEvent.delta,
                accumulatedLength: accumulatedText.length,
              });
              emitEvent(controller, {
                type: "message_delta",
                runId,
                delta: providerEvent.delta,
                accumulatedText,
              });
            }
            if (
              (rawType === "response.reasoning_summary_text.delta" || rawType === "reasoning_summary_text.delta") &&
              typeof providerEvent?.delta === "string"
            ) {
              accumulatedReasoning += providerEvent.delta;
              emitEvent(controller, {
                type: "reasoning_delta",
                runId,
                delta: providerEvent.delta,
                accumulatedText: accumulatedReasoning,
              });
            }
            if (
              (rawType === "response.reasoning_summary_text.done" || rawType === "reasoning_summary_text.done") &&
              typeof providerEvent?.text === "string"
            ) {
              accumulatedReasoning = providerEvent.text;
              emitEvent(controller, {
                type: "reasoning_completed",
                runId,
                text: accumulatedReasoning,
              });
            }
            if (rawType === "response_done") {
              const responsePayload = providerEvent?.response || (value as any)?.data?.response;
              const candidate = extractTextFromResponseOutput(responsePayload?.output);
              if (candidate) {
                streamedResponseText = candidate;
              }
              debugLog(debugEnabled, runId, "response_done", {
                hasCandidate: Boolean(candidate),
                candidateLength: candidate?.length || 0,
              });
              emitTrace(
                controller,
                runId,
                "model",
                "success",
                "Model stream completed",
                candidate ? `response_done text=${candidate.length} chars` : "response_done without final text candidate"
              );
            }
          }
        } finally {
          streamReader.releaseLock();
        }

        await (result as any)?.completed;
        const synthesizedToolText = summarizeSuccessfulToolCalls(toolCalls);
        const finalText =
          String(result.finalOutput || "").trim() ||
          accumulatedText ||
          streamedResponseText ||
          extractTextFromResponseOutput(result.rawResponses?.at(-1)?.output) ||
          synthesizedToolText;
        debugLog(debugEnabled, runId, "finalized result", {
          finalText,
          toolCalls: toolCalls.length,
          usage: result.rawResponses?.at(-1)?.usage,
        });
        emitTrace(
          controller,
          runId,
          "result",
          "success",
          "Run finalized",
          finalText ? `finalText=${finalText.length} chars · tools=${toolCalls.length}` : `empty finalText · tools=${toolCalls.length}`,
          JSON.stringify(result.rawResponses?.at(-1)?.usage || {}, null, 2)
        );
        const runResult: QalamRunResult = {
          finalText,
          sessionId: body.run.sessionId,
          outputItems: [
            ...toolCalls.map((toolCall) => ({ kind: "tool_result", toolCall }) as const),
            { kind: "text", text: finalText },
          ],
          toolCalls,
          updatedProjectData: bridgeState.hasUpdatedProjectData() ? bridgeState.getProjectData() : undefined,
          updatedWorkflow: bridgeState.hasUpdatedWorkflow() ? bridgeState.getWorkflow() : undefined,
          tracing: {
            enabled: tracingEnabled,
            traceId,
          },
          usage: result.rawResponses?.at(-1)?.usage
            ? {
                inputTokens: result.rawResponses.at(-1)?.usage?.inputTokens,
                outputTokens: result.rawResponses.at(-1)?.usage?.outputTokens,
                totalTokens: result.rawResponses.at(-1)?.usage?.totalTokens,
              }
            : undefined,
        };
        emitEvent(controller, {
          type: "message_completed",
          runId,
          text: finalText,
        });
        emitEvent(controller, {
          type: "run_completed",
          runId,
          result: runResult,
        });
        emitResult(controller, runResult);
      } catch (error: any) {
        const isMaxTurns = error?.name === "MaxTurnsExceededError" || String(error?.message || "").includes("Max turns");
        const isGuardrailError =
          error instanceof InputGuardrailTripwireTriggered ||
          error instanceof OutputGuardrailTripwireTriggered ||
          error instanceof ToolInputGuardrailTripwireTriggered ||
          error instanceof ToolOutputGuardrailTripwireTriggered;
        const synthesizedToolText = summarizeSuccessfulToolCalls(toolCalls);
        const hasSuccessfulAction = toolCalls.some(
          (toolCall) => toolCall.status === "success" && SUCCESSFUL_ACTION_TOOL_NAMES.has(toolCall.name)
        );
        const fallbackText = accumulatedText.trim() || streamedResponseText.trim() || synthesizedToolText;
        debugLog(debugEnabled, runId, "run error", {
          error: error?.message || String(error),
          isMaxTurns,
          isGuardrailError,
          fallbackText,
          toolCalls,
        });
        if (isMaxTurns && synthesizedToolText && hasSuccessfulAction) {
          emitTrace(
            controller,
            runId,
            "result",
            "success",
            "Recovered from max turns",
            `Using synthesized tool text · tools=${toolCalls.length}`,
            synthesizedToolText
          );
          const runResult: QalamRunResult = {
            finalText: synthesizedToolText,
            sessionId: body.run.sessionId,
            outputItems: [
              ...toolCalls.map((toolCall) => ({ kind: "tool_result", toolCall }) as const),
              { kind: "text", text: synthesizedToolText },
            ],
            toolCalls,
            updatedProjectData: bridgeState.hasUpdatedProjectData() ? bridgeState.getProjectData() : undefined,
            updatedWorkflow: bridgeState.hasUpdatedWorkflow() ? bridgeState.getWorkflow() : undefined,
            tracing: {
              enabled: tracingEnabled,
              traceId,
            },
          };
          emitEvent(controller, {
            type: "message_completed",
            runId,
            text: synthesizedToolText,
          });
          emitEvent(controller, {
            type: "run_completed",
            runId,
            result: runResult,
          });
          emitResult(controller, runResult);
          return;
        }
        if (fallbackText) {
          debugLog(debugEnabled, runId, "recovered fallback result", {
            fallbackText,
            toolCalls: toolCalls.length,
          });
          emitTrace(
            controller,
            runId,
            "result",
            "success",
            "Recovered fallback text",
            `Recovered ${fallbackText.length} chars after runtime error`,
            JSON.stringify({
              error: error?.message || String(error),
              toolCalls: toolCalls.length,
            }, null, 2)
          );
          const runResult: QalamRunResult = {
            finalText: fallbackText,
            sessionId: body.run.sessionId,
            outputItems: [
              ...toolCalls.map((toolCall) => ({ kind: "tool_result", toolCall }) as const),
              { kind: "text", text: fallbackText },
            ],
            toolCalls,
            updatedProjectData: bridgeState.hasUpdatedProjectData() ? bridgeState.getProjectData() : undefined,
            updatedWorkflow: bridgeState.hasUpdatedWorkflow() ? bridgeState.getWorkflow() : undefined,
            tracing: {
              enabled: tracingEnabled,
              traceId,
            },
          };
          emitEvent(controller, {
            type: "message_completed",
            runId,
            text: fallbackText,
          });
          emitEvent(controller, {
            type: "run_completed",
            runId,
            result: runResult,
          });
          emitResult(controller, runResult);
          return;
        }
        const message = isGuardrailError
          ? `Guardrail 已拦截当前请求：${error?.message || "请求不符合运行边界。"}`
          : isModelAccessError(error?.message || String(error))
            ? formatModelAccessError(provider, body.runtime.model, effectiveModel, error?.message || String(error))
            : error?.message || "Cloudflare Agent runtime 执行失败";
        emitTrace(
          controller,
          runId,
          "result",
          "error",
          "Run failed",
          message,
          JSON.stringify({
            errorName: error?.name || null,
            stack: error?.stack || null,
            isMaxTurns,
            isGuardrailError,
            toolCalls,
            accumulatedTextLength: accumulatedText.length,
            streamedResponseTextLength: streamedResponseText.length,
            accumulatedReasoningLength: accumulatedReasoning.length,
          }, null, 2)
        );
        emitEvent(controller, {
          type: "run_failed",
          runId,
          error: message,
        });
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
