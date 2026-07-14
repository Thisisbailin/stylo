import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const actionBarSource = readFileSync("node-workspace/components/FloatingActionBar.tsx", "utf8");
const workspaceSource = readFileSync("node-workspace/components/CreativeWorkspace.tsx", "utf8");

test("account panel exposes project settings without duplicate account labels", () => {
  assert.match(actionBarSource, /onOpenSettings\?: \(\) => void/);
  assert.match(actionBarSource, /aria-label="打开设置"/);
  assert.match(workspaceSource, /onOpenSettings=\{\(\) => openProjectSettingsPanel\("provider"\)\}/);
  assert.doesNotMatch(actionBarSource, /Global account/);
  assert.doesNotMatch(actionBarSource, /\["Global account", "Workspace"\]/);
  assert.match(actionBarSource, /providedAccountEmail !== accountName/);
});
