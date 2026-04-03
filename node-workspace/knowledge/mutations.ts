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

export const upsertKnowledgeEntry = (
  snapshot: KnowledgeSnapshot,
  entry: KnowledgeEntry
): KnowledgeSnapshot => {
  const existingIndex = snapshot.entries.findIndex((item) => item.id === entry.id);
  if (existingIndex < 0) {
    return {
      ...snapshot,
      revision: snapshot.revision + 1,
      entries: [...snapshot.entries, entry],
    };
  }
  const nextEntries = snapshot.entries.slice();
  nextEntries[existingIndex] = entry;
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    entries: nextEntries,
  };
};

export const upsertKnowledgeEntries = (
  snapshot: KnowledgeSnapshot,
  entries: KnowledgeEntry[]
): KnowledgeSnapshot => {
  if (!entries.length) return snapshot;
  const nextEntries = snapshot.entries.slice();
  for (const entry of entries) {
    const existingIndex = nextEntries.findIndex((item) => item.id === entry.id || item.ref === entry.ref);
    if (existingIndex < 0) {
      nextEntries.push(entry);
    } else {
      nextEntries[existingIndex] = entry;
    }
  }
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    entries: nextEntries,
  };
};

export const removeKnowledgeEntry = (
  snapshot: KnowledgeSnapshot,
  entryId: string
): KnowledgeSnapshot => ({
  ...snapshot,
  revision: snapshot.revision + 1,
  entries: snapshot.entries.filter((entry) => entry.id !== entryId),
  relations: snapshot.relations.filter(
    (relation) => relation.fromEntryId !== entryId && relation.toEntryId !== entryId
  ),
});

export const upsertKnowledgeRelation = (
  snapshot: KnowledgeSnapshot,
  relation: KnowledgeRelation
): KnowledgeSnapshot => {
  const existingIndex = snapshot.relations.findIndex((item) => item.id === relation.id);
  if (existingIndex < 0) {
    return {
      ...snapshot,
      revision: snapshot.revision + 1,
      relations: [...snapshot.relations, relation],
    };
  }
  const nextRelations = snapshot.relations.slice();
  nextRelations[existingIndex] = relation;
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    relations: nextRelations,
  };
};

export const upsertKnowledgeRelations = (
  snapshot: KnowledgeSnapshot,
  relations: KnowledgeRelation[]
): KnowledgeSnapshot => {
  if (!relations.length) return snapshot;
  const nextRelations = snapshot.relations.slice();
  for (const relation of relations) {
    const existingIndex = nextRelations.findIndex((item) => item.id === relation.id);
    if (existingIndex < 0) {
      nextRelations.push(relation);
    } else {
      nextRelations[existingIndex] = relation;
    }
  }
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    relations: nextRelations,
  };
};

export const removeKnowledgeRelation = (
  snapshot: KnowledgeSnapshot,
  relationId: string
): KnowledgeSnapshot => ({
  ...snapshot,
  revision: snapshot.revision + 1,
  relations: snapshot.relations.filter((relation) => relation.id !== relationId),
});
