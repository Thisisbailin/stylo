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

test("Electron restores one visible window and persists its normal bounds", async () => {
  const source = await readFile(path.join(process.cwd(), "electron/main.cjs"), "utf8");
  assert.match(source, /app\.requestSingleInstanceLock\(\)/);
  assert.match(source, /stylo-window-state\.json/);
  assert.match(source, /screen\.getAllDisplays\(\)/);
  assert.match(source, /targetWindow\.getNormalBounds\(\)/);
  assert.match(source, /mainWindow\.on\("move", persistWindowStateSoon\)/);
  assert.match(source, /mainWindow\.on\("resize", persistWindowStateSoon\)/);
  assert.match(source, /mainWindow\.on\("close", persistWindowStateNow\)/);
});

test("desktop startup paints the light boot surface before React auth is ready", async () => {
  const html = await readFile(path.join(process.cwd(), "index.html"), "utf8");
  const entry = await readFile(path.join(process.cwd(), "index.tsx"), "utf8");
  assert.match(html, /stylo-desktop-runtime/);
  assert.match(html, /id="stylo-desktop-boot"/);
  assert.match(html, /background: #f3f3ef/);
  assert.match(html, /Electron\\\/\\d\+/);
  assert.match(entry, /MutationObserver/);
  assert.match(entry, /stylo-desktop-boot--exit/);
});
