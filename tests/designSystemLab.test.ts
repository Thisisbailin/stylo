import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Design System Lab is routed as an explicit placeholder module", () => {
  const app = readFileSync("App.tsx", "utf8");
  const moduleBar = readFileSync("node-workspace/components/ModuleBar.tsx", "utf8");
  const settings = readFileSync("node-workspace/components/ProjectSettingsPanel.tsx", "utf8");
  const lab = readFileSync("node-workspace/components/DesignSystemLab.tsx", "utf8");

  assert.match(moduleBar, /"designSystemLab"/);
  assert.match(settings, /actionKey: "designSystemLab"[\s\S]*title: "Design System"/);
  assert.match(app, /openLabModal === "designSystemLab"[\s\S]*<DesignSystemLab/);
  assert.match(lab, /aria-label="Design System Lab"/);
  assert.match(lab, /Lab placeholder/);
  assert.match(lab, /Tokens[\s\S]*Typography[\s\S]*Components[\s\S]*Motion/);
  assert.match(lab, /event\.key === "Escape"/);
});
