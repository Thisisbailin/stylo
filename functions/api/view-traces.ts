import { getUserId, jsonResponse } from "./_auth";
import { normalizeProjectId } from "./_projectScope";
import {
  readProjectVisibility,
  readPublicProfileByUsername,
  recordProfileVisit,
} from "./_publicAccess";
import { readJsonRequest } from "./_request";

type Env = { DB: any; CLERK_SECRET_KEY: string; CLERK_JWT_KEY?: string };

const mapTrace = (row: any, direction: "inbound" | "outbound") => ({
  id: Number(row.id) || 0,
  username: direction === "inbound" ? row.viewer_username : row.owner_username,
  displayName: direction === "inbound" ? row.viewer_username : row.owner_username,
  avatarUrl: direction === "inbound" ? row.viewer_avatar_url : row.owner_avatar_url,
  projectId: row.project_id || null,
  firstSeenAt: Number(row.first_seen_at) || 0,
  lastSeenAt: Number(row.last_seen_at) || 0,
  viewCount: Number(row.view_count) || 1,
  current: Number(row.last_seen_at) >= Date.now() - 45_000,
});

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  try {
    const userId = await getUserId(context.request, context.env);
    const since = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const [inbound, outbound] = await Promise.all([
      context.env.DB.prepare(
        `SELECT v.*, p.username AS viewer_username, p.display_name AS viewer_display_name,
                p.avatar_url AS viewer_avatar_url
         FROM user_profile_visits v
         LEFT JOIN user_profile p ON p.user_id = v.viewer_user_id
         WHERE v.owner_user_id = ?1 AND v.last_seen_at >= ?2
         ORDER BY v.last_seen_at DESC LIMIT 200`,
      ).bind(userId, since).all(),
      context.env.DB.prepare(
        `SELECT v.*, p.username AS owner_username, p.display_name AS owner_display_name,
                p.avatar_url AS owner_avatar_url
         FROM user_profile_visits v
         LEFT JOIN user_profile p ON p.user_id = v.owner_user_id
         WHERE v.viewer_user_id = ?1 AND v.last_seen_at >= ?2
         ORDER BY v.last_seen_at DESC LIMIT 200`,
      ).bind(userId, since).all(),
    ]);
    const inboundItems = (inbound?.results || []).map((row: any) => mapTrace(row, "inbound"));
    return jsonResponse({
      inboundCurrent: inboundItems.filter((item: any) => item.current),
      inboundHistory: inboundItems,
      outboundHistory: (outbound?.results || []).map((row: any) => mapTrace(row, "outbound")),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("GET /api/view-traces error", error);
    return jsonResponse({ error: "Failed to load view traces" }, { status: 500 });
  }
};

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  try {
    const viewerUserId = await getUserId(context.request, context.env);
    const body = await readJsonRequest<{
      username?: unknown;
      projectId?: unknown;
      visitSession?: unknown;
    }>(context.request, 8 * 1024);
    const profile = await readPublicProfileByUsername(context.env.DB, body.username);
    if (!profile) return jsonResponse({ error: "User not found" }, { status: 404 });
    const projectId = body.projectId === undefined ? null : normalizeProjectId(body.projectId);
    if (body.projectId !== undefined && !projectId) {
      return jsonResponse({ error: "Invalid projectId" }, { status: 400 });
    }
    if (projectId) {
      const access = await readProjectVisibility(context.env.DB, profile.user_id, projectId);
      if (!access.visible) return jsonResponse({ error: "Public project not found" }, { status: 404 });
      const exists = await context.env.DB.prepare(
        "SELECT 1 FROM user_project_documents WHERE user_id = ?1 AND project_id = ?2",
      ).bind(profile.user_id, projectId).first();
      if (!exists) return jsonResponse({ error: "Public project not found" }, { status: 404 });
    }
    await recordProfileVisit(context.env.DB, {
      viewerUserId,
      ownerUserId: profile.user_id,
      projectId,
      visitSessionId: typeof body.visitSession === "string" ? body.visitSession : null,
      heartbeat: true,
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("POST /api/view-traces error", error);
    return jsonResponse({ error: "Failed to record view trace" }, { status: 500 });
  }
};
