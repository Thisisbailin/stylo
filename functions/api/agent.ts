import {
  createQalamAgentBridge,
} from "../../agents/bridge/nodeFlowBridgeCore";
import { runQalamAgentCore } from "../../agents/runtime/core";
import {
  AGENT_HTTP_STREAM_CONTENT_TYPE,
  serializeAgentStreamPacket,
  type AgentHttpRunRequest,
} from "../../agents/runtime/httpProtocol";
import { resolveAgentProvider, resolveApiMode, resolveBaseUrl, resolveProviderModel } from "../../agents/runtime/providerConfig";
import { resolveActivatedSkills, StaticSkillLoader } from "../../agents/runtime/skills";
import { buildDisabledTools } from "../../agents/runtime/toolPolicy";
import type { AgentRuntimeEvent, QalamRunResult } from "../../agents/runtime/types";
import { createAgentSessionKey, D1EdgeSession, QalamChatCompactionSession, QalamResponsesCompactionSession, readD1SessionMessages } from "./_agentSessions";
import { ensureQalamTraceProcessor, forceFlushAgentTracing, persistBufferedTrace } from "./_agentTracing";
import type { ProjectData } from "../../types";
import type { NodeFlowFile, NodeFlowNode, NodeFlowNodeData, NodeType } from "../../node-workspace/types";
import { createDefaultNodeFlowNodeData } from "../../node-workspace/nodeflow/defaults";
import { DEFAULT_NODE_DIMENSIONS } from "../../node-workspace/nodeflow/placement";
import { parseNodeFlowFile } from "../../node-workspace/nodeflow/schema";
import type { NodeFlowExecutionApprovalProposal } from "../../node-workspace/nodeflow/approvals";
import { createNodeFlowGraphLink, removeNodeFlowGraphLink } from "../../node-workspace/nodeflow/graphLinks";
import {
  appendNodeToNodeFlow,
  connectNodesInNodeFlow,
  patchNodeFlowNodeData,
  patchNodeFlowNodeStyle,
  removeLinkFromNodeFlow,
  removeNodeFromNodeFlow,
  toggleNodeFlowLinkPauseInState,
} from "../../node-workspace/nodeflow/mutations";
import {
  assertQalamProjectScope,
  isQalamSessionInProject,
} from "../../agents/runtime/projectScope";
import { getUserId } from "./_auth";
import { enforceRateLimit } from "./_rateLimit";
import { readJsonRequest } from "./_request";
import type { D1DatabaseLike, PagesContext } from "./_types";

type AgentEnv = Record<string, unknown> & {
  DB: D1DatabaseLike;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
};

const EDGE_AGENT_MAX_TURNS = 20;
const EDGE_CHAT_SESSION_MAX_ITEMS = 18;
const MAX_AGENT_REQUEST_BYTES = 5 * 1024 * 1024;
const MAX_AGENT_TEXT_LENGTH = 20_000;
const MAX_AGENT_NODES = 500;
const MAX_AGENT_LINKS = 1_000;

const withCorsHeaders = (response: Response) => {
  const headers = new Headers(response.headers);
  Object.entries(CORS_HEADERS).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const resolveApiKey = (env: Record<string, unknown>, provider: "qwen" | "openrouter" | "ark" | "deepseek") => {
  const value =
    provider === "openrouter"
      ? env.OPENROUTER_API_KEY
      : provider === "ark"
        ? env.ARK_API_KEY
        : provider === "deepseek"
          ? env.DEEPSEEK_API_KEY
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

const createAgentProjectData = (
  projectData: ProjectData | undefined,
  nodeFlow: NodeFlowFile | undefined,
  projectId: string
): ProjectData => {
  const activeProject = projectData?.flowProjects?.find((project) => project.id === projectId);
  return {
    fileName: activeProject?.title?.trim() || projectData?.fileName?.trim() || nodeFlow?.name || "",
    rawScript: "",
    episodes: [],
    roles: Array.isArray(projectData?.roles) ? projectData.roles : [],
    designAssets: Array.isArray(projectData?.designAssets) ? projectData.designAssets : [],
    canvas: projectData?.canvas || { viewport: null },
    flow: {
      flowNodes: [],
      links: [],
    },
    activeFlowProjectId: projectId,
    phase5Usage: projectData?.phase5Usage,
    stats: projectData?.stats || { context: { total: 0, success: 0, error: 0 } },
  };
};

const createAgentProjectPatch = (
  projectData: ProjectData,
  projectId: string
): QalamRunResult["updatedProjectPatch"] => {
  const activeProject = projectData.flowProjects?.find((project) => project.id === projectId);
  return {
    activeFlowProjectId: projectId,
    roles: Array.isArray(projectData.roles) ? projectData.roles : [],
    designAssets: Array.isArray(projectData.designAssets) ? projectData.designAssets : [],
    flow: projectData.flow,
    flowProjects: activeProject ? [activeProject] : undefined,
  };
};

const hasMeaningfulProjectPatch = (patch: QalamRunResult["updatedProjectPatch"]) =>
  Boolean(
    patch &&
      (Array.isArray(patch.roles) ||
        Array.isArray(patch.designAssets) ||
        patch.flow ||
        (Array.isArray(patch.flowProjects) && patch.flowProjects.length > 0))
  );

const debugLog = (enabled: boolean, runId: string, label: string, payload?: unknown) => {
  if (!enabled || typeof console === "undefined") return;
  const prefix = `[Qalam][edge][${runId}] ${label}`;
  if (payload === undefined) {
    console.log(prefix);
    return;
  }
  console.log(prefix, payload);
};

const createNodeFlowBridgeState = (
  projectData: ProjectData,
  nodeFlow?: NodeFlowFile
) => {
  let currentProjectData = projectData;
  let projectDataUpdated = false;
  const initialNodeFlow: NodeFlowFile = nodeFlow || {
      version: 2,
      revision: 0,
      name: projectData.fileName || "Qalam NodeFlow",
      nodes: [],
      links: [],
      linkStyle: "angular",
      globalAssetHistory: [],
      activeView: null,
    };
  let currentNodeFlow = structuredClone(initialNodeFlow);
  let nodeFlowUpdated = false;
  let currentExecutionApprovals: Record<string, NodeFlowExecutionApprovalProposal> = {};
  let executionApprovalsUpdated = false;
  let nodeIdCounter = (currentNodeFlow.nodes || []).reduce((max, node) => {
    const match = String(node.id || "").match(/-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  const getViewport = () => currentNodeFlow.viewport || null;
  const addNode = (type: NodeType, position: { x: number; y: number }, parentId?: string, extraData?: Partial<NodeFlowNodeData>) => {
    const id = `${type}-${++nodeIdCounter}`;
    const dim = DEFAULT_NODE_DIMENSIONS[type];
    const newNode: NodeFlowNode = {
      id,
      type,
      position,
      parentId,
      extent: parentId ? "parent" : undefined,
      data: { ...createDefaultNodeFlowNodeData(type), ...(extraData || {}) } as NodeFlowNodeData,
      style: dim ? { width: dim.width, height: dim.height } : undefined,
    };
    currentNodeFlow = appendNodeToNodeFlow(currentNodeFlow, newNode) as NodeFlowFile;
    nodeFlowUpdated = true;
    return id;
  };

  const updateNodeStyle = (nodeId: string, style: Record<string, unknown>) => {
    currentNodeFlow = patchNodeFlowNodeStyle(currentNodeFlow, nodeId, style) as NodeFlowFile;
    nodeFlowUpdated = true;
  };

  const updateNodeData = (nodeId: string, data: Partial<NodeFlowNodeData>) => {
    currentNodeFlow = patchNodeFlowNodeData(currentNodeFlow, nodeId, data) as NodeFlowFile;
    nodeFlowUpdated = true;
  };

  const moveNode = (nodeId: string, position: { x: number; y: number }) => {
    currentNodeFlow = {
      ...currentNodeFlow,
      revision: currentNodeFlow.revision + 1,
      nodes: currentNodeFlow.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              position: {
                x: position.x,
                y: position.y,
              },
            }
          : node
      ),
    };
    nodeFlowUpdated = true;
  };

  const removeNode = (nodeId: string) => {
    currentNodeFlow = removeNodeFromNodeFlow(currentNodeFlow, nodeId) as NodeFlowFile;
    nodeFlowUpdated = true;
  };

  const connectNodes = (connection: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) => {
    currentNodeFlow = connectNodesInNodeFlow(currentNodeFlow, connection as any) as NodeFlowFile;
    nodeFlowUpdated = true;
  };

  const removeLink = (linkId: string) => {
    currentNodeFlow = removeLinkFromNodeFlow(currentNodeFlow, linkId) as NodeFlowFile;
    nodeFlowUpdated = true;
  };

  const addGraphLink = (sourceRef: string, targetRef: string) => {
    const result = createNodeFlowGraphLink(currentNodeFlow.graphLinks || [], sourceRef, targetRef);
    currentNodeFlow = {
      ...currentNodeFlow,
      revision: currentNodeFlow.revision + 1,
      graphLinks: result.links,
    };
    nodeFlowUpdated = true;
    return result.linkId;
  };

  const removeGraphLink = (linkId: string) => {
    currentNodeFlow = {
      ...currentNodeFlow,
      revision: currentNodeFlow.revision + 1,
      graphLinks: removeNodeFlowGraphLink(currentNodeFlow.graphLinks || [], linkId),
    };
    nodeFlowUpdated = true;
  };

  const toggleLinkPause = (linkId: string) => {
    currentNodeFlow = toggleNodeFlowLinkPauseInState(currentNodeFlow, linkId) as NodeFlowFile;
    nodeFlowUpdated = true;
  };

  return {
    bridge: createQalamAgentBridge({
      getProjectData: () => currentProjectData,
      getNodeFlowSnapshot: () => currentNodeFlow,
      getPendingExecutionApprovals: () => Object.values(currentExecutionApprovals),
      updateProjectData: (updater: (prev: ProjectData) => ProjectData) => {
        currentProjectData = updater(currentProjectData);
        projectDataUpdated = true;
      },
      addNode,
      updateNodeData,
      moveNode,
      addGraphLink,
      removeGraphLink,
      updateNodeStyle: (nodeId, style) => updateNodeStyle(nodeId, style),
      connectNodes,
      removeNode,
      removeLink,
      toggleLinkPause,
      requestExecutionApproval: (proposal) => {
        currentExecutionApprovals = {
          ...currentExecutionApprovals,
          [proposal.nodeId]: proposal,
        };
        executionApprovalsUpdated = true;
      },
      clearExecutionApproval: (nodeId) => {
        if (!currentExecutionApprovals[nodeId]) return;
        const next = { ...currentExecutionApprovals };
        delete next[nodeId];
        currentExecutionApprovals = next;
        executionApprovalsUpdated = true;
      },
    }),
    getProjectData: () => currentProjectData,
    hasUpdatedProjectData: () => projectDataUpdated,
    getNodeFlow: () => currentNodeFlow,
    hasUpdatedNodeFlow: () => nodeFlowUpdated,
    getExecutionApprovals: () => Object.values(currentExecutionApprovals),
    hasUpdatedExecutionApprovals: () => executionApprovalsUpdated,
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

export const onRequestPost = async (context: PagesContext<AgentEnv>) => {
  let sessionOwner: string;
  let body: AgentHttpRunRequest | null = null;
  try {
    sessionOwner = await getUserId(context.request, context.env);
    await enforceRateLimit({
      db: context.env.DB,
      namespace: "agent-run",
      subject: sessionOwner,
      limit: 10,
      windowSeconds: 60,
    });
    body = await readJsonRequest<AgentHttpRunRequest>(context.request, MAX_AGENT_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof Response) return withCorsHeaders(error);
    throw error;
  }
  if (!body?.run?.projectId || !body?.run?.sessionId || !body?.run?.userText || !body?.runtime?.model || !body?.nodeFlow) {
    return new Response(JSON.stringify({ error: "请求缺少 run.projectId、run.sessionId、run.userText、runtime.model 或 nodeFlow。" }), {
      status: 400,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }
  try {
    body = { ...body, nodeFlow: parseNodeFlowFile(body.nodeFlow) };
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Agent NodeFlow payload is invalid.",
    }), {
      status: 400,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }
  if (
    body.run.projectId.length > 256 ||
    body.run.sessionId.length > 256 ||
    body.run.userText.length > MAX_AGENT_TEXT_LENGTH ||
    body.nodeFlow.nodes.length > MAX_AGENT_NODES ||
    body.nodeFlow.links.length > MAX_AGENT_LINKS ||
    (body.run.attachments?.length || 0) > 8
  ) {
    return new Response(JSON.stringify({ error: "Agent request exceeds the allowed project, text, graph, or attachment limits." }), {
      status: 413,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }

  try {
    assertQalamProjectScope(body.run.projectId, body.projectData);
    if (!isQalamSessionInProject(body.run.sessionId, body.run.projectId)) {
      throw new Error("Qalam sessionId 不属于当前 projectId。");
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || "Qalam 项目作用域校验失败。" }), {
      status: 409,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }

  const provider = resolveAgentProvider(body.runtime.provider);
  const sessionKey = createAgentSessionKey(body.run.projectId, body.run.sessionId, sessionOwner);

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const debugEnabled = isDebugEnabled(context.env || {});
      ensureQalamTraceProcessor();
      const tracingEnabled = true;
      const traceId = `edge-trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const wrapperRunId = `edge-wrapper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const workflowName = "Qalam Edge Agent";
      const groupId = sessionKey;
      const agentProjectData = createAgentProjectData(body.projectData, body.nodeFlow, body.run.projectId);
      const bridgeState = createNodeFlowBridgeState(agentProjectData, body.nodeFlow);
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
        emitWrapperTrace("runtime", "running", "Edge request accepted", `project=${body.run.projectId} · session=${body.run.sessionId}`);
        debugLog(debugEnabled, traceId, "request received", {
          provider,
          runtime: body.runtime,
          projectId: body.run.projectId,
          sessionId: body.run.sessionId,
          userTextChars: body.run.userText.length,
        });
        const effectiveModel = resolveProviderModel(provider, body.runtime.model);
        const apiMode = resolveApiMode(provider);
        const resolvedBaseUrl = resolveBaseUrl(provider);
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
        const underlyingSession = new D1EdgeSession(context.env || {}, body.run.sessionId, sessionKey, sessionOwner);
        let chatCompactionSession: QalamChatCompactionSession | null = null;
        const session =
          apiMode === "responses"
            ? new QalamResponsesCompactionSession({
                underlyingSession,
                model: effectiveModel,
                apiKey: resolvedApiKey,
                baseUrl: resolvedBaseUrl,
              })
            : (chatCompactionSession = new QalamChatCompactionSession({
                underlyingSession,
                model: effectiveModel,
                apiKey: resolvedApiKey,
                baseUrl: resolvedBaseUrl,
                maxItems: EDGE_CHAT_SESSION_MAX_ITEMS,
              }));
        const sessionMessages = await readD1SessionMessages(context.env || {}, sessionKey);
        emitWrapperTrace("session", "info", "Session snapshot loaded", `items=${sessionMessages.length}`);
        emitWrapperTrace("runtime", "running", "Delegating to agent core");
        const runResult = await runQalamAgentCore({
          input: body.run,
          config: {
            provider,
            apiMode,
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
            projectId: body.run.projectId,
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
            updatedProjectPatch: bridgeState.hasUpdatedProjectData()
              ? (() => {
                  const patch = createAgentProjectPatch(bridgeState.getProjectData(), body.run.projectId);
                  return hasMeaningfulProjectPatch(patch) ? patch : undefined;
                })()
              : undefined,
            updatedNodeFlow: bridgeState.hasUpdatedNodeFlow()
              ? parseNodeFlowFile(bridgeState.getNodeFlow())
              : undefined,
            updatedExecutionApprovals: bridgeState.hasUpdatedExecutionApprovals()
              ? bridgeState.getExecutionApprovals()
              : undefined,
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
        if (chatCompactionSession) {
          context.waitUntil?.(chatCompactionSession.runCompaction());
        }
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
                projectId: body.run.projectId,
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
