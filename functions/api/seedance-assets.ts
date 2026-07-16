import { getUserId, jsonResponse } from "./_auth";
import { enforceRateLimit } from "./_rateLimit";
import { readJsonRequest } from "./_request";
import type { D1DatabaseLike, PagesContext } from "./_types";
import { normalizeProjectId } from "./_projectScope";

type Env = Record<string, unknown> & {
  DB: D1DatabaseLike;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
};

const HOST = "open.volcengineapi.com";
const REGION = "cn-beijing";
const SERVICE = "ark";
const VERSION = "2024-01-01";
const MAX_REQUEST_BYTES = 64 * 1024;

const encoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const sha256 = async (value: string) => {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toHex(hash);
};

const hmac = async (key: ArrayBuffer | Uint8Array, value: string) => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key instanceof Uint8Array ? key : new Uint8Array(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
};

const resolveAccess = (env: Record<string, unknown>) => {
  const accessKey =
    (typeof env.VOLC_ACCESS_KEY_ID === "string" && env.VOLC_ACCESS_KEY_ID.trim()) ||
    (typeof env.VOLC_ACCESS_KEY === "string" && env.VOLC_ACCESS_KEY.trim()) ||
    (typeof env.VOLCENGINE_ACCESS_KEY_ID === "string" && env.VOLCENGINE_ACCESS_KEY_ID.trim()) ||
    (typeof env.VOLCENGINE_ACCESS_KEY === "string" && env.VOLCENGINE_ACCESS_KEY.trim()) ||
    "";
  const secretKey =
    (typeof env.VOLC_SECRET_ACCESS_KEY === "string" && env.VOLC_SECRET_ACCESS_KEY.trim()) ||
    (typeof env.VOLC_SECRET_KEY === "string" && env.VOLC_SECRET_KEY.trim()) ||
    (typeof env.VOLCENGINE_SECRET_ACCESS_KEY === "string" && env.VOLCENGINE_SECRET_ACCESS_KEY.trim()) ||
    (typeof env.VOLCENGINE_SECRET_KEY === "string" && env.VOLCENGINE_SECRET_KEY.trim()) ||
    "";
  const defaultGroupId =
    (typeof env.SEEDANCE_AIGC_ASSET_GROUP_ID === "string" && env.SEEDANCE_AIGC_ASSET_GROUP_ID.trim()) ||
    "";
  const projectName =
    (typeof env.SEEDANCE_ASSET_PROJECT_NAME === "string" && env.SEEDANCE_ASSET_PROJECT_NAME.trim()) ||
    "default";
  return { accessKey, secretKey, defaultGroupId, projectName };
};

const normalizeText = (value: unknown, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
};

const parseArkResult = (raw: any) => {
  const error = raw?.ResponseMetadata?.Error || raw?.error;
  if (error) {
    const code = error.Code || error.code || "ArkError";
    const message = error.Message || error.message || JSON.stringify(error);
    throw new Error(`${code}: ${message}`);
  }
  return raw?.Result || raw?.result || raw?.data || raw;
};

const signArkRequest = async ({
  action,
  body,
  accessKey,
  secretKey,
}: {
  action: string;
  body: string;
  accessKey: string;
  secretKey: string;
}) => {
  const now = new Date();
  const xDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = xDate.slice(0, 8);
  const payloadHash = await sha256(body);
  const query = `Action=${encodeURIComponent(action)}&Version=${encodeURIComponent(VERSION)}`;
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${HOST}\nx-content-sha256:${payloadHash}\nx-date:${xDate}\n`;
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalRequest = [
    "POST",
    "/",
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${shortDate}/${REGION}/${SERVICE}/request`;
  const stringToSign = ["HMAC-SHA256", xDate, scope, await sha256(canonicalRequest)].join("\n");
  const kDate = await hmac(encoder.encode(secretKey), shortDate);
  const kRegion = await hmac(kDate, REGION);
  const kService = await hmac(kRegion, SERVICE);
  const kSigning = await hmac(kService, "request");
  const signature = toHex(await hmac(kSigning, stringToSign));
  return {
    url: `https://${HOST}/?${query}`,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Date": xDate,
      "X-Content-Sha256": payloadHash,
      Authorization: `HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
};

const callArkAction = async ({
  action,
  payload,
  accessKey,
  secretKey,
}: {
  action: string;
  payload: Record<string, unknown>;
  accessKey: string;
  secretKey: string;
}) => {
  const body = JSON.stringify(payload);
  const signed = await signArkRequest({ action, body, accessKey, secretKey });
  const response = await fetch(signed.url, {
    method: "POST",
    headers: signed.headers,
    body,
  });
  const text = await response.text();
  let raw: any = {};
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    if (!response.ok) throw new Error(text || response.statusText);
    throw new Error(`Ark returned non-JSON response: ${text}`);
  }
  if (!response.ok) {
    const error = raw?.ResponseMetadata?.Error || raw?.error;
    const detail = error?.Message || error?.message || text || response.statusText;
    throw new Error(`Ark ${action} failed (${response.status}): ${detail}`);
  }
  return parseArkResult(raw);
};

const createAsset = async (
  payload: Record<string, unknown>,
  env: Record<string, unknown>,
  authorizedGroupId?: string
) => {
  const { accessKey, secretKey, defaultGroupId, projectName } = resolveAccess(env);
  if (!accessKey || !secretKey) {
    throw new Error("服务端未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_ACCESS_KEY，无法调用 Seedance Assets API。");
  }

  const sourceUrl = normalizeText(payload?.url);
  if (!sourceUrl || !/^https:\/\//i.test(sourceUrl)) {
    throw new Error("CreateAsset 需要可公网访问的 HTTPS 图片 URL。");
  }

  let groupId = authorizedGroupId || defaultGroupId;
  const name = normalizeText(payload?.name, `stylo-aigc-${Date.now()}`).slice(0, 80);

  if (!groupId) {
    const group = await callArkAction({
      action: "CreateAssetGroup",
      accessKey,
      secretKey,
      payload: {
        GroupType: "AIGC",
        Name: name,
        Title: name,
        Description: "Stylo AIGC synthetic portrait review",
        ProjectName: projectName,
      },
    });
    groupId = group?.Id || group?.GroupId || group?.AssetGroupId;
    if (!groupId) throw new Error("CreateAssetGroup 未返回 GroupId。");
  }

  const asset = await callArkAction({
    action: "CreateAsset",
    accessKey,
    secretKey,
    payload: {
      GroupId: groupId,
      URL: sourceUrl,
      AssetType: "Image",
      Name: name,
      ProjectName: projectName,
    },
  });
  const assetId = asset?.Id || asset?.AssetId;
  if (!assetId) throw new Error("CreateAsset 未返回 AssetId。");
  return {
    assetId,
    groupId,
    assetUri: `asset://${assetId}`,
    status: asset?.Status || "Processing",
    failedReason: asset?.FailedReason || asset?.Reason,
  };
};

const getAsset = async (payload: Record<string, unknown>, env: Record<string, unknown>) => {
  const { accessKey, secretKey, projectName } = resolveAccess(env);
  if (!accessKey || !secretKey) {
    throw new Error("服务端未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_ACCESS_KEY，无法查询 Seedance Assets API。");
  }
  const assetId = normalizeText(payload?.assetId);
  if (!assetId) throw new Error("assetId required");
  const result = await callArkAction({
    action: "GetAsset",
    accessKey,
    secretKey,
    payload: {
      Id: assetId,
      ProjectName: projectName,
    },
  });
  const asset = result?.Asset || result?.AssetItem || result;
  const id = asset?.Id || asset?.AssetId || assetId;
  const groupId = asset?.GroupId || asset?.AssetGroupId || "";
  return {
    assetId: id,
    groupId,
    assetUri: `asset://${id}`,
    status: asset?.Status || "Processing",
    failedReason: asset?.FailedReason || asset?.Reason || asset?.Message,
    name: asset?.Name,
    url: asset?.URL || asset?.Url,
  };
};

export const onRequestOptions = async () =>
  new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });

const assertAssetOwnership = async (env: Env, userId: string, projectId: string, assetId: string) => {
  const row = await env.DB.prepare(
    "SELECT asset_id FROM user_seedance_assets WHERE user_id = ?1 AND project_id = ?2 AND asset_id = ?3"
  )
    .bind(userId, projectId, assetId)
    .first();
  if (!row) throw new Response("Seedance asset not found", { status: 404 });
};

const resolveAuthorizedGroupId = async (
  env: Env,
  userId: string,
  projectId: string,
  requestedGroupId: string
) => {
  if (!requestedGroupId) return undefined;
  const { defaultGroupId } = resolveAccess(env);
  if (requestedGroupId === defaultGroupId) return requestedGroupId;
  const row = await env.DB.prepare(
    "SELECT group_id FROM user_seedance_assets WHERE user_id = ?1 AND project_id = ?2 AND group_id = ?3 LIMIT 1"
  )
    .bind(userId, projectId, requestedGroupId)
    .first();
  if (!row) throw new Response("Seedance asset group is not owned by this user", { status: 403 });
  return requestedGroupId;
};

const recordAssetOwnership = async (
  env: Env,
  userId: string,
  projectId: string,
  asset: { assetId: string; groupId?: string }
) => {
  await env.DB.prepare(
    `INSERT INTO user_seedance_assets (user_id, project_id, asset_id, group_id, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(user_id, project_id, asset_id)
     DO UPDATE SET group_id = excluded.group_id`
  )
    .bind(userId, projectId, asset.assetId, asset.groupId || null, Date.now())
    .run();
};

const withCors = (response: Response) => {
  const headers = new Headers(response.headers);
  Object.entries(CORS_HEADERS).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const onRequestPost = async ({ request, env }: PagesContext<Env>) => {
  try {
    const userId = await getUserId(request, env);
    await enforceRateLimit({
      db: env.DB,
      namespace: "seedance-assets",
      subject: userId,
      limit: 30,
      windowSeconds: 60,
    });
    const payload = await readJsonRequest<Record<string, unknown>>(request, MAX_REQUEST_BYTES);
    const action = normalizeText(payload?.action);
    const projectId = normalizeProjectId(payload?.projectId);
    if (!projectId) return new Response("projectId required", { status: 400, headers: CORS_HEADERS });
    if (action === "create") {
      const requestedGroupId = normalizeText(payload.groupId);
      const authorizedGroupId = await resolveAuthorizedGroupId(env, userId, projectId, requestedGroupId);
      const asset = await createAsset(payload, env, authorizedGroupId);
      await recordAssetOwnership(env, userId, projectId, asset);
      return Response.json(asset, { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
    }
    if (action === "get") {
      const assetId = normalizeText(payload.assetId);
      await assertAssetOwnership(env, userId, projectId, assetId);
      return Response.json(await getAsset(payload, env), {
        headers: { ...CORS_HEADERS, "Cache-Control": "no-store" },
      });
    }
    return new Response("Unsupported seedance-assets action", {
      status: 400,
      headers: CORS_HEADERS,
    });
  } catch (error) {
    if (error instanceof Response) return withCors(error);
    console.error("[Seedance Assets] Request failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return jsonResponse(
      { error: "Seedance Assets API request failed" },
      { status: 502, headers: CORS_HEADERS }
    );
  }
};
