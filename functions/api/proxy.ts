
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-proxy-url",
};

const resolveNanoBananaApiKey = (env: Record<string, unknown>) => {
    const candidates = [
        env.NANOBANANA_API_KEY,
        env.NANO_BANANA_API_KEY,
        env.WUYINKEJI_API_KEY,
    ];
    const hit = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
    return typeof hit === "string" ? hit.trim() : "";
};

const isNanoBananaTarget = (url: URL) =>
    url.hostname === "api.wuyinkeji.com" && url.pathname.includes("/api/async/image_nanoBanana_pro");

export const onRequest = async ({ request, env }) => {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, {
            headers: corsHeaders,
        });
    }

    const proxyUrl = request.headers.get("x-proxy-url") || new URL(request.url).searchParams.get("url");

    if (!proxyUrl) {
        return new Response("Missing x-proxy-url header or url param", { status: 400 });
    }

    try {
        const method = request.method;
        const headers = new Headers(request.headers);
        const targetUrl = new URL(proxyUrl);

        // Clean up headers that shouldn't be forwarded to the target
        headers.delete("host");
        headers.delete("x-proxy-url");
        headers.delete("cf-connecting-ip");
        headers.delete("cf-ray");
        headers.delete("cf-visitor");
        headers.delete("cf-ipcountry");
        headers.delete("x-real-ip");
        headers.delete("content-length"); // Fetch will recalculate

        if (isNanoBananaTarget(targetUrl)) {
            const apiKey = resolveNanoBananaApiKey((env || {}) as Record<string, unknown>);
            if (!apiKey) {
                return new Response("Proxy Error: Missing NANOBANANA_API_KEY in Cloudflare environment.", {
                    status: 500,
                    headers: corsHeaders,
                });
            }
            if (!headers.get("Authorization")) {
                headers.set("Authorization", apiKey);
            }
            if (!targetUrl.searchParams.get("key")) {
                targetUrl.searchParams.set("key", apiKey);
            }
        }

        const body = method !== "GET" && method !== "HEAD" ? await request.arrayBuffer() : null;

        console.log(`[Proxy] Forwarding ${method} to ${targetUrl.toString()}`);

        const response = await fetch(targetUrl.toString(), {
            method,
            headers,
            body,
            redirect: "follow",
        });

        const responseHeaders = new Headers(response.headers);
        // Allow the browser to read the response
        responseHeaders.set("Access-Control-Allow-Origin", "*");

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });
    } catch (err: any) {
        return new Response(`Proxy Error: ${err.message}`, { status: 500 });
    }
};
