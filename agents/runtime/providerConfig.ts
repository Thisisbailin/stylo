import { ARK_DEFAULT_MODEL, ARK_RESPONSES_BASE_URL, OPENROUTER_RESPONSES_BASE_URL, QWEN_DEFAULT_MODEL, QWEN_RESPONSES_BASE_URL } from "../../constants";

export type QalamAgentProvider = "qwen" | "openrouter" | "ark";

export const resolveAgentProvider = (provider?: string): QalamAgentProvider =>
  provider === "openrouter" ? "openrouter" : provider === "ark" ? "ark" : "qwen";

export const resolveBaseUrl = (provider: QalamAgentProvider, baseUrl?: string) => {
  const configured = (baseUrl || "").trim();
  if (configured) return configured;
  if (provider === "openrouter") return OPENROUTER_RESPONSES_BASE_URL;
  if (provider === "ark") return ARK_RESPONSES_BASE_URL;
  return QWEN_RESPONSES_BASE_URL;
};

export const resolveProviderModel = (provider: QalamAgentProvider, requestedModel?: string) => {
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

export const isModelAccessError = (message: string) =>
  /model or endpoint/i.test(message) &&
  /(does not exist|do not have access)/i.test(message);

export const formatModelAccessError = (
  provider: QalamAgentProvider,
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
