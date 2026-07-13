const CREDENTIAL_PROTOCOL_PREFIX = "stylo-auth.";
const LEGACY_CREDENTIAL_PROTOCOL_PREFIX = "qalam-auth.";

const toBase64Url = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return "";
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
};

export const encodeWebSocketCredential = (credential: string) =>
  `${CREDENTIAL_PROTOCOL_PREFIX}${toBase64Url(credential)}`;

export const readWebSocketCredential = (protocolHeader: string | null) => {
  const protocol = (protocolHeader || "")
    .split(",")
    .map((value) => value.trim())
    .find((value) =>
      value.startsWith(CREDENTIAL_PROTOCOL_PREFIX) ||
      value.startsWith(LEGACY_CREDENTIAL_PROTOCOL_PREFIX)
    );
  if (!protocol) return "";
  const prefix = protocol.startsWith(CREDENTIAL_PROTOCOL_PREFIX)
    ? CREDENTIAL_PROTOCOL_PREFIX
    : LEGACY_CREDENTIAL_PROTOCOL_PREFIX;
  return fromBase64Url(protocol.slice(prefix.length)).trim();
};
