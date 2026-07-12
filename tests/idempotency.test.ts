import assert from "node:assert/strict";
import { test } from "node:test";
import { bindOperationId, normalizeOperationId } from "../functions/api/_idempotency";

test("idempotency keys are stable for equivalent payloads", async () => {
  const first = await bindOperationId("restore", "op-1", { version: 7, nested: { b: 2, a: 1 } });
  const second = await bindOperationId("restore", "op-1", { nested: { a: 1, b: 2 }, version: 7 });
  assert.equal(first, second);
});

test("idempotency keys cannot be reused for a different operation or payload", async () => {
  const baseline = await bindOperationId("restore", "op-1", { version: 7 });
  assert.notEqual(baseline, await bindOperationId("restore", "op-1", { version: 8 }));
  assert.notEqual(baseline, await bindOperationId("project-put", "op-1", { version: 7 }));
  assert.equal(normalizeOperationId("contains spaces"), "");
});
