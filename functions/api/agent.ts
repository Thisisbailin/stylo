import {
  createQalamAgentBridge,
} from "../../agents/bridge/nodeFlowBridgeCore";
import { runQalamAgentCore } from "../../agents/runtime/core";
import {
  AGENT_HTTP_STREAM_CONTENT_TYPE,
  serializeAgentStreamPacket,
  type AgentHttpRunRequest,
} from "../../agents/runtime/httpProtocol";
import { resolveAgentProvider, resolveBaseUrl, resolveProviderModel } from "../../agents/runtime/providerConfig";
import { resolveActivatedSkills, StaticSkillLoader } from "../../agents/runtime/skills";
import { buildDisabledTools } from "../../agents/runtime/toolPolicy";
import type { AgentRuntimeEvent, QalamRunResult } from "../../agents/runtime/types";
import { createAgentSessionKey, D1EdgeSession, QalamResponsesCompactionSession, readD1SessionMessages, resolveAgentSessionOwner } from "./_agentSessions";
import { ensureQalamTraceProcessor, forceFlushAgentTracing, persistBufferedTrace } from "./_agentTracing";
import type { ProjectData } from "../../types";
import type { KnowledgeSnapshot } from "../../node-workspace/knowledge/types";
import { createEmptyKnowledgeSnapshot } from "../../node-workspace/knowledge/defaults";
import {
  createAnchoredDerivedKnowledgeNodeCommand,
  createDerivedKnowledgeLinkCommand,
  createDerivedKnowledgeNodeCommand,
  supersedeAnchoredDerivedKnowledgeNodeCommand,
  supersedeDerivedKnowledgeNodeCommand,
} from "../../node-workspace/knowledge/commands";
import type { NodeFlowFile, NodeFlowNode, NodeFlowNodeData, NodeType } from "../../node-workspace/types";
import { createDefaultNodeFlowNodeData } from "../../node-workspace/nodeflow/defaults";
import type { NodeFlowExecutionApprovalProposal } from "../../node-workspace/nodeflow/approvals";
import {
  appendNodeToNodeFlow,
  connectNodesInNodeFlow,
  patchNodeFlowNodeStyle,
  removeLinkFromNodeFlow,
  removeNodeFromNodeFlow,
  toggleNodeFlowLinkPauseInState,
} from "../../node-workspace/nodeflow/mutations";

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

const createNodeFlowBridgeState = (
  projectData: ProjectData,
  nodeFlow?: NodeFlowFile,
  knowledge?: KnowledgeSnapshot
) => {
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
  let currentKnowledge: KnowledgeSnapshot = structuredClone(
    knowledge || createEmptyKnowledgeSnapshot()
  );
  let knowledgeUpdated = false;
  let currentExecutionApprovals: Record<string, NodeFlowExecutionApprovalProposal> = {};
  let executionApprovalsUpdated = false;
  let nodeIdCounter = (currentNodeFlow.nodes || []).reduce((max, node) => {
    const match = String(node.id || "").match(/-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  const getViewport = () => currentNodeFlow.viewport || null;
  const addNode = (type: NodeType, position: { x: number; y: number }, parentId?: string, extraData?: Partial<NodeFlowNodeData>) => {
    const id = `${type}-${++nodeIdCounter}`;
    const defaultDimensions: Partial<Record<NodeType, { width: number; height?: number }>> = {
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
      data: { ...createDefaultNodeFlowNodeData(type), ...(extraData || {}) } as NodeFlowNodeData,
      style: dim ? { width: dim.width, height: dim.height } : undefined,
    };
    currentNodeFlow = appendNodeToNodeFlow(currentNodeFlow, newNode);
    nodeFlowUpdated = true;
    return id;
  };

  const updateNodeStyle = (nodeId: string, style: Record<string, unknown>) => {
    currentNodeFlow = patchNodeFlowNodeStyle(currentNodeFlow, nodeId, style);
    nodeFlowUpdated = true;
  };

  const removeNode = (nodeId: string) => {
    currentNodeFlow = removeNodeFromNodeFlow(currentNodeFlow, nodeId);
    nodeFlowUpdated = true;
  };

  const connectNodes = (connection: { source: string; target: string; sourceHandle?: string; targetHandle?: string }) => {
    currentNodeFlow = connectNodesInNodeFlow(currentNodeFlow, connection);
    nodeFlowUpdated = true;
  };

  const removeLink = (linkId: string) => {
    currentNodeFlow = removeLinkFromNodeFlow(currentNodeFlow, linkId);
    nodeFlowUpdated = true;
  };

  const toggleLinkPause = (linkId: string) => {
    currentNodeFlow = toggleNodeFlowLinkPauseInState(currentNodeFlow, linkId);
    nodeFlowUpdated = true;
  };

  const createDerivedKnowledgeNode = (input: Parameters<typeof createDerivedKnowledgeNodeCommand>[1]) => {
    const result =
      input.anchorType && input.anchorRef
        ? createAnchoredDerivedKnowledgeNodeCommand(currentKnowledge, input as Parameters<typeof createAnchoredDerivedKnowledgeNodeCommand>[1])
        : createDerivedKnowledgeNodeCommand(currentKnowledge, input);
    currentKnowledge = result.snapshot;
    knowledgeUpdated = true;
    return result.node;
  };

  const createDerivedKnowledgeLink = (input: Parameters<typeof createDerivedKnowledgeLinkCommand>[1]) => {
    const result = createDerivedKnowledgeLinkCommand(currentKnowledge, input);
    currentKnowledge = result.snapshot;
    knowledgeUpdated = true;
    return result.link;
  };

  const supersedeDerivedKnowledgeNode = (input: Parameters<typeof supersedeDerivedKnowledgeNodeCommand>[1]) => {
    const result =
      input.anchorType && input.anchorRef
        ? supersedeAnchoredDerivedKnowledgeNodeCommand(currentKnowledge, input as Parameters<typeof supersedeAnchoredDerivedKnowledgeNodeCommand>[1])
        : supersedeDerivedKnowledgeNodeCommand(currentKnowledge, input);
    currentKnowledge = result.snapshot;
    knowledgeUpdated = true;
    return {
      previousNode: result.previousNode,
      node: result.node,
      link: result.link,
    };
  };

  return {
    bridge: createQalamAgentBridge({
      getProjectData: () => currentProjectData,
      getNodeFlowSnapshot: () => currentNodeFlow,
      getKnowledgeSnapshot: () => currentKnowledge,
      getPendingExecutionApprovals: () => Object.values(currentExecutionApprovals),
      createDerivedKnowledgeNode,
      createDerivedKnowledgeLink,
      supersedeDerivedKnowledgeNode,
      updateProjectData: (updater: (prev: ProjectData) => ProjectData) => {
        currentProjectData = updater(currentProjectData);
        projectDataUpdated = true;
      },
      addNode,
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
    getKnowledge: () => currentKnowledge,
    hasUpdatedKnowledge: () => knowledgeUpdated,
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
      const bridgeState = createNodeFlowBridgeState(body.projectData, body.nodeFlow, body.knowledge);
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
            updatedKnowledge: bridgeState.hasUpdatedKnowledge() ? bridgeState.getKnowledge() : undefined,
            updatedNodeFlow: bridgeState.hasUpdatedNodeFlow() ? bridgeState.getNodeFlow() : undefined,
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
