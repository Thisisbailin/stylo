import { getUserId, jsonResponse } from "./_auth";
import { normalizeUsername } from "./_publicAccess";
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
      `SELECT avatar_url, username, display_name, bio, account_visibility,
              searchable, created_at, updated_at
       FROM user_profile WHERE user_id = ?1`
    )
      .bind(userId)
      .first();

    return jsonResponse({
      avatarUrl: row?.avatar_url || null,
      username: row?.username || null,
      displayName: row?.display_name || null,
      bio: row?.bio || "",
      accountVisibility: row?.account_visibility === "public" ? "public" : "private",
      searchable: row ? row.searchable !== 0 : true,
      createdAt: Number(row?.created_at) || 0,
      updatedAt: Number(row?.updated_at) || 0,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("GET /api/profile error", err);
    return jsonResponse({ error: "Failed to load profile" }, { status: 500 });
  }
};

export const onRequestPut = async (context: { request: Request; env: Env }) => {
  try {
    const userId = await getUserId(context.request, context.env);
    const body = await readJsonRequest<{
      avatarUrl?: unknown;
      username?: unknown;
      displayName?: unknown;
      bio?: unknown;
      searchable?: unknown;
    }>(context.request, 16 * 1024);
    const current = await context.env.DB.prepare(
      `SELECT avatar_url, username, normalized_username, display_name, bio, searchable
       FROM user_profile WHERE user_id = ?1`,
    ).bind(userId).first();
    let avatarUrl: string | null = current?.avatar_url || null;
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
    } else if (body.avatarUrl === null || body.avatarUrl === "") avatarUrl = null;

    let username = current?.username || null;
    let normalizedUsername = current?.normalized_username || null;
    if (body.username !== undefined) {
      normalizedUsername = normalizeUsername(body.username);
      if (!normalizedUsername) {
        return jsonResponse({ error: "Username must be 3-30 lowercase letters, numbers, dots, dashes or underscores" }, { status: 400 });
      }
      username = normalizedUsername;
    }
    if (
      body.displayName !== undefined
      && (typeof body.displayName !== "string" || body.displayName.trim().length > 80)
    ) {
      return jsonResponse({ error: "Invalid displayName" }, { status: 400 });
    }
    const displayName = body.displayName === undefined
      ? current?.display_name || null
      : body.displayName.trim() || null;
    const bio = body.bio === undefined
      ? String(current?.bio || "")
      : typeof body.bio === "string" && body.bio.length <= 320
        ? body.bio.trim()
        : null;
    if (bio === null) return jsonResponse({ error: "Invalid bio" }, { status: 400 });
    if (body.searchable !== undefined && typeof body.searchable !== "boolean") {
      return jsonResponse({ error: "Invalid searchable value" }, { status: 400 });
    }
    const searchable = body.searchable === undefined ? current?.searchable !== 0 : body.searchable;
    const now = Date.now();

    try {
      await context.env.DB.prepare(
        `INSERT INTO user_profile
           (user_id, avatar_url, username, normalized_username, display_name, bio,
            account_visibility, searchable, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'private', ?7, ?8, ?8)
         ON CONFLICT(user_id) DO UPDATE SET
           avatar_url = excluded.avatar_url,
           username = excluded.username,
           normalized_username = excluded.normalized_username,
           display_name = excluded.display_name,
           bio = excluded.bio,
           searchable = excluded.searchable,
           updated_at = excluded.updated_at`,
      ).bind(userId, avatarUrl, username, normalizedUsername, displayName, bio, searchable ? 1 : 0, now).run();
    } catch (error: any) {
      if (String(error?.message || error).toLowerCase().includes("unique")) {
        return jsonResponse({ error: "Username is already in use", code: "USERNAME_TAKEN" }, { status: 409 });
      }
      throw error;
    }

    return jsonResponse({ ok: true, username, displayName, bio, searchable });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("PUT /api/profile error", err);
    return jsonResponse({ error: "Failed to save profile" }, { status: 500 });
  }
};
