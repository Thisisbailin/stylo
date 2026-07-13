import type { AgentInputItem } from "@openai/agents";
import type { AgentSessionMessage } from "./types";
import { repairSessionToolTransactions } from "./sessionRepair";

export const AGENT_SESSION_LIMITS = Object.freeze({
  storedItems: 72,
  storedMessages: 240,
  historyWindow: 24,
  itemTextChars: 2400,
  toolOutputChars: 1200,
  projectedToolSummaryChars: 300,
});

const clone = <T,>(value: T): T => structuredClone(value);

export const clipSessionText = (value: string, limit: number) =>
  value.length <= limit ? value : `${value.slice(0, limit)}...`;

export const extractSessionTextParts = (content: unknown): string[] => {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const record = part as Record<string, unknown>;
      if (typeof record.text === "string") return record.text;
      if (typeof record.refusal === "string") return record.refusal;
      if (typeof record.transcript === "string") return record.transcript;
      return "";
    })
    .filter(Boolean);
};

const extractReasoningText = (item: Record<string, unknown>) => {
  const raw = extractSessionTextParts(item.rawContent);
  return (raw.length ? raw : extractSessionTextParts(item.content)).join("\n").trim();
};

export const summarizeSessionToolOutput = (
  output: unknown,
  limit = AGENT_SESSION_LIMITS.projectedToolSummaryChars
) => {
  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output);
      if (typeof parsed?.summary === "string" && parsed.summary.trim()) return clipSessionText(parsed.summary.trim(), limit);
      if (typeof parsed?.output === "string" && parsed.output.trim()) return clipSessionText(parsed.output.trim(), limit);
      return clipSessionText(JSON.stringify(parsed, null, 2), limit);
    } catch {
      return clipSessionText(output, limit);
    }
  }
  if (Array.isArray(output)) {
    const parts = extractSessionTextParts(output);
    if (parts.length) return clipSessionText(parts.join("\n"), limit);
  }
  if (output == null) return "";
  try {
    return clipSessionText(JSON.stringify(output, null, 2), limit);
  } catch {
    return clipSessionText(String(output), limit);
  }
};

export const projectAgentItemsToSessionMessages = (
  items: AgentInputItem[],
  timestampBase: number
): AgentSessionMessage[] =>
  items.flatMap((item, index): AgentSessionMessage[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as unknown as Record<string, unknown>;
    const createdAt = timestampBase + index;
    if (record.role === "user" || record.role === "assistant") {
      const text = extractSessionTextParts(record.content).join("\n").trim();
      return text ? [{ role: record.role, text, createdAt }] : [];
    }
    if (record.type === "reasoning") {
      const text = extractReasoningText(record);
      return text ? [{ role: "reasoning", text, createdAt }] : [];
    }
    if (record.type === "function_call_result") {
      const output = record.output;
      return [{
        role: "tool",
        text: summarizeSessionToolOutput(output) || String(record.name || "tool_result"),
        createdAt,
        toolName: String(record.name || "tool"),
        toolCallId: String(record.callId || `tool-${createdAt}`),
        toolStatus: record.status === "completed" ? "success" : "error",
        toolOutput: output,
      }];
    }
    return [];
  });

export const normalizeAgentSessionMessage = (message: unknown): AgentSessionMessage | null => {
  if (!message || typeof message !== "object") return null;
  const record = message as Record<string, unknown>;
  const createdAt = typeof record.createdAt === "number" ? record.createdAt : Date.now();
  if (record.role === "tool") {
    if (typeof record.toolName !== "string" || typeof record.toolCallId !== "string") return null;
    return {
      role: "tool",
      text: typeof record.text === "string" ? record.text : "",
      createdAt,
      toolName: record.toolName,
      toolCallId: record.toolCallId,
      toolStatus: record.toolStatus === "error" ? "error" : "success",
      toolOutput: record.toolOutput,
    };
  }
  if (record.role === "user" || record.role === "assistant" || record.role === "reasoning") {
    return { role: record.role, text: typeof record.text === "string" ? record.text : "", createdAt };
  }
  return null;
};

const compactContent = (content: unknown, textLimit: number) => {
  if (!Array.isArray(content)) return content;
  return content.map((part) => {
    if (!part || typeof part !== "object") return part;
    const next = { ...(part as Record<string, unknown>) };
    if (typeof next.text === "string") next.text = clipSessionText(next.text, textLimit);
    if (typeof next.transcript === "string") next.transcript = clipSessionText(next.transcript, textLimit);
    return next;
  });
};

const compactToolOutput = (output: unknown, limit: number) => {
  if (typeof output !== "string") return output;
  try {
    const parsed = JSON.parse(output);
    if (parsed && typeof parsed === "object") {
      return JSON.stringify({
        status: parsed.status,
        tool: parsed.tool,
        target: parsed.target,
        action: parsed.action,
        summary: typeof parsed.summary === "string" ? clipSessionText(parsed.summary, 300) : undefined,
      });
    }
  } catch {
    return clipSessionText(output, limit);
  }
  return clipSessionText(output, limit);
};

export const compactAgentSessionItems = (
  items: AgentInputItem[],
  options?: { maxItems?: number; textLimit?: number; toolOutputLimit?: number }
) => {
  const maxItems = options?.maxItems ?? AGENT_SESSION_LIMITS.storedItems;
  const textLimit = options?.textLimit ?? AGENT_SESSION_LIMITS.itemTextChars;
  const toolOutputLimit = options?.toolOutputLimit ?? AGENT_SESSION_LIMITS.toolOutputChars;
  const compacted = items.map((item) => {
    if (!item || typeof item !== "object") return item;
    const next = clone(item) as AgentInputItem;
    const record = next as unknown as Record<string, unknown>;
    if (record.role === "user" || record.role === "assistant" || record.type === "reasoning") {
      record.content = compactContent(record.content, textLimit);
      record.rawContent = compactContent(record.rawContent, textLimit);
    } else if (record.type === "function_call_result") {
      record.output = compactToolOutput(record.output, toolOutputLimit);
    }
    return next;
  });
  return repairSessionToolTransactions(compacted.slice(-maxItems));
};

