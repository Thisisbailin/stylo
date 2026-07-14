import assert from "node:assert/strict";
import test from "node:test";
import {
  applyNodeFlowCanvasLinkChangesCommand,
  applyNodeFlowCanvasNodeChangesCommand,
} from "../node-workspace/nodeflow/commands";
import {
  patchNodeFlowNodeData,
  patchNodeFlowNodeStyle,
} from "../node-workspace/nodeflow/mutations";
import type { NodeFlowLink, NodeFlowNode } from "../node-workspace/types";

const node: NodeFlowNode = {
  id: "text-1",
  type: "text",
  position: { x: 10, y: 20 },
  data: { title: "Text", text: "hello" },
  style: { width: 320, height: 240 },
};

test("equivalent node data and style patches do not advance the document revision", () => {
  const state = { revision: 5, nodes: [node], links: [] as NodeFlowLink[] };
  const sameData = patchNodeFlowNodeData(state, node.id, { text: "hello" });
  const sameStyle = patchNodeFlowNodeStyle(state, node.id, { width: 320 });

  assert.equal(sameData, state);
  assert.equal(sameStyle, state);
  assert.equal(patchNodeFlowNodeData(state, "missing", { text: "ignored" }), state);
});

test("React Flow measurement and selection events remain transient", () => {
  const state = { revision: 5, nodes: [node], links: [] as NodeFlowLink[] };
  const measured = applyNodeFlowCanvasNodeChangesCommand({
    state,
    changes: [{ type: "dimensions", id: node.id, dimensions: { width: 320, height: 240 } }],
  }).state;
  const selected = applyNodeFlowCanvasNodeChangesCommand({
    state,
    changes: [{ type: "select", id: node.id, selected: true }],
  }).state;

  assert.equal(measured.revision, 5);
  assert.equal(selected.revision, 5);
  assert.equal(selected.nodes[0].selected, true);
});

test("document node and link changes still advance the revision", () => {
  const link: NodeFlowLink = { id: "link-1", source: "text-1", target: "text-2" };
  const state = { revision: 5, nodes: [node], links: [link] };
  const moved = applyNodeFlowCanvasNodeChangesCommand({
    state,
    changes: [{ type: "position", id: node.id, position: { x: 30, y: 40 }, dragging: false }],
  }).state;
  const removed = applyNodeFlowCanvasLinkChangesCommand({
    state,
    changes: [{ type: "remove", id: link.id }],
  }).state;

  assert.equal(moved.revision, 6);
  assert.equal(removed.revision, 6);
});
