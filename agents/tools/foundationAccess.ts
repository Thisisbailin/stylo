import type { NodeFlowFile, NodeFlowNode } from "../../node-workspace/types";
import { getNodeFlowRef, normalizeNodeRef } from "../runtime/nodeFlowRefs";

export type FoundationAxis = "time" | "space";
export type FoundationRole =
  | "project-root"
  | "project-index"
  | "axis-folder"
  | "block-folder"
  | "block-document";

export const FOUNDATION_PROTECTED_ROLES = new Set<FoundationRole>([
  "project-root",
  "project-index",
  "axis-folder",
]);

export const FOUNDATION_STRUCTURAL_ROLES = new Set<FoundationRole>([
  "project-root",
  "project-index",
  "axis-folder",
  "block-folder",
  "block-document",
]);

export const getFoundationRole = (node?: NodeFlowNode | null): FoundationRole | "" => {
  const role = typeof node?.data?.foundationRole === "string" ? node.data.foundationRole : "";
  return FOUNDATION_STRUCTURAL_ROLES.has(role as FoundationRole) ? (role as FoundationRole) : "";
};

export const getFoundationAxis = (node?: NodeFlowNode | null): FoundationAxis | "" => {
  const axis = typeof node?.data?.foundationAxis === "string" ? node.data.foundationAxis : "";
  return axis === "time" || axis === "space" ? axis : "";
};

export const isFoundationNode = (node?: NodeFlowNode | null) => Boolean(getFoundationRole(node));

export const isProtectedFoundationNode = (node?: NodeFlowNode | null) => {
  const role = getFoundationRole(node);
  return Boolean(role && FOUNDATION_PROTECTED_ROLES.has(role));
};

export const findNodeByIdOrRef = (
  workflow: NodeFlowFile,
  input: { nodeId?: string | null; nodeRef?: string | null }
) => {
  const nodeId = input.nodeId?.trim();
  const nodeRef = normalizeNodeRef(input.nodeRef || undefined);
  if (nodeId) return workflow.nodes.find((node) => node.id === nodeId) || null;
  if (nodeRef) return workflow.nodes.find((node) => getNodeFlowRef(node) === nodeRef) || null;
  return null;
};

export const describeFoundationNode = (node: NodeFlowNode) => {
  const title =
    typeof node.data?.title === "string" && node.data.title.trim()
      ? node.data.title.trim()
      : typeof node.data?.label === "string" && node.data.label.trim()
        ? node.data.label.trim()
        : node.id;
  return `${title} (${getFoundationRole(node) || node.type})`;
};

export const assertGenericWriteAllowedForNode = (
  node: NodeFlowNode | null | undefined,
  operation: string,
  options: { allowBlockDocument?: boolean } = {}
) => {
  if (!node || !isFoundationNode(node)) return;
  const role = getFoundationRole(node);
  if (options.allowBlockDocument && role === "block-document") return;
  throw new Error(
    `Foundation 节点 ${describeFoundationNode(node)} 不能通过通用 ${operation} 工具写入；请使用受限 Foundation 操作。`
  );
};

export const assertPatchDoesNotTouchFoundationMeta = (patch: Record<string, unknown>) => {
  const blockedKeys = [
    "foundationRole",
    "foundationAxis",
    "foundationParentId",
    "foundationOrder",
    "locked",
    "readOnly",
    "qalamNodeRef",
    "documentId",
    "documentKind",
  ];
  const touched = blockedKeys.filter((key) => Object.prototype.hasOwnProperty.call(patch, key));
  if (touched.length) {
    throw new Error(`Foundation 文档通用更新不能修改结构字段：${touched.join(", ")}。`);
  }
};
