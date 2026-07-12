import { getUserId, jsonResponse } from "./_auth";

type Env = {
  DB: any;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
};

async function ensureTable(env: Env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_profile (user_id TEXT PRIMARY KEY, avatar_url TEXT)"
  ).run();
}

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  try {
    const userId = await getUserId(context.request, context.env);
    await ensureTable(context.env);

    const row = await context.env.DB.prepare(
      "SELECT avatar_url FROM user_profile WHERE user_id = ?1"
    )
      .bind(userId)
      .first();

    return jsonResponse({ avatarUrl: row?.avatar_url || null });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("GET /api/profile error", err);
    return jsonResponse({ error: "Failed to load profile" }, { status: 500 });
  }
};

export const onRequestPut = async (context: { request: Request; env: Env }) => {
  try {
    const userId = await getUserId(context.request, context.env);
    await ensureTable(context.env);

    const body = await context.request.json();
    const avatarUrl = (body && typeof body === "object" && "avatarUrl" in body) ? (body as any).avatarUrl : null;

    await context.env.DB.prepare(
      "INSERT INTO user_profile (user_id, avatar_url) VALUES (?1, ?2) ON CONFLICT(user_id) DO UPDATE SET avatar_url=?2"
    )
      .bind(userId, avatarUrl)
      .run();

    return jsonResponse({ ok: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("PUT /api/profile error", err);
    return jsonResponse({ error: "Failed to save profile" }, { status: 500 });
  }
};
