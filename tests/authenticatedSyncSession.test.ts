import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AccountApiSession, SyncTransportError } from "../sync/authenticatedFetch";

test("account sync session refreshes authentication once and preserves account headers", async () => {
  const tokens: string[] = [];
  const requests: Array<{ authorization: string | null; deviceId: string | null }> = [];
  const session = new AccountApiSession(
    "user:one",
    async (options) => {
      const token = options?.skipCache ? "fresh-token" : "stale-token";
      tokens.push(token);
      return token;
    },
    "device-1",
    (async (_input, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        authorization: headers.get("authorization"),
        deviceId: headers.get("x-device-id"),
      });
      return new Response(null, { status: requests.length === 1 ? 401 : 204 });
    }) as typeof fetch,
    (path) => `https://stylo.test${path}`
  );

  const response = await session.request("/api/project");

  assert.equal(response.status, 204);
  assert.deepEqual(tokens, ["stale-token", "fresh-token"]);
  assert.deepEqual(requests, [
    { authorization: "Bearer stale-token", deviceId: "device-1" },
    { authorization: "Bearer fresh-token", deviceId: "device-1" },
  ]);
  session.dispose();
});

test("disposing an account session rejects a pending token lease before any fetch", async () => {
  let resolveToken: (value: string | null) => void = () => {
    throw new Error("token request did not start");
  };
  let fetches = 0;
  const session = new AccountApiSession(
    "user:old",
    () => new Promise((resolve) => {
      resolveToken = resolve;
    }),
    "device-old",
    (async () => {
      fetches += 1;
      return new Response(null, { status: 200 });
    }) as typeof fetch,
    (path) => `https://stylo.test${path}`
  );
  const request = session.request("/api/project");

  session.dispose();

  await assert.rejects(request, (error: unknown) =>
    error instanceof DOMException && error.name === "AbortError"
  );
  resolveToken("old-token");
  await Promise.resolve();
  assert.equal(fetches, 0);
});

test("account sync requests fail with a retryable timeout instead of loading forever", async () => {
  const session = new AccountApiSession(
    "user:slow",
    async () => "token",
    "device-slow",
    ((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    })) as typeof fetch,
    (path) => `https://stylo.test${path}`,
    5,
  );

  await assert.rejects(
    session.request("/api/project"),
    (error: unknown) => error instanceof SyncTransportError && error.retryable && /请求超时/.test(error.message),
  );
  session.dispose();
});

test("account session leases survive React StrictMode cleanup but dispose after final unmount", async () => {
  let fetches = 0;
  const session = new AccountApiSession(
    "user:strict-mode",
    async () => "token",
    "device-strict-mode",
    (async () => {
      fetches += 1;
      return new Response(null, { status: 204 });
    }) as typeof fetch,
    (path) => `https://stylo.test${path}`,
  );

  const releaseFirstMount = session.retain();
  releaseFirstMount();
  const releaseSecondMount = session.retain();
  await Promise.resolve();

  assert.equal((await session.request("/api/project")).status, 204);
  assert.equal(fetches, 1);

  releaseSecondMount();
  await Promise.resolve();
  await assert.rejects(
    session.request("/api/project"),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
});

test("account transport invokes browser fetch with the global receiver", async () => {
  let receiver: unknown;
  const browserLikeFetch = function (this: unknown) {
    receiver = this;
    if (this !== globalThis) throw new TypeError("Illegal invocation");
    return Promise.resolve(new Response(null, { status: 204 }));
  } as typeof fetch;
  const session = new AccountApiSession(
    "user:browser-fetch",
    async () => "token",
    "device-browser-fetch",
    browserLikeFetch,
    (path) => `https://stylo.test${path}`,
  );

  assert.equal((await session.request("/api/project")).status, 204);
  assert.equal(receiver, globalThis);
  session.dispose();
});

test("sync diagnostics share the account-scoped authenticated transport", () => {
  const source = readFileSync("node-workspace/components/SyncPanel.tsx", "utf8");

  assert.match(source, /accountSession\.request\("\/api\/project-snapshots"/);
  assert.match(source, /accountSession\.request\("\/api\/project-restore"/);
  assert.match(source, /accountSession\.request\("\/api\/sync-audit"/);
  assert.doesNotMatch(source, /getAuthToken/);
  assert.doesNotMatch(source, /fetch\(buildApiUrl\("\/api\//);
});
