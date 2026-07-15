import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountApiSession } from "../sync/authenticatedFetch";

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
