import type { AgentInputItem, Session } from "@openai/agents";
import type { AgentSessionMessage, QalamSessionRecord, QalamSessionStore } from "./types";
import { repairSessionToolTransactions, trimSessionItemsSafely } from "./sessionRepair";

export const DEFAULT_AGENT_SESSION_STORAGE_KEY = "qalam_agent_sessions_v1";
export const AGENT_SESSION_STORAGE_UPDATED_EVENT = "qalam:agent-session-storage-updated";

type PersistedAgentSessionRecord = {
  id: string;
  items: AgentInputItem[];
  messages: AgentSessionMessage[];
  updatedAt: number;
};

const cloneItem = <T,>(value: T): T => structuredClone(value);

const trimSessionItems = (items: AgentInputItem[], limit?: number) => {
  return trimSessionItemsSafely(items, limit);
};

const normalizeSessionMessage = (message: any): AgentSessionMessage | null => {
  if (!message || typeof message !== "object") return null;
  const createdAt = typeof message.createdAt === "number" ? message.createdAt : Date.now();
  if (message.role === "tool") {
    if (typeof message.toolName !== "string" || typeof message.toolCallId !== "string") return null;
    return {
      role: "tool",
      text: typeof message.text === "string" ? message.text : "",
      createdAt,
      toolName: message.toolName,
      toolCallId: message.toolCallId,
      toolStatus: message.toolStatus === "error" ? "error" : "success",
      toolOutput: message.toolOutput,
    };
  }
  if (message.role === "user" || message.role === "assistant") {
    return {
      role: message.role,
      text: typeof message.text === "string" ? message.text : "",
      createdAt,
    };
  }
  return null;
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
      if (typeof parsed?.summary === "string" && parsed.summary.trim()) return parsed.summary.trim();
      if (typeof parsed?.output === "string" && parsed.output.trim()) return parsed.output.trim();
      return JSON.stringify(parsed, null, 2);
    } catch {
      return output;
    }
  }
  if (Array.isArray(output)) {
    const parts = extractTextParts(output);
    if (parts.length) return parts.join("\n");
  }
  if (output == null) return "";
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
};

const projectAgentItemsToSessionMessages = (items: AgentInputItem[], timestampBase: number): AgentSessionMessage[] =>
  items.flatMap((item, index): AgentSessionMessage[] => {
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
      const summary = summarizeToolOutput((item as any).output);
      return [
        {
          role: "tool" as const,
          text: summary || (item as any).name || "tool_result",
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

const normalizePersistedRecord = (value: any): PersistedAgentSessionRecord | null => {
  if (!value || typeof value !== "object" || typeof value.id !== "string") return null;
  const updatedAt = typeof value.updatedAt === "number" ? value.updatedAt : Date.now();
  const items = Array.isArray(value.items)
    ? repairSessionToolTransactions(
        value.items.filter((item: unknown) => item && typeof item === "object") as AgentInputItem[]
      )
    : [];
  const messages = Array.isArray(value.messages)
    ? value.messages.map(normalizeSessionMessage).filter(Boolean) as AgentSessionMessage[]
    : [];
  return {
    id: value.id,
    items,
    messages,
    updatedAt,
  };
};

const emitStorageUpdated = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AGENT_SESSION_STORAGE_UPDATED_EVENT));
};

const readLocalStorageSessions = (storageKey: string): Record<string, PersistedAgentSessionRecord> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, record]) => [key, normalizePersistedRecord(record)])
        .filter((entry): entry is [string, PersistedAgentSessionRecord] => !!entry[1])
    );
  } catch {
    return {};
  }
};

const writeLocalStorageSessions = (storageKey: string, records: Record<string, PersistedAgentSessionRecord>) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(records));
  emitStorageUpdated();
};

const getOrCreateRecord = (
  sessions: Record<string, PersistedAgentSessionRecord>,
  sessionId: string
): PersistedAgentSessionRecord =>
  sessions[sessionId] || {
    id: sessionId,
    items: [],
    messages: [],
    updatedAt: Date.now(),
  };

const toSessionRecordView = (record: PersistedAgentSessionRecord): QalamSessionRecord => ({
  id: record.id,
  messages: record.messages,
  updatedAt: record.updatedAt,
});

export const listPersistedAgentSessions = (
  storageKey = DEFAULT_AGENT_SESSION_STORAGE_KEY
): QalamSessionRecord[] =>
  Object.values(readLocalStorageSessions(storageKey))
    .map(toSessionRecordView)
    .sort((a, b) => b.updatedAt - a.updatedAt);

export const readPersistedAgentSession = (
  sessionId: string,
  storageKey = DEFAULT_AGENT_SESSION_STORAGE_KEY
): QalamSessionRecord | null => {
  const record = readLocalStorageSessions(storageKey)[sessionId];
  return record ? toSessionRecordView(record) : null;
};

export const readPersistedAgentSessionMessages = (
  sessionId: string,
  storageKey = DEFAULT_AGENT_SESSION_STORAGE_KEY
): AgentSessionMessage[] => readLocalStorageSessions(storageKey)[sessionId]?.messages || [];

export const clearPersistedAgentSession = (
  sessionId: string,
  storageKey = DEFAULT_AGENT_SESSION_STORAGE_KEY
) => {
  const sessions = readLocalStorageSessions(storageKey);
  if (!(sessionId in sessions)) return;
  delete sessions[sessionId];
  writeLocalStorageSessions(storageKey, sessions);
};

class LocalStorageAgentSession implements Session {
  constructor(
    private readonly sessionId: string,
    private readonly storageKey: string
  ) {}

  async getSessionId(): Promise<string> {
    return this.sessionId;
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    const record = readLocalStorageSessions(this.storageKey)[this.sessionId];
    const items = record?.items || [];
    return trimSessionItems(items, limit);
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    if (!items.length) return;
    const sessions = readLocalStorageSessions(this.storageKey);
    const existing = getOrCreateRecord(sessions, this.sessionId);
    const timestampBase = Date.now();
    const clonedItems = items.map(cloneItem);
    const projectedMessages = projectAgentItemsToSessionMessages(clonedItems, timestampBase);
    sessions[this.sessionId] = {
      ...existing,
      items: [...existing.items, ...clonedItems],
      messages: [...existing.messages, ...projectedMessages].slice(-240),
      updatedAt: timestampBase,
    };
    writeLocalStorageSessions(this.storageKey, sessions);
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    const sessions = readLocalStorageSessions(this.storageKey);
    const existing = sessions[this.sessionId];
    if (!existing?.items.length) return undefined;
    const nextItems = existing.items.slice(0, -1);
    const removed = existing.items[existing.items.length - 1];
    const timestampBase = Date.now();
    sessions[this.sessionId] = {
      ...existing,
      items: nextItems,
      messages: projectAgentItemsToSessionMessages(nextItems, timestampBase).slice(-240),
      updatedAt: timestampBase,
    };
    writeLocalStorageSessions(this.storageKey, sessions);
    return cloneItem(removed);
  }

  async clearSession(): Promise<void> {
    clearPersistedAgentSession(this.sessionId, this.storageKey);
  }
}

export class InMemorySessionStore implements QalamSessionStore {
  private readonly sessions = new Map<string, Session>();

  getSession(sessionId: string): Session {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const memory = {
      id: sessionId,
      items: [] as AgentInputItem[],
    };
    const session: Session = {
      getSessionId: async () => memory.id,
      getItems: async (limit?: number) => trimSessionItems(memory.items, limit),
      addItems: async (items: AgentInputItem[]) => {
        memory.items = [...memory.items, ...items.map(cloneItem)];
      },
      popItem: async () => memory.items.pop(),
      clearSession: async () => {
        memory.items = [];
      },
    };
    this.sessions.set(sessionId, session);
    return session;
  }
}

export class LocalStorageSessionStore implements QalamSessionStore {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly storageKey = DEFAULT_AGENT_SESSION_STORAGE_KEY) {}

  getSession(sessionId: string): Session {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const session = new LocalStorageAgentSession(sessionId, this.storageKey);
    this.sessions.set(sessionId, session);
    return session;
  }
}
