import { getUserId, jsonResponse } from "./_auth";
import { isStyloSessionInProject } from "../../agents/runtime/projectScope";
import { normalizeProjectId } from "./_projectScope";

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

const extractSkillReads = (messages: any[]) => {
  const reads = (Array.isArray(messages) ? messages : [])
    .filter(
      (message) =>
        message?.role === "tool" &&
        message?.toolName === "read_project_resource" &&
        message?.toolOutput?.resource_type === "skill_package"
    )
    .map((message) => {
      const output = message?.toolOutput && typeof message.toolOutput === "object" ? message.toolOutput : {};
      return {
        id: String((output as any)?.item_id || ""),
        title: String((output as any)?.title || (output as any)?.item_id || ""),
        version: String((output as any)?.version || ""),
        createdAt: Number(message?.createdAt || 0),
      };
    })
    .filter((item) => item.id);
  const deduped = new Map<string, { id: string; title: string; version: string; createdAt: number }>();
  reads.forEach((item) => {
    const key = `${item.id}:${item.version}`;
    const current = deduped.get(key);
    if (!current || item.createdAt > current.createdAt) {
      deduped.set(key, item);
    }
  });
  return Array.from(deduped.values()).sort((a, b) => b.createdAt - a.createdAt);
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
  spanCount: Number(row?.span_count || 0),
  errorCount: Number(row?.error_count || 0),
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
    const projectId = normalizeProjectId(url.searchParams.get("projectId"));
    const sessionId = (url.searchParams.get("sessionId") || "").trim();
    const traceId = (url.searchParams.get("traceId") || "").trim();
    if (!projectId) {
      return jsonResponse({ error: "Missing projectId" }, { status: 400 });
    }
    if (sessionId && !isStyloSessionInProject(sessionId, projectId)) {
      return jsonResponse({ error: "Session does not belong to this project" }, { status: 409 });
    }
    const sessionRows = await context.env.DB.prepare(
      "SELECT session_key, session_id, items, messages, updated_at FROM agent_sessions WHERE user_id = ?1 AND project_id = ?2 ORDER BY updated_at DESC LIMIT 30"
    )
      .bind(userId, projectId)
      .all();
    const sessions = ((sessionRows.results || []) as any[]).map(toSessionSummary);

    const traceRows = await context.env.DB.prepare(
      `SELECT
        t.trace_id,
        t.session_id,
        t.provider,
        t.model,
        t.workflow_name,
        t.group_id,
        t.metadata,
        t.trace_json,
        t.updated_at,
        COALESCE(s.span_count, 0) AS span_count,
        COALESCE(s.error_count, 0) AS error_count
      FROM agent_traces t
      LEFT JOIN (
        SELECT
          trace_id,
          COUNT(*) AS span_count,
          SUM(CASE WHEN error IS NOT NULL AND error != '' THEN 1 ELSE 0 END) AS error_count
        FROM agent_spans
        GROUP BY trace_id
      ) s ON s.trace_id = t.trace_id
      WHERE t.user_id = ?1 AND t.project_id = ?2
      ORDER BY t.updated_at DESC
      LIMIT 40`
    )
      .bind(userId, projectId)
      .all();
    const traces = ((traceRows.results || []) as any[]).map(toTraceSummary);

    let selectedSession: any = null;
    if (sessionId) {
      const row = await context.env.DB.prepare(
        "SELECT session_key, session_id, items, messages, updated_at FROM agent_sessions WHERE user_id = ?1 AND project_id = ?2 AND session_id = ?3 LIMIT 1"
      )
        .bind(userId, projectId, sessionId)
        .first();
      if (row) {
        const messages = safeParseJson<any[]>(row.messages, []);
        selectedSession = {
          sessionKey: String(row.session_key || ""),
          sessionId: String(row.session_id || ""),
          updatedAt: Number(row.updated_at || 0),
          items: safeParseJson<any[]>(row.items, []),
          messages,
          skillReads: extractSkillReads(messages),
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
        `SELECT
          t.trace_id,
          t.session_id,
          t.provider,
          t.model,
          t.workflow_name,
          t.group_id,
          t.metadata,
          t.trace_json,
          t.updated_at,
          COALESCE(s.span_count, 0) AS span_count,
          COALESCE(s.error_count, 0) AS error_count
        FROM agent_traces t
        LEFT JOIN (
          SELECT
            trace_id,
            COUNT(*) AS span_count,
            SUM(CASE WHEN error IS NOT NULL AND error != '' THEN 1 ELSE 0 END) AS error_count
          FROM agent_spans
          GROUP BY trace_id
        ) s ON s.trace_id = t.trace_id
        WHERE t.user_id = ?1 AND t.project_id = ?2 AND t.trace_id = ?3
        LIMIT 1`
      )
        .bind(userId, projectId, resolvedTraceId)
        .first();
      if (traceRow) {
        const spanRows = await context.env.DB.prepare(
          "SELECT span_id, parent_id, span_type, span_name, started_at, ended_at, error, span_json, created_at FROM agent_spans WHERE user_id = ?1 AND project_id = ?2 AND trace_id = ?3 ORDER BY started_at ASC, created_at ASC LIMIT 400"
        )
          .bind(userId, projectId, resolvedTraceId)
          .all();
        const traceSessionId = String(traceRow.session_id || "");
        let traceMessages: any[] = [];
        if (traceSessionId) {
          const sessionRow = await context.env.DB.prepare(
            "SELECT messages FROM agent_sessions WHERE user_id = ?1 AND project_id = ?2 AND session_id = ?3 LIMIT 1"
          )
            .bind(userId, projectId, traceSessionId)
            .first();
          traceMessages = safeParseJson<any[]>(sessionRow?.messages, []);
        }
        selectedTrace = {
          ...toTraceSummary(traceRow),
          spans: ((spanRows.results || []) as any[]).map(toSpanRecord),
          skillReads: extractSkillReads(traceMessages),
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
