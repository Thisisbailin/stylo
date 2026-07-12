type Env = {
  DB: any;
};

const SNAPSHOT_LOG_LIMIT = 50;

export const logAudit = async (
  env: Env,
  userId: string,
  action: string,
  status: string,
  detail: Record<string, unknown> = {}
) => {
  try {
    const payload = JSON.stringify(detail);
    const createdAt = Date.now();
    await env.DB.prepare(
      "INSERT INTO user_sync_audit (user_id, action, status, detail, created_at) VALUES (?1, ?2, ?3, ?4, ?5)"
    )
      .bind(userId, action, status, payload, createdAt)
      .run();

    await env.DB.prepare(
      "DELETE FROM user_sync_audit WHERE user_id = ?1 AND id NOT IN (SELECT id FROM user_sync_audit WHERE user_id = ?1 ORDER BY id DESC LIMIT ?2)"
    )
      .bind(userId, SNAPSHOT_LOG_LIMIT)
      .run();
  } catch (err) {
    console.warn("audit log error", err);
  }
};
