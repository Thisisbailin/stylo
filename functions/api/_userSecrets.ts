import { jsonResponse } from "./_auth";
import {
  decryptSecretEnvelope,
  encryptSecretEnvelope,
  importSecretsEncryptionKey,
  isSecretCipherEnvelope,
  looksLikeSecretCipherEnvelope,
} from "./_secretCrypto";

export const USER_SECRET_KEYS = ["textApiKey", "multiApiKey", "videoApiKey"] as const;
export const MAX_USER_SECRET_LENGTH = 4096;
export const MAX_SECRET_OP_ID_LENGTH = 128;

export type UserSecretKey = (typeof USER_SECRET_KEYS)[number];

export type UserSecretsPayload = {
  textApiKey?: string;
  multiApiKey?: string;
  videoApiKey?: string;
};

export type UserSecretsMeta = {
  lastOpId?: string;
};

type StoredSecretsPlaintext = {
  secrets: UserSecretsPayload;
  meta: UserSecretsMeta;
};

export type StoredUserSecretsRecord = StoredSecretsPlaintext & {
  updatedAt: number;
  exists: boolean;
};

export class UserSecretsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserSecretsValidationError";
  }
}

export const SECRET_RESPONSE_HEADERS = {
  "cache-control": "no-store",
  pragma: "no-cache",
} as const;

export const secretJsonResponse = (body: unknown, init: ResponseInit = {}) => {
  const suppliedHeaders = Object.fromEntries(new Headers(init.headers).entries());
  return jsonResponse(body, {
    ...init,
    headers: {
      ...suppliedHeaders,
      ...SECRET_RESPONSE_HEADERS,
    },
  });
};

export const withSecretResponseHeaders = (response: Response) => {
  const headers = new Headers(response.headers);
  Object.entries(SECRET_RESPONSE_HEADERS).forEach(([name, value]) => headers.set(name, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

type EnvWithDb = {
  DB: any;
  SECRETS_ENCRYPTION_KEY?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const requireEncryptionKey = async (env: EnvWithDb) => {
  const encodedKey = typeof env.SECRETS_ENCRYPTION_KEY === "string"
    ? env.SECRETS_ENCRYPTION_KEY.trim()
    : "";
  if (!encodedKey) {
    throw new Error("SECRETS_ENCRYPTION_KEY is required to process user secrets");
  }
  await importSecretsEncryptionKey(encodedKey);
  return encodedKey;
};

export const normalizeUserSecretsPayload = (
  value: unknown,
  options: { rejectUnknown?: boolean } = { rejectUnknown: true }
): UserSecretsPayload => {
  if (!isRecord(value)) throw new UserSecretsValidationError("secrets must be an object");
  const allowedKeys = new Set<string>(USER_SECRET_KEYS);
  if (options.rejectUnknown !== false) {
    const unknownKey = Object.keys(value).find((key) => !allowedKeys.has(key));
    if (unknownKey) throw new UserSecretsValidationError(`Unsupported secret key: ${unknownKey}`);
  }

  const normalized: UserSecretsPayload = {};
  for (const key of USER_SECRET_KEYS) {
    const item = value[key];
    if (item === undefined) continue;
    if (typeof item !== "string") {
      throw new UserSecretsValidationError(`${key} must be a string`);
    }
    const trimmed = item.trim();
    if (trimmed.length > MAX_USER_SECRET_LENGTH) {
      throw new UserSecretsValidationError(
        `${key} exceeds the ${MAX_USER_SECRET_LENGTH} character limit`
      );
    }
    normalized[key] = trimmed;
  }
  return normalized;
};

export const normalizeSecretOpId = (value: unknown, maxLength = MAX_SECRET_OP_ID_LENGTH) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new UserSecretsValidationError("opId must be a string");
  const normalized = value.trim();
  if (!normalized) throw new UserSecretsValidationError("opId must not be empty");
  if (normalized.length > maxLength) {
    throw new UserSecretsValidationError(
      `opId exceeds the ${maxLength} character limit`
    );
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new UserSecretsValidationError("opId contains unsupported characters");
  }
  return normalized;
};

const normalizeStoredMeta = (value: unknown): UserSecretsMeta => {
  if (!isRecord(value)) return {};
  return typeof value.lastOpId === "string" && value.lastOpId
    ? { lastOpId: value.lastOpId }
    : {};
};

export const unwrapStoredSecrets = (stored: unknown): StoredSecretsPlaintext => {
  if (!isRecord(stored)) throw new Error("Stored user secrets are malformed");
  const secretsValue = "secrets" in stored ? stored.secrets : stored;
  return {
    secrets: normalizeUserSecretsPayload(secretsValue, { rejectUnknown: false }),
    meta: "secrets" in stored ? normalizeStoredMeta(stored.meta) : {},
  };
};

const normalizeStoredVersion = (value: unknown) => {
  const version = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error("Stored user secrets version is invalid");
  }
  return version;
};

const encryptStoredSecrets = async (
  env: EnvWithDb,
  userId: string,
  plaintext: StoredSecretsPlaintext,
  encodedKey?: string
) => {
  const encryptionKey = encodedKey || await requireEncryptionKey(env);
  return JSON.stringify(await encryptSecretEnvelope(plaintext, userId, encryptionKey));
};

const readStoredUserSecretsInternal = async (
  env: EnvWithDb,
  userId: string,
  migrationAttempt: number
): Promise<StoredUserSecretsRecord> => {
  const encryptionKey = await requireEncryptionKey(env);
  const row = await env.DB.prepare(
    "SELECT data, updated_at FROM user_secrets WHERE user_id = ?1"
  )
    .bind(userId)
    .first();
  if (!row) return { secrets: {}, meta: {}, updatedAt: 0, exists: false };

  const rawData = String(row.data || "");
  const updatedAt = normalizeStoredVersion(row.updated_at);
  let stored: unknown;
  try {
    stored = JSON.parse(rawData);
  } catch {
    throw new Error("Stored user secrets are malformed");
  }

  if (isSecretCipherEnvelope(stored)) {
    const plaintext = await decryptSecretEnvelope<StoredSecretsPlaintext>(
      stored,
      userId,
      encryptionKey
    );
    const normalized = unwrapStoredSecrets(plaintext);
    return { ...normalized, updatedAt, exists: true };
  }
  if (looksLikeSecretCipherEnvelope(stored)) {
    throw new Error("Stored user secrets envelope is unsupported or malformed");
  }

  const legacyPlaintext = unwrapStoredSecrets(stored);
  const encryptedData = await encryptStoredSecrets(env, userId, legacyPlaintext, encryptionKey);
  const migration = await env.DB.prepare(
    "UPDATE user_secrets SET data = ?2 WHERE user_id = ?1 AND updated_at = ?3 AND data = ?4"
  )
    .bind(userId, encryptedData, updatedAt, rawData)
    .run();
  const changes = Number(migration?.meta?.changes ?? migration?.changes ?? 0);
  if (changes > 0) return { ...legacyPlaintext, updatedAt, exists: true };
  if (migrationAttempt >= 2) {
    throw new Error("Unable to migrate user secrets after concurrent writes");
  }
  return readStoredUserSecretsInternal(env, userId, migrationAttempt + 1);
};

export const readStoredUserSecrets = async (
  env: EnvWithDb,
  userId: string
): Promise<StoredUserSecretsRecord> => readStoredUserSecretsInternal(env, userId, 0);

export const readUserSecrets = async (env: EnvWithDb, userId: string) => {
  const record = await readStoredUserSecrets(env, userId);
  return { secrets: record.secrets, updatedAt: record.updatedAt };
};

type CompareAndSetUserSecretsOptions = {
  expectedUpdatedAt: number | null;
  meta?: UserSecretsMeta;
};

export const compareAndSetUserSecrets = async (
  env: EnvWithDb,
  userId: string,
  secrets: UserSecretsPayload,
  options: CompareAndSetUserSecretsOptions
): Promise<{ ok: true; updatedAt: number } | { ok: false }> => {
  const normalizedSecrets = normalizeUserSecretsPayload(secrets);
  const normalizedMeta: UserSecretsMeta = {
    lastOpId: normalizeSecretOpId(options.meta?.lastOpId, 256),
  };
  const expectedUpdatedAt = options.expectedUpdatedAt;
  if (expectedUpdatedAt !== null && (!Number.isSafeInteger(expectedUpdatedAt) || expectedUpdatedAt < 0)) {
    throw new Error("Expected user secrets version is invalid");
  }
  const updatedAt = Math.max(Date.now(), (expectedUpdatedAt ?? 0) + 1);
  const serialized = await encryptStoredSecrets(env, userId, {
    secrets: normalizedSecrets,
    meta: normalizedMeta,
  });
  const result =
    expectedUpdatedAt === null
      ? await env.DB.prepare(
          "INSERT INTO user_secrets (user_id, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO NOTHING"
        )
          .bind(userId, serialized, updatedAt)
          .run()
      : await env.DB.prepare(
          "UPDATE user_secrets SET data = ?2, updated_at = ?3 WHERE user_id = ?1 AND updated_at = ?4"
        )
          .bind(userId, serialized, updatedAt, expectedUpdatedAt)
          .run();
  const changes = Number(result?.meta?.changes ?? result?.changes ?? 0);
  return changes > 0 ? { ok: true, updatedAt } : { ok: false };
};

export const writeUserSecrets = async (
  env: EnvWithDb,
  userId: string,
  secrets: UserSecretsPayload,
  meta?: UserSecretsMeta
) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readStoredUserSecrets(env, userId);
    const result = await compareAndSetUserSecrets(env, userId, secrets, {
      expectedUpdatedAt: current.exists ? current.updatedAt : null,
      meta,
    });
    if (result.ok) return result.updatedAt;
  }
  throw new Error("Failed to update user secrets after concurrent writes");
};
