import type {
  ProjectData,
  ScriptCanvasState,
  ScriptCanvasTextNode,
  ScriptSpatialBlock,
  ScriptTimelineBlock,
} from "../../types";
import { buildProjectedSourceNodes, type ProjectGraphNodeRecord } from "../../node-workspace/nodeflow/projectGraph";

export type ScriptResourceNode = {
  resourceType: "source_node" | "archive_node" | "space_block" | "timeline_block" | "script_index";
  nodeId: string;
  ref: string;
  type: string;
  title: string;
  body: Record<string, unknown>;
  locked: boolean;
  sourceRef?: string | null;
  x?: number;
  y?: number;
  meta?: Record<string, unknown>;
};

export type ScriptResourceLink = {
  id: string;
  fromRef: string;
  toRef: string;
  type: "contains" | "links_to";
  fromTitle?: string;
  toTitle?: string;
};

export type ScriptResourceMap = {
  mapId: string;
  name: string;
  view: "source" | "foundation" | "archives" | "timeline";
  nodeCount: number;
  linkCount: number;
};

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const ensureScriptCanvas = (canvas?: ScriptCanvasState): ScriptCanvasState => ({
  pages: Array.isArray(canvas?.pages) ? canvas.pages : [],
  images: Array.isArray(canvas?.images) ? canvas.images : [],
  textNodes: Array.isArray(canvas?.textNodes) ? canvas.textNodes : [],
  links: Array.isArray(canvas?.links) ? canvas.links : [],
  timeline: canvas?.timeline,
});

const sourceToScriptNode = (node: ProjectGraphNodeRecord): ScriptResourceNode => ({
  resourceType: "source_node",
  nodeId: node.ref,
  ref: node.ref,
  type: node.type,
  title: node.title,
  body: node.body,
  locked: true,
  sourceRef: node.sourceRef || null,
  meta: node.meta,
});

const archiveToScriptNode = (node: ScriptCanvasTextNode): ScriptResourceNode => ({
  resourceType: "archive_node",
  nodeId: `archive:${node.id}`,
  ref: `script:archive:${node.id}`,
  type: "script.archive",
  title: trim(node.title) || "档案文档",
  body: {
    content: node.content || "",
  },
  locked: false,
  x: node.position?.x,
  y: node.position?.y,
  meta: {
    documentId: node.id,
    createdAt: node.createdAt,
  },
});

const spaceBlockToScriptNode = (block: ScriptSpatialBlock): ScriptResourceNode => ({
  resourceType: "space_block",
  nodeId: `space:${block.id}`,
  ref: `script:space:${block.id}`,
  type: "script.space_block",
  title: trim(block.title) || "空间轴区块",
  body: {
    content: block.content || "",
    linkedNodeIds: block.linkedNodeIds || [],
  },
  locked: false,
  meta: {
    blockId: block.id,
    color: block.color,
    order: block.order,
    width: block.width,
  },
});

const timelineBlockToScriptNode = (block: ScriptTimelineBlock): ScriptResourceNode => ({
  resourceType: "timeline_block",
  nodeId: `timeline:${block.id}`,
  ref: `script:timeline:${block.id}`,
  type: "script.timeline_block",
  title: trim(block.title) || "时间轴区块",
  body: {
    content: block.content || "",
    startMin: block.startMin,
    durationMin: block.durationMin,
    linkedNodeIds: block.linkedNodeIds || [],
  },
  locked: false,
  meta: {
    blockId: block.id,
    color: block.color,
    order: block.order,
  },
});

export const buildScriptResourceNodes = (projectData: ProjectData): ScriptResourceNode[] => {
  const canvas = ensureScriptCanvas(projectData.scriptCanvas);
  const nodes: ScriptResourceNode[] = buildProjectedSourceNodes(projectData).map(sourceToScriptNode);
  const timeline = canvas.timeline;

  if (timeline?.head) {
    nodes.push({
      resourceType: "script_index",
      nodeId: "script:index",
      ref: "script:index",
      type: "script.index",
      title: trim(timeline.head.title) || "项目索引",
      body: {
        content: timeline.head.content || "",
        linkedNodeIds: timeline.head.linkedNodeIds || [],
      },
      locked: false,
    });
  }

  nodes.push(...(timeline?.spaceBlocks || []).map(spaceBlockToScriptNode));
  nodes.push(...(timeline?.blocks || []).map(timelineBlockToScriptNode));
  nodes.push(...(canvas.textNodes || []).map(archiveToScriptNode));

  return nodes;
};

const resolveLinkedRef = (nodeId: string) => {
  if (nodeId.startsWith("md-")) return `script:archive:${nodeId.slice(3)}`;
  if (nodeId.startsWith("script-")) return `source:episode:${nodeId.slice(7)}`;
  if (nodeId.startsWith("space:")) return `script:space:${nodeId.slice(6)}`;
  if (nodeId.startsWith("timeline:")) return `script:timeline:${nodeId.slice(9)}`;
  return nodeId;
};

export const buildScriptResourceLinks = (projectData: ProjectData): ScriptResourceLink[] => {
  const nodes = buildScriptResourceNodes(projectData);
  const byRef = new Map(nodes.map((node) => [node.ref, node]));
  const links: ScriptResourceLink[] = [];
  const pushLink = (fromRef: string, rawToId: string, type: ScriptResourceLink["type"]) => {
    const toRef = resolveLinkedRef(rawToId);
    const from = byRef.get(fromRef);
    const to = byRef.get(toRef);
    links.push({
      id: `script-link:${fromRef}->${toRef}`,
      fromRef,
      toRef,
      type,
      fromTitle: from?.title,
      toTitle: to?.title,
    });
  };

  const canvas = ensureScriptCanvas(projectData.scriptCanvas);
  const timeline = canvas.timeline;
  (timeline?.head?.linkedNodeIds || []).forEach((nodeId) => pushLink("script:index", nodeId, "links_to"));
  (timeline?.spaceBlocks || []).forEach((block) => {
    const ref = `script:space:${block.id}`;
    block.linkedNodeIds.forEach((nodeId) => pushLink(ref, nodeId, "links_to"));
  });
  (timeline?.blocks || []).forEach((block) => {
    const ref = `script:timeline:${block.id}`;
    block.linkedNodeIds.forEach((nodeId) => pushLink(ref, nodeId, "links_to"));
  });
  canvas.links.forEach((link) => pushLink(resolveLinkedRef(link.source), link.target, "links_to"));

  return links;
};

export const buildScriptResourceMaps = (projectData: ProjectData): ScriptResourceMap[] => {
  const nodes = buildScriptResourceNodes(projectData);
  const links = buildScriptResourceLinks(projectData);
  const count = (predicate: (node: ScriptResourceNode) => boolean) => nodes.filter(predicate).length;
  return [
    {
      mapId: "script:map:source",
      name: "Script Source",
      view: "source",
      nodeCount: count((node) => node.resourceType === "source_node"),
      linkCount: 0,
    },
    {
      mapId: "script:map:foundation",
      name: "Script Foundation",
      view: "foundation",
      nodeCount: count((node) => node.resourceType !== "source_node"),
      linkCount: links.length,
    },
    {
      mapId: "script:map:archives",
      name: "Archive Documents",
      view: "archives",
      nodeCount: count((node) => node.resourceType === "archive_node"),
      linkCount: links.filter((link) => link.fromRef.includes(":archive:") || link.toRef.includes(":archive:")).length,
    },
    {
      mapId: "script:map:timeline",
      name: "Timeline",
      view: "timeline",
      nodeCount: count((node) => node.resourceType === "timeline_block" || node.resourceType === "script_index"),
      linkCount: links.filter((link) => link.fromRef.includes(":timeline:") || link.fromRef === "script:index").length,
    },
  ];
};

export const findScriptResourceNode = (
  projectData: ProjectData,
  locator: { nodeId?: string; nodeRef?: string }
) => {
  const nodeId = trim(locator.nodeId);
  const nodeRef = trim(locator.nodeRef);
  return buildScriptResourceNodes(projectData).find((node) => {
    if (nodeId && node.nodeId === nodeId) return true;
    if (nodeId && node.ref === nodeId) return true;
    if (nodeRef && node.ref === nodeRef) return true;
    if (nodeRef && node.nodeId === nodeRef) return true;
    return false;
  }) || null;
};

export const findScriptResourceLink = (projectData: ProjectData, linkId: string) =>
  buildScriptResourceLinks(projectData).find((link) => link.id === linkId) || null;

export const findScriptResourceMap = (projectData: ProjectData, locator: { mapId?: string; name?: string }) => {
  const mapId = trim(locator.mapId);
  const name = trim(locator.name).toLowerCase();
  return buildScriptResourceMaps(projectData).find((map) => {
    if (mapId && map.mapId === mapId) return true;
    if (name && map.name.toLowerCase() === name) return true;
    return false;
  }) || null;
};

export const buildScriptResourceSearchText = (node: ScriptResourceNode) =>
  [
    node.nodeId,
    node.ref,
    node.type,
    node.title,
    node.sourceRef,
    node.body.content,
    JSON.stringify(node.body),
  ]
    .filter(Boolean)
    .join(" ");
