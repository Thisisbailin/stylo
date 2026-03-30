import { verifyToken } from "@clerk/backend";
import { validateSecretsPayload } from "./validation";
import { logAudit } from "./audit";
import { getSyncRolloutInfo, RolloutEnv } from "./rollout";

type Env = {
  DB: any; // D1 binding injected by Cloudflare Pages
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
} & RolloutEnv;

const JSON_HEADERS = { "content-type": "application/json" };
const jsonResponse = (body: unknown, init: ResponseInit = {}) => {
  const headers = { ...JSON_HEADERS, ...(init.headers || {}) };
  return new Response(JSON.stringify(body), { ...init, headers });
};

const stripOuterQuotes = (value: string) => {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
};

const normalizeJwtKey = (value: string) => {
  const unescaped = value.replace(/\\r\\n|\\n|\\r/g, "\n");
  const trimmed = stripOuterQuotes(unescaped.trim());
  if (!trimmed) return "";
  const header = "-----BEGIN PUBLIC KEY-----";
  const trailer = "-----END PUBLIC KEY-----";
  const body = trimmed
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!body) return "";
  return `${header}\n${body}\n${trailer}`;
};

const extractBearerToken = (authHeader: string) => {
  const match = authHeader.match(/Bearer\s+([^,]+)/i);
  const raw = match ? match[1] : authHeader;
  const trimmed = stripOuterQuotes(raw.trim());
  const whitespaceStripped = trimmed.replace(/\s+/g, "");
  return whitespaceStripped.replace(/[^A-Za-z0-9._-]/g, "");
};

const getDeviceId = (request: Request, body?: any) => {
  const headerId = request.headers.get("x-device-id") || request.headers.get("X-Device-Id");
  const bodyId = body && typeof body.deviceId === "string" ? body.deviceId : undefined;
  return headerId || bodyId || undefined;
};

function unwrapStoredSecrets(stored: any): { secrets: any; meta: { lastOpId?: string } } {
  if (stored && typeof stored === "object" && "secrets" in stored) {
    return { secrets: (stored as any).secrets, meta: (stored as any).meta || {} };
  }
  return { secrets: stored, meta: {} };
}

async function ensureTable(env: Env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_secrets (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)"
  ).run();
}

async function getUserId(request: Request, env: Env) {
  const authHeader = request.headers.get("authorization") || "";
  const token = extractBearerToken(authHeader);

  const rawSecret = typeof env.CLERK_SECRET_KEY === "string" ? env.CLERK_SECRET_KEY : "";
  const rawJwtKey = typeof env.CLERK_JWT_KEY === "string" ? env.CLERK_JWT_KEY : "";
  const asciiCleaned = rawSecret.replace(/[^\x20-\x7E]/g, "");
  let secretKey = stripOuterQuotes(asciiCleaned.replace(/\s+/g, ""));
  const jwtKey = normalizeJwtKey(rawJwtKey);
  if (!secretKey && !jwtKey) {
    throw new Response("Missing CLERK_SECRET_KEY on server", { status: 500 });
  }

  if (!token) {
    throw new Response(JSON.stringify({ error: "Unauthorized", detail: "Missing bearer token" }), { status: 401, headers: JSON_HEADERS });
  }

  try {
    const payload = await verifyToken(token, jwtKey ? { jwtKey } : { secretKey });
    if (payload?.sub) return payload.sub;
    throw new Error("Token payload missing sub");
  } catch (err: any) {
    const detail = err?.message || "Token verification failed";
    console.warn("verifyToken failed", err);
    throw new Response(JSON.stringify({ error: "Unauthorized", detail }), { status: 401, headers: JSON_HEADERS });
  }
}

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  let userId: string | null = null;
  try {
    userId = await getUserId(context.request, context.env);
    const rollout = getSyncRolloutInfo(userId, context.env);
    if (!rollout.enabled) {
      const deviceId = getDeviceId(context.request);
      if (userId) {
        await logAudit(context.env, userId, "secrets.get", "disabled", { rolloutPercent: rollout.percent, ...(deviceId ? { deviceId } : {}) });
      }
      return jsonResponse({ error: "Sync disabled for this account", rollout: { percent: rollout.percent } }, { status: 403 });
    }
    await ensureTable(context.env);

    const row = await context.env.DB.prepare(
      "SELECT data, updated_at FROM user_secrets WHERE user_id = ?1"
    )
      .bind(userId)
      .first();

    const parsed = row ? JSON.parse(row.data as string) : { secrets: {}, meta: {} };
    const { secrets } = unwrapStoredSecrets(parsed);
    return jsonResponse(
      { secrets, updatedAt: row?.updated_at || 0 },
      { headers: { etag: String(row?.updated_at || 0) } }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("GET /api/secrets error", err);
    if (userId) {
      const deviceId = getDeviceId(context.request);
      await logAudit(context.env, userId, "secrets.get", "error", { error: "Failed to load secrets", deviceId });
    }
    return jsonResponse({ error: "Failed to load secrets" }, { status: 500 });
  }
};

export const onRequestPut = async (context: { request: Request; env: Env }) => {
  let userId: string | null = null;
  try {
    userId = await getUserId(context.request, context.env);
    const rollout = getSyncRolloutInfo(userId, context.env);
    if (!rollout.enabled) {
      const deviceId = getDeviceId(context.request);
      if (userId) {
        await logAudit(context.env, userId, "secrets.put", "disabled", { rolloutPercent: rollout.percent, ...(deviceId ? { deviceId } : {}) });
      }
      return jsonResponse({ error: "Sync disabled for this account", rollout: { percent: rollout.percent } }, { status: 403 });
    }
    await ensureTable(context.env);

    const body = await context.request.json();
    if (!body || typeof body !== "object" || !("secrets" in body)) {
      const deviceId = getDeviceId(context.request);
      if (userId) await logAudit(context.env, userId, "secrets.put", "invalid", { error: "Invalid payload", deviceId });
      return jsonResponse({ error: "Invalid payload. Expect { secrets: {...} }" }, { status: 400 });
    }

    const deviceId = getDeviceId(context.request, body);
    const auditDevice = deviceId ? { deviceId } : {};

    const validation = validateSecretsPayload(body.secrets);
    if (!validation.ok) {
      if (userId) await logAudit(context.env, userId, "secrets.put", "invalid", { error: validation.error, ...auditDevice });
      return jsonResponse({ error: validation.error }, { status: 400 });
    }

    const clientUpdatedAt = typeof body.updatedAt === "number" ? body.updatedAt : undefined;
    const opId = typeof body.opId === "string" ? body.opId : undefined;
    const secretFlags = {
      textKey: !!body.secrets?.textApiKey,
      multiKey: !!body.secrets?.multiApiKey,
      videoKey: !!body.secrets?.videoApiKey
    };

    const existing = await context.env.DB.prepare(
      "SELECT data, updated_at FROM user_secrets WHERE user_id = ?1"
    )
      .bind(userId)
      .first();

    if (existing) {
      const parsed = JSON.parse(existing.data as string);
      const { secrets: remoteSecrets, meta } = unwrapStoredSecrets(parsed);
      if (opId && meta?.lastOpId === opId) {
        return jsonResponse(
          { ok: true, updatedAt: existing.updated_at },
          { headers: { etag: String(existing.updated_at) } }
        );
      }
      if (typeof clientUpdatedAt !== "number" || clientUpdatedAt !== existing.updated_at) {
        if (userId) await logAudit(context.env, userId, "secrets.put", "conflict", { updatedAt: existing.updated_at, ...auditDevice });
        return jsonResponse(
          { error: "Conflict", secrets: remoteSecrets, updatedAt: existing.updated_at },
          { status: 409 }
        );
      }
    }

    const payload = { secrets: body.secrets || {}, meta: { lastOpId: opId } };
    const serialized = JSON.stringify(payload);
    const updatedAt = Date.now();

    await context.env.DB.prepare(
      "INSERT INTO user_secrets (user_id, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET data=?2, updated_at=?3"
    )
      .bind(userId, serialized, updatedAt)
      .run();

    if (userId) {
      await logAudit(context.env, userId, "secrets.put", "ok", { updatedAt, opId, ...secretFlags, ...auditDevice });
    }
    return jsonResponse(
      { ok: true, updatedAt },
      { headers: { etag: String(updatedAt) } }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("PUT /api/secrets error", err);
    if (userId) {
      const deviceId = getDeviceId(context.request);
      await logAudit(context.env, userId, "secrets.put", "error", { error: "Failed to save secrets", deviceId });
    }
    return jsonResponse({ error: "Failed to save secrets" }, { status: 500 });
  }
};
