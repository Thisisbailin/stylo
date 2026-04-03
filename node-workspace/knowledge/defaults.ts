import type { KnowledgeSnapshot } from "./types";

export const createEmptyKnowledgeSnapshot = (): KnowledgeSnapshot => ({
  revision: 0,
  nodes: [],
  links: [],
});
