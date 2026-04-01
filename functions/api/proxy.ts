
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-proxy-url",
    "Access-Control-Expose-Headers": "x-qalam-proxy-target,x-qalam-proxy-nanobanana,x-qalam-proxy-vidu,x-qalam-proxy-key-source,x-qalam-proxy-auth-header,x-qalam-proxy-key-query",
};

const resolveNanoBananaApiKey = (env: Record<string, unknown>) => {
    const candidates = [
        { name: "NANOBANANA_API_KEY", value: env.NANOBANANA_API_KEY },
        { name: "NANO_BANANA_API_KEY", value: env.NANO_BANANA_API_KEY },
        { name: "WUYINKEJI_API_KEY", value: env.WUYINKEJI_API_KEY },
    ];
    const hit = candidates.find((item) => typeof item.value === "string" && item.value.trim().length > 0);
    return {
        key: typeof hit?.value === "string" ? hit.value.trim() : "",
        source: hit?.name || "missing",
    };
};

const isNanoBananaTarget = (url: URL) =>
    url.hostname === "api.wuyinkeji.com" &&
    (
        url.pathname.includes("/api/async/image_nanoBanana_pro") ||
        url.pathname.includes("/api/async/detail")
    );

const resolveViduApiKey = (env: Record<string, unknown>) => {
    const candidates = [
        { name: "VIDU_API_KEY", value: env.VIDU_API_KEY },
        { name: "VITE_VIDU_API_KEY", value: env.VITE_VIDU_API_KEY },
    ];
    const hit = candidates.find((item) => typeof item.value === "string" && item.value.trim().length > 0);
    return {
        key: typeof hit?.value === "string" ? hit.value.trim() : "",
        source: hit?.name || "missing",
    };
};

const isViduTarget = (url: URL) =>
    url.hostname === "api.vidu.com" && url.pathname.startsWith("/ent/v2/");

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
        const debugHeaders: Record<string, string> = {
            "x-qalam-proxy-target": targetUrl.pathname,
            "x-qalam-proxy-nanobanana": "false",
            "x-qalam-proxy-vidu": "false",
            "x-qalam-proxy-key-source": "n/a",
            "x-qalam-proxy-auth-header": headers.get("Authorization") ? "forwarded" : "none",
            "x-qalam-proxy-key-query": targetUrl.searchParams.get("key") ? "forwarded" : "none",
        };

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
            const { key: apiKey, source } = resolveNanoBananaApiKey((env || {}) as Record<string, unknown>);
            debugHeaders["x-qalam-proxy-nanobanana"] = "true";
            debugHeaders["x-qalam-proxy-key-source"] = source;
            if (!apiKey) {
                return new Response("Proxy Error: Missing NANOBANANA_API_KEY in Cloudflare environment.", {
                    status: 500,
                    headers: {
                        ...corsHeaders,
                        ...debugHeaders,
                    },
                });
            }
            if (!headers.get("Authorization")) {
                headers.set("Authorization", apiKey);
                debugHeaders["x-qalam-proxy-auth-header"] = "injected";
            }
            if (!targetUrl.searchParams.get("key")) {
                targetUrl.searchParams.set("key", apiKey);
                debugHeaders["x-qalam-proxy-key-query"] = "injected";
            }
        }

        if (isViduTarget(targetUrl)) {
            const { key: apiKey, source } = resolveViduApiKey((env || {}) as Record<string, unknown>);
            debugHeaders["x-qalam-proxy-vidu"] = "true";
            debugHeaders["x-qalam-proxy-key-source"] = source;
            if (!apiKey) {
                return new Response("Proxy Error: Missing VIDU_API_KEY in Cloudflare environment.", {
                    status: 500,
                    headers: {
                        ...corsHeaders,
                        ...debugHeaders,
                    },
                });
            }
            if (!headers.get("Authorization")) {
                headers.set("Authorization", `Token ${apiKey}`);
                debugHeaders["x-qalam-proxy-auth-header"] = "injected";
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
        responseHeaders.set("Access-Control-Expose-Headers", corsHeaders["Access-Control-Expose-Headers"]);
        Object.entries(debugHeaders).forEach(([key, value]) => responseHeaders.set(key, value));

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });
    } catch (err: any) {
        return new Response(`Proxy Error: ${err.message}`, { status: 500, headers: corsHeaders });
    }
};
