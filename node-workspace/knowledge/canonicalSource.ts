import type { ProjectData } from "../../types";
import { createKnowledgeAnchor } from "./anchors";
import { createKnowledgeNode } from "./builders";
import type { KnowledgeNode } from "./types";

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
      createKnowledgeNode({
        id: "knowledge-source-script",
        ref: "source:script",
        kind: "source.script",
        title: trim(projectData.fileName) || "Project Script",
        content: {
          content: rawScript,
          episodeCount: Array.isArray(projectData.episodes) ? projectData.episodes.length : 0,
        },
        meta: {
          origin: "canonical-source",
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
      createKnowledgeNode({
        id: `knowledge-source-episode-${episode.id}`,
        ref: `source:episode:${episode.id}`,
        kind: "source.episode",
        title: trim(episode.title) || `第${episode.id}集`,
        content: {
          episodeId: episode.id,
          content: trim(episode.content),
          summary: trim(episode.summary),
          sceneIds: (episode.scenes || []).map((scene) => scene.id),
          sceneCount: (episode.scenes || []).length,
        },
        meta: {
          origin: "canonical-source",
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
        createKnowledgeNode({
          id: `knowledge-source-scene-${scene.id}`,
          ref: `source:scene:${scene.id}`,
          kind: "source.scene",
          title: trim(scene.title) || `场景 ${scene.id}`,
          content: {
            episodeId: episode.id,
            sceneId: scene.id,
            content: trim(scene.content),
            partition: trim(scene.partition),
            timeOfDay: trim(scene.timeOfDay),
            location: trim(scene.location),
          },
          meta: {
            origin: "canonical-source",
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

  const guides = [
    ["globalStyleGuide", "全局风格指南", projectData.globalStyleGuide],
    ["shotGuide", "镜头指南", projectData.shotGuide],
    ["soraGuide", "Sora 指南", projectData.soraGuide],
    ["storyboardGuide", "分镜指南", projectData.storyboardGuide],
    ["dramaGuide", "戏剧指南", projectData.dramaGuide],
  ] as const;

  for (const [key, title, content] of guides) {
    const text = trim(content);
    if (!text) continue;
    nodes.push(
      createKnowledgeNode({
        id: `knowledge-source-guide-${key}`,
        ref: `source:guide:${key}`,
        kind: "source.guide",
        title,
        content: {
          key,
          content: text,
        },
        meta: {
          origin: "canonical-source",
          locked: true,
        },
        status: "accepted",
        confidence: "high",
        anchors: [createKnowledgeAnchor("guide", `guide:${key}`)],
        createdAt,
        updatedAt: createdAt,
      })
    );
  }

  return nodes;
};
