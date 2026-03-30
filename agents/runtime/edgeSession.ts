import type { AgentInputItem, Session, SessionInputCallback } from "@openai/agents";
import type { AgentSessionMessage } from "./types";

type EdgeSessionRecord = {
  id: string;
  items: AgentInputItem[];
  messages: AgentSessionMessage[];
  updatedAt: number;
};

const EDGE_SESSION_MAX_ITEMS = 48;
const EDGE_SESSION_HISTORY_WINDOW = 24;
const EDGE_SESSION_TEXT_LIMIT = 2400;
const EDGE_SESSION_TOOL_OUTPUT_LIMIT = 1200;

const getEdgeSessionMap = () => {
  const scope = globalThis as typeof globalThis & {
    __QALAM_EDGE_AGENT_SESSIONS__?: Map<string, EdgeSessionRecord>;
  };
  if (!scope.__QALAM_EDGE_AGENT_SESSIONS__) {
    scope.__QALAM_EDGE_AGENT_SESSIONS__ = new Map<string, EdgeSessionRecord>();
  }
  return scope.__QALAM_EDGE_AGENT_SESSIONS__;
};

const cloneItem = <T,>(value: T): T => structuredClone(value);

const trimSessionItems = (items: AgentInputItem[], limit?: number) => {
  if (limit === undefined) return items.map(cloneItem);
  if (limit <= 0) return [];
  return items.slice(Math.max(items.length - limit, 0)).map(cloneItem);
};

const clipText = (value: string, limit: number) => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
};

const extractTextParts = (content: unknown): string[] => {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (typeof (part as any).text === "string") return (part as any).text;
      if (typeof (part as any).refusal === "string") return (part as any).refusal;
      if (typeof (part as any).transcript === "string") return (part as any).transcript;
      return "";
    })
    .filter(Boolean);
};

const summarizeToolOutput = (output: unknown) => {
  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output);
      if (typeof parsed?.summary === "string" && parsed.summary.trim()) return clipText(parsed.summary.trim(), 300);
      if (typeof parsed?.output === "string" && parsed.output.trim()) return clipText(parsed.output.trim(), 300);
      return clipText(JSON.stringify(parsed, null, 2), 300);
    } catch {
      return clipText(output, 300);
    }
  }
  if (Array.isArray(output)) {
    const parts = extractTextParts(output);
    if (parts.length) return clipText(parts.join("\n"), 300);
  }
  if (output == null) return "";
  try {
    return clipText(JSON.stringify(output, null, 2), 300);
  } catch {
    return clipText(String(output), 300);
  }
};

const projectAgentItemsToSessionMessages = (items: AgentInputItem[], timestampBase: number): AgentSessionMessage[] =>
  items.flatMap((item, index) => {
    const createdAt = timestampBase + index;
    if (!item || typeof item !== "object") return [];

    if ((item as any).role === "user") {
      const text = extractTextParts((item as any).content).join("\n").trim();
      return text ? [{ role: "user" as const, text, createdAt }] : [];
    }

    if ((item as any).role === "assistant") {
      const text = extractTextParts((item as any).content).join("\n").trim();
      return text ? [{ role: "assistant" as const, text, createdAt }] : [];
    }

    if ((item as any).type === "function_call_result") {
      return [
        {
          role: "tool" as const,
          text: summarizeToolOutput((item as any).output) || String((item as any).name || "tool_result"),
          createdAt,
          toolName: String((item as any).name || "tool"),
          toolCallId: String((item as any).callId || `tool-${createdAt}`),
          toolStatus: (item as any).status === "completed" ? "success" : "error",
          toolOutput: (item as any).output,
        },
      ];
    }

    return [];
  });

const compactToolOutput = (output: unknown) => {
  if (typeof output !== "string") return output;
  try {
    const parsed = JSON.parse(output);
    if (parsed && typeof parsed === "object") {
      return JSON.stringify({
        status: parsed.status,
        tool: parsed.tool,
        summary: typeof parsed.summary === "string" ? clipText(parsed.summary, 300) : undefined,
      });
    }
  } catch {
    return clipText(output, EDGE_SESSION_TOOL_OUTPUT_LIMIT);
  }
  return clipText(output, EDGE_SESSION_TOOL_OUTPUT_LIMIT);
};

const compactContentParts = (content: unknown) => {
  if (!Array.isArray(content)) return content;
  return content.map((part) => {
    if (!part || typeof part !== "object") return part;
    const cloned = { ...(part as any) };
    if (typeof cloned.text === "string") cloned.text = clipText(cloned.text, EDGE_SESSION_TEXT_LIMIT);
    if (typeof cloned.transcript === "string") cloned.transcript = clipText(cloned.transcript, EDGE_SESSION_TEXT_LIMIT);
    return cloned;
  });
};

const compactAgentItem = (item: AgentInputItem): AgentInputItem => {
  if (!item || typeof item !== "object") return item;
  const cloned = cloneItem(item);
  if ((cloned as any).role === "user" || (cloned as any).role === "assistant") {
    (cloned as any).content = compactContentParts((cloned as any).content);
    return cloned;
  }
  if ((cloned as any).type === "function_call_result") {
    (cloned as any).output = compactToolOutput((cloned as any).output);
    return cloned;
  }
  return cloned;
};

const compactAgentItems = (items: AgentInputItem[], maxItems = EDGE_SESSION_MAX_ITEMS) =>
  items.map(compactAgentItem).slice(-maxItems);

export class EdgeMemorySession implements Session {
  constructor(private readonly sessionId: string) {}

  async getSessionId(): Promise<string> {
    return this.sessionId;
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    const record = getEdgeSessionMap().get(this.sessionId);
    const items = record?.items || [];
    return trimSessionItems(items, limit);
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    if (!items.length) return;
    const sessions = getEdgeSessionMap();
    const existing = sessions.get(this.sessionId);
    const merged = [...(existing?.items || []), ...items.map(cloneItem)];
    const timestampBase = Date.now();
    const projectedMessages = projectAgentItemsToSessionMessages(items.map(cloneItem), timestampBase);
    sessions.set(this.sessionId, {
      id: this.sessionId,
      items: compactAgentItems(merged),
      messages: [...(existing?.messages || []), ...projectedMessages].slice(-240),
      updatedAt: timestampBase,
    });
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    const sessions = getEdgeSessionMap();
    const existing = sessions.get(this.sessionId);
    if (!existing?.items.length) return undefined;
    const next = existing.items.slice(0, -1);
    const removed = existing.items[existing.items.length - 1];
    const timestampBase = Date.now();
    sessions.set(this.sessionId, {
      id: this.sessionId,
      items: next,
      messages: projectAgentItemsToSessionMessages(next, timestampBase).slice(-240),
      updatedAt: timestampBase,
    });
    return cloneItem(removed);
  }

  async clearSession(): Promise<void> {
    getEdgeSessionMap().delete(this.sessionId);
  }
}

export const createEdgeSessionInputCallback =
  (historyWindow = EDGE_SESSION_HISTORY_WINDOW): SessionInputCallback =>
  async (historyItems, newItems) => {
    const trimmedHistory = compactAgentItems(historyItems, historyWindow);
    return [...trimmedHistory, ...newItems];
  };

export const readEdgeSessionMessages = (sessionId: string): AgentSessionMessage[] =>
  getEdgeSessionMap().get(sessionId)?.messages || [];
