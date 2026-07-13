import { buildAuthorizedHeaders, captureApiAuthLease } from "./authToken";

const rawBase = typeof import.meta !== "undefined" ? import.meta.env?.VITE_API_BASE : "";
const base = typeof rawBase === "string" ? rawBase.replace(/\/+$/, "") : "";

export const buildApiUrl = (path: string) => {
  if (!path.startsWith("/")) {
    return `${base}/${path}`;
  }
  return `${base}${path}`;
};

export const fetchViaProxy = async (url: string, init: RequestInit = {}) => {
  const lease = captureApiAuthLease();
  if (init.signal?.aborted) throw init.signal.reason;
  const headers = await buildAuthorizedHeaders(
    init.headers,
    "x-stylo-authorization",
    lease.generation
  );
  lease.assertCurrent();
  headers.set("x-proxy-url", url);
  const signal = init.signal ? AbortSignal.any([lease.signal, init.signal]) : lease.signal;
  return fetch(buildApiUrl("/api/proxy"), { ...init, headers, signal });
};

export const fetchAuthorized = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const lease = captureApiAuthLease();
  if (init.signal?.aborted) throw init.signal.reason;
  const headers = await buildAuthorizedHeaders(init.headers, "authorization", lease.generation);
  lease.assertCurrent();
  const signal = init.signal ? AbortSignal.any([lease.signal, init.signal]) : lease.signal;
  return fetch(input, { ...init, headers, signal });
};
