import type { NodeFlowGraphLink } from "../types";

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const buildNodeFlowGraphLinkId = (sourceRef: string, targetRef: string) =>
  `graphlink-${encodeURIComponent(sourceRef)}-${encodeURIComponent(targetRef)}`;

export const normalizeNodeFlowGraphLink = (link: NodeFlowGraphLink): NodeFlowGraphLink => {
  const sourceRef = trim(link.sourceRef);
  const targetRef = trim(link.targetRef);
  return {
    id: trim(link.id) || buildNodeFlowGraphLinkId(sourceRef, targetRef),
    sourceRef,
    targetRef,
  };
};

export const normalizeNodeFlowGraphLinks = (links: NodeFlowGraphLink[] | undefined) => {
  const deduped = new Map<string, NodeFlowGraphLink>();
  (links || []).forEach((link) => {
    const normalized = normalizeNodeFlowGraphLink(link);
    if (!normalized.sourceRef || !normalized.targetRef || normalized.sourceRef === normalized.targetRef) return;
    deduped.set(normalized.id, normalized);
  });
  return Array.from(deduped.values());
};

export const createNodeFlowGraphLink = (links: NodeFlowGraphLink[], sourceRef: string, targetRef: string) => {
  const id = buildNodeFlowGraphLinkId(sourceRef, targetRef);
  const existing = links.find((link) => link.id === id);
  if (existing) return { links, linkId: existing.id };
  const nextLink = normalizeNodeFlowGraphLink({ id, sourceRef, targetRef });
  return {
    links: [...links, nextLink],
    linkId: nextLink.id,
  };
};

export const removeNodeFlowGraphLink = (links: NodeFlowGraphLink[], linkId: string) =>
  links.filter((link) => link.id !== linkId);
