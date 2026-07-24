import {
  AccountApiSession,
  parseJsonResponse,
  requireOkResponse,
} from "./authenticatedFetch";
import type { SyncCodec } from "./realtimeSyncTypes";

export type SecretsPayload = {
  textApiKey: string;
  multiApiKey: string;
  videoApiKey: string;
};

type SecretsResponse = {
  ok?: boolean;
  secrets?: Partial<SecretsPayload>;
  updatedAt?: number;
};

export const normalizeSecretsPayload = (value: Partial<SecretsPayload> | null | undefined): SecretsPayload => ({
  textApiKey: typeof value?.textApiKey === "string" ? value.textApiKey : "",
  multiApiKey: typeof value?.multiApiKey === "string" ? value.multiApiKey : "",
  videoApiKey: typeof value?.videoApiKey === "string" ? value.videoApiKey : "",
});

const serializeSecrets = (value: SecretsPayload) => JSON.stringify(normalizeSecretsPayload(value));

export const secretsSyncCodec: SyncCodec<SecretsPayload> = {
  snapshot(value) {
    return normalizeSecretsPayload(value);
  },
  fingerprint: serializeSecrets,
  validate() {
    return null;
  },
  isEmpty(value) {
    return !value.textApiKey && !value.multiApiKey && !value.videoApiKey;
  },
};

export type SecretsSnapshot = {
  value: SecretsPayload;
  version: number;
};

export const loadSecretsSnapshot = async (
  session: AccountApiSession,
  signal: AbortSignal,
): Promise<SecretsSnapshot | null> => {
  const response = await session.request("/api/secrets", {}, signal);
  if (response.status === 404) return null;
  await requireOkResponse(response, "加载云端密钥失败");
  const payload = await parseJsonResponse<SecretsResponse>(response, "加载云端密钥失败");
  if (typeof payload.updatedAt !== "number") {
    throw new Error("云端密钥响应缺少 updatedAt。");
  }
  return {
    value: normalizeSecretsPayload(payload.secrets),
    version: payload.updatedAt,
  };
};

export const saveSecretsSnapshot = async (
  session: AccountApiSession,
  value: SecretsPayload,
  baseVersion: number,
  operationId: string,
  signal: AbortSignal,
): Promise<{ kind: "saved"; version: number } | { kind: "changed"; remote: SecretsSnapshot }> => {
  const response = await session.request("/api/secrets", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "if-match": String(baseVersion),
    },
    body: JSON.stringify({
      secrets: value,
      updatedAt: baseVersion,
      opId: operationId,
    }),
  }, signal);

  if (response.status === 409) {
    await response.body?.cancel().catch(() => undefined);
    const remote = await loadSecretsSnapshot(session, signal);
    if (!remote) throw new Error("账户设置更新后无法读取最新状态。");
    return { kind: "changed", remote };
  }

  await requireOkResponse(response, "保存云端密钥失败");
  const payload = await parseJsonResponse<SecretsResponse>(response, "保存云端密钥失败");
  if (payload.ok !== true || typeof payload.updatedAt !== "number") {
    throw new Error("云端密钥保存响应缺少确认版本号。");
  }
  return { kind: "saved", version: payload.updatedAt };
};
