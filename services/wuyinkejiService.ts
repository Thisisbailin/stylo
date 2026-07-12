import { MultimodalConfig, TokenUsage } from "../types";
import { fetchViaProxy } from "../utils/api";
import { NANOBANANA_PRO_ENDPOINT, WUYINKEJI_ASYNC_DETAIL_ENDPOINT } from "../constants";

export interface ImageTaskSubmissionResult {
    id: string;
}

export interface ImageTaskStatusResult {
    id: string;
    status: 'queued' | 'processing' | 'succeeded' | 'failed';
    url?: string;
    errorMsg?: string;
}

const findFirstMediaUrl = (value: unknown): string | undefined => {
    if (!value) return undefined;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (/^https?:\/\/\S+/i.test(trimmed) || /^data:image\//i.test(trimmed)) return trimmed;
        return undefined;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const hit = findFirstMediaUrl(item);
            if (hit) return hit;
        }
        return undefined;
    }
    if (typeof value === "object") {
        for (const candidateKey of ["remote_url", "img_url", "image_url", "result_url", "url", "src"]) {
            const hit = findFirstMediaUrl((value as Record<string, unknown>)[candidateKey]);
            if (hit) return hit;
        }
        for (const nested of Object.values(value as Record<string, unknown>)) {
            const hit = findFirstMediaUrl(nested);
            if (hit) return hit;
        }
    }
    return undefined;
};

const safePreview = (value: unknown) => {
    try {
        const serialized = JSON.stringify(value);
        return serialized.length > 400 ? `${serialized.slice(0, 400)}...` : serialized;
    } catch {
        return String(value);
    }
};

/**
 * SUBMIT IMAGE TASK
 * Sends the generation request to Nano Banana Pro.
 */
export const submitImageTask = async (
    prompt: string,
    config: MultimodalConfig,
    options?: {
        aspectRatio?: string;
        inputImageUrl?: string;
        size?: string;
        signal?: AbortSignal;
    }
): Promise<ImageTaskSubmissionResult> => {
    const { baseUrl, apiKey } = config;
    const resolvedApiKey = (apiKey || "").trim();

    const endpoint = (baseUrl || NANOBANANA_PRO_ENDPOINT).trim();
    const urlObj = new URL(endpoint);

    const payload: Record<string, unknown> = {
        prompt,
        size: options?.size || "1K",
        aspectRatio: options?.aspectRatio || "1:1",
    };
    if (options?.inputImageUrl) {
        payload.urls = [options.inputImageUrl];
    }

    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (resolvedApiKey) {
            headers.Authorization = resolvedApiKey;
        }
        const response = await fetchViaProxy(urlObj.toString(), {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: options?.signal,
        });

        const text = await response.text();
        if (!response.ok) throw new Error(`API Error ${response.status}: ${text}`);

        let data;
        try { data = JSON.parse(text); } catch (e) { throw new Error("Failed to parse API response."); }

        if (data.code !== undefined && data.code !== 200) {
            throw new Error(`Provider Error (${data.code}): ${data.msg}`);
        }

        const taskId = data.data?.id || data.id;
        if (!taskId) throw new Error("No Task ID returned.");

        return { id: taskId };

    } catch (error: any) {
        console.error("Image Submission Failed:", error);
        throw error;
    }
};

/**
 * CHECK IMAGE TASK STATUS
 * Single poll to check status of an image task.
 */
export const checkImageTaskStatus = async (
    taskId: string,
    config: MultimodalConfig,
    signal?: AbortSignal
): Promise<ImageTaskStatusResult> => {
    const { apiKey } = config;
    const resolvedApiKey = (apiKey || "").trim();

    const detailUrl = new URL(WUYINKEJI_ASYNC_DETAIL_ENDPOINT);
    detailUrl.searchParams.set("id", taskId);
    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (resolvedApiKey) {
            headers.Authorization = resolvedApiKey;
        }
        const response = await fetchViaProxy(detailUrl.toString(), {
            method: "GET",
            headers,
            signal,
        });

        if (!response.ok) {
            if (response.status === 404) return { id: taskId, status: 'processing' };
            throw new Error(`Poll Error ${response.status}`);
        }

        const text = await response.text();
        let data: any;
        try {
            data = JSON.parse(text);
        } catch (e) {
            return {
                id: taskId,
                status: "failed",
                errorMsg: "Failed to parse poll response.",
            };
        }

        if (data.code !== undefined) {
            if (Number(data.code) !== 200) {
                return {
                    id: taskId,
                    status: "failed",
                    errorMsg: data.msg || `Provider Error (${data.code})`,
                };
            }

            const d = data.data;
            if (!d) return { id: taskId, status: 'processing' };

            const s = Number(d.status);
            const finalUrl = findFirstMediaUrl(d) || findFirstMediaUrl(data.debug);

            // Official result-detail doc:
            // 0 初始化, 1 进行中, 2 成功, 3 失败
            if (s === 2) {
                if (finalUrl) return { id: taskId, status: 'succeeded', url: finalUrl };
                return {
                    id: taskId,
                    status: 'failed',
                    errorMsg: `Task completed but no media URL found. payload=${safePreview(d)} debug=${safePreview(data.debug)}`,
                };
            }

            if (s === 3) {
                return { id: taskId, status: 'failed', errorMsg: d.message || d.fail_reason || "Unknown failure" };
            }

            if (s === 0) return { id: taskId, status: 'queued' };
            if (s === 1) return { id: taskId, status: 'processing' };

            return { id: taskId, status: 'processing' };
        }

        return { id: taskId, status: 'processing' };

    } catch (e: any) {
        console.warn("Check status warning:", e);
        return {
            id: taskId,
            status: 'failed',
            errorMsg: e?.message || "Polling failed.",
        };
    }
};
