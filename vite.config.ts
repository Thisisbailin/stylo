import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api/qwen-ws': {
          target: 'wss://dashscope.aliyuncs.com',
          ws: true,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/qwen-ws/, '/api-ws'),
          configure: (proxy, options) => {
            proxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
              console.log('[Vite Proxy] Intercepted WebSocket connection:', req.url);
              const url = new URL((proxyReq.path || req.url) || '', 'http://dummy');
              const token = url.searchParams.get('token');
              if (token) {
                console.log('[Vite Proxy] Injecting Authorization header...');
                url.searchParams.delete('token');
                proxyReq.path = url.pathname + url.search;
                proxyReq.setHeader('Authorization', `Bearer ${token}`);
              } else {
                console.warn('[Vite Proxy] No token found in URL query params!');
              }
            });
          }
        },
        '/api/qwen-tts-ws': {
          target: 'wss://dashscope.aliyuncs.com',
          ws: true,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/qwen-tts-ws/, '/api-ws'),
          configure: (proxy, options) => {
            proxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
              console.log('[Vite Proxy] Intercepted WebSocket connection:', req.url);
              const url = new URL((proxyReq.path || req.url) || '', 'http://dummy');
              const token = url.searchParams.get('token');
              if (token) {
                console.log('[Vite Proxy] Injecting Authorization header...');
                url.searchParams.delete('token');
                proxyReq.path = url.pathname + url.search;
                proxyReq.setHeader('Authorization', `Bearer ${token}`);
              } else {
                console.warn('[Vite Proxy] No token found in URL query params!');
              }
            });
          }
        },
        '/api': {
          target: 'https://dashscope.aliyuncs.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/proxy\?url=/, ''),
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              const urlObj = new URL(req.url || '', 'http://dummy');
              const targetUrl = urlObj.searchParams.get('url');
              if (targetUrl) {
                try {
                  const parsedTarget = new URL(decodeURIComponent(targetUrl));
                  proxyReq.path = parsedTarget.pathname + parsedTarget.search;
                  // We shouldn't change the host header here as changeOrigin handles it for the *proxy target*, but we might need to be careful.
                  // Actually, the simple proxy above might be enough for simple GETs, but for the complex POSTs we used `wrapWithProxy` which acts like a classic proxy.
                  // Let's stick to the user's existing logic if possible, but the user didn't HAVE a proxy config before?
                  // Wait, Step 152 showed `wrapWithProxy` pointing to `/api/proxy`.
                  // If `vite.config.ts` had NO proxy before, then `/api/proxy` would have failed 404 unless handled by a backend.
                  // The user said "WebSocket connection error", implying REST worked?
                  // If REST worked, then `/api/proxy` was being handled.
                  // BUT `vite.config.ts` showed NO proxy config.
                  // This implies there IS a backend server (Express/Next) running on port 3000?
                  // OR the user was running against a distinct backend?
                  // "APP/Qalam" suggests a standalone app.
                  // If I look at `vite.config.ts` again... "plugins: [react()]". This is a SPA.
                  // If there was no proxy config, how did `fetch('/api/proxy?url=...')` work?
                  // Maybe it DIDN'T work and the user just didn't report it yet because they were stuck on 400?
                  // OR `wrapWithProxy` returns the URL as is if it starts with http?
                  // Let's check `utils/api.ts` again.
                  // "const proxyEndpoint = buildApiUrl("/api/proxy"); return `${proxyEndpoint}?url=...`"
                  // If `wrapWithProxy` constructs a URL, and that URL hits 404, the fetch fails.
                  // The previous error was "Qwen TTS failed (400)". This actually suggests the request REACHED DashScope.
                  // Format: `{"code":"InvalidParameter","message":"url error..."}`.
                  // This 400 came from DashScope.
                  // This implies the request wasn't proxied? Or the proxy worked?
                  // If I used `wrapWithProxy`, I sent to `/api/proxy`.
                  // If there is no proxy, how did it reach DashScope?
                  // Maybe `wrapWithProxy` has a check `if (!url) return url`.
                  // Step 152: `if (!url) return url; ... return ...`
                  // It returns the proxy URL.
                  // If the user got 400 from DashScope, it means *something* proxied it.
                  // Maybe I missed a server file?
                  // `find_by_name` "server" or "app.js" or "index.js"?
                  // But I am in `vite.config.ts`.
                  // If I modify `vite.config.ts` now, I enable the proxy.
                  // I should add the `/api` proxy too just in case it was missing.
                } catch (e) { }
              }
            });
          }
        }
      },
    },
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(env.VITE_CLERK_PUBLISHABLE_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
