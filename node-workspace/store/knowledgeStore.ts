import { create } from "zustand";
import type { ProjectData } from "../../types";
import { buildCanonicalKnowledgeEntries } from "../knowledge/canonicalSource";
import { createEmptyKnowledgeSnapshot } from "../knowledge/defaults";
import {
  removeKnowledgeEntry,
  removeKnowledgeRelation,
  replaceKnowledgeEntries,
  replaceKnowledgeRelations,
  upsertKnowledgeEntry,
  upsertKnowledgeEntries,
  upsertKnowledgeRelation,
  upsertKnowledgeRelations,
} from "../knowledge/mutations";
import type {
  KnowledgeEntry,
  KnowledgeMapView,
  KnowledgeRelation,
  KnowledgeSnapshot,
} from "../knowledge/types";
import { buildKnowledgeMapView } from "../knowledge/maps";

type KnowledgeStore = {
  revision: number;
  entries: KnowledgeEntry[];
  relations: KnowledgeRelation[];
  setKnowledgeSnapshot: (snapshot: KnowledgeSnapshot) => void;
  replaceEntries: (entries: KnowledgeEntry[]) => void;
  replaceRelations: (relations: KnowledgeRelation[]) => void;
  upsertEntry: (entry: KnowledgeEntry) => void;
  upsertEntries: (entries: KnowledgeEntry[]) => void;
  removeEntry: (entryId: string) => void;
  upsertRelation: (relation: KnowledgeRelation) => void;
  upsertRelations: (relations: KnowledgeRelation[]) => void;
  removeRelation: (relationId: string) => void;
  seedCanonicalSource: (projectData: ProjectData) => void;
  clearKnowledge: () => void;
  getKnowledgeMapView: () => KnowledgeMapView;
};

const toSnapshot = (state: Pick<KnowledgeStore, "revision" | "entries" | "relations">): KnowledgeSnapshot => ({
  revision: state.revision,
  entries: state.entries,
  relations: state.relations,
});

const applySnapshot = (snapshot: KnowledgeSnapshot) => ({
  revision: snapshot.revision,
  entries: snapshot.entries,
  relations: snapshot.relations,
});

export const useKnowledgeStore = create<KnowledgeStore>((set, get) => ({
  ...createEmptyKnowledgeSnapshot(),

  setKnowledgeSnapshot: (snapshot) => set(applySnapshot(snapshot)),

  replaceEntries: (entries) =>
    set((state) => applySnapshot(replaceKnowledgeEntries(toSnapshot(state), entries))),

  replaceRelations: (relations) =>
    set((state) => applySnapshot(replaceKnowledgeRelations(toSnapshot(state), relations))),

  upsertEntry: (entry) =>
    set((state) => applySnapshot(upsertKnowledgeEntry(toSnapshot(state), entry))),

  upsertEntries: (entries) =>
    set((state) => applySnapshot(upsertKnowledgeEntries(toSnapshot(state), entries))),

  removeEntry: (entryId) =>
    set((state) => applySnapshot(removeKnowledgeEntry(toSnapshot(state), entryId))),

  upsertRelation: (relation) =>
    set((state) => applySnapshot(upsertKnowledgeRelation(toSnapshot(state), relation))),

  upsertRelations: (relations) =>
    set((state) => applySnapshot(upsertKnowledgeRelations(toSnapshot(state), relations))),

  removeRelation: (relationId) =>
    set((state) => applySnapshot(removeKnowledgeRelation(toSnapshot(state), relationId))),

  seedCanonicalSource: (projectData) =>
    set((state) =>
      applySnapshot(
        upsertKnowledgeEntries(toSnapshot(state), buildCanonicalKnowledgeEntries(projectData))
      )
    ),

  clearKnowledge: () => set(createEmptyKnowledgeSnapshot()),

  getKnowledgeMapView: () => buildKnowledgeMapView(toSnapshot(get())),
}));
