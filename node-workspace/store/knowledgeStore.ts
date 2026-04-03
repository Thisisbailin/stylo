import { create } from "zustand";
import type { ProjectData } from "../../types";
import { buildCanonicalKnowledgeNodes } from "../knowledge/canonicalSource";
import { createEmptyKnowledgeSnapshot } from "../knowledge/defaults";
import {
  removeKnowledgeLink,
  removeKnowledgeNode,
  replaceKnowledgeLinks,
  replaceKnowledgeNodes,
  upsertKnowledgeLink,
  upsertKnowledgeLinks,
  upsertKnowledgeNode,
  upsertKnowledgeNodes,
} from "../knowledge/mutations";
import type {
  KnowledgeLink,
  KnowledgeMap,
  KnowledgeNode,
  KnowledgeSnapshot,
} from "../knowledge/types";
import { buildKnowledgeMap } from "../knowledge/maps";

type KnowledgeStore = {
  revision: number;
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
  setKnowledgeSnapshot: (snapshot: KnowledgeSnapshot) => void;
  replaceNodes: (nodes: KnowledgeNode[]) => void;
  replaceLinks: (links: KnowledgeLink[]) => void;
  upsertNode: (node: KnowledgeNode) => void;
  upsertNodes: (nodes: KnowledgeNode[]) => void;
  removeNode: (nodeId: string) => void;
  upsertLink: (link: KnowledgeLink) => void;
  upsertLinks: (links: KnowledgeLink[]) => void;
  removeLink: (linkId: string) => void;
  seedCanonicalSource: (projectData: ProjectData) => void;
  clearKnowledge: () => void;
  getKnowledgeMap: () => KnowledgeMap;
};

const toSnapshot = (state: Pick<KnowledgeStore, "revision" | "nodes" | "links">): KnowledgeSnapshot => ({
  revision: state.revision,
  nodes: state.nodes,
  links: state.links,
});

const applySnapshot = (snapshot: KnowledgeSnapshot) => ({
  revision: snapshot.revision,
  nodes: snapshot.nodes,
  links: snapshot.links,
});

export const useKnowledgeStore = create<KnowledgeStore>((set, get) => ({
  ...createEmptyKnowledgeSnapshot(),

  setKnowledgeSnapshot: (snapshot) => set(applySnapshot(snapshot)),

  replaceNodes: (nodes) =>
    set((state) => applySnapshot(replaceKnowledgeNodes(toSnapshot(state), nodes))),

  replaceLinks: (links) =>
    set((state) => applySnapshot(replaceKnowledgeLinks(toSnapshot(state), links))),

  upsertNode: (node) =>
    set((state) => applySnapshot(upsertKnowledgeNode(toSnapshot(state), node))),

  upsertNodes: (nodes) =>
    set((state) => applySnapshot(upsertKnowledgeNodes(toSnapshot(state), nodes))),

  removeNode: (nodeId) =>
    set((state) => applySnapshot(removeKnowledgeNode(toSnapshot(state), nodeId))),

  upsertLink: (link) =>
    set((state) => applySnapshot(upsertKnowledgeLink(toSnapshot(state), link))),

  upsertLinks: (links) =>
    set((state) => applySnapshot(upsertKnowledgeLinks(toSnapshot(state), links))),

  removeLink: (linkId) =>
    set((state) => applySnapshot(removeKnowledgeLink(toSnapshot(state), linkId))),

  seedCanonicalSource: (projectData) =>
    set((state) =>
      applySnapshot(
        upsertKnowledgeNodes(toSnapshot(state), buildCanonicalKnowledgeNodes(projectData))
      )
    ),

  clearKnowledge: () => set(createEmptyKnowledgeSnapshot()),

  getKnowledgeMap: () => buildKnowledgeMap(toSnapshot(get())),
}));
