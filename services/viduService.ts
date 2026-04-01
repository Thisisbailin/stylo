import {
  ViduReferenceVideoAudioParams,
  ViduReferenceVideoVisualParams,
  ViduServiceConfig,
  ViduReferenceRequest,
  ViduReferenceMode,
  ViduTaskResult,
  ViduTaskState,
} from "../types";
import { wrapWithProxy } from "../utils/api";
import { VIDU_DEFAULT_BASE_URL } from "../constants";

const DEFAULT_BASE_URL = VIDU_DEFAULT_BASE_URL;
const DEFAULT_REFERENCE_MODEL = "viduq2";

const normalizeBaseUrl = (baseUrl?: string) =>
  (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");

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

const postJson = async <T>(path: string, body: Record<string, unknown>, config?: ViduServiceConfig): Promise<T> => {
  const { baseUrl, apiKey } = resolveConfig(config);
  const url = `${baseUrl}/${path.replace(/^\//, "")}`;

  const response = await fetch(wrapWithProxy(url), {
    method: "POST",
    headers: buildHeaders(apiKey, true),
    body: JSON.stringify(body),
  });

  const text = await response.text();
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

// --- Reference to Video: audio+video output ---
export const createReferenceVideoWithAudio = async (
  params: ViduReferenceVideoAudioParams,
  config?: ViduServiceConfig
) => {
  const { defaultModel } = resolveConfig(config);

  ensureArrayHasValues(params.subjects, "subjects");
  params.subjects.forEach((s, idx) => ensureArrayHasValues(s.images, `subjects[${idx}].images`));

  const payload = {
    model: params.model || defaultModel,
    subjects: params.subjects.map((s) => ({
      id: s.id,
      images: s.images,
      voice_id: s.voiceId || "",
    })),
    prompt: params.prompt,
    duration: params.duration ?? 8,
    audio: params.audio ?? true,
  };

  if (params.offPeak !== undefined) {
    (payload as any).off_peak = params.offPeak;
  }

  const data = await postJson<{ task_id?: string; id?: string; state?: string }>(
    "reference2video",
    payload,
    config
  );

  const taskId = data.task_id || data.id;
  if (!taskId) throw new Error("Vidu did not return a task_id.");

  return { taskId, state: mapState(data.state) };
};

// --- Reference to Video: video-only output ---
export const createReferenceVideoVisual = async (
  params: ViduReferenceVideoVisualParams,
  config?: ViduServiceConfig
) => {
  const { defaultModel } = resolveConfig(config);

  ensureArrayHasValues(params.images, "images");

  const payload = {
    model: params.model || defaultModel,
    images: params.images,
    prompt: params.prompt,
    duration: params.duration ?? 5,
    aspect_ratio: params.aspectRatio,
    resolution: params.resolution,
    movement_amplitude: params.movementAmplitude ?? "auto",
    seed: params.seed ?? 0,
    off_peak: params.offPeak ?? false,
    audio: params.audio ?? false,
  };

  const data = await postJson<{ task_id?: string; id?: string; state?: string }>(
    "reference2video",
    payload,
    config
  );

  const taskId = data.task_id || data.id;
  if (!taskId) throw new Error("Vidu did not return a task_id.");

  return { taskId, state: mapState(data.state) };
};

// Unified reference2video selector
export const createReferenceVideo = async (
  request: ViduReferenceRequest,
  config?: ViduServiceConfig
) => {
  if (request.mode === "audioVideo") {
    if (!request.audioParams) throw new Error("audioParams required for audioVideo mode");
    return createReferenceVideoWithAudio(request.audioParams, config);
  }
  if (request.mode === "videoOnly") {
    if (!request.visualParams) throw new Error("visualParams required for videoOnly mode");
    return createReferenceVideoVisual(request.visualParams, config);
  }
  throw new Error(`Unknown reference mode: ${request.mode as string}`);
};

// --- Task polling ---
export const fetchTaskResult = async (taskId: string, config?: ViduServiceConfig): Promise<ViduTaskResult> => {
  const { baseUrl, apiKey } = resolveConfig(config);
  const url = `${baseUrl}/tasks/${taskId}/creations`;

  const response = await fetch(wrapWithProxy(url), {
    method: "GET",
    headers: buildHeaders(apiKey),
  });

  const text = await response.text();
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
