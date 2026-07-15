import type { NodeFlowLink, NodeFlowNode } from "../types";
import { isLookbookNodeType } from "../../utils/lookbookIdentities";
import { SCREENPLAY_PAGE_RELATION } from "../screenplay/manusPages";

export type WrapperProjection = {
  hiddenNodeIds: Set<string>;
  memberIdsByWrapper: Map<string, string[]>;
  screenplayRootIds: Set<string>;
};

const isCollapsed = (node: NodeFlowNode) => node.data?.wrapperCollapsed === true;

const addMember = (members: Map<string, Set<string>>, wrapperId: string, memberId: string) => {
  if (!memberId || memberId === wrapperId) return;
  const current = members.get(wrapperId) || new Set<string>();
  current.add(memberId);
  members.set(wrapperId, current);
};

const collectScreenplayDescendants = (
  rootId: string,
  outgoing: Map<string, string[]>,
  scriptNodeIds: Set<string>
) => {
  const descendants: string[] = [];
  const visited = new Set<string>([rootId]);
  const queue = [...(outgoing.get(rootId) || [])];
  while (queue.length) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId) || !scriptNodeIds.has(nodeId)) continue;
    visited.add(nodeId);
    descendants.push(nodeId);
    queue.push(...(outgoing.get(nodeId) || []));
  }
  return descendants;
};

export const buildWrapperProjection = (
  nodes: NodeFlowNode[],
  links: NodeFlowLink[]
): WrapperProjection => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const lookbookIds = new Set(nodes.filter((node) => isLookbookNodeType(node.type)).map((node) => node.id));
  const leporelloIds = new Set(nodes.filter((node) => node.type === "leporello").map((node) => node.id));
  const scriptNodeIds = new Set(nodes.filter((node) => node.type === "scriptPage").map((node) => node.id));
  const memberSets = new Map<string, Set<string>>();
  const screenplayIncoming = new Set<string>();
  const screenplayOutgoing = new Map<string, string[]>();

  links.forEach((link) => {
    if (link.data?.relation === "lookbook-membership") {
      if (lookbookIds.has(link.source) && nodeById.has(link.target)) addMember(memberSets, link.source, link.target);
      if (lookbookIds.has(link.target) && nodeById.has(link.source)) addMember(memberSets, link.target, link.source);
      return;
    }
    if (link.data?.relation === "leporello-membership") {
      if (leporelloIds.has(link.source) && nodeById.has(link.target)) addMember(memberSets, link.source, link.target);
      if (leporelloIds.has(link.target) && nodeById.has(link.source)) addMember(memberSets, link.target, link.source);
      return;
    }
    if (
      link.data?.relation === SCREENPLAY_PAGE_RELATION &&
      scriptNodeIds.has(link.source) &&
      scriptNodeIds.has(link.target)
    ) {
      screenplayIncoming.add(link.target);
      const targets = screenplayOutgoing.get(link.source) || [];
      targets.push(link.target);
      screenplayOutgoing.set(link.source, targets);
    }
  });

  const screenplayRootIds = new Set(
    Array.from(scriptNodeIds).filter((nodeId) => !screenplayIncoming.has(nodeId))
  );
  screenplayRootIds.forEach((rootId) => {
    collectScreenplayDescendants(rootId, screenplayOutgoing, scriptNodeIds)
      .forEach((memberId) => addMember(memberSets, rootId, memberId));
  });

  const hiddenNodeIds = new Set<string>();
  memberSets.forEach((memberIds, wrapperId) => {
    const wrapper = nodeById.get(wrapperId);
    if (!wrapper || !isCollapsed(wrapper)) return;
    memberIds.forEach((memberId) => hiddenNodeIds.add(memberId));
  });

  return {
    hiddenNodeIds,
    memberIdsByWrapper: new Map(
      Array.from(memberSets, ([wrapperId, memberIds]) => [wrapperId, Array.from(memberIds)])
    ),
    screenplayRootIds,
  };
};
