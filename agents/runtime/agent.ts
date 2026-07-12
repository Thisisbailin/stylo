import type { QalamAgentBridge } from "../bridge/qalamBridge";
import { readPersistedAgentSessionMessages } from "./session";
import { runQalamAgentCore } from "./core";
import { resolveAgentProvider, resolveApiMode, resolveBaseUrl } from "./providerConfig";
import { resolveActivatedSkills, StaticSkillLoader } from "./skills";
import { buildDisabledTools } from "./toolPolicy";
import type {
  QalamAgentConfigProvider,
  QalamAgentRuntime,
  QalamAgentTracer,
  QalamRunOptions,
  QalamSessionStore,
  QalamSkillLoader,
} from "./types";

const AGENT_MAX_TURNS = 50;

type RuntimeDeps = {
  bridge: QalamAgentBridge;
  skillLoader: QalamSkillLoader;
  configProvider: QalamAgentConfigProvider;
  sessionStore: QalamSessionStore;
  tracer?: QalamAgentTracer;
};

const resolveApiKey = (provider: "qwen" | "openrouter" | "ark" | "deepseek", apiKey?: string) => {
  const finalKey = (apiKey || "").trim();
  if (!finalKey) {
    throw new Error(`缺少 ${provider} API Key，请在项目设置中填写。`);
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
        apiMode: resolveApiMode(provider),
        apiKey: resolveApiKey(provider, rawConfig.apiKey),
        baseUrl: resolveBaseUrl(provider, rawConfig.baseUrl),
      };
      const loader = skillLoader || new StaticSkillLoader();
      const {
        skills: enabledSkills,
        explicitSkillIds,
        implicitSkillIds,
      } = await resolveActivatedSkills({
        explicitSkillIds: input.enabledSkillIds || [],
        loader,
      });
      const disabledTools = buildDisabledTools(rawConfig, enabledSkills as Array<{ disabledTools?: string[] }>);
      const session = await sessionStore.getSession(input.sessionId);
      const sessionMessages = readPersistedAgentSessionMessages(input.sessionId);

      debugLog("skills resolved", {
        explicitSkillIds,
        implicitSkillIds,
        enabledSkills: enabledSkills.map((skill) => skill.id),
      });

      tracer?.onRunStarted(input);
      const runResult = await runQalamAgentCore({
        input,
        config: {
          provider,
          apiMode: resolvedConfig.apiMode,
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
