import type { ProjectData } from "../../types";
import type { NodeFlowFile, NodeFlowGraphLink } from "../types";
import {
  getNodeFlowNodeAssetType,
  getNodeFlowNodePlane,
  getNodeFlowNodeRef,
  getNodeFlowNodeTitle,
  toNodeFlowLinkRecord,
  toNodeFlowNodeRecord,
} from "./model";

export type ProjectGraphNodeRecord = {
  resourceType: "source_node" | "graph_node";
  nodeId?: string;
  ref: string;
  plane: "source" | "semantic" | "design" | "execution";
  type: string;
  title: string;
  body: Record<string, unknown>;
  locked: boolean;
  sourceRef?: string | null;
  meta?: Record<string, unknown>;
  x?: number;
  y?: number;
  parentId?: string | null;
};

export type ProjectGraphMapRecord = {
  mapId: string;
  name: string;
  view: string | null;
  nodeCount: number;
  linkCount: number;
  isActive: boolean;
};

export type ProjectGraphLinkRecord = {
  id: string;
  sourceRef: string;
  targetRef: string;
};

const trimText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const createSourceNode = (
  ref: string,
  type: string,
  title: string,
  body: Record<string, unknown>,
  sourceRef?: string
): ProjectGraphNodeRecord => ({
  resourceType: "source_node",
  ref,
  plane: "source",
  type,
  title,
  body,
  locked: true,
  sourceRef: sourceRef || null,
});

export const buildProjectedSourceNodes = (projectData: ProjectData): ProjectGraphNodeRecord[] => {
  const nodes: ProjectGraphNodeRecord[] = [];
  const rawScript = trimText(projectData.rawScript);
  if (rawScript) {
    nodes.push(
      createSourceNode("source:script", "source.script", projectData.fileName?.trim() || "Project Script", {
        content: rawScript,
        episodeCount: Array.isArray(projectData.episodes) ? projectData.episodes.length : 0,
      })
    );
  }

  (projectData.episodes || []).forEach((episode) => {
    nodes.push(
      createSourceNode(
        `source:episode:${episode.id}`,
        "source.episode",
        episode.title?.trim() || `第${episode.id}集`,
        {
          episodeId: episode.id,
          content: trimText(episode.content),
          summary: trimText(episode.summary),
          sceneIds: (episode.scenes || []).map((scene) => scene.id),
          sceneCount: (episode.scenes || []).length,
        },
        `ep:${episode.id}`
      )
    );

    (episode.scenes || []).forEach((scene, index) => {
      nodes.push(
        createSourceNode(
          `source:scene:${scene.id}`,
          "source.scene",
          scene.title?.trim() || `场景 ${index + 1} · ${scene.id}`,
          {
            episodeId: episode.id,
            sceneId: scene.id,
            content: trimText(scene.content),
          },
          `scene:${scene.id}`
        )
      );
    });
  });

  const guides = [
    ["globalStyleGuide", "全局风格指南", projectData.globalStyleGuide],
    ["shotGuide", "镜头指南", projectData.shotGuide],
    ["soraGuide", "Sora 指南", projectData.soraGuide],
    ["storyboardGuide", "分镜指南", projectData.storyboardGuide],
    ["dramaGuide", "戏剧指南", projectData.dramaGuide],
  ] as const;

  guides.forEach(([key, title, content]) => {
    const text = trimText(content);
    if (!text) return;
    nodes.push(
      createSourceNode(`source:guide:${key}`, "source.guide", title, { key, content: text }, `guide:${key}`)
    );
  });

  return nodes;
};

export const buildGraphNodesFromWorkflow = (workflow: NodeFlowFile): ProjectGraphNodeRecord[] =>
  workflow.nodes.map((node) => {
    const record = toNodeFlowNodeRecord(node);
    const rawData = (node.data || {}) as Record<string, unknown>;
    return {
      resourceType: "graph_node",
      nodeId: record.id,
      ref: record.ref,
      plane: record.plane,
      type: record.assetType,
      title: record.title || record.id,
      body: record.body,
      locked: Boolean(rawData.locked) || record.plane === "source",
      sourceRef: Array.isArray(rawData.sourceRefs) && typeof rawData.sourceRefs[0] === "string" ? String(rawData.sourceRefs[0]) : null,
      meta: record.meta,
      x: record.x,
      y: record.y,
      parentId: record.parentId ?? null,
    };
  });

export const findProjectedSourceNode = (
  projectData: ProjectData,
  locator: { ref?: string; sourceRef?: string; title?: string }
) => {
  const ref = trimText(locator.ref);
  const sourceRef = trimText(locator.sourceRef);
  const title = trimText(locator.title).toLowerCase();
  return buildProjectedSourceNodes(projectData).find((node) => {
    if (ref && node.ref === ref) return true;
    if (sourceRef && node.sourceRef === sourceRef) return true;
    if (title && node.title.trim().toLowerCase() === title) return true;
    return false;
  });
};

export const findProjectGraphNodeByRef = (
  projectData: ProjectData,
  workflow: NodeFlowFile,
  ref: string
) => {
  const resolvedRef = trimText(ref);
  if (!resolvedRef) return null;
  const projectedSource = findProjectedSourceNode(projectData, { ref: resolvedRef });
  if (projectedSource) return projectedSource;
  return findGraphNode(workflow, { nodeRef: resolvedRef });
};

export const findGraphNode = (
  workflow: NodeFlowFile,
  locator: { nodeId?: string; nodeRef?: string }
) => {
  const nodeId = trimText(locator.nodeId);
  const nodeRef = trimText(locator.nodeRef);
  const node = workflow.nodes.find((item) => (nodeId ? item.id === nodeId : getNodeFlowNodeRef(item) === nodeRef));
  if (!node) return null;
  const record = toNodeFlowNodeRecord(node);
  return {
    resourceType: "graph_node" as const,
    nodeId: record.id,
    ref: record.ref,
    plane: getNodeFlowNodePlane(node),
    type: getNodeFlowNodeAssetType(node),
    title: getNodeFlowNodeTitle(node),
    body: record.body,
    locked: Boolean((node.data as Record<string, unknown>)?.locked),
    meta: record.meta,
    x: record.x,
    y: record.y,
    parentId: record.parentId ?? null,
  };
};

export const findGraphLink = (workflow: NodeFlowFile, linkId: string) => {
  const link = (workflow.graphLinks || []).find((item) => item.id === linkId);
  return link ? { id: link.id, sourceRef: link.sourceRef, targetRef: link.targetRef } : null;
};

export const findExecutionLink = (workflow: NodeFlowFile, linkId: string) => {
  const link = workflow.links.find((item) => item.id === linkId);
  return link ? toNodeFlowLinkRecord(link) : null;
};

export const buildProjectGraphMaps = (workflow: NodeFlowFile): ProjectGraphMapRecord[] => {
  const workflowNodeRefs = new Set(workflow.nodes.map((node) => getNodeFlowNodeRef(node)));
  const workspaceGraphLinkCount = (workflow.graphLinks || []).filter(
    (link) => workflowNodeRefs.has(link.sourceRef) || workflowNodeRefs.has(link.targetRef)
  ).length;
  const maps: ProjectGraphMapRecord[] = [
    {
      mapId: "map:workspace",
      name: workflow.name || "NodeFlow",
      view: null,
      nodeCount: workflow.nodes.length,
      linkCount: workflow.links.length + workspaceGraphLinkCount,
      isActive: !workflow.activeView,
    },
  ];

  const viewNames = new Set<string>();
  workflow.nodes.forEach((node) => {
    const rawView = (node.data as Record<string, unknown>)?.view;
    const view = trimText(rawView);
    if (view) viewNames.add(view);
  });
  if (workflow.activeView) viewNames.add(workflow.activeView);

  Array.from(viewNames)
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
    .forEach((view) => {
      const nodeIds = new Set(
        workflow.nodes
          .filter((node) => trimText((node.data as Record<string, unknown>)?.view) === view)
          .map((node) => node.id)
      );
      const nodeRefs = new Set(
        workflow.nodes
          .filter((node) => trimText((node.data as Record<string, unknown>)?.view) === view)
          .map((node) => getNodeFlowNodeRef(node))
      );
      const groupTitleNode = workflow.nodes.find(
        (node) => node.type === "group" && trimText((node.data as Record<string, unknown>)?.view) === view
      );
      const groupTitle = trimText((groupTitleNode?.data as Record<string, unknown> | undefined)?.title) || view;
      const executionLinkCount = workflow.links.filter(
        (link) => nodeIds.has(link.source) && nodeIds.has(link.target)
      ).length;
      const graphLinkCount = (workflow.graphLinks || []).filter(
        (link) => nodeRefs.has(link.sourceRef) && nodeRefs.has(link.targetRef)
      ).length;
      maps.push({
        mapId: `map:view:${view}`,
        name: String(groupTitle || view),
        view,
        nodeCount: nodeIds.size,
        linkCount: executionLinkCount + graphLinkCount,
        isActive: workflow.activeView === view,
      });
    });

  return maps;
};

export const buildProjectGraphSearchText = (node: ProjectGraphNodeRecord) =>
  [node.ref, node.plane, node.type, node.title, JSON.stringify(node.body)].filter(Boolean).join(" ");

export const buildProjectGraphLinks = (workflow: NodeFlowFile): ProjectGraphLinkRecord[] =>
  (workflow.graphLinks || []).map((link: NodeFlowGraphLink) => ({
    id: link.id,
    sourceRef: link.sourceRef,
    targetRef: link.targetRef,
  }));
