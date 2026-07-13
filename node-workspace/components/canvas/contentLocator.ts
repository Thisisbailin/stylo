import type { SharedCanvasViewport } from "./types";

export type CanvasContentDirection = "left" | "right" | "up" | "down";

export type CanvasContentRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasContentLocation =
  | { status: "no_nodes" }
  | { status: "visible" }
  | { status: "offscreen"; direction: CanvasContentDirection };

type LocateCanvasContentInput = {
  viewport: SharedCanvasViewport;
  canvasWidth: number;
  canvasHeight: number;
  nodeRects: CanvasContentRect[];
  leftInset?: number;
  rightInset?: number;
  topInset?: number;
  bottomInset?: number;
  minimumVisiblePixels?: number;
};

const isFiniteRect = (rect: CanvasContentRect) =>
  Number.isFinite(rect.x) &&
  Number.isFinite(rect.y) &&
  Number.isFinite(rect.width) &&
  Number.isFinite(rect.height) &&
  rect.width > 0 &&
  rect.height > 0;

const clampInset = (value: number | undefined, limit: number) =>
  Math.min(Math.max(Number.isFinite(value) ? Number(value) : 0, 0), Math.max(limit, 0));

export const locateCanvasContent = ({
  viewport,
  canvasWidth,
  canvasHeight,
  nodeRects,
  leftInset,
  rightInset,
  topInset,
  bottomInset,
  minimumVisiblePixels = 12,
}: LocateCanvasContentInput): CanvasContentLocation => {
  const measurableNodes = nodeRects.filter(isFiniteRect);
  if (!measurableNodes.length) return { status: "no_nodes" };

  const width = Math.max(0, Number.isFinite(canvasWidth) ? canvasWidth : 0);
  const height = Math.max(0, Number.isFinite(canvasHeight) ? canvasHeight : 0);
  const zoom = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1;
  const effectiveLeft = clampInset(leftInset, width);
  const effectiveRight = clampInset(rightInset, width - effectiveLeft);
  const effectiveTop = clampInset(topInset, height);
  const effectiveBottom = clampInset(bottomInset, height - effectiveTop);
  const visibleWidth = width - effectiveLeft - effectiveRight;
  const visibleHeight = height - effectiveTop - effectiveBottom;
  if (visibleWidth <= 0 || visibleHeight <= 0) return { status: "visible" };

  const visibleRect: CanvasContentRect = {
    x: (effectiveLeft - viewport.x) / zoom,
    y: (effectiveTop - viewport.y) / zoom,
    width: visibleWidth / zoom,
    height: visibleHeight / zoom,
  };
  const minimumVisibleFlowSize = Math.max(1, minimumVisiblePixels / zoom);
  const hasVisibleNode = measurableNodes.some((node) => {
    const overlapWidth = Math.min(visibleRect.x + visibleRect.width, node.x + node.width) - Math.max(visibleRect.x, node.x);
    const overlapHeight = Math.min(visibleRect.y + visibleRect.height, node.y + node.height) - Math.max(visibleRect.y, node.y);
    return overlapWidth >= minimumVisibleFlowSize && overlapHeight >= minimumVisibleFlowSize;
  });
  if (hasVisibleNode) return { status: "visible" };

  const viewportCenter = {
    x: visibleRect.x + visibleRect.width / 2,
    y: visibleRect.y + visibleRect.height / 2,
  };
  const nearestNode = measurableNodes.reduce((nearest, node) => {
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;
    const distance = Math.hypot(centerX - viewportCenter.x, centerY - viewportCenter.y);
    return distance < nearest.distance ? { node, distance } : nearest;
  }, { node: measurableNodes[0], distance: Number.POSITIVE_INFINITY }).node;
  const deltaX = nearestNode.x + nearestNode.width / 2 - viewportCenter.x;
  const deltaY = nearestNode.y + nearestNode.height / 2 - viewportCenter.y;
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return { status: "offscreen", direction: deltaX < 0 ? "left" : "right" };
  }
  return { status: "offscreen", direction: deltaY < 0 ? "up" : "down" };
};

