import type { ProjectData } from "../../types";
import { createKnowledgeAnchor } from "./anchors";
import {
  createCanonicalKnowledgeLink,
  createCanonicalKnowledgeNode,
} from "./builders";
import type { KnowledgeLink, KnowledgeNode, KnowledgeSnapshot } from "./types";

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const buildCanonicalKnowledgeNodes = (
  projectData: ProjectData,
  {
    createdAt = Date.now(),
  }: {
    createdAt?: number;
  } = {}
): KnowledgeNode[] => {
  const nodes: KnowledgeNode[] = [];

  const rawScript = trim(projectData.rawScript);
  if (rawScript) {
    nodes.push(
      createCanonicalKnowledgeNode({
        id: "knowledge-source-script",
        ref: "source:script",
        kind: "source.script",
        title: trim(projectData.fileName) || "Project Script",
        content: {
          content: rawScript,
        },
        meta: {
          locked: true,
        },
        status: "accepted",
        confidence: "high",
        anchors: [createKnowledgeAnchor("script", "source:script")],
        createdAt,
        updatedAt: createdAt,
      })
    );
  }

  for (const episode of projectData.episodes || []) {
    const episodeRef = `ep:${episode.id}`;
    nodes.push(
      createCanonicalKnowledgeNode({
        id: `knowledge-source-episode-${episode.id}`,
        ref: `source:episode:${episode.id}`,
        kind: "source.episode",
        title: trim(episode.title) || `第${episode.id}集`,
        content: {
          episodeId: episode.id,
          content: trim(episode.content),
        },
        meta: {
          locked: true,
        },
        status: "accepted",
        confidence: "high",
        anchors: [createKnowledgeAnchor("episode", episodeRef)],
        createdAt,
        updatedAt: createdAt,
      })
    );

    for (const scene of episode.scenes || []) {
      const sceneRef = `scene:${scene.id}`;
      nodes.push(
        createCanonicalKnowledgeNode({
          id: `knowledge-source-scene-${scene.id}`,
          ref: `source:scene:${scene.id}`,
          kind: "source.scene",
          title: trim(scene.title) || `场景 ${scene.id}`,
          content: {
            episodeId: episode.id,
            sceneId: scene.id,
            content: trim(scene.content),
          },
          meta: {
            locked: true,
          },
          status: "accepted",
          confidence: "high",
          anchors: [
            createKnowledgeAnchor("episode", episodeRef),
            createKnowledgeAnchor("scene", sceneRef),
          ],
          createdAt,
          updatedAt: createdAt,
        })
      );
    }
  }

  return nodes;
};

export const buildCanonicalKnowledgeLinks = (
  projectData: ProjectData,
  {
    createdAt = Date.now(),
  }: {
    createdAt?: number;
  } = {}
): KnowledgeLink[] => {
  const links: KnowledgeLink[] = [];
  const hasScript = trim(projectData.rawScript).length > 0;

  for (const episode of projectData.episodes || []) {
    if (hasScript) {
      links.push(
        createCanonicalKnowledgeLink({
          id: `knowledge-link-script-episode-${episode.id}`,
          fromNodeId: "knowledge-source-script",
          toNodeId: `knowledge-source-episode-${episode.id}`,
          type: "contains",
          createdAt,
          updatedAt: createdAt,
        })
      );
    }

    for (const scene of episode.scenes || []) {
      links.push(
        createCanonicalKnowledgeLink({
          id: `knowledge-link-episode-${episode.id}-scene-${scene.id}`,
          fromNodeId: `knowledge-source-episode-${episode.id}`,
          toNodeId: `knowledge-source-scene-${scene.id}`,
          type: "contains",
          createdAt,
          updatedAt: createdAt,
        })
      );
    }
  }

  return links;
};

export const buildCanonicalKnowledgeSnapshot = (
  projectData: ProjectData,
  {
    createdAt = Date.now(),
  }: {
    createdAt?: number;
  } = {}
): KnowledgeSnapshot => ({
  revision: 0,
  nodes: buildCanonicalKnowledgeNodes(projectData, { createdAt }),
  links: buildCanonicalKnowledgeLinks(projectData, { createdAt }),
});
