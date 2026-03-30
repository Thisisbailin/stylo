import * as process from "node:process";
import { AsyncLocalStorage as BuiltinAsyncLocalStorage } from "node:async_hooks";
import { EventEmitter as RuntimeEventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { clearTimeout, setTimeout } from "node:timers";

export { RuntimeEventEmitter, randomUUID, Readable, clearTimeout, setTimeout };

export function loadEnv() {
  if (typeof process === "undefined" || typeof process.env === "undefined") {
    try {
      const importMeta = (0, eval)("import.meta");
      if (typeof importMeta === "object" && typeof importMeta.env === "object") {
        return importMeta.env;
      }
    } catch {}
    return {};
  }
  return process.env;
}

export const ReadableStream = globalThis.ReadableStream;
export const ReadableStreamController = globalThis.ReadableStreamDefaultController;
export const TransformStream = globalThis.TransformStream;

export class AsyncLocalStorage extends BuiltinAsyncLocalStorage {
  enterWith(context) {
    super.enterWith(context);
  }
}

export function isBrowserEnvironment() {
  return false;
}

export function isTracingLoopRunningByDefault() {
  return false;
}

const createUnsupportedMcpServer = (name) =>
  class UnsupportedMcpServer {
    constructor() {
      throw new Error(`${name} is not supported in Cloudflare Pages Functions runtime.`);
    }
  };

export const MCPServerStdio = createUnsupportedMcpServer("MCPServerStdio");
export const MCPServerStreamableHttp = createUnsupportedMcpServer("MCPServerStreamableHttp");
export const MCPServerSSE = createUnsupportedMcpServer("MCPServerSSE");

class WorkerTimer {
  setTimeout(callback, ms) {
    return setTimeout(callback, ms);
  }

  clearTimeout(timeoutId) {
    clearTimeout(timeoutId);
  }
}

export const timer = new WorkerTimer();
