import { getUserId, jsonResponse } from "./_auth";
import { publicProfileDto } from "./_publicAccess";

type Env = { DB: any; CLERK_SECRET_KEY: string; CLERK_JWT_KEY?: string };

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  try {
    await getUserId(context.request, context.env);
    const query = new URL(context.request.url).searchParams.get("q")?.trim().toLowerCase().slice(0, 80) || "";
    const rows = query
      ? await context.env.DB.prepare(
          `SELECT user_id, username, normalized_username, display_name, avatar_url,
                  account_visibility, updated_at
           FROM user_profile
           WHERE searchable = 1 AND normalized_username IS NOT NULL
             AND (normalized_username LIKE ?1 ESCAPE '\\'
               OR lower(COALESCE(display_name, '')) LIKE ?1 ESCAPE '\\')
           ORDER BY CASE WHEN normalized_username = ?2 THEN 0 ELSE 1 END,
                    updated_at DESC
           LIMIT 30`,
        ).bind(`%${escapeLike(query)}%`, query).all()
      : await context.env.DB.prepare(
          `SELECT user_id, username, normalized_username, display_name, avatar_url,
                  account_visibility, updated_at
           FROM user_profile
           WHERE searchable = 1 AND normalized_username IS NOT NULL
             AND (account_visibility = 'public' OR EXISTS (
               SELECT 1 FROM user_project_visibility v
               WHERE v.user_id = user_profile.user_id AND v.visibility = 'public'
             ))
           ORDER BY updated_at DESC
           LIMIT 30`,
        ).all();
    return jsonResponse({
      users: (rows?.results || []).map((row: any) => publicProfileDto(row, false)),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("GET /api/public-directory error", error);
    return jsonResponse({ error: "Failed to search users" }, { status: 500 });
  }
};
