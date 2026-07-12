import { getUserId, jsonResponse } from "./_auth";
import { ensureAuditTable } from "./audit";
import { getSyncRolloutInfo, RolloutEnv } from "./rollout";

type Env = {
  DB: any;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
} & RolloutEnv;

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  try {
    const userId = await getUserId(context.request, context.env);
    const rollout = getSyncRolloutInfo(userId, context.env);
    if (!rollout.enabled) {
      return jsonResponse({ error: "Sync disabled for this account", rollout: { percent: rollout.percent } }, { status: 403 });
    }
    await ensureAuditTable(context.env);

    const rows = await context.env.DB.prepare(
      "SELECT id, action, status, detail, created_at FROM user_sync_audit WHERE user_id = ?1 ORDER BY id DESC LIMIT 50"
    )
      .bind(userId)
      .all();

    const entries = (rows?.results || []).map((row: any) => {
      let detail: any = {};
      try {
        detail = JSON.parse(row.detail as string);
      } catch {
        detail = {};
      }
      return {
        id: row.id,
        action: row.action,
        status: row.status,
        createdAt: row.created_at,
        detail
      };
    });

    return jsonResponse({ entries });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("GET /api/sync-audit error", err);
    return jsonResponse({ error: "Failed to load audit logs" }, { status: 500 });
  }
};
