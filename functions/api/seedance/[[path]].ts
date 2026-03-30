import { SEEDANCE_DEFAULT_BASE_URL } from "../../../constants";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

const resolveBaseUrl = (value?: string | null) =>
  (value || SEEDANCE_DEFAULT_BASE_URL).trim().replace(/\/+$/, "");

export const onRequest = async (context: any) => {
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  const apiKey = typeof context.env?.ARK_API_KEY === "string" ? context.env.ARK_API_KEY.trim() : "";
  if (!apiKey) {
    return new Response("Pages Functions 未配置 ARK_API_KEY。", {
      status: 500,
      headers: CORS_HEADERS,
    });
  }

  const requestUrl = new URL(context.request.url);
  const baseUrl = resolveBaseUrl(requestUrl.searchParams.get("baseUrl"));
  requestUrl.searchParams.delete("baseUrl");
  const requestPath = requestUrl.pathname.replace(/^\/api\/seedance/, "") || "";
  const query = requestUrl.searchParams.toString();
  const normalizedTargetUrl = `${baseUrl}${requestPath}${query ? `?${query}` : ""}`;

  try {
    const headers = new Headers(context.request.headers);
    headers.delete("host");
    headers.delete("content-length");
    headers.delete("cf-connecting-ip");
    headers.delete("cf-ipcountry");
    headers.delete("cf-ray");
    headers.delete("cf-visitor");
    headers.delete("x-real-ip");
    headers.delete("x-forwarded-for");
    headers.delete("authorization");
    headers.set("Authorization", `Bearer ${apiKey}`);

    const body =
      context.request.method !== "GET" && context.request.method !== "HEAD"
        ? await context.request.arrayBuffer()
        : null;

    const response = await fetch(normalizedTargetUrl, {
      method: context.request.method,
      headers,
      body,
      redirect: "follow",
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    return new Response(`Seedance proxy error: ${error?.message || "unknown error"}`, {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
