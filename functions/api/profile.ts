import { getUserId, jsonResponse } from "./_auth";
import { readJsonRequest } from "./_request";

type Env = {
  DB: any;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
};

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  try {
    const userId = await getUserId(context.request, context.env);
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
    const body = await readJsonRequest<{ avatarUrl?: unknown }>(context.request, 16 * 1024);
    let avatarUrl: string | null = null;
    if (body.avatarUrl !== undefined && body.avatarUrl !== null && body.avatarUrl !== "") {
      if (typeof body.avatarUrl !== "string" || body.avatarUrl.length > 2_048) {
        return jsonResponse({ error: "Invalid avatarUrl" }, { status: 400 });
      }
      try {
        const parsed = new URL(body.avatarUrl);
        if (parsed.protocol !== "https:") throw new Error("unsupported protocol");
        avatarUrl = parsed.toString();
      } catch {
        return jsonResponse({ error: "avatarUrl must be an HTTPS URL" }, { status: 400 });
      }
    }

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
