import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("Manus presents hidden floating tools, connected pages, and a LookBook identity rail", async () => {
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

  assert.doesNotMatch(chrome, /screenplay-header__bookmark/);
  assert.match(chrome, /screenplay-header__hot-zone/);
  assert.match(chrome, /screenplay-identity-dock__rail/);
  assert.match(chrome, /ScreenplayIdentityDock/);
  assert.match(chrome, /entry\.role\.kind === "person"/);
  assert.match(chrome, /entry\.role\.kind === "scene"/);
  assert.match(chrome, /打开 \$\{name\} 的 LookBook/);
  assert.match(writingPanel, /node\.type !== "identityCard" && node\.type !== "lookbook"/);
  assert.match(writingPanel, /identityArrivalQueue/);
  assert.match(writingPanel, /getConnectedScriptPageSequence/);
  assert.match(writingPanel, /onSplitScriptDocument/);
  assert.match(writingPanel, /commitDraft\(draftRef\.current, true\);[\s\S]*onOpenLookbook/);
  assert.match(workspace, /onOpenLookbook=\{\(identityNodeId\) => \{[\s\S]*setEditingScriptNodeId\(null\);[\s\S]*setActiveLookbookNodeId\(identityNodeId\);/);
  assert.match(styles, /\.screenplay-header \{[\s\S]*position: absolute;[\s\S]*right: -68px;/);
  assert.match(styles, /\.screenplay-document \{[\s\S]*border-radius: 8px;/);
  assert.match(styles, /\.screenplay-identity-dock__rail \{/);
  assert.match(styles, /scrollbar-width: none;/);
});
