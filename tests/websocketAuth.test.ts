import assert from "node:assert/strict";
import { test } from "node:test";
import {
  encodeWebSocketCredential,
  readWebSocketCredential,
} from "../utils/websocketAuth";

test("WebSocket credentials round-trip Unicode without unsafe protocol characters", () => {
  const credential = "sk-测试-🔐-with spaces";
  const protocol = encodeWebSocketCredential(credential);

  assert.match(protocol, /^stylo-auth\.[A-Za-z0-9_-]+$/);
  assert.equal(readWebSocketCredential(protocol), credential);
});

test("WebSocket credentials are selected from a protocol list", () => {
  const credentialProtocol = encodeWebSocketCredential("token-123");

  assert.equal(
    readWebSocketCredential(`chat.v1, ${credentialProtocol}, telemetry.v1`),
    "token-123"
  );
});

test("malformed or unrelated WebSocket protocols never produce credentials", () => {
  assert.equal(readWebSocketCredential(null), "");
  assert.equal(readWebSocketCredential("chat.v1, telemetry.v1"), "");
  assert.equal(readWebSocketCredential("stylo-auth.***"), "");
  assert.equal(readWebSocketCredential("stylo-auth.not-valid-utf8-_w"), "");
});

test("pre-release WebSocket credential protocols remain readable during migration", () => {
  const current = encodeWebSocketCredential("legacy-token");
  const legacy = current.replace(/^stylo-auth\./, "qalam-auth.");
  assert.equal(readWebSocketCredential(legacy), "legacy-token");
});
