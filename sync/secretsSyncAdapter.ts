import {
  AccountApiSession,
  parseJsonResponse,
  requireOkResponse,
} from "./authenticatedFetch";
import type {
  VersionedSaveResult,
  VersionedSyncCodec,
  VersionedSyncTransport,
} from "./versionedSyncEngine";

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

export const secretsSyncCodec: VersionedSyncCodec<SecretsPayload> = {
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

export const createSecretsSyncTransport = (
  session: AccountApiSession
): VersionedSyncTransport<SecretsPayload> => {
  const load = async (signal: AbortSignal) => {
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

  return {
    load,
    async save(request, signal): Promise<VersionedSaveResult<SecretsPayload>> {
      const response = await session.request("/api/secrets", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "if-match": String(request.baseVersion),
        },
        body: JSON.stringify({
          secrets: request.value,
          updatedAt: request.baseVersion,
          opId: request.operationId,
        }),
      }, signal);

      if (response.status === 409) {
        await response.body?.cancel().catch(() => undefined);
        const remote = await load(signal);
        if (!remote) throw new Error("密钥冲突后无法读取云端版本。");
        return { kind: "conflict", remote };
      }

      await requireOkResponse(response, "保存云端密钥失败");
      const payload = await parseJsonResponse<SecretsResponse>(response, "保存云端密钥失败");
      if (payload.ok !== true || typeof payload.updatedAt !== "number") {
        throw new Error("云端密钥保存响应缺少确认版本号。");
      }
      return { kind: "saved", version: payload.updatedAt };
    },
  };
};
