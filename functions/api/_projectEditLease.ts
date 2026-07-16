import { jsonResponse } from "./_auth";
import type { D1DatabaseLike, D1PreparedStatementLike } from "./_types";
import { requireRequestProjectId } from "./_projectScope";

export type ProjectEditLeaseEnv = {
  DB: any;
};

export type ProjectEditLeaseRow = {
  user_id: string;
  project_id: string;
  lease_id: string;
  device_id: string;
  session_id: string;
  client_label: string;
  acquired_at: number;
  renewed_at: number;
  expires_at: number;
};

export const PROJECT_EDIT_LEASE_HEADER = "x-project-edit-lease";
export const PROJECT_EDIT_LEASE_TTL_MS = 45_000;

export const readRequestDeviceId = (request: Request) =>
  (request.headers.get("x-device-id") || "").trim();

export const readProjectEditLease = async (
  env: ProjectEditLeaseEnv,
  userId: string,
  projectId: string,
): Promise<ProjectEditLeaseRow | null> => {
  const row = await env.DB.prepare(
    `SELECT user_id, project_id, lease_id, device_id, session_id, client_label, acquired_at, renewed_at, expires_at
     FROM user_project_edit_leases WHERE user_id = ?1 AND project_id = ?2`,
  ).bind(userId, projectId).first();
  return row ? row as ProjectEditLeaseRow : null;
};

export const toPublicLeaseOwner = (row: ProjectEditLeaseRow | null) => row
  ? {
      clientLabel: row.client_label,
      acquiredAt: Number(row.acquired_at) || 0,
      renewedAt: Number(row.renewed_at) || 0,
      expiresAt: Number(row.expires_at) || 0,
    }
  : null;

/**
 * Transaction-time fencing guard. It deliberately violates the existing
 * guard table's NOT NULL constraint if ownership changed before the D1 batch
 * actually begins, rolling back every mutation in that batch.
 */
export const buildProjectEditLeaseGuardStatement = (
  db: D1DatabaseLike,
  row: ProjectEditLeaseRow,
  guardId: string,
): D1PreparedStatementLike => db.prepare(
  `INSERT INTO user_project_write_guards (guard_id, ok)
   VALUES (?1, (
     SELECT CASE
       WHEN EXISTS (
         SELECT 1 FROM user_project_edit_leases
         WHERE user_id = ?2
           AND project_id = ?3
           AND lease_id = ?4
           AND device_id = ?5
           AND session_id = ?6
           AND expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
       )
       THEN 1 ELSE NULL
     END
   ))`,
).bind(guardId, row.user_id, row.project_id, row.lease_id, row.device_id, row.session_id);

/**
 * Server-side write fence. UI state is never sufficient: every project
 * mutation must present the live token and originate from its owning device.
 */
export const requireProjectEditLease = async (
  env: ProjectEditLeaseEnv,
  request: Request,
  userId: string,
) => {
  const projectId = requireRequestProjectId(request);
  const leaseId = (request.headers.get(PROJECT_EDIT_LEASE_HEADER) || "").trim();
  const deviceId = readRequestDeviceId(request);
  const row = await readProjectEditLease(env, userId, projectId);
  const now = Date.now();
  const valid = Boolean(
    row &&
    leaseId &&
    deviceId &&
    row.lease_id === leaseId &&
    row.device_id === deviceId &&
    Number(row.expires_at) > now
  );
  if (valid) return row as ProjectEditLeaseRow;

  throw jsonResponse(
    {
      error: "Project edit lease required",
      code: "PROJECT_EDIT_LEASE_REQUIRED",
      owner: row && Number(row.expires_at) > now ? toPublicLeaseOwner(row) : null,
    },
    { status: 423 },
  );
};
