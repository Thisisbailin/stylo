const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$/;
const VISIT_SESSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$/;

export type PublicProfileRow = {
  user_id: string;
  username: string;
  normalized_username: string;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  account_visibility?: string | null;
  searchable?: number | null;
  updated_at?: number | null;
};

export const normalizeUsername = (value: unknown) => {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return USERNAME_PATTERN.test(normalized) ? normalized : "";
};

export const normalizeVisitSessionId = (value: unknown) => {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return VISIT_SESSION_PATTERN.test(normalized) ? normalized : "";
};

export const readPublicProfileByUsername = async (db: any, username: unknown) => {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;
  return db.prepare(
    `SELECT user_id, username, normalized_username, display_name, bio, avatar_url,
            account_visibility, searchable, updated_at
     FROM user_profile
     WHERE normalized_username = ?1`,
  ).bind(normalizedUsername).first() as Promise<PublicProfileRow | null>;
};

export const readProjectVisibility = async (db: any, ownerUserId: string, projectId: string) => {
  const row = await db.prepare(
    `SELECT p.account_visibility, v.visibility
     FROM user_profile p
     LEFT JOIN user_project_visibility v
       ON v.user_id = p.user_id AND v.project_id = ?2
     WHERE p.user_id = ?1`,
  ).bind(ownerUserId, projectId).first();
  const override = String(row?.visibility || "inherit");
  const accountPublic = row?.account_visibility === "public";
  return {
    accountPublic,
    override,
    visible: override === "public" || (override !== "private" && accountPublic),
  };
};

export const recordProfileVisit = async (
  db: any,
  input: {
    viewerUserId: string;
    ownerUserId: string;
    projectId?: string | null;
    visitSessionId?: string | null;
    heartbeat?: boolean;
  },
) => {
  if (!input.viewerUserId || input.viewerUserId === input.ownerUserId) return;
  const projectId = input.projectId || null;
  const scopeKey = projectId ? `project:${projectId}` : "profile";
  const visitSessionId = normalizeVisitSessionId(input.visitSessionId) || crypto.randomUUID();
  const now = Date.now();
  await db.prepare(
    `INSERT INTO user_profile_visits
       (viewer_user_id, owner_user_id, project_id, scope_key, visit_session_id,
        first_seen_at, last_seen_at, view_count)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, 1)
     ON CONFLICT(viewer_user_id, owner_user_id, scope_key, visit_session_id)
     DO UPDATE SET
       last_seen_at = excluded.last_seen_at,
       view_count = user_profile_visits.view_count + ?7`,
  ).bind(
    input.viewerUserId,
    input.ownerUserId,
    projectId,
    scopeKey,
    visitSessionId,
    now,
    input.heartbeat ? 0 : 1,
  ).run();
};

export const publicProfileDto = (row: PublicProfileRow, includeDetails: boolean) => ({
  username: row.username,
  displayName: row.username,
  avatarUrl: row.avatar_url || null,
  accountPublic: row.account_visibility === "public",
  ...(includeDetails ? { bio: row.bio || "", updatedAt: Number(row.updated_at) || 0 } : {}),
});
