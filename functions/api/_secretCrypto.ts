const SECRET_KEY_BYTES = 32;
const SECRET_IV_BYTES = 12;
const AES_GCM_TAG_BITS = 128;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export const SECRET_ENVELOPE_VERSION = 1 as const;
export const SECRET_ENVELOPE_ALGORITHM = "AES-256-GCM" as const;

export type SecretCipherEnvelope = {
  version: typeof SECRET_ENVELOPE_VERSION;
  algorithm: typeof SECRET_ENVELOPE_ALGORITHM;
  iv: string;
  ciphertext: string;
};

const getWebCrypto = () => {
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.subtle || typeof webCrypto.getRandomValues !== "function") {
    throw new Error("Web Crypto is unavailable; refusing to process encrypted secrets");
  }
  return webCrypto;
};

const decodeHex = (value: string) => {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) return null;
  const bytes = new Uint8Array(SECRET_KEY_BYTES);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

const decodeBase64 = (value: string) => {
  const paddingIndex = value.indexOf("=");
  if (paddingIndex >= 0 && !/^={1,2}$/.test(value.slice(paddingIndex))) return null;
  const unpadded = (paddingIndex >= 0 ? value.slice(0, paddingIndex) : value)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (!unpadded || !/^[A-Za-z0-9+/]+$/.test(unpadded) || unpadded.length % 4 === 1) return null;
  const padded = unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
};

const decodeEncryptionKey = (encodedKey: string) => {
  const normalized = typeof encodedKey === "string" ? encodedKey.trim() : "";
  const bytes = decodeHex(normalized) || decodeBase64(normalized);
  if (!bytes || bytes.byteLength !== SECRET_KEY_BYTES) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY must be exactly 32 bytes encoded as hex, base64, or base64url"
    );
  }
  return bytes;
};

const encodeBase64Url = (value: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    binary += String.fromCharCode(...value.subarray(offset, offset + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const decodeBase64Url = (value: string, label: string) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`Secret envelope ${label} is malformed`);
  }
  const decoded = decodeBase64(value);
  if (!decoded) throw new Error(`Secret envelope ${label} is malformed`);
  return decoded;
};

const encodeAdditionalData = (userId: string) => {
  if (typeof userId !== "string" || !userId) {
    throw new Error("A non-empty userId is required to process encrypted secrets");
  }
  return encoder.encode(userId);
};

export const importSecretsEncryptionKey = async (encodedKey: string) => {
  const webCrypto = getWebCrypto();
  return webCrypto.subtle.importKey(
    "raw",
    decodeEncryptionKey(encodedKey),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
};

export const isSecretCipherEnvelope = (value: unknown): value is SecretCipherEnvelope => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  return (
    envelope.version === SECRET_ENVELOPE_VERSION &&
    envelope.algorithm === SECRET_ENVELOPE_ALGORITHM &&
    typeof envelope.iv === "string" &&
    typeof envelope.ciphertext === "string"
  );
};

export const looksLikeSecretCipherEnvelope = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  return ["version", "algorithm", "iv", "ciphertext"].some((key) => key in envelope);
};

export const encryptSecretEnvelope = async <T>(
  value: T,
  userId: string,
  encodedKey: string
): Promise<SecretCipherEnvelope> => {
  const webCrypto = getWebCrypto();
  const key = await importSecretsEncryptionKey(encodedKey);
  const iv = webCrypto.getRandomValues(new Uint8Array(SECRET_IV_BYTES));
  const plaintext = encoder.encode(JSON.stringify(value));
  const encrypted = await webCrypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encodeAdditionalData(userId),
      tagLength: AES_GCM_TAG_BITS,
    },
    key,
    plaintext
  );
  return {
    version: SECRET_ENVELOPE_VERSION,
    algorithm: SECRET_ENVELOPE_ALGORITHM,
    iv: encodeBase64Url(iv),
    ciphertext: encodeBase64Url(new Uint8Array(encrypted)),
  };
};

export const decryptSecretEnvelope = async <T>(
  envelope: SecretCipherEnvelope,
  userId: string,
  encodedKey: string
): Promise<T> => {
  if (!isSecretCipherEnvelope(envelope)) {
    throw new Error("Secret envelope version or algorithm is unsupported");
  }
  const iv = decodeBase64Url(envelope.iv, "iv");
  const ciphertext = decodeBase64Url(envelope.ciphertext, "ciphertext");
  if (iv.byteLength !== SECRET_IV_BYTES || ciphertext.byteLength <= AES_GCM_TAG_BITS / 8) {
    throw new Error("Secret envelope is malformed");
  }
  try {
    const webCrypto = getWebCrypto();
    const key = await importSecretsEncryptionKey(encodedKey);
    const decrypted = await webCrypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: encodeAdditionalData(userId),
        tagLength: AES_GCM_TAG_BITS,
      },
      key,
      ciphertext
    );
    return JSON.parse(decoder.decode(decrypted)) as T;
  } catch {
    throw new Error("Secret envelope authentication failed");
  }
};
