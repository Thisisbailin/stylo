import { getUserId, jsonResponse } from "./_auth";

type Env = {
  DB: any;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
};

const readTitle = (data: unknown, projectId: string) => {
  if (typeof data !== "string") return projectId;
  try {
    const meta = JSON.parse(data) as Record<string, unknown>;
    return typeof meta.fileName === "string" && meta.fileName.trim()
      ? meta.fileName.trim().slice(0, 200)
      : projectId;
  } catch {
    return projectId;
  }
};

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  try {
    const userId = await getUserId(context.request, context.env);
    const rows = await context.env.DB.prepare(
      `SELECT project_id, project_data AS data, updated_at
       FROM user_project_documents
       WHERE user_id = ?1
       ORDER BY updated_at DESC, project_id ASC
       LIMIT 100`,
    ).bind(userId).all();
    return jsonResponse({
      projects: (rows?.results || []).map((row: Record<string, unknown>) => ({
        projectId: String(row.project_id || ""),
        title: readTitle(row.data, String(row.project_id || "")),
        updatedAt: Number(row.updated_at) || 0,
      })).filter((item: { projectId: string }) => Boolean(item.projectId)),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("GET /api/projects error", error);
    return jsonResponse({ error: "Failed to list cloud projects" }, { status: 500 });
  }
};
