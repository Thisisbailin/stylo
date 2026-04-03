import type { KnowledgeMap, KnowledgeSnapshot } from "./types";

export const buildKnowledgeMap = (snapshot: KnowledgeSnapshot): KnowledgeMap => ({
  revision: snapshot.revision,
  nodes: snapshot.nodes,
  links: snapshot.links,
});
