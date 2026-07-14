import type { Node, XYPosition } from "@xyflow/react";

export type EdgeAlignmentGuide = {
  x?: number;
  y?: number;
  xStrength?: number;
  yStrength?: number;
};

type AlignableNode = Pick<Node, "id" | "position" | "style" | "measured">;

type AlignmentResult = {
  position: XYPosition;
  guide: EdgeAlignmentGuide | null;
};

const DEFAULT_NODE_WIDTH = 320;
const DEFAULT_NODE_HEIGHT = 180;
const DEFAULT_GUIDE_THRESHOLD = 14;
const DEFAULT_SNAP_THRESHOLD = 4;

type AlignmentOptions = {
  guideThreshold?: number;
  snapThreshold?: number;
};

type Bounds = ReturnType<typeof getAlignableNodeBounds>;

const isVerticalNeighbor = (active: Bounds, target: Bounds) => target.bottom <= active.top || target.top >= active.bottom;

const isHorizontalNeighbor = (active: Bounds, target: Bounds) => target.right <= active.left || target.left >= active.right;

const getGuideStrength = (distance: number, threshold: number) => {
  if (threshold <= 0) return 1;
  return Math.max(0.2, 1 - distance / threshold);
};

const parseSize = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const getAlignableNodeSize = (node: AlignableNode) => ({
  width: node.measured?.width || parseSize(node.style?.width) || DEFAULT_NODE_WIDTH,
  height: node.measured?.height || parseSize(node.style?.height) || DEFAULT_NODE_HEIGHT,
});

export const getAlignableNodeBounds = (node: AlignableNode, position: XYPosition = node.position) => {
  const size = getAlignableNodeSize(node);
  return {
    left: position.x,
    right: position.x + size.width,
    top: position.y,
    bottom: position.y + size.height,
    width: size.width,
    height: size.height,
  };
};

export const getEdgeAlignedPosition = (
  activeNode: AlignableNode,
  nodes: AlignableNode[],
  position: XYPosition,
  options: AlignmentOptions = {}
): AlignmentResult => {
  const guideThreshold = Math.max(0, options.guideThreshold ?? DEFAULT_GUIDE_THRESHOLD);
  const snapThreshold = Math.min(
    guideThreshold,
    Math.max(0, options.snapThreshold ?? DEFAULT_SNAP_THRESHOLD)
  );
  const active = getAlignableNodeBounds(activeNode, position);
  let nextX = position.x;
  let nextY = position.y;
  let bestX = guideThreshold + 1;
  let bestY = guideThreshold + 1;
  let guideX: number | undefined;
  let guideY: number | undefined;
  let xStrength: number | undefined;
  let yStrength: number | undefined;

  nodes.forEach((node) => {
    if (node.id === activeNode.id) return;
    const target = getAlignableNodeBounds(node);

    if (isVerticalNeighbor(active, target)) {
      const targetXEdges = [target.left, target.right];
      const activeXEdges = [
        { edge: active.left, offset: 0 },
        { edge: active.right, offset: active.width },
      ];

      targetXEdges.forEach((targetEdge) => {
        activeXEdges.forEach((activeEdge) => {
          const distance = Math.abs(activeEdge.edge - targetEdge);
          if (distance < bestX && distance <= guideThreshold) {
            bestX = distance;
            if (distance <= snapThreshold) nextX = targetEdge - activeEdge.offset;
            guideX = targetEdge;
            xStrength = getGuideStrength(distance, guideThreshold);
          }
        });
      });
    }

    if (isHorizontalNeighbor(active, target)) {
      const targetYEdges = [target.top, target.bottom];
      const activeYEdges = [
        { edge: active.top, offset: 0 },
        { edge: active.bottom, offset: active.height },
      ];

      targetYEdges.forEach((targetEdge) => {
        activeYEdges.forEach((activeEdge) => {
          const distance = Math.abs(activeEdge.edge - targetEdge);
          if (distance < bestY && distance <= guideThreshold) {
            bestY = distance;
            if (distance <= snapThreshold) nextY = targetEdge - activeEdge.offset;
            guideY = targetEdge;
            yStrength = getGuideStrength(distance, guideThreshold);
          }
        });
      });
    }
  });

  const guide = guideX == null && guideY == null ? null : { x: guideX, y: guideY, xStrength, yStrength };
  return {
    position: { x: nextX, y: nextY },
    guide,
  };
};
