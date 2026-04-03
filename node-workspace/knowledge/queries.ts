import type { KnowledgeSnapshot } from "./types";

export const getKnowledgeEntryById = (snapshot: KnowledgeSnapshot, entryId: string) =>
  snapshot.entries.find((entry) => entry.id === entryId);

export const getKnowledgeEntryByRef = (snapshot: KnowledgeSnapshot, entryRef: string) =>
  snapshot.entries.find((entry) => entry.ref === entryRef);

export const getKnowledgeRelationsForEntry = (snapshot: KnowledgeSnapshot, entryId: string) => ({
  incoming: snapshot.relations.filter((relation) => relation.toEntryId === entryId),
  outgoing: snapshot.relations.filter((relation) => relation.fromEntryId === entryId),
});
