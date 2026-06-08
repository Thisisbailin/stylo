import { create } from "zustand";
import type { ProjectData } from "../../types";
import { syncCanonicalKnowledgeSnapshot } from "../knowledge/canonicalSource";
import {
  createAnchoredDerivedKnowledgeNodeCommand,
  createDerivedKnowledgeLinkCommand,
  createDerivedKnowledgeNodeCommand,
  removeDerivedKnowledgeLinkCommand,
  supersedeAnchoredDerivedKnowledgeNodeCommand,
  supersedeDerivedKnowledgeNodeCommand,
} from "../knowledge/commands";
import { createEmptyKnowledgeSnapshot } from "../knowledge/defaults";
import {
  listKnowledgeNodeIdentities,
  readKnowledgeNodeDetail,
  readKnowledgeNodeIdentity,
  searchKnowledgeNodes,
} from "../knowledge/queries";
import type {
  KnowledgeAnchorMapProjection,
  KnowledgeAnchor,
  KnowledgeLink,
  KnowledgeLocalMapProjection,
  KnowledgeMap,
  KnowledgeSearchContext,
  KnowledgeNodeDetail,
  KnowledgeNodeIdentity,
  KnowledgeNode,
  KnowledgeNodeConfidence,
  KnowledgeSearchResult,
  KnowledgeSearchScope,
  KnowledgeNodeStatus,
  KnowledgeSnapshot,
} from "../knowledge/types";
import {
  buildKnowledgeAnchorMapProjection,
  buildKnowledgeLocalMapProjection,
  buildKnowledgeMap,
} from "../knowledge/maps";

type KnowledgeStore = {
  revision: number;
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
  applyKnowledgeSnapshot: (snapshot: KnowledgeSnapshot) => void;
  devReplaceKnowledgeSnapshot: (snapshot: KnowledgeSnapshot) => void;
  createDerivedNode: (input: {
    id?: string;
    ref?: string;
    kind: string;
    title: string;
    content?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    status?: KnowledgeNodeStatus;
    confidence?: KnowledgeNodeConfidence;
    anchors?: KnowledgeAnchor[];
    createdAt?: number;
    updatedAt?: number;
  }) => KnowledgeNode;
  createDerivedNodeForAnchor: (input: {
    anchorType: KnowledgeAnchor["type"];
    anchorRef: string;
    anchorSpan?: string;
    id?: string;
    ref?: string;
    kind: string;
    title: string;
    content?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    status?: KnowledgeNodeStatus;
    confidence?: KnowledgeNodeConfidence;
    anchors?: KnowledgeAnchor[];
    createdAt?: number;
    updatedAt?: number;
  }) => KnowledgeNode;
  createDerivedLink: (input: {
    id?: string;
    fromNodeId: string;
    toNodeId: string;
    type: string;
    weight?: number;
    status?: "active" | "superseded";
    createdAt?: number;
    updatedAt?: number;
  }) => KnowledgeLink;
  removeDerivedLink: (input: {
    linkId: string;
  }) => KnowledgeLink;
  supersedeDerivedNode: (input: {
    nodeId?: string;
    nodeRef?: string;
    id?: string;
    ref?: string;
    kind?: string;
    title?: string;
    content?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    status?: KnowledgeNodeStatus;
    confidence?: KnowledgeNodeConfidence;
    anchors?: KnowledgeAnchor[];
    relationType?: string;
    createdAt?: number;
    updatedAt?: number;
  }) => KnowledgeNode;
  supersedeDerivedNodeForAnchor: (input: {
    anchorType: KnowledgeAnchor["type"];
    anchorRef: string;
    anchorSpan?: string;
    nodeId?: string;
    nodeRef?: string;
    id?: string;
    ref?: string;
    kind?: string;
    title?: string;
    content?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    status?: KnowledgeNodeStatus;
    confidence?: KnowledgeNodeConfidence;
    anchors?: KnowledgeAnchor[];
    relationType?: string;
    createdAt?: number;
    updatedAt?: number;
  }) => KnowledgeNode;
  syncCanonicalSource: (projectData: ProjectData) => void;
  devClearKnowledge: () => void;
  getKnowledgeMap: () => KnowledgeMap;
  getKnowledgeLocalMap: (args: {
    nodeId?: string;
    nodeRef?: string;
    depth?: number;
  }) => KnowledgeLocalMapProjection;
  getKnowledgeAnchorMap: (args: {
    anchor?: KnowledgeAnchor | null;
    depth?: number;
  }) => KnowledgeAnchorMapProjection;
  listNodeIdentities: () => KnowledgeNodeIdentity[];
  readNodeIdentity: (args: { nodeId?: string; nodeRef?: string }) => KnowledgeNodeIdentity | null;
  readNodeDetail: (args: { nodeId?: string; nodeRef?: string }) => KnowledgeNodeDetail | null;
  searchNodes: (args: {
    query: string;
    scopes?: KnowledgeSearchScope[];
    context?: KnowledgeSearchContext;
  }) => KnowledgeSearchResult[];
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

  applyKnowledgeSnapshot: (snapshot) => set(applySnapshot(snapshot)),
  devReplaceKnowledgeSnapshot: (snapshot) => set(applySnapshot(snapshot)),

  createDerivedNode: (input) => {
    let created!: KnowledgeNode;
    set((state) => {
      const result = createDerivedKnowledgeNodeCommand(toSnapshot(state), input);
      created = result.node;
      return applySnapshot(result.snapshot);
    });
    return created;
  },

  createDerivedNodeForAnchor: (input) => {
    let created!: KnowledgeNode;
    set((state) => {
      const result = createAnchoredDerivedKnowledgeNodeCommand(toSnapshot(state), input);
      created = result.node;
      return applySnapshot(result.snapshot);
    });
    return created;
  },

  createDerivedLink: (input) => {
    let created!: KnowledgeLink;
    set((state) => {
      const result = createDerivedKnowledgeLinkCommand(toSnapshot(state), input);
      created = result.link;
      return applySnapshot(result.snapshot);
    });
    return created;
  },

  removeDerivedLink: (input) => {
    let removed!: KnowledgeLink;
    set((state) => {
      const result = removeDerivedKnowledgeLinkCommand(toSnapshot(state), input);
      removed = result.link;
      return applySnapshot(result.snapshot);
    });
    return removed;
  },

  supersedeDerivedNode: (input) => {
    let created!: KnowledgeNode;
    set((state) => {
      const result = supersedeDerivedKnowledgeNodeCommand(toSnapshot(state), input);
      created = result.node;
      return applySnapshot(result.snapshot);
    });
    return created;
  },

  supersedeDerivedNodeForAnchor: (input) => {
    let created!: KnowledgeNode;
    set((state) => {
      const result = supersedeAnchoredDerivedKnowledgeNodeCommand(toSnapshot(state), input);
      created = result.node;
      return applySnapshot(result.snapshot);
    });
    return created;
  },

  syncCanonicalSource: (projectData) =>
    set((state) => applySnapshot(syncCanonicalKnowledgeSnapshot(toSnapshot(state), projectData))),

  devClearKnowledge: () => set(createEmptyKnowledgeSnapshot()),

  getKnowledgeMap: () => buildKnowledgeMap(toSnapshot(get())),

  getKnowledgeLocalMap: (args) => buildKnowledgeLocalMapProjection(toSnapshot(get()), args),

  getKnowledgeAnchorMap: (args) => buildKnowledgeAnchorMapProjection(toSnapshot(get()), args),

  listNodeIdentities: () => listKnowledgeNodeIdentities(toSnapshot(get())),

  readNodeIdentity: (args) => readKnowledgeNodeIdentity(toSnapshot(get()), args),

  readNodeDetail: (args) => readKnowledgeNodeDetail(toSnapshot(get()), args),

  searchNodes: (args) => searchKnowledgeNodes(toSnapshot(get()), args),
}));
