import { getUserId, jsonResponse } from "./_auth";
import {
  publicProfileDto,
  readPublicProfileByUsername,
  recordProfileVisit,
} from "./_publicAccess";

type Env = { DB: any; CLERK_SECRET_KEY: string; CLERK_JWT_KEY?: string };

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
    const viewerUserId = await getUserId(context.request, context.env);
    const url = new URL(context.request.url);
    const profile = await readPublicProfileByUsername(context.env.DB, url.searchParams.get("username"));
    if (!profile) return jsonResponse({ error: "User not found" }, { status: 404 });

    await recordProfileVisit(context.env.DB, {
      viewerUserId,
      ownerUserId: profile.user_id,
      visitSessionId: url.searchParams.get("visitSession"),
    });

    const projects = await context.env.DB.prepare(
      `SELECT d.project_id, d.project_data, d.updated_at,
              COALESCE(v.visibility, 'inherit') AS visibility
       FROM user_project_documents d
       LEFT JOIN user_project_visibility v
         ON v.user_id = d.user_id AND v.project_id = d.project_id
       WHERE d.user_id = ?1
         AND (v.visibility = 'public'
           OR (?2 = 'public' AND COALESCE(v.visibility, 'inherit') != 'private'))
       ORDER BY d.updated_at DESC
       LIMIT 100`,
    ).bind(profile.user_id, profile.account_visibility || "private").all();

    return jsonResponse({
      profile: publicProfileDto(profile, true),
      projects: (projects?.results || []).map((row: any) => ({
        projectId: String(row.project_id),
        title: readTitle(row.project_data, String(row.project_id)),
        updatedAt: Number(row.updated_at) || 0,
        visibility: row.visibility === "public" ? "public" : "account",
      })),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("GET /api/public-profile error", error);
    return jsonResponse({ error: "Failed to load public profile" }, { status: 500 });
  }
};

