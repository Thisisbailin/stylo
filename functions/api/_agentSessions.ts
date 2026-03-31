import type { AgentInputItem, Session } from "@openai/agents";
import { getUserId } from "./_auth";
import type { AgentSessionMessage } from "../../agents/runtime/types";

type EnvWithDb = {
  DB: any;
  CLERK_SECRET_KEY?: string;
  CLERK_JWT_KEY?: string;
};

type PersistedAgentSessionRecord = {
  items: AgentInputItem[];
  messages: AgentSessionMessage[];
  updatedAt: number;
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
    return clipText(output, 1200);
  }
  return clipText(output, 1200);
};

const compactContentParts = (content: unknown) => {
  if (!Array.isArray(content)) return content;
  return content.map((part) => {
    if (!part || typeof part !== "object") return part;
    const cloned = { ...(part as any) };
    if (typeof cloned.text === "string") cloned.text = clipText(cloned.text, 2400);
    if (typeof cloned.transcript === "string") cloned.transcript = clipText(cloned.transcript, 2400);
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

const compactAgentItems = (items: AgentInputItem[], maxItems = 48) =>
  items.map(compactAgentItem).slice(-maxItems);

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

const normalizeRecord = (row: any): PersistedAgentSessionRecord => {
  let items: AgentInputItem[] = [];
  let messages: AgentSessionMessage[] = [];
  try {
    const parsedItems = JSON.parse(String(row?.items || "[]"));
    if (Array.isArray(parsedItems)) items = parsedItems.filter((item) => item && typeof item === "object").map(cloneItem);
  } catch {}
  try {
    const parsedMessages = JSON.parse(String(row?.messages || "[]"));
    if (Array.isArray(parsedMessages)) {
      messages = parsedMessages.map(normalizeSessionMessage).filter(Boolean) as AgentSessionMessage[];
    }
  } catch {}
  const updatedAt = typeof row?.updated_at === "number" ? row.updated_at : Number(row?.updated_at || Date.now());
  return { items, messages, updatedAt };
};

export const ensureAgentSessionsTable = async (env: EnvWithDb) => {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS agent_sessions (session_key TEXT PRIMARY KEY, session_id TEXT NOT NULL, user_id TEXT, items TEXT NOT NULL, messages TEXT NOT NULL, updated_at INTEGER NOT NULL)"
  ).run();
  const info = await env.DB.prepare("PRAGMA table_info(agent_sessions)").all();
  const columns = new Set(((info.results || []) as Array<{ name?: string }>).map((row) => row.name || ""));
  if (!columns.has("user_id")) {
    await env.DB.prepare("ALTER TABLE agent_sessions ADD COLUMN user_id TEXT").run();
  }
};

const readAgentSessionRecord = async (env: EnvWithDb, sessionKey: string): Promise<PersistedAgentSessionRecord> => {
  await ensureAgentSessionsTable(env);
  const row = await env.DB.prepare(
    "SELECT items, messages, updated_at FROM agent_sessions WHERE session_key = ?1"
  ).bind(sessionKey).first();
  if (!row) return { items: [], messages: [], updatedAt: 0 };
  return normalizeRecord(row);
};

const writeAgentSessionRecord = async (
  env: EnvWithDb,
  sessionKey: string,
  sessionId: string,
  userId: string | null,
  record: PersistedAgentSessionRecord
) => {
  await ensureAgentSessionsTable(env);
  await env.DB.prepare(
    "INSERT INTO agent_sessions (session_key, session_id, user_id, items, messages, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(session_key) DO UPDATE SET items = ?4, messages = ?5, updated_at = ?6, user_id = ?3, session_id = ?2"
  )
    .bind(
      sessionKey,
      sessionId,
      userId,
      JSON.stringify(record.items),
      JSON.stringify(record.messages),
      record.updatedAt
    )
    .run();
};

export const resolveAgentSessionOwner = async (request: Request, env: EnvWithDb) => {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.trim()) return null;
  return await getUserId(request, env as Required<Pick<EnvWithDb, "CLERK_SECRET_KEY">> & EnvWithDb);
};

export const createAgentSessionKey = (sessionId: string, userId?: string | null) =>
  userId ? `user:${userId}:${sessionId}` : `anon:${sessionId}`;

export class D1EdgeSession implements Session {
  constructor(
    private readonly env: EnvWithDb,
    private readonly sessionId: string,
    private readonly sessionKey: string,
    private readonly userId: string | null
  ) {}

  async getSessionId(): Promise<string> {
    return this.sessionId;
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    const record = await readAgentSessionRecord(this.env, this.sessionKey);
    return trimSessionItems(record.items, limit);
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    if (!items.length) return;
    const existing = await readAgentSessionRecord(this.env, this.sessionKey);
    const merged = [...existing.items, ...items.map(cloneItem)];
    const timestampBase = Date.now();
    const projectedMessages = projectAgentItemsToSessionMessages(items.map(cloneItem), timestampBase);
    await writeAgentSessionRecord(this.env, this.sessionKey, this.sessionId, this.userId, {
      items: compactAgentItems(merged),
      messages: [...existing.messages, ...projectedMessages].slice(-240),
      updatedAt: timestampBase,
    });
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    const existing = await readAgentSessionRecord(this.env, this.sessionKey);
    if (!existing.items.length) return undefined;
    const nextItems = existing.items.slice(0, -1);
    const removed = existing.items[existing.items.length - 1];
    const timestampBase = Date.now();
    await writeAgentSessionRecord(this.env, this.sessionKey, this.sessionId, this.userId, {
      items: nextItems,
      messages: projectAgentItemsToSessionMessages(nextItems, timestampBase).slice(-240),
      updatedAt: timestampBase,
    });
    return cloneItem(removed);
  }

  async clearSession(): Promise<void> {
    await ensureAgentSessionsTable(this.env);
    await this.env.DB.prepare("DELETE FROM agent_sessions WHERE session_key = ?1").bind(this.sessionKey).run();
  }
}

export const readD1SessionMessages = async (env: EnvWithDb, sessionKey: string) => {
  const record = await readAgentSessionRecord(env, sessionKey);
  return record.messages;
};
