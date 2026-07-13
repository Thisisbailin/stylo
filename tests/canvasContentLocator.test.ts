import assert from "node:assert/strict";
import { test } from "node:test";
import { locateCanvasContent } from "../node-workspace/components/canvas/contentLocator";

const viewport = { x: 0, y: 0, zoom: 1 };

test("canvas content locator stays hidden when there are no measurable nodes", () => {
  assert.deepEqual(locateCanvasContent({
    viewport,
    canvasWidth: 1000,
    canvasHeight: 700,
    nodeRects: [],
  }), { status: "no_nodes" });
});

test("canvas content locator recognizes a meaningfully visible node", () => {
  assert.deepEqual(locateCanvasContent({
    viewport,
    canvasWidth: 1000,
    canvasHeight: 700,
    nodeRects: [{ x: 120, y: 80, width: 280, height: 180 }],
  }), { status: "visible" });
});

test("canvas content locator points toward the nearest offscreen node", () => {
  assert.deepEqual(locateCanvasContent({
    viewport: { x: -2200, y: 0, zoom: 1 },
    canvasWidth: 1000,
    canvasHeight: 700,
    nodeRects: [
      { x: 80, y: 120, width: 240, height: 160 },
      { x: 7000, y: 120, width: 240, height: 160 },
    ],
  }), { status: "offscreen", direction: "left" });

  assert.deepEqual(locateCanvasContent({
    viewport,
    canvasWidth: 1000,
    canvasHeight: 700,
    nodeRects: [{ x: 420, y: 1800, width: 240, height: 160 }],
    bottomInset: 84,
  }), { status: "offscreen", direction: "down" });
});

test("canvas content locator excludes the Agent dock from the usable viewport", () => {
  const nodeRects = [{ x: 80, y: 120, width: 180, height: 160 }];
  assert.deepEqual(locateCanvasContent({
    viewport,
    canvasWidth: 1000,
    canvasHeight: 700,
    nodeRects,
  }), { status: "visible" });

  assert.deepEqual(locateCanvasContent({
    viewport,
    canvasWidth: 1000,
    canvasHeight: 700,
    nodeRects,
    leftInset: 320,
  }), { status: "offscreen", direction: "left" });
});
