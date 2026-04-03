import type { KnowledgeSnapshot } from "./types";

export const serializeKnowledgeSnapshot = (snapshot: KnowledgeSnapshot) =>
  JSON.stringify(snapshot, null, 2);

export const parseKnowledgeSnapshot = (raw: string): KnowledgeSnapshot => {
  const parsed = JSON.parse(raw) as KnowledgeSnapshot;
  return {
    revision: typeof parsed.revision === "number" ? parsed.revision : 0,
    entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    relations: Array.isArray(parsed.relations) ? parsed.relations : [],
  };
};
