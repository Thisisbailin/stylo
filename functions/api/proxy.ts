import { getUserId, jsonResponse } from "./_auth";
import { enforceRateLimit } from "./_rateLimit";
import type { D1DatabaseLike, PagesContext } from "./_types";

type Env = {
  DB: D1DatabaseLike;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
  CORS_ALLOWED_ORIGINS?: string;
};

const MAX_REQUEST_BYTES = 20 * 1024 * 1024;

const TARGET_POLICIES: ReadonlyArray<{
  hostname: string;
  pathPrefixes?: readonly string[];
  exactPaths?: readonly string[];
}> = [
  { hostname: "dashscope.aliyuncs.com", pathPrefixes: ["/api/"] },
  { hostname: "ark.cn-beijing.volces.com", pathPrefixes: ["/api/v3/"] },
  { hostname: "openrouter.ai", pathPrefixes: ["/api/v1/"] },
  { hostname: "api.deepseek.com", pathPrefixes: ["/v1/"] },
  { hostname: "api.openai.com", pathPrefixes: ["/v1/"] },
  {
    hostname: "api.wuyinkeji.com",
    exactPaths: ["/api/async/image_nanoBanana_pro", "/api/async/detail"],
  },
  { hostname: "api.vidu.cn", pathPrefixes: ["/ent/v2/"] },
  { hostname: "api.vidu.com", pathPrefixes: ["/ent/v2/"] },
];

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "http-referer",
  "x-dashscope-async",
  "x-dashscope-sse",
  "x-title",
] as const;

const parseAllowedOrigins = (request: Request, env: Env) => {
  const allowed = new Set([new URL(request.url).origin]);
  (env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .forEach((origin) => allowed.add(origin));
  return allowed;
};

const buildCorsHeaders = (request: Request, env: Env) => {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": [
      "Accept",
      "Authorization",
      "Content-Type",
      "HTTP-Referer",
      "X-DashScope-Async",
      "X-DashScope-SSE",
      "X-Stylo-Authorization",
      "X-Qalam-Authorization",
      "X-Proxy-Url",
      "X-Title",
    ].join(", "),
    "Access-Control-Expose-Headers": "Retry-After, X-Request-Id",
    Vary: "Origin",
  });
  const origin = request.headers.get("origin");
  if (origin && parseAllowedOrigins(request, env).has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
};

const withCors = (response: Response, request: Request, env: Env) => {
  const headers = new Headers(response.headers);
  buildCorsHeaders(request, env).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const parseTargetUrl = (value: string | null) => {
  if (!value || value.length > 4_096) {
    throw new Response("Missing or oversized proxy target", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(value);
  } catch {
    throw new Response("Invalid proxy target", { status: 400 });
  }

  const policy = TARGET_POLICIES.find(
    (candidate) =>
      candidate.hostname === target.hostname.toLowerCase() &&
      (
        candidate.exactPaths?.includes(target.pathname) ||
        candidate.pathPrefixes?.some((prefix) => target.pathname.startsWith(prefix))
      )
  );
  const hasDefaultPort = !target.port || target.port === "443";
  if (
    target.protocol !== "https:" ||
    !hasDefaultPort ||
    target.username ||
    target.password ||
    target.hash ||
    !policy
  ) {
    throw new Response("Proxy target is not allowed", { status: 403 });
  }
  return target;
};

const readRequestBody = async (request: Request) => {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new Response("Proxy request body is too large", { status: 413 });
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_REQUEST_BYTES) {
    throw new Response("Proxy request body is too large", { status: 413 });
  }
  return body;
};

const buildUpstreamHeaders = (request: Request) => {
  const headers = new Headers();
  FORWARDED_REQUEST_HEADERS.forEach((name) => {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  });
  return headers;
};

const normalizeProviderKey = (value: string) =>
  value.trim().replace(/^(Bearer|Token)\s+/i, "").trim();

const prepareProviderSpecificRequest = (target: URL, headers: Headers) => {
  if (target.hostname !== "api.wuyinkeji.com" || target.searchParams.has("key")) return;
  const authorization = headers.get("authorization");
  if (!authorization) return;
  const key = normalizeProviderKey(authorization);
  if (key) {
    target.searchParams.set("key", key);
    headers.delete("authorization");
  }
};

const buildSafeResponseHeaders = (upstream: Response) => {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const rawContentType = upstream.headers.get("content-type") || "";
  if (/^(application\/(?:json|problem\+json)|text\/event-stream)(?:;|$)/i.test(rawContentType)) {
    headers.set("Content-Type", rawContentType);
  } else if (/^text\/plain(?:;|$)/i.test(rawContentType)) {
    headers.set("Content-Type", "text/plain; charset=utf-8");
  } else {
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Disposition", "attachment");
  }
  for (const name of ["retry-after", "x-request-id", "x-dashscope-request-id"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
};

export const onRequest = async ({ request, env }: PagesContext<Env>) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(request, env) });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return withCors(new Response("Method not allowed", { status: 405 }), request, env);
  }

  try {
    const authHeaderName = request.headers.has("x-stylo-authorization")
      ? "x-stylo-authorization"
      : "x-qalam-authorization";
    const userId = await getUserId(request, env, authHeaderName);
    await enforceRateLimit({
      db: env.DB,
      namespace: "provider-proxy",
      subject: userId,
      limit: 120,
      windowSeconds: 60,
    });
    const target = parseTargetUrl(request.headers.get("x-proxy-url"));
    const headers = buildUpstreamHeaders(request);
    prepareProviderSpecificRequest(target, headers);
    const body = await readRequestBody(request);
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      return withCors(
        jsonResponse({ error: "Upstream redirects are not allowed" }, { status: 502 }),
        request,
        env
      );
    }
    return withCors(
      new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: buildSafeResponseHeaders(upstream),
      }),
      request,
      env
    );
  } catch (error) {
    if (error instanceof Response) return withCors(error, request, env);
    console.error("[Proxy] Upstream request failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return withCors(
      jsonResponse({ error: "Upstream request failed" }, { status: 502 }),
      request,
      env
    );
  }
};
