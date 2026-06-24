import type { FlowState } from "../../types";
import type { NodeFlowNode, NodeFlowNodeData } from "../types";
import { isFoundationAxis, isNodeTypeAllowedInFoundationAxis } from "./axes";

export const FOUNDATION_MEMBERSHIP_RELATION = "foundation-membership" as const;

const getNodeName = (node: NodeFlowNode) => {
  const data = node.data as { filename?: string | null; title?: string; label?: string };
  return data.filename?.trim() || data.title?.trim() || data.label?.trim() || node.id;
};

const splitFilename = (name: string) => {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) return { stem: name, extension: "" };
  return { stem: name.slice(0, dotIndex), extension: name.slice(dotIndex) };
};

export const createUniqueFoundationMemberName = (name: string, occupiedNames: Iterable<string>) => {
  const occupied = new Set(Array.from(occupiedNames, (item) => item.trim().toLocaleLowerCase()).filter(Boolean));
  if (!occupied.has(name.trim().toLocaleLowerCase())) return name;
  const { stem, extension } = splitFilename(name);
  let index = 1;
  while (true) {
    const suffix = index === 1 ? " 副本" : ` 副本 ${index}`;
    const candidate = `${stem}${suffix}${extension}`;
    if (!occupied.has(candidate.toLocaleLowerCase())) return candidate;
    index += 1;
  }
};

const getFoundationRole = (node?: NodeFlowNode | null) =>
  typeof node?.data?.foundationRole === "string" ? node.data.foundationRole : "";

const isBlockFolder = (node?: NodeFlowNode | null) => getFoundationRole(node) === "block-folder";

export const isFoundationMembershipLink = (
  nodes: NodeFlowNode[],
  link: FlowState["links"][number]
) => {
  if (link.data?.relation === FOUNDATION_MEMBERSHIP_RELATION) return true;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return isBlockFolder(nodeById.get(link.source)) && !getFoundationRole(nodeById.get(link.target));
};

export const createFoundationMembershipLink = (blockId: string, nodeId: string): FlowState["links"][number] => ({
  id: `link-${blockId}-${nodeId}-text-text`,
  source: blockId,
  target: nodeId,
  sourceHandle: "text",
  targetHandle: "text",
  data: { relation: FOUNDATION_MEMBERSHIP_RELATION },
});

const renameForDestination = (
  node: NodeFlowNode,
  destinationMembers: NodeFlowNode[]
): NodeFlowNode => {
  const originalName = getNodeName(node);
  const nextName = createUniqueFoundationMemberName(originalName, destinationMembers.map(getNodeName));
  if (nextName === originalName) return node;
  const data = node.data as NodeFlowNodeData & { filename?: string | null; title?: string; label?: string };
  const patch: Record<string, unknown> = {};
  if (typeof data.filename === "string" && data.filename.trim()) patch.filename = nextName;
  if (typeof data.title === "string" && data.title.trim() === originalName) patch.title = nextName;
  if (!data.filename && typeof data.title === "string" && data.title.trim()) patch.title = nextName;
  if (!data.filename && !data.title && typeof data.label === "string") patch.label = nextName;
  return { ...node, data: { ...node.data, ...patch } as NodeFlowNodeData };
};

export const assignFoundationMembership = (
  flow: FlowState,
  blockId: string,
  nodeId: string
): FlowState => {
  const nodes = flow.flowNodes || [];
  const block = nodes.find((node) => node.id === blockId);
  const member = nodes.find((node) => node.id === nodeId);
  if (!block || !isBlockFolder(block)) throw new Error("目标不是 Foundation 块文件夹。");
  if (!member || getFoundationRole(member)) throw new Error("Foundation 块只能归属普通节点。");
  const axis = block.data?.foundationAxis;
  if (!isFoundationAxis(axis)) throw new Error("Foundation 块缺少有效轴类型。");
  if (!isNodeTypeAllowedInFoundationAxis(axis, member.type)) {
    throw new Error(`${axis} 轴不接受 ${member.type} 节点。`);
  }

  const retainedLinks = flow.links.filter(
    (link) => !(link.target === nodeId && isFoundationMembershipLink(nodes, link))
  );
  const destinationMemberIds = new Set(
    retainedLinks
      .filter((link) => link.source === blockId && isFoundationMembershipLink(nodes, link))
      .map((link) => link.target)
  );
  const renamedMember = renameForDestination(
    member,
    nodes.filter((node) => destinationMemberIds.has(node.id) && node.id !== nodeId)
  );
  const nextNodes = nodes.map((node) =>
    node.id === nodeId
      ? {
          ...renamedMember,
          data: { ...renamedMember.data, foundationContainerId: blockId } as NodeFlowNodeData,
        }
      : node
  );
  return {
    ...flow,
    revision: (flow.revision || 0) + 1,
    flowNodes: nextNodes,
    links: [...retainedLinks, createFoundationMembershipLink(blockId, nodeId)],
  };
};

export const removeFoundationMembership = (
  flow: FlowState,
  nodeId: string,
  blockId?: string
): FlowState => {
  const nodes = flow.flowNodes || [];
  const nextLinks = flow.links.filter(
    (link) =>
      !(
        link.target === nodeId &&
        (!blockId || link.source === blockId) &&
        isFoundationMembershipLink(nodes, link)
      )
  );
  if (nextLinks.length === flow.links.length) return flow;
  return {
    ...flow,
    revision: (flow.revision || 0) + 1,
    flowNodes: nodes.map((node) =>
      node.id === nodeId
        ? { ...node, data: { ...node.data, foundationContainerId: undefined } as NodeFlowNodeData }
        : node
    ),
    links: nextLinks,
  };
};

export const normalizeFoundationMemberships = (flow: FlowState): FlowState => {
  const nodes = flow.flowNodes || [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const chosenByTarget = new Map<string, FlowState["links"][number]>();
  const ordinaryLinks: FlowState["links"] = [];
  let changed = false;

  flow.links.forEach((link) => {
    if (!isFoundationMembershipLink(nodes, link)) {
      ordinaryLinks.push(link);
      return;
    }
    const block = nodeById.get(link.source);
    const member = nodeById.get(link.target);
    const axis = block?.data?.foundationAxis;
    if (!block || !member || !isFoundationAxis(axis) || !isNodeTypeAllowedInFoundationAxis(axis, member.type)) {
      changed = true;
      return;
    }
    const current = chosenByTarget.get(link.target);
    const preferredBlockId = member.data?.foundationContainerId;
    if (!current || (preferredBlockId === link.source && current.source !== preferredBlockId)) {
      if (current) changed = true;
      chosenByTarget.set(link.target, {
        ...link,
        data: { ...link.data, relation: FOUNDATION_MEMBERSHIP_RELATION },
      });
    } else {
      changed = true;
    }
    if (link.data?.relation !== FOUNDATION_MEMBERSHIP_RELATION) changed = true;
  });

  const membersByBlock = new Map<string, NodeFlowNode[]>();
  const nextNodes = nodes.map((node) => {
    if (getFoundationRole(node)) return node;
    const containerId = chosenByTarget.get(node.id)?.source;
    let nextNode = node;
    if (node.data?.foundationContainerId !== containerId) {
      changed = true;
      nextNode = {
        ...node,
        data: { ...node.data, foundationContainerId: containerId } as NodeFlowNodeData,
      };
    }
    if (containerId) {
      const existingMembers = membersByBlock.get(containerId) || [];
      const renamed = renameForDestination(nextNode, existingMembers);
      if (renamed !== nextNode) changed = true;
      nextNode = renamed;
      existingMembers.push(nextNode);
      membersByBlock.set(containerId, existingMembers);
    }
    return nextNode;
  });
  if (!changed) return flow;
  return {
    ...flow,
    flowNodes: nextNodes,
    links: [...ordinaryLinks, ...chosenByTarget.values()],
  };
};
