import type { XYPosition } from "@xyflow/react";
import type {
  NodeFlowFile,
  NodeFlowGraphLink,
  NodeFlowLink,
  NodeFlowNode,
  NodeFlowNodeStyle,
  NodeType,
} from "../types";
import { createDefaultNodeFlowNodeData } from "./defaults";
import { buildNodeFlowLinkId } from "./links";
import { normalizeNodeFlowGraphLinks } from "./graphLinks";
import { dedupeNodeFlowRefs } from "./refs";

const LEGACY_AUTO_HEIGHTS: Partial<Record<NodeType, number>> = {
  audioInput: 280,
  videoInput: 420,
  seedanceVideoGen: 640,
};

export const getNodeFlowNodeDimensions = (node: NodeFlowNode) => {
  const styleWidth = typeof node.style?.width === "number" ? node.style.width : undefined;
  const styleHeight = typeof node.style?.height === "number" ? node.style.height : undefined;
  const measuredWidth = typeof node.measured?.width === "number" ? node.measured.width : undefined;
  const measuredHeight = typeof node.measured?.height === "number" ? node.measured.height : undefined;
  return {
    width: measuredWidth ?? styleWidth ?? 280,
    height: measuredHeight ?? styleHeight ?? 200,
  };
};

export const getNodeFlowAbsolutePosition = (node: NodeFlowNode, nodeMap: Map<string, NodeFlowNode>) => {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  while (parentId) {
    const parent = nodeMap.get(parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }
  return { x, y };
};

export const sanitizeNodeFlowNodeStyle = (type: NodeType, style?: NodeFlowNodeStyle) => {
  if (!style) return style;
  const nextStyle = { ...style };
  const legacyHeight = LEGACY_AUTO_HEIGHTS[type];
  if (
    legacyHeight !== undefined &&
    (nextStyle.height === legacyHeight ||
      nextStyle.height === `${legacyHeight}` ||
      nextStyle.height === `${legacyHeight}px`)
  ) {
    delete nextStyle.height;
  }
  return Object.keys(nextStyle).length > 0 ? nextStyle : undefined;
};

export const normalizeNodeFlowNode = (node: NodeFlowNode): NodeFlowNode => {
  const base = createDefaultNodeFlowNodeData(node.type);
  const data = base ? { ...base, ...(node.data || {}) } : node.data || {};
  const position = node.position || { x: 0, y: 0 };
  return {
    ...node,
    position,
    selected: false,
    data,
    style: sanitizeNodeFlowNodeStyle(node.type, node.style),
  };
};

export const normalizeNodeFlowLink = (link: NodeFlowLink, index: number): NodeFlowLink => {
  const id =
    link.id ||
    buildNodeFlowLinkId(link.source, link.target, link.sourceHandle, link.targetHandle) ||
    `link-${index}`;
  return {
    ...link,
    id,
    sourceHandle: link.sourceHandle ?? null,
    targetHandle: link.targetHandle ?? null,
    selected: false,
  };
};

export const normalizeNodeFlowData = (nodeFlow: NodeFlowFile) => {
  const nodes = dedupeNodeFlowRefs(
    Array.isArray(nodeFlow.nodes) ? nodeFlow.nodes.map(normalizeNodeFlowNode) : []
  );
  const nodeIds = new Set(nodes.map((node) => node.id));
  const links = Array.isArray(nodeFlow.links)
    ? nodeFlow.links
        .map(normalizeNodeFlowLink)
        .filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target))
    : [];
  const graphLinks: NodeFlowGraphLink[] = normalizeNodeFlowGraphLinks(nodeFlow.graphLinks);
  return { nodes, links, graphLinks };
};

export const normalizeNodeFlowGroupBindings = (nodes: NodeFlowNode[], links: NodeFlowLink[]) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, Set<string>>();
  links.forEach((link) => {
    if (!adjacency.has(link.source)) adjacency.set(link.source, new Set());
    if (!adjacency.has(link.target)) adjacency.set(link.target, new Set());
    adjacency.get(link.source)!.add(link.target);
    adjacency.get(link.target)!.add(link.source);
  });

  const groupOrder = new Map<string, number>();
  nodes.forEach((node, index) => {
    if (node.type === "group") groupOrder.set(node.id, index);
  });
  const groupIdSet = new Set(Array.from(groupOrder.keys()));

  let changed = false;
  let nextNodes = nodes.slice();

  const updateNode = (nodeId: string, updates: Partial<NodeFlowNode>) => {
    const index = nextNodes.findIndex((node) => node.id === nodeId);
    if (index === -1) return;
    const updated = { ...nextNodes[index], ...updates };
    nextNodes[index] = updated;
    nodeMap.set(nodeId, updated);
    changed = true;
  };

  const pickPrimaryGroup = (groupIds: Set<string>) => {
    const selectedGroups = Array.from(groupIds).filter((id) => nodeMap.get(id)?.selected);
    if (selectedGroups.length > 0) {
      return selectedGroups.reduce((winner, id) => {
        const winnerOrder = groupOrder.get(winner) ?? -1;
        const currentOrder = groupOrder.get(id) ?? -1;
        return currentOrder > winnerOrder ? id : winner;
      }, selectedGroups[0]);
    }

    let winner: string | null = null;
    let bestOrder = -1;
    groupIds.forEach((id) => {
      const order = groupOrder.get(id) ?? -1;
      if (order > bestOrder) {
        bestOrder = order;
        winner = id;
      }
    });
    return winner;
  };

  const visited = new Set<string>();
  const mergedGroupIds = new Set<string>();
  const nonGroupNodes = nodes.filter((node) => node.type !== "group");

  nonGroupNodes.forEach((node) => {
    if (visited.has(node.id)) return;
    const queue = [node.id];
    visited.add(node.id);
    const componentIds: string[] = [];
    const componentGroupIds = new Set<string>();

    while (queue.length) {
      const currentId = queue.shift()!;
      componentIds.push(currentId);
      const currentNode = nodeMap.get(currentId);
      if (currentNode?.parentId && groupIdSet.has(currentNode.parentId)) {
        componentGroupIds.add(currentNode.parentId);
      }
      const neighbors = adjacency.get(currentId);
      if (!neighbors) continue;
      neighbors.forEach((neighborId) => {
        if (visited.has(neighborId)) return;
        const neighbor = nodeMap.get(neighborId);
        if (!neighbor || neighbor.type === "group") return;
        visited.add(neighborId);
        queue.push(neighborId);
      });
    }

    if (componentGroupIds.size === 0) return;
    const primaryGroupId = pickPrimaryGroup(componentGroupIds);
    if (!primaryGroupId) return;
    const primaryGroup = nodeMap.get(primaryGroupId);
    if (!primaryGroup) return;

    const needsMerge = componentIds.some((id) => {
      const target = nodeMap.get(id);
      return !target || target.parentId !== primaryGroupId;
    });

    if (needsMerge) {
      const primaryChildren = nextNodes
        .filter((child) => child.parentId === primaryGroupId && child.type !== "group")
        .map((child) => child.id);
      const affectedIds = new Set([...primaryChildren, ...componentIds]);
      const absPositions = new Map<string, XYPosition>();

      affectedIds.forEach((id) => {
        const target = nodeMap.get(id);
        if (!target) return;
        absPositions.set(id, getNodeFlowAbsolutePosition(target, nodeMap));
      });

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      componentIds.forEach((id) => {
        const target = nodeMap.get(id);
        if (!target) return;
        const abs = absPositions.get(id) ?? getNodeFlowAbsolutePosition(target, nodeMap);
        const size = getNodeFlowNodeDimensions(target);
        minX = Math.min(minX, abs.x);
        minY = Math.min(minY, abs.y);
        maxX = Math.max(maxX, abs.x + size.width);
        maxY = Math.max(maxY, abs.y + size.height);
      });

      const paddingX = 80;
      const paddingY = 100;
      const componentBounds = {
        x: minX - paddingX,
        y: minY - paddingY,
        width: maxX - minX + paddingX * 2,
        height: maxY - minY + paddingY * 2,
      };
      const groupAbs = getNodeFlowAbsolutePosition(primaryGroup, nodeMap);
      const groupSize = getNodeFlowNodeDimensions(primaryGroup);
      const groupBounds = {
        x: groupAbs.x,
        y: groupAbs.y,
        width: groupSize.width,
        height: groupSize.height,
      };
      const nextX = Math.min(groupBounds.x, componentBounds.x);
      const nextY = Math.min(groupBounds.y, componentBounds.y);
      const nextMaxX = Math.max(groupBounds.x + groupBounds.width, componentBounds.x + componentBounds.width);
      const nextMaxY = Math.max(groupBounds.y + groupBounds.height, componentBounds.y + componentBounds.height);
      const nextBounds = {
        x: nextX,
        y: nextY,
        width: nextMaxX - nextX,
        height: nextMaxY - nextY,
      };
      const nextGroupPosition = { x: nextBounds.x, y: nextBounds.y };

      if (
        nextBounds.x !== groupBounds.x ||
        nextBounds.y !== groupBounds.y ||
        nextBounds.width !== groupBounds.width ||
        nextBounds.height !== groupBounds.height
      ) {
        updateNode(primaryGroupId, {
          position: nextGroupPosition,
          style: { ...(primaryGroup.style || {}), width: nextBounds.width, height: nextBounds.height },
        });
      }

      componentIds.forEach((id) => {
        const target = nodeMap.get(id);
        if (!target || target.parentId === primaryGroupId) return;
        updateNode(id, { parentId: primaryGroupId });
      });

      affectedIds.forEach((id) => {
        const abs = absPositions.get(id);
        if (!abs) return;
        updateNode(id, { position: { x: abs.x - nextGroupPosition.x, y: abs.y - nextGroupPosition.y } });
      });

      componentGroupIds.forEach((groupId) => {
        if (groupId !== primaryGroupId) mergedGroupIds.add(groupId);
      });
    }
  });

  const groupNodes = nextNodes.filter((node) => node.type === "group");
  groupNodes.forEach((groupNode) => {
    const groupId = groupNode.id;
    const groupChildren = nextNodes.filter((node) => node.parentId === groupId && node.type !== "group");
    const childSet = new Set(groupChildren.map((node) => node.id));
    if (childSet.size === 0) return;

    const groupAbs = getNodeFlowAbsolutePosition(groupNode, nodeMap);
    const groupSize = getNodeFlowNodeDimensions(groupNode);
    const groupBounds = {
      x: groupAbs.x,
      y: groupAbs.y,
      width: groupSize.width,
      height: groupSize.height,
    };
    const margin = 40;

    childSet.forEach((nodeId) => {
      const node = nodeMap.get(nodeId);
      if (!node || node.parentId !== groupId) return;
      const neighbors = adjacency.get(nodeId);
      const hasGroupLink = neighbors ? Array.from(neighbors).some((id) => childSet.has(id)) : false;
      const desiredExtent = hasGroupLink ? "parent" : undefined;
      if (node.extent !== desiredExtent) {
        updateNode(nodeId, { extent: desiredExtent });
      }

      if (hasGroupLink) return;
      const abs = getNodeFlowAbsolutePosition(node, nodeMap);
      const size = getNodeFlowNodeDimensions(node);
      const outside =
        abs.x + size.width < groupBounds.x - margin ||
        abs.x > groupBounds.x + groupBounds.width + margin ||
        abs.y + size.height < groupBounds.y - margin ||
        abs.y > groupBounds.y + groupBounds.height + margin;
      if (outside) {
        updateNode(nodeId, {
          parentId: undefined,
          extent: undefined,
          position: abs,
        });
      }
    });
  });

  if (mergedGroupIds.size > 0) {
    const childCount = new Map<string, number>();
    nextNodes.forEach((node) => {
      if (node.parentId) {
        childCount.set(node.parentId, (childCount.get(node.parentId) ?? 0) + 1);
      }
    });
    const removableIds = new Set<string>();
    mergedGroupIds.forEach((id) => {
      if ((childCount.get(id) ?? 0) === 0) removableIds.add(id);
    });
    if (removableIds.size > 0) {
      nextNodes = nextNodes.filter((node) => !(node.type === "group" && removableIds.has(node.id)));
      changed = true;
    }
  }

  const orderedNodes = nextNodes.slice().sort((a, b) => {
    const aGroup = a.type === "group";
    const bGroup = b.type === "group";
    if (aGroup !== bGroup) return aGroup ? -1 : 1;
    return 0;
  });

  const orderChanged =
    orderedNodes.length !== nodes.length ||
    orderedNodes.some((node, index) => nodes[index]?.id !== node.id);

  if (changed || orderChanged) {
    return orderedNodes;
  }

  return nodes;
};
