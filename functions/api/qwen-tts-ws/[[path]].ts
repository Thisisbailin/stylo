import { readWebSocketCredential } from "../../../utils/websocketAuth";

export const onRequest = async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    const token = readWebSocketCredential(request.headers.get("sec-websocket-protocol"));

    // Diagnostic mode: If request is NOT a WebSocket upgrade, return environment info
    if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response(JSON.stringify({
            status: 'Proxy Active',
            info: 'This endpoint is for Qwen TTS Realtime WebSocket proxying.',
            pathname: url.pathname,
            hasCredential: !!token,
            timestamp: new Date().toISOString()
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (!token) {
        return new Response('Missing DashScope WebSocket credential', { status: 400 });
    }

    // Rewrite target URL (api/qwen-tts-ws/v1/realtime -> api-ws/v1/realtime)
    const targetPath = url.pathname.replace('/api/qwen-tts-ws', '/api-ws');
    // Workers/Pages fetch only supports http/https; websocket is upgraded via headers.
    const dashscopeUrl = new URL(`https://dashscope.aliyuncs.com${targetPath}`);
    dashscopeUrl.search = url.searchParams.toString();
    console.log(`[Qwen TTS Proxy] Handshaking with DashScope: ${dashscopeUrl.toString()}`);

    try {
        // Cloudflare Workers - Initiating an outbound WebSocket connection
        const resp = await fetch(dashscopeUrl.toString(), {
            headers: {
                'Upgrade': 'websocket',
                'Authorization': `Bearer ${token}`,
            },
        });

        if (resp.status !== 101) {
            const errorText = await resp.text();
            console.error(`[Qwen TTS Proxy] DashScope rejected handshake: ${resp.status} ${errorText}`);
            return new Response(`DashScope Handshake Failed: ${resp.status} - ${errorText}`, { status: 502 });
        }

        const serverWS = resp.webSocket;
        if (!serverWS) {
            return new Response('Fatal: DashScope response did not include a WebSocket object', { status: 500 });
        }

        // Accept the client upgrade and pair it with the server connection
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        server.accept();
        serverWS.accept();

        // Standard relay pattern for CF Workers
        server.addEventListener('message', (ev: MessageEvent) => serverWS.send(ev.data));
        serverWS.addEventListener('message', ev => server.send(ev.data));

        server.addEventListener('close', () => serverWS.close());
        serverWS.addEventListener('close', () => server.close());

        server.addEventListener('error', () => serverWS.close());
        serverWS.addEventListener('error', () => server.close());

        return new Response(null, {
            status: 101,
            webSocket: client,
        });
    } catch (error) {
        console.error("[Qwen TTS Proxy] Connection failed");
        return new Response(
            `Edge Proxy Exception: ${error instanceof Error ? error.message : "unknown error"}`,
            { status: 500 }
        );
    }
};
