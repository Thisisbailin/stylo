import type {
  SeedanceAssetCreateResult,
  SeedanceAssetStatusResult,
  SeedanceKeyProbeResult,
  SeedanceTaskCreateParams,
  SeedanceTaskStatusResult,
  SeedanceTaskSubmissionResult,
  VideoServiceConfig,
} from "../types";
import { SEEDANCE_DEFAULT_BASE_URL } from "../constants";
import { buildApiUrl, fetchAuthorized, fetchViaProxy } from "../utils/api";

const resolveApiKey = (config?: VideoServiceConfig) => {
  return (config?.apiKey || "").trim();
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

const normalizeModels = (raw: any): string[] => {
  const models =
    (Array.isArray(raw?.data) && raw.data) ||
    (Array.isArray(raw?.models) && raw.models) ||
    (Array.isArray(raw?.result) && raw.result) ||
    [];
  return models
    .map((item: any) => item?.id || item?.model || item?.name)
    .filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0);
};

const maskKeySource = (config?: VideoServiceConfig): SeedanceKeyProbeResult["keySource"] => {
  if ((config?.apiKey || "").trim()) return "config";
  return resolveApiKey(config) ? "env" : "missing";
};

export const createSeedanceTask = async (
  params: SeedanceTaskCreateParams,
  config?: VideoServiceConfig,
  signal?: AbortSignal
): Promise<SeedanceTaskSubmissionResult> => {
  const apiKey = resolveApiKey(config);
  const baseUrl = resolveBaseUrl(config);
  const requestInit: RequestInit = {
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
    signal,
  };
  const response = apiKey
    ? await fetchViaProxy(`${baseUrl}/contents/generations/tasks`, requestInit)
    : await fetchAuthorized(buildServerProxyUrl("/api/seedance/contents/generations/tasks", config), requestInit);

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
  config?: VideoServiceConfig,
  signal?: AbortSignal
): Promise<SeedanceTaskStatusResult> => {
  const apiKey = resolveApiKey(config);
  const baseUrl = resolveBaseUrl(config);
  const requestInit: RequestInit = {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    signal,
  };
  const response = apiKey
    ? await fetchViaProxy(`${baseUrl}/contents/generations/tasks/${taskId}`, requestInit)
    : await fetchAuthorized(buildServerProxyUrl(`/api/seedance/contents/generations/tasks/${taskId}`, config), requestInit);

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

export const probeSeedanceApiKey = async (
  config?: VideoServiceConfig,
  configuredModel?: string
): Promise<SeedanceKeyProbeResult> => {
  const apiKey = resolveApiKey(config);
  const baseUrl = SEEDANCE_DEFAULT_BASE_URL;
  const model = configuredModel || config?.model || "";
  const keySource = maskKeySource(config);
  const capabilities = ["video-generation", "multimodal-reference-video", "asset-uri-reference"];
  if (!apiKey) {
    const endpoint = buildApiUrl("/api/ark-models");
    const url = new URL(endpoint, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    url.searchParams.set("baseUrl", baseUrl);
    const serverResponse = await fetchAuthorized(url.toString(), { method: "GET" });
    if (serverResponse.ok) {
      const raw = await serverResponse.json();
      const models = normalizeModels(raw);
      return {
        status: "valid",
        message: models.length
          ? "服务端 ARK_API_KEY 有效，已读取可用模型列表。"
          : "服务端 ARK_API_KEY 有效，但未返回模型明细。",
        keySource: "env",
        baseUrl,
        configuredModel: model,
        models,
        modelAvailable: model ? models.includes(model) : undefined,
        capabilities,
      };
    }
    return {
      status: "invalid",
      message: `未检测到可用 API Key：${await serverResponse.text()}`,
      keySource,
      baseUrl,
      configuredModel: model,
      models: [],
      modelAvailable: false,
      capabilities,
    };
  }

  const modelsResponse = await fetchViaProxy(`${baseUrl}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (modelsResponse.status === 401 || modelsResponse.status === 403) {
    const text = await modelsResponse.text();
    return {
      status: "invalid",
      message: `API Key 鉴权失败：${text || modelsResponse.statusText}`,
      keySource,
      baseUrl,
      configuredModel: model,
      models: [],
      modelAvailable: false,
      capabilities,
    };
  }

  if (modelsResponse.ok) {
    const raw = await modelsResponse.json();
    const models = normalizeModels(raw);
    const modelAvailable = model ? models.includes(model) : undefined;
    return {
      status: "valid",
      message: models.length
        ? "API Key 有效，已读取可用模型列表。"
        : "API Key 有效，但模型列表为空或当前账号未返回模型明细。",
      keySource,
      baseUrl,
      configuredModel: model,
      models,
      modelAvailable,
      capabilities,
    };
  }

  const fallbackResponse = await fetchViaProxy(`${baseUrl}/contents/generations/tasks/stylo-api-key-probe`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (fallbackResponse.status === 401 || fallbackResponse.status === 403) {
    const text = await fallbackResponse.text();
    return {
      status: "invalid",
      message: `API Key 鉴权失败：${text || fallbackResponse.statusText}`,
      keySource,
      baseUrl,
      configuredModel: model,
      models: [],
      modelAvailable: undefined,
      capabilities,
    };
  }

  return {
    status: fallbackResponse.ok || fallbackResponse.status === 404 || fallbackResponse.status === 400 ? "valid" : "unknown",
    message:
      fallbackResponse.ok || fallbackResponse.status === 404 || fallbackResponse.status === 400
        ? "API Key 鉴权通过；当前模型列表接口未返回可解析列表，模型可用性需以实际任务提交为准。"
        : `无法确认 API Key 状态：${fallbackResponse.status} ${await fallbackResponse.text()}`,
    keySource,
    baseUrl,
    configuredModel: model,
    models: [],
    modelAvailable: undefined,
    capabilities,
  };
};

const postAssetApi = async (payload: Record<string, unknown>) => {
  const response = await fetchAuthorized(buildApiUrl("/api/seedance-assets"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Seedance Asset API Error ${response.status}: ${text}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Seedance Asset API 返回了无法解析的 JSON: ${text}`);
  }
};

export const createSeedanceAsset = async (params: {
  url: string;
  name?: string;
  groupId?: string | null;
}): Promise<SeedanceAssetCreateResult> => {
  return postAssetApi({
    action: "create",
    url: params.url,
    name: params.name,
    groupId: params.groupId || undefined,
  });
};

export const getSeedanceAsset = async (assetId: string): Promise<SeedanceAssetStatusResult> => {
  return postAssetApi({
    action: "get",
    assetId,
  });
};
