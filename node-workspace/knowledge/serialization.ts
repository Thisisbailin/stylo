import type { KnowledgeSnapshot } from "./types";

export const serializeKnowledgeSnapshot = (snapshot: KnowledgeSnapshot) =>
  JSON.stringify(snapshot, null, 2);

export const parseKnowledgeSnapshot = (raw: string): KnowledgeSnapshot => {
  const parsed = JSON.parse(raw) as KnowledgeSnapshot;
  return {
    revision: typeof parsed.revision === "number" ? parsed.revision : 0,
    nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
    links: Array.isArray(parsed.links) ? parsed.links : [],
  };
};
