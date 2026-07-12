import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decryptSecretEnvelope,
  encryptSecretEnvelope,
  isSecretCipherEnvelope,
} from "../functions/api/_secretCrypto";

const encryptionKey = Buffer.alloc(32, 0x5a).toString("base64url");

test("secret envelopes round-trip without storing plaintext", async () => {
  const plaintext = { secrets: { textApiKey: "sk-sensitive" }, meta: { lastOpId: "op-1" } };
  const envelope = await encryptSecretEnvelope(plaintext, "user-a", encryptionKey);

  assert.equal(isSecretCipherEnvelope(envelope), true);
  assert.equal(JSON.stringify(envelope).includes("sk-sensitive"), false);
  assert.deepEqual(await decryptSecretEnvelope(envelope, "user-a", encryptionKey), plaintext);
});

test("secret envelope authentication binds ciphertext to user and detects tampering", async () => {
  const envelope = await encryptSecretEnvelope({ secrets: { videoApiKey: "secret" } }, "user-a", encryptionKey);
  await assert.rejects(() => decryptSecretEnvelope(envelope, "user-b", encryptionKey), /authentication failed/);

  const tamperIndex = Math.floor(envelope.ciphertext.length / 2);
  const original = envelope.ciphertext[tamperIndex] || "A";
  const tampered = {
    ...envelope,
    ciphertext:
      envelope.ciphertext.slice(0, tamperIndex) +
      (original === "A" ? "B" : "A") +
      envelope.ciphertext.slice(tamperIndex + 1),
  };
  await assert.rejects(() => decryptSecretEnvelope(tampered, "user-a", encryptionKey), /authentication failed/);
});

test("invalid encryption keys fail closed", async () => {
  await assert.rejects(
    () => encryptSecretEnvelope({ secret: "value" }, "user-a", "not-32-bytes"),
    /exactly 32 bytes/
  );
});
