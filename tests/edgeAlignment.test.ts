import assert from "node:assert/strict";
import { test } from "node:test";
import { getEdgeAlignedPosition } from "../node-workspace/utils/edgeAlignment";

const createNode = (id: string, x: number, y: number) => ({
  id,
  position: { x, y },
  style: { width: 100, height: 100 },
  measured: { width: 100, height: 100 },
});

test("edge alignment previews nearby edges without pulling the node during drag", () => {
  const target = createNode("target", 100, 100);
  const active = createNode("active", 108, -100);
  const result = getEdgeAlignedPosition(active, [active, target], active.position, {
    guideThreshold: 14,
    snapThreshold: 4,
  });

  assert.deepEqual(result.position, { x: 108, y: -100 });
  assert.equal(result.guide?.x, 100);
  assert.equal(result.guide?.y, undefined);
});

test("edge alignment snaps only the active node inside the release threshold", () => {
  const target = createNode("target", 100, 100);
  const active = createNode("active", 104, -100);
  const targetBefore = structuredClone(target);
  const result = getEdgeAlignedPosition(active, [active, target], active.position, {
    guideThreshold: 14,
    snapThreshold: 4,
  });

  assert.deepEqual(result.position, { x: 100, y: -100 });
  assert.deepEqual(target, targetBefore, "alignment must never reposition another node");
});

test("edge alignment ignores distant and overlapping nodes", () => {
  const target = createNode("target", 100, 100);
  const distant = createNode("distant", 116, -100);
  const overlapping = createNode("overlapping", 105, 150);

  assert.equal(getEdgeAlignedPosition(distant, [distant, target], distant.position).guide, null);
  assert.equal(getEdgeAlignedPosition(overlapping, [overlapping, target], overlapping.position).guide, null);
});
