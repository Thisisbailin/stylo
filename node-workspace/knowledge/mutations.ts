import type { KnowledgeEntry, KnowledgeRelation, KnowledgeSnapshot } from "./types";

export const replaceKnowledgeEntries = (
  snapshot: KnowledgeSnapshot,
  entries: KnowledgeEntry[]
): KnowledgeSnapshot => ({
  ...snapshot,
  revision: snapshot.revision + 1,
  entries,
});

export const replaceKnowledgeRelations = (
  snapshot: KnowledgeSnapshot,
  relations: KnowledgeRelation[]
): KnowledgeSnapshot => ({
  ...snapshot,
  revision: snapshot.revision + 1,
  relations,
});
