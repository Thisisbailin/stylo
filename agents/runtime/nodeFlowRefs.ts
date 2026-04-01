import type { NodeFlowNode } from "../../node-workspace/types";

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
