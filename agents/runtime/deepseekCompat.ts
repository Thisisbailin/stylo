import type OpenAI from "openai";

const DEEPSEEK_COMPAT_INSTALLED = Symbol.for("qalam.deepseek.chatCompletionsCompat");

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeAssistantMessageForDeepSeek = (message: any) => {
  if (!isRecord(message) || message.role !== "assistant") return message;
  if (typeof message.reasoning !== "string" || typeof message.reasoning_content === "string") {
    return message;
  }
  const next = { ...message, reasoning_content: message.reasoning };
  delete next.reasoning;
  return next;
};

const normalizeRequestForDeepSeek = (request: any) => {
  if (!isRecord(request)) return request;
  const messages = Array.isArray(request.messages)
    ? request.messages.map(normalizeAssistantMessageForDeepSeek)
    : request.messages;
  return {
    ...request,
    messages,
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

const normalizeResponseFromDeepSeek = (response: any) => {
  if (!isRecord(response) || !Array.isArray(response.choices)) return response;
  return {
    ...response,
    choices: response.choices.map(normalizeChoiceMessageFromDeepSeek),
  };
};

const normalizeStreamChunkFromDeepSeek = (chunk: any) => {
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

