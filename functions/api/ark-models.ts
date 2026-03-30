import { ARK_RESPONSES_BASE_URL } from "../../constants";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

const resolveBaseUrl = (raw?: string | null) =>
  (raw || ARK_RESPONSES_BASE_URL).trim().replace(/\/+$/, "");

export const onRequestOptions = async () =>
  new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });

export const onRequestGet = async (context: any) => {
  const apiKey = typeof context.env?.ARK_API_KEY === "string" ? context.env.ARK_API_KEY.trim() : "";
  if (!apiKey) {
    return new Response("Pages Functions 未配置 ARK_API_KEY。", {
      status: 500,
      headers: CORS_HEADERS,
    });
  }

  const requestUrl = new URL(context.request.url);
  const baseUrl = resolveBaseUrl(requestUrl.searchParams.get("baseUrl"));
  const targetUrl = `${baseUrl}/models`;

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    return new Response(`Ark models proxy error: ${error?.message || "unknown error"}`, {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
