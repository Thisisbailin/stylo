import { createClient } from "@supabase/supabase-js";
import { getUserId, jsonResponse } from "./_auth";
import { readJsonRequest } from "./_request";
import { requireRequestProjectId } from "./_projectScope";

type Env = {
  DB: any;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  PROJECT_REALTIME?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
};

const STORAGE_BUCKETS = ["assets", "public-assets"] as const;
const STORAGE_LIST_LIMIT = 100;
const getSupabaseAdmin = (env: Env) => {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRole = env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRole) return null;
  return createClient(supabaseUrl, serviceRole);
};

type ResetPlan = { table: string; sql: string; requires?: string; projectScoped?: boolean };

const PROJECT_RESET_PLANS: ResetPlan[] = [
  { table: "agent_spans", sql: "DELETE FROM agent_spans WHERE user_id = ?1", projectScoped: true },
  { table: "agent_traces", sql: "DELETE FROM agent_traces WHERE user_id = ?1", projectScoped: true },
  { table: "agent_sessions", sql: "DELETE FROM agent_sessions WHERE user_id = ?1", projectScoped: true },
  { table: "user_project_flow_nodes", sql: "DELETE FROM user_project_flow_nodes WHERE user_id = ?1", projectScoped: true },
  { table: "user_seedance_assets", sql: "DELETE FROM user_seedance_assets WHERE user_id = ?1", projectScoped: true },
  { table: "user_project_scenes", sql: "DELETE FROM user_project_scenes WHERE user_id = ?1", projectScoped: true },
  { table: "user_project_episodes", sql: "DELETE FROM user_project_episodes WHERE user_id = ?1", projectScoped: true },
  { table: "user_project_snapshots", sql: "DELETE FROM user_project_snapshots WHERE user_id = ?1", projectScoped: true },
  { table: "user_project_characters", sql: "DELETE FROM user_project_characters WHERE user_id = ?1", projectScoped: true },
  { table: "user_project_locations", sql: "DELETE FROM user_project_locations WHERE user_id = ?1", projectScoped: true },
  { table: "user_project_flow_projects", sql: "DELETE FROM user_project_flow_projects WHERE user_id = ?1", projectScoped: true },
  { table: "user_project_write_guards", sql: "DELETE FROM user_project_write_guards WHERE user_id = ?1", projectScoped: true },
  { table: "user_projects", sql: "DELETE FROM user_projects WHERE user_id = ?1" },
  { table: "user_project_changes", sql: "DELETE FROM user_project_changes WHERE user_id = ?1" },
  { table: "user_project_updates", sql: "DELETE FROM user_project_updates WHERE user_id = ?1", projectScoped: true },
  { table: "user_project_documents", sql: "DELETE FROM user_project_documents WHERE user_id = ?1", projectScoped: true },
  { table: "user_project_meta", sql: "DELETE FROM user_project_meta WHERE user_id = ?1", projectScoped: true },
  { table: "user_sync_audit", sql: "DELETE FROM user_sync_audit WHERE user_id = ?1" },
];

const ACCOUNT_RESET_PLANS: ResetPlan[] = [
  { table: "user_profile", sql: "DELETE FROM user_profile WHERE user_id = ?1" },
  { table: "user_secrets", sql: "DELETE FROM user_secrets WHERE user_id = ?1" },
];

export const resetD1UserData = async (
  env: Env,
  userId: string,
  includeAccountSettings: boolean,
  projectId?: string,
) => {
  const tableRows = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
  ).all();
  const existingTables = new Set<string>(
    (tableRows?.results || [])
      .map((row: { name?: unknown }) => typeof row.name === "string" ? row.name : "")
      .filter(Boolean)
  );
  const plans = [
    ...PROJECT_RESET_PLANS,
    ...(includeAccountSettings ? ACCOUNT_RESET_PLANS : []),
  ].filter((plan) =>
    existingTables.has(plan.table) &&
    (!plan.requires || existingTables.has(plan.requires)) &&
    (includeAccountSettings || plan.projectScoped)
  );
  if (!plans.length) return {};

  const results = await env.DB.batch(
    plans.map((plan) => plan.projectScoped && !includeAccountSettings
      ? env.DB.prepare(`${plan.sql} AND project_id = ?2`).bind(userId, projectId)
      : env.DB.prepare(plan.sql).bind(userId)),
  );
  return Object.fromEntries(
    plans.map((plan, index) => [plan.table, Number(results?.[index]?.meta?.changes || 0)])
  );
};

const collectStoragePaths = async (
  supabase: any,
  bucket: string,
  prefix: string
): Promise<string[]> => {
  const paths: string[] = [];
  const walk = async (folder: string) => {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(folder, { limit: STORAGE_LIST_LIMIT, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw error;
      const items = data || [];
      for (const item of items) {
        const path = `${folder}/${item.name}`.replace(/^\/+/, "");
        const isFolder = item.id === null;
        if (isFolder) {
          await walk(path);
        } else {
          paths.push(path);
        }
      }
      if (items.length < STORAGE_LIST_LIMIT) break;
      offset += STORAGE_LIST_LIMIT;
    }
  };
  await walk(prefix.replace(/\/+$/, ""));
  return paths;
};

const removeStoragePaths = async (supabase: any, bucket: string, paths: string[]) => {
  let removed = 0;
  for (let index = 0; index < paths.length; index += STORAGE_LIST_LIMIT) {
    const batch = paths.slice(index, index + STORAGE_LIST_LIMIT);
    if (!batch.length) continue;
    const { data, error } = await supabase.storage.from(bucket).remove(batch);
    if (error) throw error;
    removed += Array.isArray(data) ? data.length : batch.length;
  }
  return removed;
};

const deleteStorageUserData = async (env: Env, userId: string, projectId?: string) => {
  const supabase = getSupabaseAdmin(env);
  if (!supabase) {
    return {
      skipped: true,
      reason: "Supabase admin env missing",
      buckets: {},
    };
  }

  const prefix = projectId
    ? `users/${userId}/projects/${projectId}`
    : `users/${userId}`;
  const buckets: Record<string, { prefixes: Record<string, { listed: number; removed: number }> }> = {};
  for (const bucket of STORAGE_BUCKETS) {
    const bucketResult: Record<string, { listed: number; removed: number }> = {};
    const paths = await collectStoragePaths(supabase, bucket, prefix);
    const removed = await removeStoragePaths(supabase, bucket, paths);
    bucketResult[prefix] = { listed: paths.length, removed };
    buckets[bucket] = { prefixes: bucketResult };
  }
  return {
    skipped: false,
    prefix,
    buckets,
  };
};

const parseResetOptions = async (request: Request) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get("intent") === "delete" ? "delete" as const : "reset" as const;
  if (request.method === "DELETE") return { scope: "project" as const, mode };
  const body = await readJsonRequest<{ scope?: unknown }>(request, 4 * 1024);
  return {
    scope: body?.scope === "all" ? ("all" as const) : ("project" as const),
    mode,
  };
};

const listResetProjectIds = async (
  env: Env,
  userId: string,
  requestedProjectId?: string,
) => {
  if (requestedProjectId) return [requestedProjectId];
  const rows = await env.DB.prepare(
    `SELECT project_id FROM user_project_documents WHERE user_id = ?1
     UNION
     SELECT project_id FROM user_project_meta WHERE user_id = ?1`,
  ).bind(userId).all();
  return (rows?.results || [])
    .map((row: { project_id?: unknown }) => typeof row.project_id === "string" ? row.project_id : "")
    .filter(Boolean);
};

const resetRealtimeRooms = async (
  env: Env,
  userId: string,
  projectIds: string[],
  mode: "reset" | "delete",
) => {
  if (!env.PROJECT_REALTIME) return;
  for (const projectId of projectIds) {
    const roomId = env.PROJECT_REALTIME.idFromName(`${userId}:${projectId}`);
    const response = await env.PROJECT_REALTIME.get(roomId).fetch(
      new Request("https://stylo.internal/reset", {
        method: "POST",
        headers: {
          "x-stylo-user-id": userId,
          "x-stylo-project-id": projectId,
          "x-stylo-reset-mode": mode,
        },
      }),
    );
    if (!response.ok) {
      throw new Error(`Realtime room reset failed for project ${projectId}`);
    }
  }
};

const handleReset = async (context: { request: Request; env: Env }) => {
  try {
    const userId = await getUserId(context.request, context.env);
    const { scope, mode } = await parseResetOptions(context.request);
    const includeAccountSettings = scope === "all";
    const projectId = includeAccountSettings ? undefined : requireRequestProjectId(context.request);
    const projectIds = await listResetProjectIds(context.env, userId, projectId);
    await resetRealtimeRooms(
      context.env,
      userId,
      projectIds,
      includeAccountSettings ? "delete" : mode,
    );
    const d1 = await resetD1UserData(context.env, userId, includeAccountSettings, projectId);
    let storage: Awaited<ReturnType<typeof deleteStorageUserData>> | {
      skipped: true;
      reason: string;
      buckets: Record<string, never>;
    };
    const warnings: string[] = [];
    try {
      storage = await deleteStorageUserData(
        context.env,
        userId,
        projectId,
      );
    } catch (error) {
      // D1 is the source of truth for project and Agent state. Object cleanup is
      // best-effort and must not turn an already committed reset into a false
      // failure response that causes the client to replay stale project writes.
      console.error("Account storage cleanup failed after D1 reset", error);
      warnings.push("Project state was reset, but some object storage cleanup must be retried.");
      storage = {
        skipped: true,
        reason: "Storage cleanup failed after project reset",
        buckets: {},
      };
    }
    return jsonResponse({
      ok: true,
      scope,
      d1,
      storage,
      ...(warnings.length ? { warnings } : {}),
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Account data reset failed", error);
    return jsonResponse({ error: "Failed to reset account data" }, { status: 500 });
  }
};

export const onRequestDelete = handleReset;
export const onRequestPost = handleReset;
