import { getUserId, jsonResponse } from "./_auth";

type Env = {
  DB: any;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
};

const safeParseJson = <T,>(value: unknown, fallback: T): T => {
  try {
    if (typeof value !== "string") return fallback;
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const summarizeMessagePreview = (messages: any[]) => {
  const last = [...messages].reverse().find((message) => typeof message?.text === "string" && message.text.trim());
  if (!last?.text) return "";
  const text = String(last.text).trim();
  return text.length > 140 ? `${text.slice(0, 140)}...` : text;
};

const toSessionSummary = (row: any) => {
  const messages = safeParseJson<any[]>(row?.messages, []);
  return {
    sessionKey: String(row?.session_key || ""),
    sessionId: String(row?.session_id || ""),
    updatedAt: Number(row?.updated_at || 0),
    itemCount: Array.isArray(safeParseJson<any[]>(row?.items, [])) ? safeParseJson<any[]>(row?.items, []).length : 0,
    messageCount: messages.length,
    preview: summarizeMessagePreview(messages),
  };
};

const toTraceSummary = (row: any) => ({
  traceId: String(row?.trace_id || ""),
  sessionId: String(row?.session_id || ""),
  provider: String(row?.provider || ""),
  model: String(row?.model || ""),
  workflowName: String(row?.workflow_name || ""),
  groupId: row?.group_id ? String(row.group_id) : null,
  updatedAt: Number(row?.updated_at || 0),
  metadata: safeParseJson<Record<string, string>>(row?.metadata, {}),
  trace: safeParseJson<Record<string, unknown>>(row?.trace_json, {}),
});

const toSpanRecord = (row: any) => ({
  spanId: String(row?.span_id || ""),
  parentId: row?.parent_id ? String(row.parent_id) : null,
  spanType: String(row?.span_type || "unknown"),
  spanName: row?.span_name ? String(row.span_name) : "",
  startedAt: row?.started_at ? String(row.started_at) : null,
  endedAt: row?.ended_at ? String(row.ended_at) : null,
  error: row?.error ? String(row.error) : null,
  span: safeParseJson<Record<string, unknown>>(row?.span_json, {}),
});

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  try {
    const userId = await getUserId(context.request, context.env);
    const url = new URL(context.request.url);
    const sessionId = (url.searchParams.get("sessionId") || "").trim();
    const traceId = (url.searchParams.get("traceId") || "").trim();

    const sessionRows = await context.env.DB.prepare(
      "SELECT session_key, session_id, items, messages, updated_at FROM agent_sessions WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT 30"
    )
      .bind(userId)
      .all();
    const sessions = ((sessionRows.results || []) as any[]).map(toSessionSummary);

    const traceRows = await context.env.DB.prepare(
      "SELECT trace_id, session_id, provider, model, workflow_name, group_id, metadata, trace_json, updated_at FROM agent_traces WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT 40"
    )
      .bind(userId)
      .all();
    const traces = ((traceRows.results || []) as any[]).map(toTraceSummary);

    let selectedSession: any = null;
    if (sessionId) {
      const row = await context.env.DB.prepare(
        "SELECT session_key, session_id, items, messages, updated_at FROM agent_sessions WHERE user_id = ?1 AND session_id = ?2 LIMIT 1"
      )
        .bind(userId, sessionId)
        .first();
      if (row) {
        selectedSession = {
          sessionKey: String(row.session_key || ""),
          sessionId: String(row.session_id || ""),
          updatedAt: Number(row.updated_at || 0),
          items: safeParseJson<any[]>(row.items, []),
          messages: safeParseJson<any[]>(row.messages, []),
        };
      }
    }

    const resolvedTraceId =
      traceId ||
      traces.find((item) => item.sessionId === sessionId)?.traceId ||
      traces[0]?.traceId ||
      "";

    let selectedTrace: any = null;
    if (resolvedTraceId) {
      const traceRow = await context.env.DB.prepare(
        "SELECT trace_id, session_id, provider, model, workflow_name, group_id, metadata, trace_json, updated_at FROM agent_traces WHERE user_id = ?1 AND trace_id = ?2 LIMIT 1"
      )
        .bind(userId, resolvedTraceId)
        .first();
      if (traceRow) {
        const spanRows = await context.env.DB.prepare(
          "SELECT span_id, parent_id, span_type, span_name, started_at, ended_at, error, span_json, created_at FROM agent_spans WHERE trace_id = ?1 ORDER BY started_at ASC, created_at ASC LIMIT 400"
        )
          .bind(resolvedTraceId)
          .all();
        selectedTrace = {
          ...toTraceSummary(traceRow),
          spans: ((spanRows.results || []) as any[]).map(toSpanRecord),
        };
      }
    }

    return jsonResponse({
      sessions,
      traces,
      selectedSession,
      selectedTrace,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("GET /api/agent-observability error", err);
    return jsonResponse({ error: "Failed to load agent observability" }, { status: 500 });
  }
};
