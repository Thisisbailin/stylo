/**
 * Minimal Cloudflare Workers WebSocket extensions used by Pages Functions.
 *
 * Keeping these declarations local avoids loading the complete Workers global
 * type set into the browser build, where it conflicts with DOM globals.
 */
interface WebSocket {
  accept(): void;
}

interface WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

declare const WebSocketPair: {
  new (): WebSocketPair;
};

interface Response {
  readonly webSocket?: WebSocket;
}

interface ResponseInit {
  webSocket?: WebSocket;
}
