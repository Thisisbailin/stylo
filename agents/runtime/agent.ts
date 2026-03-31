import type { QalamAgentBridge } from "../bridge/qalamBridge";
import { normalizeQalamToolSettings } from "../../node-workspace/components/qalam/tooling";
import { readPersistedAgentSessionMessages } from "./session";
import { runQalamAgentCore } from "./core";
import { resolveAgentProvider, resolveBaseUrl } from "./providerConfig";
import type {
  QalamAgentConfigProvider,
  QalamAgentRuntime,
  QalamAgentTracer,
  QalamRunOptions,
  QalamSessionStore,
  QalamSkillLoader,
} from "./types";

const STABILIZATION_DISABLED_TOOLS = [
  "ping_tool",
] as const;

const AGENT_MAX_TURNS = 50;

type RuntimeDeps = {
  bridge: QalamAgentBridge;
  skillLoader: QalamSkillLoader;
  configProvider: QalamAgentConfigProvider;
  sessionStore: QalamSessionStore;
  tracer?: QalamAgentTracer;
};

const resolveApiKey = (provider: "qwen" | "openrouter" | "ark", apiKey?: string) => {
  const env = typeof import.meta !== "undefined" ? import.meta.env : undefined;
  const processEnv = typeof process !== "undefined" ? process.env : undefined;
  const envKey =
    provider === "openrouter"
      ? env?.OPENROUTER_API_KEY ||
        env?.VITE_OPENROUTER_API_KEY ||
        processEnv?.OPENROUTER_API_KEY ||
        processEnv?.VITE_OPENROUTER_API_KEY
      : provider === "ark"
        ? env?.ARK_API_KEY ||
          env?.VITE_ARK_API_KEY ||
          processEnv?.ARK_API_KEY ||
          processEnv?.VITE_ARK_API_KEY
        : env?.QWEN_API_KEY ||
          env?.VITE_QWEN_API_KEY ||
          env?.DASHSCOPE_API_KEY ||
          env?.VITE_DASHSCOPE_API_KEY ||
          processEnv?.QWEN_API_KEY ||
          processEnv?.VITE_QWEN_API_KEY ||
          processEnv?.DASHSCOPE_API_KEY ||
          processEnv?.VITE_DASHSCOPE_API_KEY ||
          env?.OPENAI_API_KEY ||
          env?.VITE_OPENAI_API_KEY ||
          processEnv?.OPENAI_API_KEY ||
          processEnv?.VITE_OPENAI_API_KEY;
  const finalKey = (apiKey || envKey || "").trim();
  if (!finalKey) {
    throw new Error("缺少 OpenAI 兼容 API Key，无法运行新的 Agent runtime。");
  }
  return finalKey;
};

const debugLog = (label: string, payload?: unknown) => {
  if (typeof console === "undefined") return;
  const prefix = "[Qalam][browser-core]";
  if (payload === undefined) {
    console.debug(prefix, label);
    return;
  }
  console.debug(prefix, label, payload);
};

const debugGroupStart = (label: string) => {
  if (typeof console === "undefined" || typeof console.groupCollapsed !== "function") return;
  console.groupCollapsed(`[Qalam][browser-core] ${label}`);
};

const debugGroupEnd = () => {
  if (typeof console === "undefined" || typeof console.groupEnd !== "function") return;
  console.groupEnd();
};

const buildDisabledTools = (config: Awaited<ReturnType<QalamAgentConfigProvider["getConfig"]>>, enabledSkills: Array<{ disabledTools?: string[] }>) => {
  const toolSettings = normalizeQalamToolSettings(config.qalamTools);
  const disabledTools = enabledSkills.flatMap((skill) => skill?.disabledTools || []);
  disabledTools.push(...STABILIZATION_DISABLED_TOOLS);
  if (!toolSettings.projectData.enabled) {
    disabledTools.push(
      "list_project_resources",
      "read_project_resource",
      "search_project_resource",
      "edit_project_resource"
    );
  }
  if (!toolSettings.workflowBuilder.enabled) {
    disabledTools.push("operate_project_resource");
  }
  return Array.from(new Set(disabledTools));
};

export const createQalamAgentRuntime = ({
  bridge,
  skillLoader,
  configProvider,
  sessionStore,
  tracer,
}: RuntimeDeps): QalamAgentRuntime => ({
  async run(input, options?: QalamRunOptions) {
    debugGroupStart("Agent run");
    try {
      const rawConfig = await configProvider.getConfig();
      const provider = resolveAgentProvider(rawConfig.provider);
      const resolvedConfig = {
        ...rawConfig,
        provider,
        apiKey: resolveApiKey(provider, rawConfig.apiKey),
        baseUrl: resolveBaseUrl(provider, rawConfig.baseUrl),
      };
      const enabledSkills = (
        await Promise.all((input.enabledSkillIds || []).map((skillId) => skillLoader.getSkill(skillId)))
      ).filter(Boolean);
      const disabledTools = buildDisabledTools(rawConfig, enabledSkills as Array<{ disabledTools?: string[] }>);
      const session = await sessionStore.getSession(input.sessionId);
      const sessionMessages = readPersistedAgentSessionMessages(input.sessionId);

      tracer?.onRunStarted(input);
      const runResult = await runQalamAgentCore({
        input,
        config: {
          provider,
          model: resolvedConfig.model,
          apiKey: resolvedConfig.apiKey,
          baseUrl: resolvedConfig.baseUrl,
          defaultHeaders: resolvedConfig.defaultHeaders,
          qalamTools: resolvedConfig.qalamTools,
        },
        bridge,
        session,
        sessionMessages,
        runtimeMode: "browser",
        runtimeLabel: "Qalam Agent",
        workflowName: "Qalam Browser Agent",
        enabledSkills: enabledSkills as any,
        disabledTools,
        maxTurns: AGENT_MAX_TURNS,
        signal: options?.signal,
        onEvent: (event) => {
          if (event.type === "tool_called") tracer?.onToolCalled(event.call);
          if (event.type === "tool_completed") tracer?.onToolCompleted(event.call);
          options?.onEvent?.(event);
        },
        onDebug: debugLog,
      });
      tracer?.onRunCompleted(runResult);
      return runResult;
    } catch (error: any) {
      const message = error?.message || "Agent runtime 执行失败";
      tracer?.onRunFailed(message);
      throw error;
    } finally {
      debugGroupEnd();
    }
  },
});
