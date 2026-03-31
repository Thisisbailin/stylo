import { MultimodalConfig, TokenUsage } from "../types";
import { wrapWithProxy } from "../utils/api";
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
    }
): Promise<ImageTaskSubmissionResult> => {
    const { baseUrl, apiKey } = config;
    const resolvedApiKey = (apiKey || "").trim();

    const endpoint = (baseUrl || NANOBANANA_PRO_ENDPOINT).trim();
    const urlObj = new URL(endpoint);

    if (resolvedApiKey && !urlObj.searchParams.get("key")) {
        urlObj.searchParams.set("key", resolvedApiKey);
    }

    const payload: Record<string, unknown> = {
        prompt,
        size: options?.size || "1K",
        aspectRatio: options?.aspectRatio || "1:1",
    };
    if (options?.inputImageUrl) {
        payload.urls = [options.inputImageUrl];
    }

    try {
        console.log("--- [Phase 4] Submit Image Task (Nano Banana) ---");
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (resolvedApiKey) {
            headers.Authorization = resolvedApiKey;
        }
        const response = await fetch(wrapWithProxy(urlObj.toString()), {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
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
    config: MultimodalConfig
): Promise<ImageTaskStatusResult> => {
    const { apiKey } = config;
    const resolvedApiKey = (apiKey || "").trim();

    const detailUrl = new URL(WUYINKEJI_ASYNC_DETAIL_ENDPOINT);
    detailUrl.searchParams.set("id", taskId);
    if (resolvedApiKey && !detailUrl.searchParams.get("key")) {
        detailUrl.searchParams.set("key", resolvedApiKey);
    }

    try {
        console.log(`[Nano Banana] Polling: ${detailUrl.toString()}`);
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (resolvedApiKey) {
            headers.Authorization = resolvedApiKey;
        }
        const response = await fetch(wrapWithProxy(detailUrl.toString()), {
            method: "GET",
            headers
        });

        if (!response.ok) {
            if (response.status === 404) return { id: taskId, status: 'processing' };
            throw new Error(`Poll Error ${response.status}`);
        }

        const data = await response.json();

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
            const finalUrl =
                d.remote_url ||
                d.img_url ||
                d.image_url ||
                d.result_url ||
                d.url ||
                d.images?.[0] ||
                d.urls?.[0] ||
                d.data?.images?.[0] ||
                d.data?.urls?.[0];

            // Official result-detail doc:
            // 0 初始化, 1 进行中, 2 成功, 3 失败
            if (s === 2) {
                if (finalUrl) return { id: taskId, status: 'succeeded', url: finalUrl };
                return { id: taskId, status: 'processing' };
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
        return { id: taskId, status: 'processing' };
    }
};
