import { SEEDANCE_DEFAULT_BASE_URL } from "../../../constants";
import { getUserId, jsonResponse } from "../_auth";
import { enforceRateLimit } from "../_rateLimit";
import { readJsonRequest } from "../_request";
import type { D1DatabaseLike, PagesContext } from "../_types";

type Env = Record<string, unknown> & {
  DB: D1DatabaseLike;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
};

const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const ALLOWED_PATH = /^\/contents\/generations\/tasks(?:\/[A-Za-z0-9._-]{1,256})?$/;

const withCors = (response: Response) => {
  const headers = new Headers(response.headers);
  Object.entries(CORS_HEADERS).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const onRequest = async ({ request, env }: PagesContext<Env>) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const userId = await getUserId(request, env);
    await enforceRateLimit({
      db: env.DB,
      namespace: "seedance",
      subject: userId,
      limit: 30,
      windowSeconds: 60,
    });

    const apiKey = typeof env.ARK_API_KEY === "string" ? env.ARK_API_KEY.trim() : "";
    if (!apiKey) {
      return new Response("Pages Functions 未配置 ARK_API_KEY。", {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    const requestUrl = new URL(request.url);
    const requestPath = requestUrl.pathname.replace(/^\/api\/seedance/, "") || "";
    if (!ALLOWED_PATH.test(requestPath)) {
      return new Response("Seedance path is not allowed", { status: 403, headers: CORS_HEADERS });
    }

    requestUrl.searchParams.delete("baseUrl");
    const query = requestUrl.searchParams.toString();
    const targetUrl = `${SEEDANCE_DEFAULT_BASE_URL}${requestPath}${query ? `?${query}` : ""}`;
    const body = request.method === "POST"
      ? JSON.stringify(await readJsonRequest<unknown>(request, MAX_REQUEST_BYTES))
      : undefined;
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      return jsonResponse({ error: "Seedance redirected unexpectedly" }, { status: 502, headers: CORS_HEADERS });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Response) return withCors(error);
    console.error("[Seedance] Request failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return jsonResponse({ error: "Seedance proxy request failed" }, { status: 502, headers: CORS_HEADERS });
  }
};
