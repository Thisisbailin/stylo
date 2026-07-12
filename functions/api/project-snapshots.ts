import { getUserId, jsonResponse } from "./_auth";
import { getSyncRolloutInfo, RolloutEnv } from "./rollout";

type Env = {
  DB: any;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
} & RolloutEnv;

const NO_STORE_HEADERS = { "cache-control": "no-store" } as const;

const snapshotsJsonResponse = (body: unknown, init: ResponseInit = {}) => {
  const suppliedHeaders = Object.fromEntries(new Headers(init.headers).entries());
  return jsonResponse(body, {
    ...init,
    headers: { ...suppliedHeaders, ...NO_STORE_HEADERS },
  });
};

const withNoStore = (response: Response) => {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  try {
    const userId = await getUserId(context.request, context.env);
    const rollout = getSyncRolloutInfo(userId, context.env);
    if (!rollout.enabled) {
      return snapshotsJsonResponse(
        { error: "Sync disabled for this account", rollout: { percent: rollout.percent } },
        { status: 403 }
      );
    }
    const [rows, currentMeta] = await Promise.all([
      context.env.DB.prepare(
        "SELECT version, created_at FROM user_project_snapshots WHERE user_id = ?1 ORDER BY version DESC LIMIT 20"
      )
        .bind(userId)
        .all(),
      context.env.DB.prepare(
        "SELECT updated_at FROM user_project_meta WHERE user_id = ?1"
      )
        .bind(userId)
        .first(),
    ]);

    const snapshots = (rows?.results || []).map((row: any) => ({
      version: row.version,
      createdAt: row.created_at
    }));

    const parsedCurrentVersion =
      typeof currentMeta?.updated_at === "number"
        ? currentMeta.updated_at
        : Number(currentMeta?.updated_at || 0);
    const currentVersion = Number.isFinite(parsedCurrentVersion) ? parsedCurrentVersion : 0;
    return snapshotsJsonResponse({ snapshots, currentVersion });
  } catch (err: any) {
    if (err instanceof Response) return withNoStore(err);
    console.error("GET /api/project-snapshots error", err);
    return snapshotsJsonResponse({ error: "Failed to load snapshots" }, { status: 500 });
  }
};
