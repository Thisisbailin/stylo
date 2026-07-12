import { createClient } from "@supabase/supabase-js";
import { getUserId, jsonResponse } from "./_auth";
import { readJsonRequest } from "./_request";

type Env = {
  DB: any;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
};

const STORAGE_BUCKETS = ["assets", "public-assets"] as const;
const STORAGE_LIST_LIMIT = 100;
const getSupabaseAdmin = (env: Env) => {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRole = env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRole) return null;
  return createClient(supabaseUrl, serviceRole);
};

const tableExists = async (env: Env, table: string) => {
  const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?1")
    .bind(table)
    .first();
  return !!row;
};

const deleteIfTableExists = async (env: Env, table: string, sql: string, ...bindings: unknown[]) => {
  if (!(await tableExists(env, table))) return 0;
  const result = await env.DB.prepare(sql).bind(...bindings).run();
  return Number(result?.meta?.changes || 0);
};

const resetD1UserData = async (env: Env, userId: string, includeAccountSettings: boolean) => {
  const changes: Record<string, number> = {};
  const add = (table: string, count: number) => {
    changes[table] = (changes[table] || 0) + count;
  };

  if (await tableExists(env, "agent_traces")) {
    add(
      "agent_spans",
      await deleteIfTableExists(
        env,
        "agent_spans",
        "DELETE FROM agent_spans WHERE trace_id IN (SELECT trace_id FROM agent_traces WHERE user_id = ?1)",
        userId
      )
    );
  }
  add("agent_traces", await deleteIfTableExists(env, "agent_traces", "DELETE FROM agent_traces WHERE user_id = ?1", userId));
  add("agent_sessions", await deleteIfTableExists(env, "agent_sessions", "DELETE FROM agent_sessions WHERE user_id = ?1", userId));

  const projectTables = [
    "user_project_flow_nodes",
    "user_project_flow_projects",
    "user_project_scenes",
    "user_project_episodes",
    "user_project_snapshots",
    "user_project_characters",
    "user_project_locations",
    "user_project_meta",
    "user_projects",
    "user_project_changes",
  ];
  for (const table of projectTables) {
    add(table, await deleteIfTableExists(env, table, `DELETE FROM ${table} WHERE user_id = ?1`, userId));
  }

  add("user_sync_audit", await deleteIfTableExists(env, "user_sync_audit", "DELETE FROM user_sync_audit WHERE user_id = ?1", userId));

  if (includeAccountSettings) {
    add("user_profile", await deleteIfTableExists(env, "user_profile", "DELETE FROM user_profile WHERE user_id = ?1", userId));
    add("user_secrets", await deleteIfTableExists(env, "user_secrets", "DELETE FROM user_secrets WHERE user_id = ?1", userId));
  }

  return changes;
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

const deleteStorageUserData = async (env: Env, userId: string) => {
  const supabase = getSupabaseAdmin(env);
  if (!supabase) {
    return {
      skipped: true,
      reason: "Supabase admin env missing",
      buckets: {},
    };
  }

  const prefix = `users/${userId}`;
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
  if (request.method === "DELETE") return { scope: "project" as const };
  const body = await readJsonRequest<{ scope?: unknown }>(request, 4 * 1024);
  return {
    scope: body?.scope === "all" ? ("all" as const) : ("project" as const),
  };
};

const handleReset = async (context: { request: Request; env: Env }) => {
  try {
    const userId = await getUserId(context.request, context.env);
    const { scope } = await parseResetOptions(context.request);
    const includeAccountSettings = scope === "all";
    const d1 = await resetD1UserData(context.env, userId, includeAccountSettings);
    const storage = await deleteStorageUserData(context.env, userId);
    return jsonResponse({
      ok: true,
      scope,
      d1,
      storage,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Account data reset failed", error);
    return jsonResponse({ error: "Failed to reset account data" }, { status: 500 });
  }
};

export const onRequestDelete = handleReset;
export const onRequestPost = handleReset;
