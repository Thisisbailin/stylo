import { getUserId, jsonResponse } from "./_auth";
import { normalizeProjectId } from "./_projectScope";
import { readJsonRequest } from "./_request";

type Env = {
  DB: any;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
  PROJECT_REALTIME?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
};
type Visibility = "inherit" | "public" | "private";

const revokeProjectViewers = async (env: Env, userId: string, projectId: string) => {
  if (!env.PROJECT_REALTIME) return;
  const roomId = env.PROJECT_REALTIME.idFromName(`${userId}:${projectId}`);
  const response = await env.PROJECT_REALTIME.get(roomId).fetch(
    new Request("https://stylo.internal/revoke-viewers", {
      method: "POST",
      headers: {
        "x-stylo-user-id": userId,
        "x-stylo-project-id": projectId,
      },
    }),
  );
  if (!response.ok) throw new Error(`Realtime viewer revocation failed for project ${projectId}`);
};

const readTitle = (data: unknown, projectId: string) => {
  try {
    const project = JSON.parse(String(data || "{}"));
    const active = Array.isArray(project.flowProjects)
      ? project.flowProjects.find((item: any) => item?.id === projectId)
      : null;
    return String(active?.title || project.fileName || projectId).slice(0, 200);
  } catch {
    return projectId;
  }
};

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  try {
    const userId = await getUserId(context.request, context.env);
    const [profile, projects] = await Promise.all([
      context.env.DB.prepare(
        `SELECT username, display_name, bio, avatar_url, account_visibility, searchable, updated_at
         FROM user_profile WHERE user_id = ?1`,
      ).bind(userId).first(),
      context.env.DB.prepare(
        `SELECT d.project_id, d.project_data, d.updated_at,
                COALESCE(v.visibility, 'inherit') AS visibility
         FROM user_project_documents d
         LEFT JOIN user_project_visibility v
           ON v.user_id = d.user_id AND v.project_id = d.project_id
         WHERE d.user_id = ?1
         ORDER BY d.updated_at DESC`,
      ).bind(userId).all(),
    ]);
    return jsonResponse({
      profile: {
        username: profile?.username || null,
        displayName: profile?.display_name || null,
        bio: profile?.bio || "",
        avatarUrl: profile?.avatar_url || null,
        accountVisibility: profile?.account_visibility === "public" ? "public" : "private",
        searchable: profile ? profile.searchable !== 0 : true,
        updatedAt: Number(profile?.updated_at) || 0,
      },
      projects: (projects?.results || []).map((row: any) => ({
        projectId: String(row.project_id),
        title: readTitle(row.project_data, String(row.project_id)),
        updatedAt: Number(row.updated_at) || 0,
        visibility: ["public", "private"].includes(String(row.visibility)) ? row.visibility : "inherit",
      })),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("GET /api/publication error", error);
    return jsonResponse({ error: "Failed to load publication settings" }, { status: 500 });
  }
};

export const onRequestPut = async (context: { request: Request; env: Env }) => {
  try {
    const userId = await getUserId(context.request, context.env);
    const body = await readJsonRequest<{
      accountVisibility?: unknown;
      projectId?: unknown;
      visibility?: unknown;
    }>(context.request, 8 * 1024);
    const now = Date.now();
    if (body.accountVisibility !== undefined) {
      if (body.accountVisibility !== "public" && body.accountVisibility !== "private") {
        return jsonResponse({ error: "Invalid account visibility" }, { status: 400 });
      }
      if (body.accountVisibility === "public") {
        const profile = await context.env.DB.prepare(
          "SELECT normalized_username FROM user_profile WHERE user_id = ?1",
        ).bind(userId).first();
        if (!profile?.normalized_username) {
          return jsonResponse({ error: "Set a username before publishing your account", code: "USERNAME_REQUIRED" }, { status: 409 });
        }
      }
      await context.env.DB.prepare(
        `INSERT INTO user_profile
           (user_id, account_visibility, bio, searchable, created_at, updated_at)
         VALUES (?1, ?2, '', 1, ?3, ?3)
         ON CONFLICT(user_id) DO UPDATE SET
           account_visibility = excluded.account_visibility,
           updated_at = excluded.updated_at`,
      ).bind(userId, body.accountVisibility, now).run();
      const rows = await context.env.DB.prepare(
        "SELECT project_id FROM user_project_documents WHERE user_id = ?1",
      ).bind(userId).all();
      await Promise.all((rows?.results || []).map((row: any) =>
        revokeProjectViewers(context.env, userId, String(row.project_id || "")),
      ));
      return jsonResponse({ ok: true, accountVisibility: body.accountVisibility });
    }

    const projectId = normalizeProjectId(body.projectId);
    const visibility = body.visibility as Visibility;
    if (!projectId || !["inherit", "public", "private"].includes(visibility)) {
      return jsonResponse({ error: "Invalid project publication setting" }, { status: 400 });
    }
    const owned = await context.env.DB.prepare(
      `SELECT 1 FROM user_project_documents WHERE user_id = ?1 AND project_id = ?2`,
    ).bind(userId, projectId).first();
    if (!owned) return jsonResponse({ error: "Project not found" }, { status: 404 });
    if (visibility === "public") {
      const profile = await context.env.DB.prepare(
        "SELECT normalized_username FROM user_profile WHERE user_id = ?1",
      ).bind(userId).first();
      if (!profile?.normalized_username) {
        return jsonResponse({ error: "Set a username before publishing a project", code: "USERNAME_REQUIRED" }, { status: 409 });
      }
    }
    await context.env.DB.prepare(
      `INSERT INTO user_project_visibility
         (user_id, project_id, visibility, published_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(user_id, project_id) DO UPDATE SET
         visibility = excluded.visibility,
         published_at = CASE
           WHEN excluded.visibility = 'public' THEN COALESCE(user_project_visibility.published_at, excluded.published_at)
           ELSE user_project_visibility.published_at
         END,
         updated_at = excluded.updated_at`,
    ).bind(userId, projectId, visibility, visibility === "public" ? now : null, now).run();
    await revokeProjectViewers(context.env, userId, projectId);
    return jsonResponse({ ok: true, projectId, visibility });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("PUT /api/publication error", error);
    return jsonResponse({ error: "Failed to update publication settings" }, { status: 500 });
  }
};
