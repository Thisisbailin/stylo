import type {
  SeedanceTaskCreateParams,
  SeedanceTaskStatusResult,
  SeedanceTaskSubmissionResult,
  VideoServiceConfig,
} from "../types";
import { SEEDANCE_DEFAULT_BASE_URL } from "../constants";
import { wrapWithProxy } from "../utils/api";

const resolveApiKey = (config?: VideoServiceConfig) => {
  const envKey =
    (typeof import.meta !== "undefined"
      ? ((import.meta as any).env?.ARK_API_KEY ||
        (import.meta as any).env?.VITE_ARK_API_KEY ||
        (import.meta as any).env?.VIDEO_API_KEY ||
        (import.meta as any).env?.VITE_VIDEO_API_KEY)
      : undefined) ||
    (typeof process !== "undefined"
      ? (process.env?.ARK_API_KEY ||
        process.env?.VITE_ARK_API_KEY ||
        process.env?.VIDEO_API_KEY ||
        process.env?.VITE_VIDEO_API_KEY)
      : undefined);
  return (config?.apiKey || envKey || "").trim();
};

const resolveBaseUrl = (config?: VideoServiceConfig) =>
  (config?.baseUrl || SEEDANCE_DEFAULT_BASE_URL).replace(/\/+$/, "");

const mapStatus = (value?: string): SeedanceTaskStatusResult["status"] => {
  const normalized = (value || "").toLowerCase();
  if (["succeeded", "success", "completed", "finished"].includes(normalized)) return "succeeded";
  if (["failed", "error", "canceled", "cancelled"].includes(normalized)) return "failed";
  if (["queued", "pending", "submitted", "created"].includes(normalized)) return "queued";
  return "processing";
};

const extractVideoUrl = (payload: any): string | undefined => {
  if (!payload || typeof payload !== "object") return undefined;

  const direct =
    payload.video_url ||
    payload.url ||
    payload.file_url ||
    payload.output_url ||
    payload.media_url;
  if (typeof direct === "string" && direct.trim()) return direct;

  const output = payload.output || payload.result || payload.data;
  if (output && output !== payload) {
    const nested = extractVideoUrl(output);
    if (nested) return nested;
  }

  if (Array.isArray(payload.content)) {
    for (const item of payload.content) {
      const url =
        item?.video_url?.url ||
        item?.video_url ||
        item?.url ||
        item?.file_url;
      if (typeof url === "string" && url.trim()) return url;
    }
  }

  if (Array.isArray(payload.results)) {
    for (const item of payload.results) {
      const url = extractVideoUrl(item);
      if (url) return url;
    }
  }

  return undefined;
};

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Seedance API Error ${response.status}: ${text}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Seedance 返回了无法解析的 JSON: ${text}`);
  }
};

export const createSeedanceTask = async (
  params: SeedanceTaskCreateParams,
  config?: VideoServiceConfig
): Promise<SeedanceTaskSubmissionResult> => {
  const apiKey = resolveApiKey(config);
  if (!apiKey) {
    throw new Error("Missing ARK API key. 请配置 ARK_API_KEY / VITE_ARK_API_KEY 或 Video API Key。");
  }

  const baseUrl = resolveBaseUrl(config);
  const response = await fetch(wrapWithProxy(`${baseUrl}/contents/generations/tasks`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      content: params.content,
      generate_audio: params.generateAudio ?? true,
      resolution: params.resolution || "720p",
      ratio: params.ratio || "adaptive",
      duration: params.duration ?? 5,
      watermark: params.watermark ?? false,
      ...(params.useWebSearch ? { tools: [{ type: "web_search" }] } : {}),
    }),
  });

  const data = await parseJson(response);
  const id = data?.id || data?.task_id || data?.output?.task_id;
  if (!id) {
    throw new Error("Seedance 未返回任务 ID。");
  }
  return {
    id,
    status: data?.status || data?.output?.status,
  };
};

export const getSeedanceTask = async (
  taskId: string,
  config?: VideoServiceConfig
): Promise<SeedanceTaskStatusResult> => {
  const apiKey = resolveApiKey(config);
  if (!apiKey) {
    throw new Error("Missing ARK API key. 请配置 ARK_API_KEY / VITE_ARK_API_KEY 或 Video API Key。");
  }

  const baseUrl = resolveBaseUrl(config);
  const response = await fetch(wrapWithProxy(`${baseUrl}/contents/generations/tasks/${taskId}`), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const data = await parseJson(response);
  const statusRaw = data?.status || data?.output?.status || data?.task_status;
  return {
    id: data?.id || taskId,
    status: mapStatus(statusRaw),
    url: extractVideoUrl(data),
    ratio: data?.ratio || data?.output?.ratio,
    duration: data?.duration || data?.output?.duration,
    errorMsg:
      data?.error?.message ||
      data?.error ||
      data?.output?.error ||
      data?.message,
  };
};
