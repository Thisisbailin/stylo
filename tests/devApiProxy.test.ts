import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Vite development routes HTTP APIs to a real Pages backend", async () => {
  const source = await readFile("vite.config.ts", "utf8");

  assert.match(source, /STYLO_DEV_API_BASE\s*\|\|\s*env\.VITE_API_BASE/);
  assert.match(source, /['"]\/api['"]:\s*\{[\s\S]*target:\s*devApiTarget/);
  assert.match(source, /https:\/\/node-qalam\.pages\.dev/);
});
