import { verifyToken } from "@clerk/backend";

type EnvWithClerk = {
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
};

export const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export const jsonResponse = (body: unknown, init: ResponseInit = {}) => {
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

const extractBearerToken = (authHeader: string) =>
  authHeader.match(
    /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i
  )?.[1] || "";

export const getUserId = async (
  request: Request,
  env: EnvWithClerk,
  authorizationHeader = "authorization"
) => {
  const authHeader = request.headers.get(authorizationHeader) || "";
  const token = extractBearerToken(authHeader);

  const rawSecret = typeof env.CLERK_SECRET_KEY === "string" ? env.CLERK_SECRET_KEY : "";
  const rawJwtKey = typeof env.CLERK_JWT_KEY === "string" ? env.CLERK_JWT_KEY : "";
  const asciiCleaned = rawSecret.replace(/[^\x20-\x7E]/g, "");
  const secretKey = stripOuterQuotes(asciiCleaned.replace(/\s+/g, ""));
  const jwtKey = normalizeJwtKey(rawJwtKey);

  if (!secretKey && !jwtKey) {
    throw new Response("Missing CLERK_SECRET_KEY on server", { status: 500 });
  }
  if (!token) {
    throw new Response(JSON.stringify({ error: "Unauthorized", detail: "Missing bearer token" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const attempts = [
    ...(jwtKey ? [{ jwtKey }] : []),
    ...(secretKey ? [{ secretKey }] : []),
  ];
  for (const options of attempts) {
    try {
      const payload = await verifyToken(token, options);
      if (payload?.sub) return payload.sub;
    } catch {
      // Try the next configured verification method.
    }
  }

  throw new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: JSON_HEADERS,
  });
};
