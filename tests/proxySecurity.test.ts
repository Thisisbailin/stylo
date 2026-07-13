import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequest } from "../functions/api/proxy";

const authModule = require("../functions/api/_auth") as {
  getUserId: (...args: unknown[]) => Promise<string>;
};
const rateLimitModule = require("../functions/api/_rateLimit") as {
  enforceRateLimit: (...args: unknown[]) => Promise<void>;
};

authModule.getUserId = async () => "test-user";
rateLimitModule.enforceRateLimit = async () => undefined;

const makeContext = (target: string) => ({
  request: new Request("https://stylo.test/api/proxy", {
    method: "GET",
    headers: {
      authorization: "Bearer provider-secret",
      "x-stylo-authorization": "Bearer stylo-session",
      "x-proxy-url": target,
    },
  }),
  env: {
    DB: {},
    CLERK_SECRET_KEY: "unused-in-test",
  },
});

test("proxy forwards only an allowed HTTPS target with safe fetch options", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response('{"ok":true}', {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await onRequest(makeContext("https://api.openai.com/v1/responses") as never);

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
    assert.equal(calls[0].init?.redirect, "manual");
    assert.equal(new Headers(calls[0].init?.headers).get("authorization"), "Bearer provider-secret");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("proxy rejects scheme, port, credential, fragment, host, and path escapes before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response("unexpected");
  }) as typeof fetch;
  const blockedTargets = [
    "http://api.openai.com/v1/responses",
    "https://api.openai.com:444/v1/responses",
    "https://user:password@api.openai.com/v1/responses",
    "https://api.openai.com/v1/responses#fragment",
    "https://api.openai.com.evil.test/v1/responses",
    "https://api.openai.com/v2/responses",
    "https://api.wuyinkeji.com/api/async/detail-anything",
    "https://api.wuyinkeji.com/api/async/image_nanoBanana_pro_evil",
  ];

  try {
    for (const target of blockedTargets) {
      const response = await onRequest(makeContext(target) as never);
      assert.equal(response.status, 403, target);
    }
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("proxy refuses upstream redirects instead of following them", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(null, {
    status: 302,
    headers: { location: "https://untrusted.example/steal" },
  })) as typeof fetch;

  try {
    const response = await onRequest(makeContext("https://api.openai.com/v1/responses") as never);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "Upstream redirects are not allowed" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
