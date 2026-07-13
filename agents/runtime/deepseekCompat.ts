import type OpenAI from "openai";

const DEEPSEEK_COMPAT_INSTALLED = Symbol.for("stylo.deepseek.chatCompletionsCompat");

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getReasoningText = (message: Record<string, any>) => {
  if (typeof message.reasoning_content === "string") return message.reasoning_content;
  if (typeof message.reasoning === "string") return message.reasoning;
  return "";
};

const hasAssistantPayload = (message: Record<string, any>) =>
  (message.content !== null && message.content !== undefined) ||
  (Array.isArray(message.tool_calls) && message.tool_calls.length > 0);

const appendReasoning = (existing: string, incoming: string) => {
  if (!incoming) return existing;
  if (!existing) return incoming;
  return `${existing}\n${incoming}`;
};

const normalizeAssistantMessageForDeepSeek = (message: any, pendingReasoning = "") => {
  if (!isRecord(message) || message.role !== "assistant") return message;
  const ownReasoning = getReasoningText(message);
  const reasoning = appendReasoning(pendingReasoning, ownReasoning);
  if (!reasoning && typeof message.reasoning !== "string") return message;
  const next = { ...message };
  if (reasoning) next.reasoning_content = reasoning;
  delete next.reasoning;
  return next;
};

export const normalizeMessagesForDeepSeek = (messages: unknown) => {
  if (!Array.isArray(messages)) return messages;
  let pendingReasoning = "";
  const normalized: any[] = [];

  for (const message of messages) {
    if (!isRecord(message) || message.role !== "assistant") {
      const role = isRecord(message) ? message.role : undefined;
      if (pendingReasoning && role !== "tool" && role !== "function") {
        pendingReasoning = "";
      }
      normalized.push(message);
      continue;
    }

    const reasoning = getReasoningText(message);
    if (!hasAssistantPayload(message)) {
      pendingReasoning = appendReasoning(pendingReasoning, reasoning);
      continue;
    }

    normalized.push(normalizeAssistantMessageForDeepSeek(message, pendingReasoning));
    pendingReasoning = "";
  }

  return normalized;
};

export const normalizeRequestForDeepSeek = (request: any) => {
  if (!isRecord(request)) return request;
  return {
    ...request,
    messages: normalizeMessagesForDeepSeek(request.messages),
    reasoning_effort: request.reasoning_effort || "high",
    thinking: request.thinking || { type: "enabled" },
  };
};

const normalizeChoiceMessageFromDeepSeek = (choice: any) => {
  const message = choice?.message;
  if (!isRecord(message) || typeof message.reasoning === "string" || typeof message.reasoning_content !== "string") {
    return choice;
  }
  return {
    ...choice,
    message: {
      ...message,
      reasoning: message.reasoning_content,
    },
  };
};

export const normalizeResponseFromDeepSeek = (response: any) => {
  if (!isRecord(response) || !Array.isArray(response.choices)) return response;
  return {
    ...response,
    choices: response.choices.map(normalizeChoiceMessageFromDeepSeek),
  };
};

export const normalizeStreamChunkFromDeepSeek = (chunk: any) => {
  if (!isRecord(chunk) || !Array.isArray(chunk.choices)) return chunk;
  let changed = false;
  const choices = chunk.choices.map((choice: any) => {
    const delta = choice?.delta;
    if (!isRecord(delta) || typeof delta.reasoning === "string" || typeof delta.reasoning_content !== "string") {
      return choice;
    }
    changed = true;
    return {
      ...choice,
      delta: {
        ...delta,
        reasoning: delta.reasoning_content,
      },
    };
  });
  return changed ? { ...chunk, choices } : chunk;
};

const wrapDeepSeekStream = (stream: AsyncIterable<any>) => ({
  async *[Symbol.asyncIterator]() {
    for await (const chunk of stream) {
      yield normalizeStreamChunkFromDeepSeek(chunk);
    }
  },
});

export const installDeepSeekChatCompletionsCompatibility = (client: OpenAI) => {
  const completions = (client as any)?.chat?.completions;
  if (!completions || typeof completions.create !== "function") return;
  if (completions[DEEPSEEK_COMPAT_INSTALLED]) return;

  const originalCreate = completions.create.bind(completions);
  completions.create = async (...args: any[]) => {
    const request = normalizeRequestForDeepSeek(args[0]);
    const response = await originalCreate(request, ...args.slice(1));
    if (request?.stream && response && typeof response[Symbol.asyncIterator] === "function") {
      return wrapDeepSeekStream(response);
    }
    return normalizeResponseFromDeepSeek(response);
  };
  completions[DEEPSEEK_COMPAT_INSTALLED] = true;
};
