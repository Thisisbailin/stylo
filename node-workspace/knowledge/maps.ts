import type { KnowledgeMapView, KnowledgeSnapshot } from "./types";

export const buildKnowledgeMapView = (snapshot: KnowledgeSnapshot): KnowledgeMapView => ({
  revision: snapshot.revision,
  entries: snapshot.entries,
  relations: snapshot.relations,
});
