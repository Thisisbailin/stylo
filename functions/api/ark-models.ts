import { ARK_RESPONSES_BASE_URL } from "../../constants";
import { getUserId } from "./_auth";
import { enforceRateLimit } from "./_rateLimit";
import type { D1DatabaseLike, PagesContext } from "./_types";

type Env = Record<string, unknown> & {
  DB: D1DatabaseLike;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
};

export const onRequestOptions = async () =>
  new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });

export const onRequestGet = async (context: PagesContext<Env>) => {
  try {
    const userId = await getUserId(context.request, context.env);
    await enforceRateLimit({
      db: context.env.DB,
      namespace: "ark-models",
      subject: userId,
      limit: 30,
      windowSeconds: 60,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  const apiKey = typeof context.env?.ARK_API_KEY === "string" ? context.env.ARK_API_KEY.trim() : "";
  if (!apiKey) {
    return new Response("Pages Functions 未配置 ARK_API_KEY。", {
      status: 500,
      headers: CORS_HEADERS,
    });
  }

  const targetUrl = `${ARK_RESPONSES_BASE_URL}/models`;

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      return new Response("Ark models endpoint redirected unexpectedly", {
        status: 502,
        headers: CORS_HEADERS,
      });
    }
    const responseHeaders = new Headers({
      ...CORS_HEADERS,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("Ark models proxy failed", error);
    return new Response("Ark models proxy failed", {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
