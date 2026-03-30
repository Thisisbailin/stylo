import { QWEN_RESPONSES_BASE_URL } from "../../constants";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

const resolveBaseUrl = (raw?: string | null) =>
  (raw || QWEN_RESPONSES_BASE_URL).trim().replace(/\/+$/, "");

const resolveModelsEndpoint = (baseUrl: string) => {
  if (baseUrl.includes("/api/v2/apps/protocols/compatible-mode/v1")) {
    return `${baseUrl.replace(/\/api\/v2\/apps\/protocols\/compatible-mode\/v1(?:\/responses|\/models)?$/, "/compatible-mode/v1")}/models`;
  }
  if (baseUrl.endsWith("/responses")) return baseUrl.replace(/\/responses$/, "/models");
  if (baseUrl.endsWith("/models")) return baseUrl;
  return `${baseUrl}/models`;
};

export const onRequestOptions = async () =>
  new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });

export const onRequestGet = async (context: any) => {
  const apiKey =
    typeof context.env?.QWEN_API_KEY === "string"
      ? context.env.QWEN_API_KEY.trim()
      : typeof context.env?.DASHSCOPE_API_KEY === "string"
        ? context.env.DASHSCOPE_API_KEY.trim()
        : typeof context.env?.OPENAI_API_KEY === "string"
          ? context.env.OPENAI_API_KEY.trim()
          : "";
  if (!apiKey) {
    return new Response("Pages Functions 未配置 QWEN_API_KEY / DASHSCOPE_API_KEY。", {
      status: 500,
      headers: CORS_HEADERS,
    });
  }

  const requestUrl = new URL(context.request.url);
  const targetUrl = resolveModelsEndpoint(resolveBaseUrl(requestUrl.searchParams.get("baseUrl")));

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
    return new Response(`Qwen models proxy error: ${error?.message || "unknown error"}`, {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
