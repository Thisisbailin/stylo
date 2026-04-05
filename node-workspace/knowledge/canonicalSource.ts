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
        anchors: [createKnowledgeAnchor("script", "raw")],
        createdAt,
        updatedAt: createdAt,
      })
    );
  }

  for (const episode of projectData.episodes || []) {
    const episodeRef = String(episode.id);
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
      const sceneRef = scene.id;
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

const stableSerialize = (value: unknown): string => {
  if (value == null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
};

const normalizeKnowledgeNodeComparable = (node: KnowledgeNode) =>
  stableSerialize({
    id: node.id,
    ref: node.ref,
    kind: node.kind,
    origin: node.origin,
    package: node.package,
    content: node.content,
    meta: node.meta || null,
    anchors: node.anchors
      .map((anchor) => ({
        type: anchor.type,
        ref: anchor.ref,
        span: anchor.span || null,
      }))
      .sort((left, right) =>
        `${left.type}:${left.ref}:${left.span || ""}`.localeCompare(
          `${right.type}:${right.ref}:${right.span || ""}`
        )
      ),
  });

const normalizeKnowledgeLinkComparable = (link: KnowledgeLink) =>
  stableSerialize({
    id: link.id,
    origin: link.origin,
    fromNodeId: link.fromNodeId,
    toNodeId: link.toNodeId,
    type: link.type,
    weight: link.weight ?? null,
    status: link.status ?? "active",
  });

const areKnowledgeNodeSetsEqual = (left: KnowledgeNode[], right: KnowledgeNode[]) =>
  stableSerialize(
    left
      .map((node) => normalizeKnowledgeNodeComparable(node))
      .sort((a, b) => a.localeCompare(b))
  ) ===
  stableSerialize(
    right
      .map((node) => normalizeKnowledgeNodeComparable(node))
      .sort((a, b) => a.localeCompare(b))
  );

const areKnowledgeLinkSetsEqual = (left: KnowledgeLink[], right: KnowledgeLink[]) =>
  stableSerialize(
    left
      .map((link) => normalizeKnowledgeLinkComparable(link))
      .sort((a, b) => a.localeCompare(b))
  ) ===
  stableSerialize(
    right
      .map((link) => normalizeKnowledgeLinkComparable(link))
      .sort((a, b) => a.localeCompare(b))
  );

export const syncCanonicalKnowledgeSnapshot = (
  snapshot: KnowledgeSnapshot,
  projectData: ProjectData,
  {
    timestamp = Date.now(),
  }: {
    timestamp?: number;
  } = {}
): KnowledgeSnapshot => {
  const desired = buildCanonicalKnowledgeSnapshot(projectData, { createdAt: timestamp });
  const existingCanonicalNodes = snapshot.nodes.filter((node) => node.origin === "canonical-source");
  const existingCanonicalLinks = snapshot.links.filter((link) => link.origin === "canonical-source");
  const canonicalNodesById = new Map(existingCanonicalNodes.map((node) => [node.id, node]));
  const canonicalLinksById = new Map(existingCanonicalLinks.map((link) => [link.id, link]));

  const nextCanonicalNodes = desired.nodes.map((node) => {
    const existing = canonicalNodesById.get(node.id);
    if (!existing) return node;
    if (normalizeKnowledgeNodeComparable(existing) === normalizeKnowledgeNodeComparable(node)) {
      return existing;
    }
    return {
      ...node,
      createdAt: existing.createdAt,
      updatedAt: timestamp,
    };
  });

  const nextCanonicalLinks = desired.links.map((link) => {
    const existing = canonicalLinksById.get(link.id);
    if (!existing) return link;
    if (normalizeKnowledgeLinkComparable(existing) === normalizeKnowledgeLinkComparable(link)) {
      return existing;
    }
    return {
      ...link,
      createdAt: existing.createdAt,
      updatedAt: timestamp,
    };
  });

  const nextNodes = [
    ...snapshot.nodes.filter((node) => node.origin !== "canonical-source"),
    ...nextCanonicalNodes,
  ];
  const validNodeIds = new Set(nextNodes.map((node) => node.id));
  const nextLinks = [
    ...snapshot.links.filter((link) => link.origin !== "canonical-source"),
    ...nextCanonicalLinks,
  ].filter((link) => validNodeIds.has(link.fromNodeId) && validNodeIds.has(link.toNodeId));

  if (
    areKnowledgeNodeSetsEqual(snapshot.nodes, nextNodes) &&
    areKnowledgeLinkSetsEqual(snapshot.links, nextLinks)
  ) {
    return snapshot;
  }

  return {
    revision: snapshot.revision + 1,
    nodes: nextNodes,
    links: nextLinks,
  };
};
