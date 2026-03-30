import { MultimodalConfig, TokenUsage } from "../types";
import { wrapWithProxy } from "../utils/api";
import { NANOBANANA_PRO_MODEL } from "../constants";

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

const resolveQwenApiKey = () => {
    const envKey =
        (typeof import.meta !== "undefined"
            ? (import.meta.env.QWEN_API_KEY || import.meta.env.VITE_QWEN_API_KEY)
            : undefined) ||
        (typeof process !== "undefined"
            ? (process.env?.QWEN_API_KEY || process.env?.VITE_QWEN_API_KEY)
            : undefined);
    return (envKey || "").trim();
};

// Helper to convert mixed text/markdown-image content into OpenAI Structured Content
const formatContentForApi = (content: string): any => {
    // Regex for markdown image: ![alt](url)
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

    // If no images, return string directly
    if (!content.match(imgRegex)) return content;

    const parts: any[] = [];
    let lastIndex = 0;
    let match;

    while ((match = imgRegex.exec(content)) !== null) {
        // Add text before image
        if (match.index > lastIndex) {
            const textPart = content.substring(lastIndex, match.index).trim();
            if (textPart) parts.push({ type: "text", text: textPart });
        }

        const imageUrl = match[2];

        // Add image part
        // Check if it's base64 or url
        if (imageUrl.startsWith('data:image')) {
            parts.push({
                type: "image_url",
                image_url: {
                    url: imageUrl,
                    detail: "high" // Use high detail for best refinement context
                }
            });
        } else if (!imageUrl.includes("[Image Omitted]")) {
            parts.push({
                type: "image_url",
                image_url: {
                    url: imageUrl
                }
            });
        }

        lastIndex = imgRegex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < content.length) {
        const textPart = content.substring(lastIndex).trim();
        if (textPart) parts.push({ type: "text", text: textPart });
    }

    return parts;
};

export const sendMessage = async (
    messages: ChatMessage[],
    config: MultimodalConfig
): Promise<{ content: string; usage: TokenUsage }> => {
    const { baseUrl, apiKey, model } = config;
    const resolvedApiKey =
        apiKey ||
        (baseUrl.includes("dashscope.aliyuncs.com") ? resolveQwenApiKey() : "");

    if (!baseUrl || !resolvedApiKey) {
        throw new Error("Multimodal Intelligence configuration missing. Please check Settings.");
    }

    let apiBase = baseUrl.trim().replace(/\/+$/, '');
    // Ensure standard OpenAI /v1/chat/completions structure
    if (!apiBase.endsWith('/chat/completions')) {
        if (apiBase.endsWith('/v1')) {
            apiBase = `${apiBase}/chat/completions`;
        } else {
            apiBase = `${apiBase}/v1/chat/completions`;
        }
    }

    // PRE-PROCESS MESSAGES
    // Convert markdown images in history to structured content objects
    const apiMessages = messages.map(msg => {
        // Only process assistant messages that might contain generated images
        // Or user messages if we eventually support image upload
        if (typeof msg.content === 'string' && msg.content.includes('![')) {
            return {
                role: msg.role,
                content: formatContentForApi(msg.content)
            };
        }
        return msg;
    });

    const payload = {
        model: model || "gpt-4o",
        messages: apiMessages,
        temperature: 0.7,
        stream: false // Explicitly disable streaming
    };

    console.log("--- [Phase 4] Multimodal Request ---");
    console.log("URL:", apiBase);
    console.log("Model:", model);
    // console.log("Payload:", JSON.stringify(payload, null, 2)); // Too large to log with base64

    try {
        const response = await fetch(wrapWithProxy(apiBase), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${resolvedApiKey}`,
                "HTTP-Referer": window.location.origin,
                "X-Title": "Qalam"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("--- [Phase 4] API Error ---", response.status, errText);
            throw new Error(`API Error ${response.status}: ${errText}`);
        }

        const data = await response.json();

        console.log("--- [Phase 4] Multimodal Response (Raw) ---");
        // console.log(data); 
        console.log("Usage:", data.usage);

        const choice = data.choices?.[0];
        const message = choice?.message;
        let content = message?.content || "";

        // CHECK 1: Handle non-standard 'images' array in message object
        if (message?.images && Array.isArray(message.images)) {
            const extractedUrls = message.images.map((img: any) => {
                if (typeof img === 'string') return img; // Direct URL
                if (img.image_url?.url) return img.image_url.url; // OpenAI-like object
                if (img.url) return img.url; // Simplistic object
                return null;
            }).filter(Boolean);

            if (extractedUrls.length > 0) {
                // Append to content as Markdown so the frontend renderer picks it up
                const imageMarkdown = extractedUrls.map((url: string) => `![Generated Image](${url})`).join("\n\n");
                // If content is just a backtick or empty, replace it. Otherwise append.
                if (!content || content.trim() === '`') {
                    content = imageMarkdown;
                } else {
                    content = `${content}\n\n${imageMarkdown}`;
                }
            }
        }

        // CHECK 2: Clean up artifacts
        if (content.trim() === '`') {
            content = "";
        }

        const usage: TokenUsage = {
            promptTokens: data.usage?.prompt_tokens || 0,
            responseTokens: data.usage?.completion_tokens || 0,
            totalTokens: data.usage?.total_tokens || 0
        };

        return { content, usage };
    } catch (error: any) {
        console.error("Multimodal Service Error:", error);
        throw error;
    }
};

export const fetchMultimodalModels = async (baseUrl: string, apiKey: string): Promise<string[]> => {
    // Avoid CORS error for Wuyinkeji or empty URLs for placeholders
    if (baseUrl.includes('api.wuyinkeji.com')) {
        return [NANOBANANA_PRO_MODEL];
    }
    if (!baseUrl || baseUrl.includes('placeholder')) {
        return ['default-model'];
    }

    let apiBase = baseUrl.trim().replace(/\/+$/, '');
    if (apiBase.endsWith('/chat/completions')) apiBase = apiBase.replace('/chat/completions', '');
    if (!apiBase.endsWith('/v1')) apiBase = `${apiBase}/v1`;

    const resolvedApiKey =
        apiKey ||
        (baseUrl.includes("dashscope.aliyuncs.com") ? resolveQwenApiKey() : "");
    if (!resolvedApiKey) return [];
    try {
        const response = await fetch(wrapWithProxy(`${apiBase}/models`), {
            method: 'GET',
            headers: { "Authorization": `Bearer ${resolvedApiKey}` }
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.data?.map((m: any) => m.id) || [];
    } catch (e) {
        return [];
    }
};
