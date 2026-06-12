import type {
  SeedanceTaskCreateParams,
  SeedanceTaskStatusResult,
  SeedanceTaskSubmissionResult,
  VideoServiceConfig,
} from "../types";
import { SEEDANCE_DEFAULT_BASE_URL } from "../constants";
import { buildApiUrl, wrapWithProxy } from "../utils/api";

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

const buildServerProxyUrl = (path: string, config?: VideoServiceConfig) => {
  const endpoint = buildApiUrl(path);
  const url = new URL(endpoint, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const baseUrl = resolveBaseUrl(config);
  if (baseUrl && baseUrl !== SEEDANCE_DEFAULT_BASE_URL) {
    url.searchParams.set("baseUrl", baseUrl);
  }
  return url.toString();
};

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

const isHumanComplianceMessage = (message?: string) => {
  const normalized = (message || "").toLowerCase();
  return (
    normalized.includes("真人") ||
    normalized.includes("人脸") ||
    normalized.includes("肖像") ||
    normalized.includes("real person") ||
    normalized.includes("human face") ||
    normalized.includes("portrait") ||
    normalized.includes("face") ||
    normalized.includes("deepfake")
  );
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const createSeedanceTask = async (
  params: SeedanceTaskCreateParams,
  config?: VideoServiceConfig
): Promise<SeedanceTaskSubmissionResult> => {
  const apiKey = resolveApiKey(config);
  const baseUrl = resolveBaseUrl(config);
  const response = await fetch(
    apiKey
      ? wrapWithProxy(`${baseUrl}/contents/generations/tasks`)
      : buildServerProxyUrl("/api/seedance/contents/generations/tasks", config),
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
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
    }
  );

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
  const baseUrl = resolveBaseUrl(config);
  const response = await fetch(
    apiKey
      ? wrapWithProxy(`${baseUrl}/contents/generations/tasks/${taskId}`)
      : buildServerProxyUrl(`/api/seedance/contents/generations/tasks/${taskId}`, config),
    {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    }
  );

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

export const checkSeedanceImageHumanCompliance = async (
  imageUrl: string,
  config?: VideoServiceConfig
): Promise<{
  status: "passed" | "human_detected" | "blocked" | "error";
  message: string;
  taskId?: string;
}> => {
  const configToUse = {
    ...config,
    baseUrl: SEEDANCE_DEFAULT_BASE_URL,
  };
  try {
    const task = await createSeedanceTask(
      {
        model: "doubao-seedance-2-0-fast-260128",
        content: [
          {
            type: "text",
            text: "素材合规性预检。请基于图片生成一段简单静态镜头，不添加新人物，不改变主体身份。",
          },
          {
            type: "image_url",
            image_url: { url: imageUrl },
            role: "reference_image",
          },
        ],
        generateAudio: false,
        resolution: "480p",
        ratio: "adaptive",
        duration: 4,
        watermark: true,
      },
      configToUse
    );

    for (let attempt = 0; attempt < 36; attempt += 1) {
      const result = await getSeedanceTask(task.id, configToUse);
      if (result.status === "succeeded") {
        return {
          status: "passed",
          taskId: task.id,
          message: "官方预检任务通过：该素材未被 Seedance 2.0 按真人人脸参考素材拦截。",
        };
      }
      if (result.status === "failed") {
        const message = result.errorMsg || "Seedance 预检任务失败。";
        return {
          status: isHumanComplianceMessage(message) ? "human_detected" : "blocked",
          taskId: task.id,
          message,
        };
      }
      await wait(5000);
    }

    return {
      status: "error",
      taskId: task.id,
      message: "Seedance 预检任务超时，未能确认素材是否会被真人合规审核拦截。",
    };
  } catch (error: any) {
    const message = error?.message || "Seedance 预检提交失败。";
    return {
      status: isHumanComplianceMessage(message) ? "human_detected" : "error",
      message,
    };
  }
};
