import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildQalamAccountSessionId,
  buildQalamAccountStorageKeys,
} from "../agents/runtime/projectScope";
import {
  buildAuthorizedHeaders,
  captureApiAuthLease,
  setApiAuthTokenProvider,
} from "../utils/authToken";

test("guest and signed-in Qalam records use distinct local namespaces", () => {
  const guest = buildQalamAccountStorageKeys("guest", "flow-project-main");
  const user = buildQalamAccountStorageKeys("user:123", "flow-project-main");
  assert.notEqual(guest.conversationStorageKey, user.conversationStorageKey);
  assert.match(guest.conversationStorageKey, /guest%3Aflow-project-main/);
  assert.notEqual(
    buildQalamAccountSessionId("guest", "flow-project-main", "chat-1"),
    buildQalamAccountSessionId("user:123", "flow-project-main", "chat-1")
  );
});

test("an account switch aborts leases and rejects a stale token result", async () => {
  let resolveToken: ((token: string) => void) | undefined;
  setApiAuthTokenProvider(() => new Promise((resolve) => {
    resolveToken = (token) => resolve(token);
  }));
  const lease = captureApiAuthLease();
  const pendingHeaders = buildAuthorizedHeaders();

  setApiAuthTokenProvider(async () => "token-b");
  resolveToken?.("token-a");

  await assert.rejects(pendingHeaders, (error: unknown) =>
    error instanceof DOMException && error.name === "AbortError"
  );
  assert.equal(lease.signal.aborted, true);
  assert.equal(lease.isCurrent(), false);
  setApiAuthTokenProvider(null);
});
