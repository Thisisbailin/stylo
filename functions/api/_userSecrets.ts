export type UserSecretsPayload = {
  textApiKey?: string;
  multiApiKey?: string;
  videoApiKey?: string;
};

type EnvWithDb = {
  DB: any;
};

export const ensureUserSecretsTable = async (env: EnvWithDb) => {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_secrets (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)"
  ).run();
};

export const unwrapStoredSecrets = (stored: any): { secrets: UserSecretsPayload; meta: { lastOpId?: string } } => {
  if (stored && typeof stored === "object" && "secrets" in stored) {
    return { secrets: (stored as any).secrets || {}, meta: (stored as any).meta || {} };
  }
  return { secrets: (stored || {}) as UserSecretsPayload, meta: {} };
};

export const readUserSecrets = async (env: EnvWithDb, userId: string) => {
  await ensureUserSecretsTable(env);
  const row = await env.DB.prepare("SELECT data, updated_at FROM user_secrets WHERE user_id = ?1").bind(userId).first();
  if (!row) {
    return { secrets: {} as UserSecretsPayload, updatedAt: 0 };
  }
  const parsed = JSON.parse(row.data as string);
  const { secrets } = unwrapStoredSecrets(parsed);
  return {
    secrets,
    updatedAt: typeof row.updated_at === "number" ? row.updated_at : Number(row.updated_at || 0),
  };
};

export const writeUserSecrets = async (
  env: EnvWithDb,
  userId: string,
  secrets: UserSecretsPayload,
  meta?: { lastOpId?: string }
) => {
  await ensureUserSecretsTable(env);
  const updatedAt = Date.now();
  const payload = {
    secrets,
    meta: meta || {},
  };
  await env.DB.prepare(
    "INSERT INTO user_secrets (user_id, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET data=?2, updated_at=?3"
  )
    .bind(userId, JSON.stringify(payload), updatedAt)
    .run();
  return updatedAt;
};
