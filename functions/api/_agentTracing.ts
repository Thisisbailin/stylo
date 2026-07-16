import { addTraceProcessor, getGlobalTraceProvider, type Span, type Trace, type TracingProcessor } from "@openai/agents";

type EnvWithDb = {
  DB: any;
};

type BufferedTraceState = {
  trace?: Record<string, unknown> | null;
  spans: Map<string, Record<string, unknown>>;
  updatedAt: number;
};

type PersistTraceContext = {
  traceId: string;
  projectId: string;
  sessionId: string;
  sessionKey: string;
  userId: string | null;
  provider: string;
  model: string;
  workflowName: string;
  groupId?: string;
  metadata?: Record<string, string>;
  failure?: string | null;
};

const TRACE_BUFFER_SYMBOL = Symbol.for("stylo.agent.traceBuffer");
const TRACE_PROCESSOR_SYMBOL = Symbol.for("stylo.agent.traceProcessor");

const getTraceBuffer = () => {
  const holder = globalThis as typeof globalThis & {
    [TRACE_BUFFER_SYMBOL]?: Map<string, BufferedTraceState>;
  };
  if (!holder[TRACE_BUFFER_SYMBOL]) {
    holder[TRACE_BUFFER_SYMBOL] = new Map<string, BufferedTraceState>();
  }
  return holder[TRACE_BUFFER_SYMBOL]!;
};

const upsertBufferedTrace = (traceId: string, updater: (current: BufferedTraceState) => BufferedTraceState) => {
  const store = getTraceBuffer();
  const current = store.get(traceId) || { spans: new Map<string, Record<string, unknown>>(), updatedAt: Date.now() };
  store.set(traceId, updater(current));
};

class StyloBufferedTracingProcessor implements TracingProcessor {
  async onTraceStart(trace: Trace): Promise<void> {
    const snapshot = trace.toJSON();
    upsertBufferedTrace(trace.traceId, (current) => ({
      ...current,
      trace: snapshot && typeof snapshot === "object" ? (snapshot as Record<string, unknown>) : current.trace,
      updatedAt: Date.now(),
    }));
  }

  async onTraceEnd(trace: Trace): Promise<void> {
    const snapshot = trace.toJSON();
    upsertBufferedTrace(trace.traceId, (current) => ({
      ...current,
      trace: snapshot && typeof snapshot === "object" ? (snapshot as Record<string, unknown>) : current.trace,
      updatedAt: Date.now(),
    }));
  }

  async onSpanStart(_span: Span<any>): Promise<void> {}

  async onSpanEnd(span: Span<any>): Promise<void> {
    const snapshot = span.toJSON();
    if (!snapshot || typeof snapshot !== "object") return;
    upsertBufferedTrace(span.traceId, (current) => {
      const spans = new Map(current.spans);
      spans.set(span.spanId, snapshot as Record<string, unknown>);
      return {
        ...current,
        spans,
        updatedAt: Date.now(),
      };
    });
  }

  async shutdown(): Promise<void> {}

  async forceFlush(): Promise<void> {}
}

export const ensureStyloTraceProcessor = () => {
  const holder = globalThis as typeof globalThis & {
    [TRACE_PROCESSOR_SYMBOL]?: boolean;
  };
  if (holder[TRACE_PROCESSOR_SYMBOL]) return;
  addTraceProcessor(new StyloBufferedTracingProcessor());
  holder[TRACE_PROCESSOR_SYMBOL] = true;
};

const drainBufferedTrace = (traceId: string) => {
  const store = getTraceBuffer();
  const entry = store.get(traceId);
  if (!entry) return null;
  store.delete(traceId);
  return {
    trace: entry.trace || null,
    spans: Array.from(entry.spans.values()),
  };
};

export const forceFlushAgentTracing = async () => {
  await getGlobalTraceProvider().forceFlush();
};

export const persistBufferedTrace = async (env: EnvWithDb, context: PersistTraceContext) => {
  const buffered = drainBufferedTrace(context.traceId);
  if (!buffered && !context.failure) return false;

  const nowIso = new Date().toISOString();
  const bundle = buffered || {
    trace: {
      trace_id: context.traceId,
      name: context.workflowName,
      group_id: context.groupId || null,
      metadata: context.metadata || {},
      error: context.failure,
    },
    spans: [{
      id: `${context.traceId}-wrapper`,
      trace_id: context.traceId,
      parent_id: null,
      started_at: nowIso,
      ended_at: nowIso,
      error: context.failure,
      span_data: { type: "wrapper", name: "Agent wrapper" },
    }],
  };

  const now = Date.now();
  const traceJson = JSON.stringify(bundle.trace || {});
  const metadataJson = JSON.stringify(context.metadata || {});
  await env.DB.prepare(
    "INSERT INTO agent_traces (trace_id, session_key, session_id, user_id, project_id, provider, model, workflow_name, group_id, metadata, trace_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13) ON CONFLICT(trace_id) DO UPDATE SET session_key = excluded.session_key, session_id = excluded.session_id, user_id = excluded.user_id, project_id = excluded.project_id, provider = excluded.provider, model = excluded.model, workflow_name = excluded.workflow_name, group_id = excluded.group_id, metadata = excluded.metadata, trace_json = excluded.trace_json, updated_at = excluded.updated_at"
  )
    .bind(
      context.traceId,
      context.sessionKey,
      context.sessionId,
      context.userId,
      context.projectId,
      context.provider,
      context.model,
      context.workflowName,
      context.groupId || null,
      metadataJson,
      traceJson,
      now,
      now
    )
    .run();

  for (const span of bundle.spans) {
    const spanData = (span.span_data || {}) as Record<string, unknown>;
    const spanType = typeof spanData.type === "string" ? spanData.type : "unknown";
    const spanName =
      typeof spanData.name === "string"
        ? spanData.name
        : typeof spanType === "string"
          ? spanType
          : null;
    const errorText =
      span.error && typeof span.error === "object"
        ? JSON.stringify(span.error)
        : span.error
          ? String(span.error)
          : null;
    await env.DB.prepare(
      "INSERT INTO agent_spans (span_id, trace_id, user_id, project_id, parent_id, span_type, span_name, started_at, ended_at, error, span_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13) ON CONFLICT(span_id) DO UPDATE SET trace_id = excluded.trace_id, user_id = excluded.user_id, project_id = excluded.project_id, parent_id = excluded.parent_id, span_type = excluded.span_type, span_name = excluded.span_name, started_at = excluded.started_at, ended_at = excluded.ended_at, error = excluded.error, span_json = excluded.span_json, updated_at = excluded.updated_at"
    )
      .bind(
        span.id,
        context.traceId,
        context.userId,
        context.projectId,
        typeof span.parent_id === "string" ? span.parent_id : null,
        spanType,
        spanName,
        typeof span.started_at === "string" ? span.started_at : null,
        typeof span.ended_at === "string" ? span.ended_at : null,
        errorText,
        JSON.stringify(span),
        now,
        now
      )
      .run();
  }

  return true;
};
