import type { FlowLink } from "../../types";

export const appendUniqueFlowLink = (links: FlowLink[], nextLink: FlowLink) => {
  const exists = links.some(
    (link) =>
      link.id === nextLink.id ||
      (link.source === nextLink.source &&
        link.target === nextLink.target &&
        link.sourceHandle === nextLink.sourceHandle &&
        link.targetHandle === nextLink.targetHandle)
  );
  return exists ? links : [...links, nextLink];
};

export const removeFlowLinksById = (links: FlowLink[], removedIds: ReadonlySet<string>) =>
  removedIds.size ? links.filter((link) => !removedIds.has(link.id)) : links;
