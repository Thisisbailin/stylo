import type { AgentInputItem, Session, SessionInputCallback } from "@openai/agents";
import type { AgentSessionMessage } from "./types";
import { trimSessionItemsSafely } from "./sessionRepair";
import {
  AGENT_SESSION_LIMITS,
  compactAgentSessionItems,
  projectAgentItemsToSessionMessages,
} from "./sessionProjection";

type EdgeSessionRecord = {
  id: string;
  items: AgentInputItem[];
  messages: AgentSessionMessage[];
  updatedAt: number;
};

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
  return trimSessionItemsSafely(items, limit);
};

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
      items: compactAgentSessionItems(merged),
      messages: [...(existing?.messages || []), ...projectedMessages].slice(-AGENT_SESSION_LIMITS.storedMessages),
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
      messages: projectAgentItemsToSessionMessages(next, timestampBase).slice(-AGENT_SESSION_LIMITS.storedMessages),
      updatedAt: timestampBase,
    });
    return cloneItem(removed);
  }

  async clearSession(): Promise<void> {
    getEdgeSessionMap().delete(this.sessionId);
  }
}

export const createEdgeSessionInputCallback =
  (historyWindow = AGENT_SESSION_LIMITS.historyWindow): SessionInputCallback =>
  async (historyItems, newItems) => {
    const trimmedHistory = compactAgentSessionItems(historyItems, { maxItems: historyWindow });
    return [...trimmedHistory, ...newItems];
  };

export const readEdgeSessionMessages = (sessionId: string): AgentSessionMessage[] =>
  getEdgeSessionMap().get(sessionId)?.messages || [];
