import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

test("Electron uses the configured dev port and blocks unsafe navigation", async () => {
  const source = await readFile(path.join(process.cwd(), "electron/main.cjs"), "utf8");
  assert.match(source, /DEFAULT_DEV_URL = "http:\/\/127\.0\.0\.1:3000"/);
  assert.match(source, /contextIsolation: true/);
  assert.match(source, /nodeIntegration: false/);
  assert.match(source, /sandbox: true/);
  assert.match(source, /webContents\.on\("will-navigate"/);
  assert.match(source, /\["http:", "https:"\]\.includes/);
});
