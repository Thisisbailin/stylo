
import { MultimodalConfig } from "../types";
import { fetchViaProxy } from "../utils/api";

/**
 * GENERATE SEEDREAM IMAGE
 * OpenAI-compatible /images/generations endpoint.
 */
export const generateSeedreamImage = async (
    prompt: string,
    config: MultimodalConfig,
    options?: {
        aspectRatio?: string;
        inputImageUrl?: string;
        signal?: AbortSignal;
    }
): Promise<string> => {
    const { baseUrl, apiKey, model } = config;

    if (!apiKey) {
        throw new Error("Missing Seedream API Key.");
    }

    if (!baseUrl) {
        throw new Error("Seedream endpoint missing. Please set the API base URL in Settings.");
    }
    const targetUrl = baseUrl;

    // Map aspectRatio to 'size' or similar if needed, 
    // Document shows 'size' as string. Standard is '1024x1024'.
    // Mapping 1:1 -> 1024x1024, 16:9 -> 1280x720, etc.
    let size = "1024x1024";
    if (options?.aspectRatio === '16:9') size = "1280x720";
    if (options?.aspectRatio === '9:16') size = "720x1280";

    const payload = {
        model: model || "doubao-seedream-250828",
        prompt: prompt,
        image: options?.inputImageUrl || undefined,
        size: size,
        stream: false,
        response_format: "url",
        // Additional parameters from doc
        guidance_scale: 7.5,
        watermark: false,
        sequential_image_generation: "disabled",
        sequential_image_generation_options: {
            "num_images": 1
        }
    };

    try {
        console.log("--- [Seedream] Requesting Image Generation ---");
        const response = await fetchViaProxy(targetUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload),
            signal: options?.signal,
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Seedream API Error ${response.status}: ${errText}`);
        }

        const data = await response.json();

        // Standard OpenAI response structure: { data: [ { url: "..." } ] }
        const imageUrl = data.data?.[0]?.url || data.url;

        if (!imageUrl) {
            throw new Error("Seedream API returned no image URL.");
        }

        return imageUrl;

    } catch (error: any) {
        console.error("Seedream Generation Failed:", error);
        throw error;
    }
};
