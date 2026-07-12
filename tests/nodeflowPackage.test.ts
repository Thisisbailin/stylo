import assert from "node:assert/strict";
import { test } from "node:test";
import type { NodeFlowFile } from "../node-workspace/types";
import {
  buildNodeFlowPackageBlob,
  readNodeFlowImportFile,
} from "../node-workspace/nodeflow/package";
import { NODE_FLOW_IMPORT_LIMITS } from "../node-workspace/nodeflow/schema";

const makeTextProject = (): NodeFlowFile => ({
  version: 2,
  revision: 7,
  name: "Package Test",
  nodes: [{
    id: "text-1",
    type: "text",
    position: { x: 12, y: 34 },
    data: {
      title: "第一幕",
      text: "第一幕\n\n这是需要完整往返的正文。",
    },
  }],
  links: [],
  graphLinks: [],
});

test("Qalam package round-trip restores packed document content", async () => {
  const original = makeTextProject();
  const originalText = original.nodes[0]?.data.text;
  const blob = await buildNodeFlowPackageBlob(original);
  const imported = await readNodeFlowImportFile(new File(
    [blob],
    "package-test.qalam.zip",
    { type: "application/zip" }
  ));

  assert.equal(imported.version, 2);
  assert.equal(imported.revision, original.revision);
  assert.equal(imported.nodes[0]?.data.text, originalText);
  assert.equal("qalamPackageResources" in (imported.nodes[0]?.data || {}), false);
  assert.equal(original.nodes[0]?.data.text, originalText, "packing must not mutate the source project");
});

test("JSON imports use the same schema migration boundary", async () => {
  const legacy = {
    name: "Legacy JSON",
    nodes: [
      { id: "a", type: "text", position: { x: 0, y: 0 }, data: { text: "A" } },
      { id: "b", type: "text", position: { x: 1, y: 1 }, data: { text: "B" } },
    ],
    edges: [{ source: "a", target: "b" }],
  };
  const file = new File([JSON.stringify(legacy)], "legacy.json", { type: "application/json" });

  const imported = await readNodeFlowImportFile(file);

  assert.equal(imported.version, 2);
  assert.equal(imported.links[0]?.id, "link-imported-1");
});

test("invalid JSON, corrupt ZIPs, and oversized JSON fail closed", async () => {
  await assert.rejects(
    () => readNodeFlowImportFile(new File(["{"], "broken.json", { type: "application/json" })),
    /不是有效的 JSON/
  );
  await assert.rejects(
    () => readNodeFlowImportFile(new File([new Uint8Array([1, 2, 3, 4])], "broken.zip", { type: "application/zip" })),
    /zip/i
  );

  let readAttempted = false;
  const oversizedFile = {
    name: "oversized.json",
    type: "application/json",
    size: NODE_FLOW_IMPORT_LIMITS.jsonBytes + 1,
    text: async () => {
      readAttempted = true;
      return "{}";
    },
  } as File;
  await assert.rejects(
    () => readNodeFlowImportFile(oversizedFile),
    /超过 25 MB 限制/
  );
  assert.equal(readAttempted, false, "oversized input must be rejected before reading its body");
});
