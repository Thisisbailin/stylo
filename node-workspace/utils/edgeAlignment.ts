import type { Node, NodeChange, XYPosition } from "@xyflow/react";

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
const ALIGN_THRESHOLD = 24;
const ALIGN_LOCK_THRESHOLD = 6;

type Bounds = ReturnType<typeof getAlignableNodeBounds>;

const isVerticalNeighbor = (active: Bounds, target: Bounds) => target.bottom <= active.top || target.top >= active.bottom;

const isHorizontalNeighbor = (active: Bounds, target: Bounds) => target.right <= active.left || target.left >= active.right;

const getMagneticPosition = (current: number, aligned: number, distance: number, threshold: number) => {
  if (distance <= ALIGN_LOCK_THRESHOLD) return aligned;
  const pull = Math.pow(1 - distance / threshold, 1.55) * 0.72;
  return current + (aligned - current) * pull;
};

const getGuideStrength = (distance: number, threshold: number) => {
  if (distance <= ALIGN_LOCK_THRESHOLD) return 1;
  return Math.max(0.24, 1 - distance / threshold);
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
  threshold = ALIGN_THRESHOLD
): AlignmentResult => {
  const active = getAlignableNodeBounds(activeNode, position);
  let nextX = position.x;
  let nextY = position.y;
  let bestX = threshold + 1;
  let bestY = threshold + 1;
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
        if (distance < bestX && distance <= threshold) {
          bestX = distance;
          nextX = getMagneticPosition(position.x, targetEdge - activeEdge.offset, distance, threshold);
          guideX = targetEdge;
          xStrength = getGuideStrength(distance, threshold);
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
        if (distance < bestY && distance <= threshold) {
          bestY = distance;
          nextY = getMagneticPosition(position.y, targetEdge - activeEdge.offset, distance, threshold);
          guideY = targetEdge;
          yStrength = getGuideStrength(distance, threshold);
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

export const alignPositionChangesToNodeEdges = <TNode extends AlignableNode>(
  changes: NodeChange<TNode>[],
  nodes: TNode[],
  enabled: boolean
): { changes: NodeChange<TNode>[]; guide: EdgeAlignmentGuide | null } => {
  if (!enabled) return { changes, guide: null };

  let lastGuide: EdgeAlignmentGuide | null = null;
  const alignedChanges = changes.map((change) => {
    if (change.type !== "position" || !change.position) return change;
    const node = nodes.find((item) => item.id === change.id);
    if (!node) return change;
    const result = getEdgeAlignedPosition(node, nodes, change.position);
    lastGuide = result.guide;
    return {
      ...change,
      position: result.position,
    };
  });

  return { changes: alignedChanges, guide: lastGuide };
};
