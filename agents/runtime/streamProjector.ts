import type { RunStreamEvent } from "@openai/agents";
import type { AgentRuntimeEvent } from "./types";

type MessageRuntimeEvent = Extract<
  AgentRuntimeEvent,
  { type: "message_delta" | "message_completed" | "reasoning_delta" | "reasoning_completed" }
>;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const getArray = (record: Record<string, unknown> | null, key: string) =>
  record && Array.isArray(record[key]) ? record[key] as unknown[] : [];

export const extractTextFromModelOutput = (output: unknown): string => {
  if (typeof output === "string") return output.trim();
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  output.forEach((item) => {
    const record = asRecord(item);
    if (!record) return;
    if (record.type === "output_text" && typeof record.text === "string") parts.push(record.text);
    if (record.type !== "message") return;
    getArray(record, "content").forEach((content) => {
      const contentRecord = asRecord(content);
      if (contentRecord?.type === "output_text" && typeof contentRecord.text === "string") parts.push(contentRecord.text);
    });
  });
  return parts.join("\n").trim();
};

export const extractReasoningFromModelOutput = (output: unknown): string => {
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  output.forEach((item) => {
    const record = asRecord(item);
    if (!record) return;
    if (["reasoning", "reasoning_summary", "summary_text"].includes(String(record.type)) && typeof record.text === "string") {
      parts.push(record.text);
    }
    [...getArray(record, "summary"), ...getArray(record, "content"), ...getArray(record, "rawContent")].forEach((content) => {
      const contentRecord = asRecord(content);
      if (
        ["reasoning_summary_text", "reasoning_text", "summary_text"].includes(String(contentRecord?.type)) &&
        typeof contentRecord?.text === "string"
      ) {
        parts.push(contentRecord.text);
      }
    });
  });
  return Array.from(new Set(parts.map((part) => part.trim()).filter(Boolean))).join("\n").trim();
};

export const modelOutputHasToolCalls = (output: unknown) =>
  Array.isArray(output) && output.some((item) => asRecord(item)?.type === "function_call");

const unwrapProviderEvent = (value: unknown) => {
  const record = asRecord(value);
  return asRecord(record?.event) || asRecord(record?.providerData) || record;
};

const mergeCompletedText = (streamedText: string, completedText?: string) => {
  const candidate = completedText || "";
  if (!candidate) return streamedText;
  if (!streamedText) return candidate;
  if (candidate.includes(streamedText)) return candidate;
  if (streamedText.includes(candidate)) return streamedText;
  return `${streamedText.trimEnd()}\n\n${candidate.trimStart()}`;
};

export class AgentMessageStreamProjector {
  private textSegmentIndex = 0;
  private activeMessageId = "";
  private activeMessageText = "";
  private activeReasoningText = "";
  private readonly completedMessages: Array<{ messageId: string; text: string; isFinal: boolean }> = [];

  streamedText = "";
  streamedResponseText = "";
  streamedReasoningText = "";

  constructor(
    private readonly runId: string,
    private readonly emit: (event: MessageRuntimeEvent) => void
  ) {}

  private ensureMessageId() {
    if (!this.activeMessageId) {
      this.textSegmentIndex += 1;
      this.activeMessageId = `${this.runId}-message-${this.textSegmentIndex}`;
      this.activeMessageText = "";
    }
    return this.activeMessageId;
  }

  private emitMessageDelta(delta: string) {
    if (!delta) return;
    const messageId = this.ensureMessageId();
    this.activeMessageText += delta;
    this.streamedText += delta;
    this.emit({ type: "message_delta", runId: this.runId, messageId, delta, accumulatedText: this.activeMessageText });
  }

  private emitReasoningDelta(delta: string) {
    if (!delta) return;
    this.activeReasoningText += delta;
    this.streamedReasoningText += delta;
    this.emit({ type: "reasoning_delta", runId: this.runId, delta, accumulatedText: this.activeReasoningText });
  }

  private completeReasoning(completedText?: string) {
    const text = mergeCompletedText(this.activeReasoningText, completedText);
    if (!text.trim()) return;
    this.activeReasoningText = "";
    this.emit({ type: "reasoning_completed", runId: this.runId, text });
  }

  private completeMessage(completedText?: string, isFinal = false) {
    if (!this.activeMessageText.trim() && !completedText?.trim()) return;
    const messageId = this.ensureMessageId();
    this.activeMessageText = mergeCompletedText(this.activeMessageText, completedText);
    this.completedMessages.push({ messageId, text: this.activeMessageText, isFinal });
    this.emit({ type: "message_completed", runId: this.runId, messageId, text: this.activeMessageText, isFinal });
    this.activeMessageId = "";
    this.activeMessageText = "";
  }

  consume(event: RunStreamEvent) {
    if (event.type !== "raw_model_stream_event") return;
    const raw = asRecord(event.data);
    const provider = unwrapProviderEvent(event.data);
    const rawType = String(raw?.type || provider?.type || "");
    const choices = getArray(provider, "choices");
    const firstChoice = asRecord(choices[0]);
    const chatDelta = asRecord(firstChoice?.delta);
    const chatReasoning =
      typeof chatDelta?.reasoning_content === "string"
        ? chatDelta.reasoning_content
        : typeof chatDelta?.reasoning === "string"
          ? chatDelta.reasoning
          : "";
    this.emitReasoningDelta(chatReasoning);

    if (rawType === "output_text_delta" && typeof raw?.delta === "string") {
      this.emitMessageDelta(raw.delta);
    }

    const reasoningDelta =
      typeof raw?.delta === "string" ? raw.delta : typeof provider?.delta === "string" ? provider.delta : "";
    if (["response.reasoning_summary_text.delta", "reasoning_summary_text.delta"].includes(rawType)) {
      this.emitReasoningDelta(reasoningDelta);
    }
    if (
      ["response.reasoning_summary_text.done", "reasoning_summary_text.done"].includes(rawType) &&
      typeof raw?.text === "string"
    ) {
      this.completeReasoning(raw.text);
    }
    if (rawType === "response_done") {
      const response = asRecord(raw?.response) || asRecord(provider?.response);
      const candidate = extractTextFromModelOutput(response?.output);
      if (candidate) this.streamedResponseText = candidate;
      const reasoning = extractReasoningFromModelOutput(response?.output);
      if (reasoning) this.completeReasoning(reasoning);
      this.completeMessage(candidate, !modelOutputHasToolCalls(response?.output));
    }
  }

  finish() {
    this.completeReasoning();
    this.completeMessage();
  }

  finalize(finalText: string) {
    const normalized = finalText.trim();
    if (!normalized) return;
    const completed = this.completedMessages.find((item) => {
      const text = item.text.trim();
      return text === normalized || text.includes(normalized) || normalized.includes(text);
    });
    if (completed) {
      if (!completed.isFinal) {
        completed.isFinal = true;
        this.emit({ type: "message_completed", runId: this.runId, messageId: completed.messageId, text: completed.text, isFinal: true });
      }
      return;
    }
    this.completeMessage(normalized, true);
  }
}

