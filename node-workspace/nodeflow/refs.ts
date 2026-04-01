import type { NodeFlowNode } from "../types";

export const normalizeNodeRef = (value?: string | null) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

export const getNodeFlowRef = (node?: NodeFlowNode | null) => {
  const ref = normalizeNodeRef((node?.data as Record<string, unknown> | undefined)?.qalamNodeRef as string | undefined);
  return ref || undefined;
};

export const setNodeFlowRef = <T extends Record<string, unknown>>(data: T | undefined, nodeRef?: string | null): T => {
  const resolved = normalizeNodeRef(nodeRef);
  if (!resolved) return { ...(data || {}) } as T;
  return {
    ...(data || {}),
    qalamNodeRef: resolved,
  } as T;
};

const buildRefConflictMap = (nodes: NodeFlowNode[], excludeNodeId?: string) => {
  const counts = new Map<string, number>();
  nodes.forEach((node) => {
    if (excludeNodeId && node.id === excludeNodeId) return;
    const ref = getNodeFlowRef(node);
    if (!ref) return;
    counts.set(ref, (counts.get(ref) || 0) + 1);
  });
  return counts;
};

export const ensureUniqueNodeRef = ({
  desiredRef,
  nodes,
  excludeNodeId,
}: {
  desiredRef?: string | null;
  nodes: NodeFlowNode[];
  excludeNodeId?: string;
}) => {
  const normalized = normalizeNodeRef(desiredRef);
  if (!normalized) return undefined;
  const conflicts = buildRefConflictMap(nodes, excludeNodeId);
  if (!conflicts.has(normalized)) return normalized;

  let suffix = 2;
  let candidate = `${normalized}_${suffix}`;
  while (conflicts.has(candidate)) {
    suffix += 1;
    candidate = `${normalized}_${suffix}`;
  }
  return candidate;
};

export const dedupeNodeFlowRefs = (nodes: NodeFlowNode[]) => {
  const seen = new Set<string>();
  return nodes.map((node) => {
    const ref = getNodeFlowRef(node);
    if (!ref) return node;
    if (!seen.has(ref)) {
      seen.add(ref);
      return node;
    }
    let suffix = 2;
    let nextRef = `${ref}_${suffix}`;
    while (seen.has(nextRef)) {
      suffix += 1;
      nextRef = `${ref}_${suffix}`;
    }
    seen.add(nextRef);
    return {
      ...node,
      data: setNodeFlowRef((node.data || {}) as Record<string, unknown>, nextRef),
    };
  });
};
