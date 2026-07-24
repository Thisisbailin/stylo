import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("selected Flow edges expose the shared disconnect control", async () => {
  const root = process.cwd();
  const edge = await readFile(
    path.join(root, "node-workspace/edges/DisconnectableEdge.tsx"),
    "utf8"
  );
  const flowSurface = await readFile(
    path.join(root, "node-workspace/components/FlowSurface.tsx"),
    "utf8"
  );
  const styles = await readFile(
    path.join(root, "node-workspace/styles/nodeflow.css"),
    "utf8"
  );

  assert.match(edge, /if \(!selected \|\| deletable === false\) return null/);
  assert.match(edge, /deleteElements\(\{ edges: \[\{ id: edgeId \}\] \}\)/);
  assert.match(edge, /<LinkBreak/);
  assert.match(edge, /aria-label="断开连接"/);
  assert.match(flowSurface, /disconnectable: DisconnectableEdge/);
  assert.match(flowSurface, /"wrapperMembership" : "disconnectable"/);
  assert.equal(flowSurface.match(/<EdgeDisconnectControl/g)?.length, 2);
  assert.match(styles, /\.flow-edge-disconnect \{[\s\S]*width: 28px;[\s\S]*pointer-events: all;/);
});
