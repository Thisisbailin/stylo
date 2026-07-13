import { OpenAIProvider, type ModelSettings } from "@openai/agents";
import OpenAI from "openai";
import { installDeepSeekChatCompletionsCompatibility } from "./deepseekCompat";
import type { QalamAgentApiMode, QalamAgentProvider } from "./providerConfig";

export type QalamProviderRuntimeConfig = {
  provider: QalamAgentProvider;
  apiMode: QalamAgentApiMode;
  model: string;
  apiKey: string;
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  allowBrowserClient: boolean;
};

export type QalamProviderRuntime = {
  client: OpenAI;
  modelProvider: OpenAIProvider;
  modelSettings: ModelSettings;
  close: () => Promise<void>;
};

const buildModelSettings = (config: QalamProviderRuntimeConfig): ModelSettings => ({
  toolChoice: "auto",
  parallelToolCalls: false,
  store: false,
  ...(config.provider === "deepseek"
    ? {
        reasoning: { effort: "high" as const },
        providerData: {
          thinking: { type: "enabled" },
        },
      }
    : {}),
});

export const createQalamProviderRuntime = (config: QalamProviderRuntimeConfig): QalamProviderRuntime => {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    defaultHeaders: config.defaultHeaders,
    dangerouslyAllowBrowser: config.allowBrowserClient,
  });
  if (config.provider === "deepseek" && config.apiMode === "chat_completions") {
    installDeepSeekChatCompletionsCompatibility(client);
  }
  const modelProvider = new OpenAIProvider({
    openAIClient: client,
    useResponses: config.apiMode === "responses",
  });
  return {
    client,
    modelProvider,
    modelSettings: buildModelSettings(config),
    close: () => modelProvider.close(),
  };
};

