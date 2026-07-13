import type { AgentInputItem, Session } from "@openai/agents";
import type { AgentSessionMessage, StyloSessionRecord, StyloSessionStore } from "./types";
import { trimSessionItemsSafely } from "./sessionRepair";
import {
  AGENT_SESSION_LIMITS,
  compactAgentSessionItems,
  normalizeAgentSessionMessage,
  projectAgentItemsToSessionMessages,
} from "./sessionProjection";

export const DEFAULT_AGENT_SESSION_STORAGE_KEY = "stylo_agent_sessions_v1";
export const AGENT_SESSION_STORAGE_UPDATED_EVENT = "stylo:agent-session-storage-updated";

type PersistedAgentSessionRecord = {
  id: string;
  items: AgentInputItem[];
  messages: AgentSessionMessage[];
  updatedAt: number;
};

type AgentSessionStorage = Pick<Storage, "getItem" | "setItem">;

const cloneItem = <T,>(value: T): T => structuredClone(value);

const trimSessionItems = (items: AgentInputItem[], limit?: number) => {
  return trimSessionItemsSafely(items, limit);
};

const normalizePersistedRecord = (value: any): PersistedAgentSessionRecord | null => {
  if (!value || typeof value !== "object" || typeof value.id !== "string") return null;
  const updatedAt = typeof value.updatedAt === "number" ? value.updatedAt : Date.now();
  const items = Array.isArray(value.items)
    ? compactAgentSessionItems(value.items.filter((item: unknown) => item && typeof item === "object") as AgentInputItem[])
    : [];
  const messages = Array.isArray(value.messages)
    ? (value.messages.map(normalizeAgentSessionMessage).filter(Boolean) as AgentSessionMessage[])
        .slice(-AGENT_SESSION_LIMITS.storedMessages)
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

const readLocalStorageSessions = (
  storageKey: string,
  storage?: AgentSessionStorage
): Record<string, PersistedAgentSessionRecord> => {
  const target = storage || (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!target) return {};
  try {
    const raw = target.getItem(storageKey);
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

const writeLocalStorageSessions = (
  storageKey: string,
  records: Record<string, PersistedAgentSessionRecord>,
  storage?: AgentSessionStorage
) => {
  const target = storage || (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!target) return;
  target.setItem(storageKey, JSON.stringify(records));
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

const toSessionRecordView = (record: PersistedAgentSessionRecord): StyloSessionRecord => ({
  id: record.id,
  messages: record.messages,
  updatedAt: record.updatedAt,
});

export const listPersistedAgentSessions = (
  storageKey = DEFAULT_AGENT_SESSION_STORAGE_KEY
): StyloSessionRecord[] =>
  Object.values(readLocalStorageSessions(storageKey))
    .map(toSessionRecordView)
    .sort((a, b) => b.updatedAt - a.updatedAt);

export const readPersistedAgentSession = (
  sessionId: string,
  storageKey = DEFAULT_AGENT_SESSION_STORAGE_KEY
): StyloSessionRecord | null => {
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

export const clearPersistedAgentSessionsWhere = (
  predicate: (sessionId: string) => boolean,
  storageKey = DEFAULT_AGENT_SESSION_STORAGE_KEY,
  storage?: AgentSessionStorage
) => {
  const sessions = readLocalStorageSessions(storageKey, storage);
  const matchingIds = Object.keys(sessions).filter(predicate);
  if (!matchingIds.length) return 0;
  matchingIds.forEach((sessionId) => delete sessions[sessionId]);
  writeLocalStorageSessions(storageKey, sessions, storage);
  return matchingIds.length;
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
      items: compactAgentSessionItems([...existing.items, ...clonedItems]),
      messages: [...existing.messages, ...projectedMessages].slice(-AGENT_SESSION_LIMITS.storedMessages),
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
      messages: projectAgentItemsToSessionMessages(nextItems, timestampBase).slice(-AGENT_SESSION_LIMITS.storedMessages),
      updatedAt: timestampBase,
    };
    writeLocalStorageSessions(this.storageKey, sessions);
    return cloneItem(removed);
  }

  async clearSession(): Promise<void> {
    clearPersistedAgentSession(this.sessionId, this.storageKey);
  }
}

export class InMemorySessionStore implements StyloSessionStore {
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
        memory.items = compactAgentSessionItems([...memory.items, ...items.map(cloneItem)]);
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

export class LocalStorageSessionStore implements StyloSessionStore {
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
