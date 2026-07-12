const textEncoder = new TextEncoder();

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)])
  );
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const normalizeOperationId = (value: unknown, maxLength = 128) => {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    return "";
  }
  return normalized;
};

/** Binds an idempotency key to one operation kind and canonical payload. */
export const bindOperationId = async (kind: string, operationId: string, payload: unknown) => {
  const canonicalPayload = JSON.stringify(canonicalize(payload));
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(canonicalPayload));
  return `${kind}:${operationId}:${toHex(new Uint8Array(digest))}`;
};
