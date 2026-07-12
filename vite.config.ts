import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readWebSocketCredential = (header: string | string[] | undefined) => {
  const rawHeader = Array.isArray(header) ? header.join(',') : header || '';
  const encoded = rawHeader
    .split(',')
    .map((value) => value.trim())
    .find((value) => value.startsWith('qalam-auth.'))
    ?.slice('qalam-auth.'.length);
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length > 8_192) return '';
  try {
    return Buffer.from(encoded, 'base64url').toString('utf8').trim();
  } catch {
    return '';
  }
};

const createQwenWebSocketProxy = (routePrefix: RegExp): ProxyOptions => ({
  target: 'wss://dashscope.aliyuncs.com',
  ws: true,
  changeOrigin: true,
  rewrite: (requestPath) => requestPath.replace(routePrefix, '/api-ws'),
  configure: (proxy) => {
    proxy.on('proxyReqWs', (proxyRequest, request) => {
      const credential = readWebSocketCredential(request.headers['sec-websocket-protocol']);
      proxyRequest.removeHeader('sec-websocket-protocol');
      if (!credential) {
        proxyRequest.destroy(new Error('Missing DashScope WebSocket credential'));
        return;
      }
      proxyRequest.setHeader('authorization', `Bearer ${credential}`);
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      strictPort: true,
      host: '0.0.0.0',
      proxy: {
        '/api/qwen-ws': createQwenWebSocketProxy(/^\/api\/qwen-ws/),
        '/api/qwen-tts-ws': createQwenWebSocketProxy(/^\/api\/qwen-tts-ws/),
      },
    },
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(env.VITE_CLERK_PUBLISHABLE_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
