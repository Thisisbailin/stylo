import {
  ViduReferenceVideoSubjectParams,
  ViduReferenceVideoNonSubjectParams,
  ViduServiceConfig,
  ViduReferenceRequest,
  ViduTaskResult,
  ViduTaskState,
} from "../types";
import { wrapWithProxy } from "../utils/api";
import { VIDU_DEFAULT_BASE_URL } from "../constants";

const DEFAULT_BASE_URL = VIDU_DEFAULT_BASE_URL;
const DEFAULT_REFERENCE_MODEL = "viduq3";

const normalizeBaseUrl = (baseUrl?: string) =>
  (baseUrl || DEFAULT_BASE_URL)
    .replace("https://api.vidu.com/ent/v2", VIDU_DEFAULT_BASE_URL)
    .replace("http://api.vidu.com/ent/v2", VIDU_DEFAULT_BASE_URL)
    .replace(/\/+$/, "");

const mapState = (state?: string): ViduTaskState => {
  if (!state) return "processing";
  const normalized = state.toLowerCase();
  if (normalized.includes("fail")) return "failed";
  if (normalized.includes("success")) return "success";
  if (normalized.includes("cancel")) return "canceled";
  if (normalized.includes("queue") || normalized.includes("schedule")) return "scheduled";
  if (normalized.includes("create")) return "created";
  return "processing";
};

const ensureArrayHasValues = (arr?: unknown[], label?: string) => {
  if (!arr || !Array.isArray(arr) || arr.length === 0) {
    throw new Error(`Vidu payload missing required array: ${label || "value"}`);
  }
};

const resolveConfig = (config?: ViduServiceConfig) => {
  const envBase =
    (typeof import.meta !== "undefined" ? (import.meta as any)?.env?.VIDU_BASE_URL || (import.meta as any)?.env?.VITE_VIDU_BASE_URL : undefined) ||
    (typeof process !== "undefined" ? process.env?.VIDU_BASE_URL : undefined);
  const envKey =
    (typeof import.meta !== "undefined" ? (import.meta as any)?.env?.VIDU_API_KEY || (import.meta as any)?.env?.VITE_VIDU_API_KEY : undefined) ||
    (typeof process !== "undefined" ? process.env?.VIDU_API_KEY : undefined);

  const baseUrl = normalizeBaseUrl(config?.baseUrl || envBase);
  const apiKey = config?.apiKey || envKey;
  const defaultModel = config?.defaultModel || DEFAULT_REFERENCE_MODEL;

  if (!baseUrl) {
    throw new Error("Missing Vidu API base URL. Set VIDU_BASE_URL or pass it via config.");
  }
  return { baseUrl, apiKey, defaultModel };
};

const buildHeaders = (apiKey?: string, includeContentType = false) => {
  const headers: Record<string, string> = {};
  if (includeContentType) headers["Content-Type"] = "application/json";
  if (apiKey) headers.Authorization = `Token ${apiKey}`;
  return headers;
};

const readProxyDebugHeaders = (response: Response) => ({
  target: response.headers.get("x-qalam-proxy-target") || "n/a",
  vidu: response.headers.get("x-qalam-proxy-vidu") || "n/a",
  keySource: response.headers.get("x-qalam-proxy-key-source") || "n/a",
  keyFingerprint: response.headers.get("x-qalam-proxy-key-fingerprint") || "n/a",
  authHeader: response.headers.get("x-qalam-proxy-auth-header") || "n/a",
  keyQuery: response.headers.get("x-qalam-proxy-key-query") || "n/a",
});

export const fetchViduCredits = async (config?: ViduServiceConfig) => {
  const { baseUrl, apiKey } = resolveConfig(config);
  const url = `${baseUrl}/credits?show_detail`;

  const response = await fetch(wrapWithProxy(url), {
    method: "GET",
    headers: buildHeaders(apiKey),
  });

  const text = await response.text();
  console.log("[Vidu] Credits proxy debug:", {
    url,
    ...readProxyDebugHeaders(response),
  });
  console.log("[Vidu] Credits raw response:", text);

  if (!response.ok) {
    throw new Error(`Vidu credits failed (${response.status}): ${text}`);
  }

  try {
    return JSON.parse(text) as {
      remains?: Array<{
        type?: string;
        credit_remain?: number;
        concurrency_limit?: number;
        current_concurrency?: number;
        queue_count?: number;
      }>;
      packages?: Array<{
        id?: string | number;
        name?: string;
        type?: string;
        concurrency?: number;
        credit_amount?: number;
        credit_remain?: number;
        valid_to?: string;
      }>;
    };
  } catch (err) {
    throw new Error(`Failed to parse Vidu credits response: ${text}`);
  }
};

const postJson = async <T>(path: string, body: Record<string, unknown>, config?: ViduServiceConfig): Promise<T> => {
  const { baseUrl, apiKey } = resolveConfig(config);
  const url = `${baseUrl}/${path.replace(/^\//, "")}`;

  const response = await fetch(wrapWithProxy(url), {
    method: "POST",
    headers: buildHeaders(apiKey, true),
    body: JSON.stringify(body),
  });

  const text = await response.text();
  console.log("[Vidu] Submit proxy debug:", {
    path,
    url,
    ...readProxyDebugHeaders(response),
  });
  console.log("[Vidu] Submit raw response:", text);
  if (!response.ok) {
    throw new Error(`Vidu request failed (${response.status}): ${text}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(`Failed to parse Vidu response: ${text}`);
  }
};

export const fetchViduModels = async (config?: ViduServiceConfig): Promise<string[]> => {
  const { baseUrl, apiKey } = resolveConfig(config);
  const url = `${baseUrl}/models`;
  const response = await fetch(wrapWithProxy(url), {
    method: "GET",
    headers: buildHeaders(apiKey),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Vidu models: ${response.status}`);
  }
  const data = await response.json();
  const list = data?.data || data?.models || [];
  return Array.isArray(list) ? list.map((m: any) => (typeof m === "string" ? m : m.id || "")).filter(Boolean) : [];
};

const createSubjectReferenceVideo = async (
  params: ViduReferenceVideoSubjectParams,
  config?: ViduServiceConfig
) => {
  const { defaultModel } = resolveConfig(config);

  ensureArrayHasValues(params.subjects, "subjects");
  params.subjects.forEach((s, idx) => {
    const hasImages = Array.isArray(s.images) && s.images.length > 0;
    const hasVideos = Array.isArray(s.videos) && s.videos.length > 0;
    const hasServerId = typeof s.serverId === "string" && s.serverId.trim().length > 0;
    if (!hasImages && !hasVideos && !hasServerId) {
      throw new Error(`Vidu subject missing source: subjects[${idx}] requires images, videos, or serverId.`);
    }
  });

  const payload = {
    model: params.model || defaultModel,
    subjects: params.subjects.map((s) => ({
      name: s.name,
      ...(Array.isArray(s.images) && s.images.length > 0 ? { images: s.images } : {}),
      ...(Array.isArray(s.videos) && s.videos.length > 0 ? { videos: s.videos } : {}),
      ...(s.voiceId ? { voice_id: s.voiceId } : {}),
      ...(s.serverId ? { server_id: s.serverId } : {}),
    })),
    prompt: params.prompt,
    duration: params.duration ?? 5,
    audio: params.audio ?? true,
    ...(params.autoSubjects !== undefined ? { auto_subjects: params.autoSubjects } : {}),
    ...(params.seed !== undefined ? { seed: params.seed } : {}),
    ...(params.aspectRatio ? { aspect_ratio: params.aspectRatio } : {}),
    ...(params.resolution ? { resolution: params.resolution } : {}),
    ...(params.offPeak !== undefined ? { off_peak: params.offPeak } : {}),
    ...(params.watermark !== undefined ? { watermark: params.watermark } : {}),
    ...(params.wmPosition !== undefined ? { wm_position: params.wmPosition } : {}),
    ...(params.wmUrl ? { wm_url: params.wmUrl } : {}),
    ...(params.metaData ? { meta_data: params.metaData } : {}),
    ...(params.callbackUrl ? { callback_url: params.callbackUrl } : {}),
    ...(params.payload ? { payload: params.payload } : {}),
  };

  const data = await postJson<{ task_id?: string; id?: string; state?: string; credits?: number }>(
    "reference2video",
    payload,
    config
  );

  const taskId = data.task_id || data.id;
  if (!taskId) throw new Error("Vidu did not return a task_id.");

  return { taskId, state: mapState(data.state), credits: data.credits };
};

const createNonSubjectReferenceVideo = async (
  params: ViduReferenceVideoNonSubjectParams,
  config?: ViduServiceConfig
) => {
  const { defaultModel } = resolveConfig(config);

  ensureArrayHasValues(params.images, "images");

  const payload = {
    model: params.model || defaultModel,
    images: params.images,
    ...(Array.isArray(params.videos) && params.videos.length > 0 ? { videos: params.videos } : {}),
    ...(Array.isArray(params.sounds) && params.sounds.length > 0 ? { sounds: params.sounds } : {}),
    prompt: params.prompt,
    ...(params.bgm !== undefined ? { bgm: params.bgm } : {}),
    duration: params.duration ?? 5,
    ...(params.aspectRatio ? { aspect_ratio: params.aspectRatio } : {}),
    ...(params.resolution ? { resolution: params.resolution } : {}),
    ...(params.seed !== undefined ? { seed: params.seed } : {}),
    ...(params.offPeak !== undefined ? { off_peak: params.offPeak } : {}),
    ...(params.audio !== undefined ? { audio: params.audio } : {}),
    ...(params.watermark !== undefined ? { watermark: params.watermark } : {}),
    ...(params.wmPosition !== undefined ? { wm_position: params.wmPosition } : {}),
    ...(params.wmUrl ? { wm_url: params.wmUrl } : {}),
    ...(params.metaData ? { meta_data: params.metaData } : {}),
    ...(params.callbackUrl ? { callback_url: params.callbackUrl } : {}),
    ...(params.payload ? { payload: params.payload } : {}),
  };

  const data = await postJson<{ task_id?: string; id?: string; state?: string; credits?: number }>(
    "reference2video",
    payload,
    config
  );

  const taskId = data.task_id || data.id;
  if (!taskId) throw new Error("Vidu did not return a task_id.");

  return { taskId, state: mapState(data.state), credits: data.credits };
};

// Unified reference2video selector
export const createReferenceVideo = async (
  request: ViduReferenceRequest,
  config?: ViduServiceConfig
) => {
  if (request.mode === "subject" || request.mode === "audioVideo") {
    if (!request.subjectParams) throw new Error("subjectParams required for subject mode");
    return createSubjectReferenceVideo(request.subjectParams, config);
  }
  if (request.mode === "nonSubject" || request.mode === "videoOnly") {
    if (!request.nonSubjectParams) throw new Error("nonSubjectParams required for nonSubject mode");
    return createNonSubjectReferenceVideo(request.nonSubjectParams, config);
  }
  throw new Error(`Unknown reference mode: ${String(request.mode)}`);
};

// --- Task polling ---
export const fetchTaskResult = async (taskId: string, config?: ViduServiceConfig): Promise<ViduTaskResult> => {
  const { baseUrl, apiKey } = resolveConfig(config);
  const url = `${baseUrl}/tasks/${taskId}/creations`;

  console.log("[Vidu] Polling:", url);
  const response = await fetch(wrapWithProxy(url), {
    method: "GET",
    headers: buildHeaders(apiKey),
  });

  const text = await response.text();
  console.log("[Vidu] Poll proxy debug:", {
    taskId,
    url,
    ...readProxyDebugHeaders(response),
  });
  console.log("[Vidu] Poll raw response:", text);
  if (!response.ok) {
    throw new Error(`Failed to fetch Vidu task (${response.status}): ${text}`);
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse Vidu task response: ${text}`);
  }

  return {
    id: data.id || taskId,
    state: mapState(data.state),
    err_code: data.err_code,
    credits: data.credits,
    payload: data.payload,
    creations: data.creations,
  };
};

// Cancel task
export const cancelTask = async (taskId: string, config?: ViduServiceConfig): Promise<boolean> => {
  const { baseUrl, apiKey } = resolveConfig(config);
  const url = `${baseUrl}/tasks/${taskId}/cancel`;

  const response = await fetch(wrapWithProxy(url), {
    method: "POST",
    headers: buildHeaders(apiKey, true),
    body: JSON.stringify({ id: taskId }),
  });

  if (response.status === 404) return false; // Not found or already finished

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Failed to cancel Vidu task (${response.status}): ${text}`);
  }
  return true;
};
