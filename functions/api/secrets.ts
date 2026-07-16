import { getUserId } from "./_auth";
import {
  compareAndSetUserSecrets,
  normalizeSecretOpId,
  normalizeUserSecretsPayload,
  readStoredUserSecrets,
  secretJsonResponse,
  UserSecretsValidationError,
  withSecretResponseHeaders,
} from "./_userSecrets";
import { logAudit } from "./audit";
import { readJsonRequest } from "./_request";
import { bindOperationId } from "./_idempotency";

type Env = {
  DB: any; // D1 binding injected by Cloudflare Pages
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
  SECRETS_ENCRYPTION_KEY?: string;
};

const MAX_SECRETS_REQUEST_BYTES = 64 * 1024;

type SecretsPutRequest = {
  secrets?: unknown;
  updatedAt?: unknown;
  opId?: unknown;
  deviceId?: unknown;
};

const getDeviceId = (request: Request, body?: any) => {
  const headerId = request.headers.get("x-device-id") || request.headers.get("X-Device-Id");
  const bodyId = body && typeof body.deviceId === "string" ? body.deviceId : undefined;
  return headerId || bodyId || undefined;
};

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  let userId: string | null = null;
  try {
    userId = await getUserId(context.request, context.env);
    const record = await readStoredUserSecrets(context.env, userId);
    return secretJsonResponse(
      { secrets: record.secrets, updatedAt: record.updatedAt },
      { headers: { etag: String(record.updatedAt) } }
    );
  } catch (err: any) {
    if (err instanceof Response) return withSecretResponseHeaders(err);
    console.error("GET /api/secrets error", err);
    if (userId) {
      const deviceId = getDeviceId(context.request);
      await logAudit(context.env, userId, "secrets.get", "error", { error: "Failed to load secrets", deviceId });
    }
    return secretJsonResponse({ error: "Failed to load secrets" }, { status: 500 });
  }
};

export const onRequestPut = async (context: { request: Request; env: Env }) => {
  let userId: string | null = null;
  try {
    userId = await getUserId(context.request, context.env);
    const body = await readJsonRequest<SecretsPutRequest>(
      context.request,
      MAX_SECRETS_REQUEST_BYTES
    );
    if (!body || typeof body !== "object" || body.secrets === undefined) {
      const deviceId = getDeviceId(context.request);
      if (userId) await logAudit(context.env, userId, "secrets.put", "invalid", { error: "Invalid payload", deviceId });
      return secretJsonResponse({ error: "Invalid payload. Expect { secrets: {...} }" }, { status: 400 });
    }

    const deviceId = getDeviceId(context.request, body);
    const auditDevice = deviceId ? { deviceId } : {};

    const secrets = normalizeUserSecretsPayload(body.secrets);
    const bodyUpdatedAt = typeof body.updatedAt === "number" &&
      Number.isSafeInteger(body.updatedAt) && body.updatedAt >= 0
      ? body.updatedAt
      : undefined;
    const ifMatchHeader = context.request.headers.get("if-match");
    const ifMatchVersion = ifMatchHeader !== null && /^\d+$/.test(ifMatchHeader.trim())
      ? Number(ifMatchHeader.trim())
      : undefined;
    if (ifMatchHeader !== null && ifMatchVersion === undefined) {
      return secretJsonResponse({ error: "Invalid If-Match secrets version" }, { status: 400 });
    }
    if (bodyUpdatedAt !== undefined && ifMatchVersion !== undefined && bodyUpdatedAt !== ifMatchVersion) {
      return secretJsonResponse({ error: "Secrets version differs between body and If-Match" }, { status: 400 });
    }
    const clientUpdatedAt = ifMatchVersion ?? bodyUpdatedAt;
    const opId = normalizeSecretOpId(body.opId);
    const boundOpId = opId
      ? await bindOperationId("secrets-put", opId, secrets)
      : undefined;
    const secretFlags = {
      textKey: !!secrets.textApiKey,
      multiKey: !!secrets.multiApiKey,
      videoKey: !!secrets.videoApiKey
    };

    const existing = await readStoredUserSecrets(context.env, userId);
    if (boundOpId && existing.meta.lastOpId === boundOpId) {
      return secretJsonResponse(
        { ok: true, updatedAt: existing.updatedAt },
        { headers: { etag: String(existing.updatedAt) } }
      );
    }
    if (
      existing.exists &&
      (typeof clientUpdatedAt !== "number" || clientUpdatedAt !== existing.updatedAt)
    ) {
      await logAudit(context.env, userId, "secrets.put", "conflict", {
        updatedAt: existing.updatedAt,
        ...auditDevice,
      });
      return secretJsonResponse(
        { error: "Conflict", updatedAt: existing.updatedAt },
        { status: 409, headers: { etag: String(existing.updatedAt) } }
      );
    }

    const writeResult = await compareAndSetUserSecrets(context.env, userId, secrets, {
      expectedUpdatedAt: existing.exists ? existing.updatedAt : null,
      meta: { lastOpId: boundOpId },
    });

    if (!writeResult.ok) {
      const current = await readStoredUserSecrets(context.env, userId);
      if (boundOpId && current.meta.lastOpId === boundOpId) {
        return secretJsonResponse(
          { ok: true, updatedAt: current.updatedAt },
          { headers: { etag: String(current.updatedAt) } }
        );
      }
      await logAudit(context.env, userId, "secrets.put", "conflict", {
        updatedAt: current.updatedAt,
        ...auditDevice,
      });
      return secretJsonResponse(
        { error: "Conflict", updatedAt: current.updatedAt },
        { status: 409, headers: { etag: String(current.updatedAt) } }
      );
    }

    const updatedAt = writeResult.updatedAt;

    if (userId) {
      await logAudit(context.env, userId, "secrets.put", "ok", { updatedAt, opId, ...secretFlags, ...auditDevice });
    }
    return secretJsonResponse(
      { ok: true, updatedAt },
      { headers: { etag: String(updatedAt) } }
    );
  } catch (err: any) {
    if (err instanceof Response) return withSecretResponseHeaders(err);
    if (err instanceof UserSecretsValidationError) {
      return secretJsonResponse({ error: err.message }, { status: 400 });
    }
    console.error("PUT /api/secrets error", err);
    if (userId) {
      const deviceId = getDeviceId(context.request);
      await logAudit(context.env, userId, "secrets.put", "error", { error: "Failed to save secrets", deviceId });
    }
    return secretJsonResponse({ error: "Failed to save secrets" }, { status: 500 });
  }
};
