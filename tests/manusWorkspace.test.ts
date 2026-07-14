import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("Manus presents attached tools and a LookBook identity dock", async () => {
  const root = process.cwd();
  const chrome = await readFile(
    path.join(root, "node-workspace/components/screenplay/ScreenplayChrome.tsx"),
    "utf8"
  );
  const writingPanel = await readFile(
    path.join(root, "node-workspace/components/WritingPanel.tsx"),
    "utf8"
  );
  const workspace = await readFile(
    path.join(root, "node-workspace/components/CreativeWorkspace.tsx"),
    "utf8"
  );
  const styles = await readFile(
    path.join(root, "node-workspace/styles/screenplay.css"),
    "utf8"
  );

  assert.match(chrome, /screenplay-header__bookmark/);
  assert.match(chrome, /ScreenplayIdentityDock/);
  assert.match(chrome, /entry\.role\.kind === "person"/);
  assert.match(chrome, /entry\.role\.kind === "scene"/);
  assert.match(chrome, /打开 \$\{name\} 的 LookBook/);
  assert.match(writingPanel, /node\.type !== "identityCard"/);
  assert.match(writingPanel, /identityArrivalQueue/);
  assert.match(writingPanel, /commitDraft\(draftRef\.current, true\);[\s\S]*onOpenLookbook/);
  assert.match(workspace, /onOpenLookbook=\{\(identityNodeId\) => \{[\s\S]*setEditingScriptNodeId\(null\);[\s\S]*setActiveLookbookNodeId\(identityNodeId\);/);
  assert.match(styles, /\.screenplay-header \{[\s\S]*position: absolute;[\s\S]*right: -38px;/);
  assert.match(styles, /\.screenplay-identity-dock \{[\s\S]*position: fixed;[\s\S]*bottom: 20px;/);
});
