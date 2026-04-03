import type { KnowledgeAnchor, KnowledgeAnchorType } from "./types";

export const createKnowledgeAnchor = (
  type: KnowledgeAnchorType,
  ref: string,
  span?: string
): KnowledgeAnchor => ({
  type,
  ref,
  span,
});
