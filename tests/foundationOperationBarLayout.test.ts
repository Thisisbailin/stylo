import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import path from "node:path";

const stylesheet = readFileSync(
  path.resolve(process.cwd(), "node-workspace/styles/nodeflow.css"),
  "utf8"
);

const finalLayoutMarker = "/* Bottom action bar: compact primary rail + detached Foundation expansion rail. */";
const finalLayout = stylesheet.slice(stylesheet.lastIndexOf(finalLayoutMarker));

const readRule = (selector: string, source = finalLayout) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`));
  assert.ok(match, `Missing CSS rule: ${selector}`);
  return match[1];
};

test("Foundation operation bar keeps one viewport-bottom anchor in every state", () => {
  const dockRule = readRule(".script-foundation-dock");
  const expandedRule = readRule('.script-foundation-dock[data-foundation-expanded="true"]');

  assert.match(dockRule, /position:\s*fixed/);
  assert.match(dockRule, /left:\s*50vw/);
  assert.match(dockRule, /bottom:\s*max\(18px,\s*env\(safe-area-inset-bottom\)\)/);
  assert.match(dockRule, /transform:\s*translateX\(-50%\)/);
  assert.doesNotMatch(expandedRule, /(?:^|;)\s*(?:left|right|bottom|transform)\s*:/);
});

test("Foundation expansion rail grows above the anchored operation bar", () => {
  const axisBodyRule = readRule(".script-foundation-axis-body");

  assert.match(axisBodyRule, /top:\s*auto/);
  assert.match(axisBodyRule, /bottom:\s*calc\(100%\s*\+\s*10px\)/);
});

test("narrow screens change spacing without moving the expanded operation bar", () => {
  const narrowLayout = finalLayout.slice(finalLayout.lastIndexOf("@media (max-width: 760px)"));
  const dockRule = readRule(".script-foundation-dock", narrowLayout);
  const expandedRule = readRule('.script-foundation-dock[data-foundation-expanded="true"]', narrowLayout);
  const axisBodyRule = readRule(".script-foundation-axis-body", narrowLayout);

  assert.match(dockRule, /bottom:\s*max\(12px,\s*env\(safe-area-inset-bottom\)\)/);
  assert.doesNotMatch(expandedRule, /(?:^|;)\s*(?:left|right|bottom|transform)\s*:/);
  assert.match(axisBodyRule, /bottom:\s*calc\(100%\s*\+\s*8px\)/);
});
