import { getUserId, jsonResponse } from "./_auth";
import { readJsonRequest } from "./_request";
import { logAudit } from "./audit";
import {
  PROJECT_EDIT_LEASE_TTL_MS,
  buildProjectEditLeaseTakeoverStatement,
  readProjectEditLease,
  readRequestDeviceId,
  toPublicLeaseOwner,
} from "./_projectEditLease";
import { normalizeProjectId } from "./_projectScope";

type Env = {
  DB: any;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
};

type LeaseRequest = {
  action?: unknown;
  sessionId?: unknown;
  clientLabel?: unknown;
  leaseId?: unknown;
  projectId?: unknown;
  takeoverToken?: unknown;
};

const normalizeId = (value: unknown, max = 160) =>
  typeof value === "string" && value.trim().length >= 8 && value.trim().length <= max
    ? value.trim()
    : "";

const normalizeClientLabel = (value: unknown) => {
  if (typeof value !== "string") return "Stylo 客户端";
  const label = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return label || "Stylo 客户端";
};

const createLeaseId = () => crypto.randomUUID();

const ownedResponse = (row: Awaited<ReturnType<typeof readProjectEditLease>>) =>
  jsonResponse({
    status: "owned",
    leaseId: row?.lease_id,
    acquiredAt: Number(row?.acquired_at) || 0,
    renewedAt: Number(row?.renewed_at) || 0,
    expiresAt: Number(row?.expires_at) || 0,
  });

const blockedResponse = (row: Awaited<ReturnType<typeof readProjectEditLease>>) =>
  jsonResponse(
    {
      status: "blocked",
      code: "PROJECT_EDIT_LEASE_HELD",
      owner: toPublicLeaseOwner(row),
      takeoverToken: row?.lease_id || null,
    },
    { status: 423 },
  );

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  let userId: string | null = null;
  try {
    userId = await getUserId(context.request, context.env);
    const body = await readJsonRequest<LeaseRequest>(context.request, 8 * 1024);
    const action = body?.action;
    const sessionId = normalizeId(body?.sessionId);
    const projectId = normalizeProjectId(body?.projectId);
    const deviceId = readRequestDeviceId(context.request);
    const clientLabel = normalizeClientLabel(body?.clientLabel);
    if (!deviceId || !sessionId || !projectId || !["acquire", "renew", "release", "takeover"].includes(String(action))) {
      return jsonResponse({ error: "Invalid project lease request" }, { status: 400 });
    }

    const now = Date.now();
    if (action === "acquire") {
      const candidateLeaseId = createLeaseId();
      const expiresAt = now + PROJECT_EDIT_LEASE_TTL_MS;
      await context.env.DB.prepare(
        `INSERT INTO user_project_edit_leases
           (user_id, project_id, lease_id, device_id, session_id, client_label, acquired_at, renewed_at, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8)
         ON CONFLICT(user_id, project_id) DO UPDATE SET
           lease_id = CASE
             WHEN device_id = excluded.device_id AND session_id = excluded.session_id THEN lease_id
             ELSE excluded.lease_id
           END,
           device_id = excluded.device_id,
           session_id = excluded.session_id,
           client_label = excluded.client_label,
           acquired_at = CASE
             WHEN device_id = excluded.device_id AND session_id = excluded.session_id THEN acquired_at
             ELSE excluded.acquired_at
           END,
           renewed_at = excluded.renewed_at,
           expires_at = excluded.expires_at
         WHERE expires_at <= ?7 OR (device_id = excluded.device_id AND session_id = excluded.session_id)`,
      ).bind(userId, projectId, candidateLeaseId, deviceId, sessionId, clientLabel, now, expiresAt).run();

      const row = await readProjectEditLease(context.env, userId, projectId);
      if (row?.device_id === deviceId && row.session_id === sessionId && Number(row.expires_at) > now) {
        await logAudit(context.env, userId, "project.lease.acquire", "owned", {
          deviceId,
          projectId,
          sessionId,
          expiresAt: row.expires_at,
        });
        return ownedResponse(row);
      }
      await logAudit(context.env, userId, "project.lease.acquire", "blocked", {
        deviceId,
        projectId,
        sessionId,
        owner: toPublicLeaseOwner(row),
      });
      return blockedResponse(row);
    }

    if (action === "takeover") {
      const takeoverToken = normalizeId(body?.takeoverToken);
      if (!takeoverToken) {
        return jsonResponse({ error: "Missing or stale project takeover token" }, { status: 409 });
      }
      const candidateLeaseId = createLeaseId();
      const expiresAt = now + PROJECT_EDIT_LEASE_TTL_MS;
      await buildProjectEditLeaseTakeoverStatement(context.env.DB, {
        userId,
        projectId,
        candidateLeaseId,
        deviceId,
        sessionId,
        clientLabel,
        now,
        expiresAt,
        takeoverToken,
      }).run();

      const row = await readProjectEditLease(context.env, userId, projectId);
      if (row?.lease_id === candidateLeaseId && row.device_id === deviceId && row.session_id === sessionId) {
        await logAudit(context.env, userId, "project.lease.takeover", "owned", {
          deviceId,
          projectId,
          sessionId,
          expiresAt: row.expires_at,
        });
        return ownedResponse(row);
      }
      await logAudit(context.env, userId, "project.lease.takeover", "stale", {
        deviceId,
        projectId,
        sessionId,
        owner: toPublicLeaseOwner(row),
      });
      return blockedResponse(row);
    }

    const leaseId = normalizeId(body?.leaseId);
    if (!leaseId) return jsonResponse({ error: "Missing project lease id" }, { status: 400 });

    if (action === "renew") {
      const expiresAt = now + PROJECT_EDIT_LEASE_TTL_MS;
      await context.env.DB.prepare(
        `UPDATE user_project_edit_leases
         SET renewed_at = ?6, expires_at = ?7, client_label = ?8
         WHERE user_id = ?1 AND project_id = ?2 AND lease_id = ?3 AND device_id = ?4 AND session_id = ?5 AND expires_at > ?6`,
      ).bind(userId, projectId, leaseId, deviceId, sessionId, now, expiresAt, clientLabel).run();
      const row = await readProjectEditLease(context.env, userId, projectId);
      if (row?.lease_id === leaseId && row.device_id === deviceId && row.session_id === sessionId && Number(row.expires_at) > now) {
        return ownedResponse(row);
      }
      await logAudit(context.env, userId, "project.lease.renew", "lost", { deviceId, projectId, sessionId });
      return blockedResponse(row);
    }

    await context.env.DB.prepare(
      `DELETE FROM user_project_edit_leases
       WHERE user_id = ?1 AND project_id = ?2 AND lease_id = ?3 AND device_id = ?4 AND session_id = ?5`,
    ).bind(userId, projectId, leaseId, deviceId, sessionId).run();
    await logAudit(context.env, userId, "project.lease.release", "released", { deviceId, projectId, sessionId });
    return jsonResponse({ status: "released" });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("POST /api/project-lease error", error);
    if (userId) await logAudit(context.env, userId, "project.lease", "error", {});
    return jsonResponse({ error: "Project edit lease request failed" }, { status: 500 });
  }
};
