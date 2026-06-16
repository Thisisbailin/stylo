import type {
  ProjectData,
  FlowState,
  FlowTextNode,
  FlowSpatialBlock,
  FlowTimelineBlock,
} from "../../types";
import type { NodeFlowFile, NodeFlowNode } from "../../node-workspace/types";
import { getNodeFlowNodeRef } from "../../node-workspace/nodeflow/model";

export type ScriptResourceNode = {
  resourceType: "document_node" | "archive_node" | "space_block" | "timeline_block" | "script_index";
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

export const ensureFlow = (canvas?: FlowState): FlowState => ({
  pages: Array.isArray(canvas?.pages) ? canvas.pages : [],
  images: Array.isArray(canvas?.images) ? canvas.images : [],
  textNodes: Array.isArray(canvas?.textNodes) ? canvas.textNodes : [],
  flowNodes: Array.isArray(canvas?.flowNodes) ? canvas.flowNodes : [],
  links: Array.isArray(canvas?.links) ? canvas.links : [],
  timeline: canvas?.timeline,
});

const archiveToScriptNode = (node: FlowTextNode): ScriptResourceNode => ({
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

const archiveFlowNodeToScriptNode = (node: NodeFlowNode): ScriptResourceNode => {
  const data = node.data as {
    documentId?: string;
    title?: string;
    text?: string;
    content?: string;
    createdAt?: number;
  };
  const documentId = trim(data.documentId) || node.id.replace(/^md-/, "");
  return {
    resourceType: "archive_node",
    nodeId: `archive:${documentId}`,
    ref: `script:archive:${documentId}`,
    type: "script.archive",
    title: trim(data.title) || "档案文档",
    body: {
      content: typeof data.content === "string" ? data.content : data.text || "",
    },
    locked: false,
    x: node.position?.x,
    y: node.position?.y,
    meta: {
      documentId,
      nodeId: node.id,
      createdAt: data.createdAt,
    },
  };
};

const documentFlowNodeToScriptNode = (node: NodeFlowNode): ScriptResourceNode | null => {
  if (node.type !== "scriptPage" && node.type !== "text") return null;
  const data = node.data as {
    documentId?: string;
    title?: string;
    text?: string;
    content?: string;
    preview?: string;
    createdAt?: number;
    updatedAt?: number;
  };
  const documentId = trim(data.documentId) || node.id;
  const isScript = node.type === "scriptPage";
  return {
    resourceType: "document_node",
    nodeId: `document:${documentId}`,
    ref: `script:document:${documentId}`,
    type: isScript ? "script.document" : "script.note",
    title: trim(data.title) || (isScript ? "剧本文档" : "文本节点"),
    body: {
      content: typeof data.content === "string" ? data.content : data.text || "",
      format: isScript ? "fountain" : "markdown",
      documentKind: isScript ? "script" : "note",
    },
    locked: false,
    x: node.position?.x,
    y: node.position?.y,
    meta: {
      documentId,
      nodeId: node.id,
      nodeType: node.type,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      preview: data.preview || "",
    },
  };
};

const documentNodeFlowNodeToScriptNode = (node: NodeFlowNode): ScriptResourceNode | null => {
  if (node.type !== "scriptPage" && node.type !== "text" && node.type !== "mdText") return null;
  const data = node.data as {
    documentId?: string;
    title?: string;
    text?: string;
    content?: string;
    preview?: string;
    createdAt?: number;
    updatedAt?: number;
    documentKind?: string;
    format?: string;
  };
  const documentId = trim(data.documentId) || node.id;
  const isScript = node.type === "scriptPage";
  const isArchive = node.type === "mdText" || data.documentKind === "archive";
  return {
    resourceType: isArchive ? "archive_node" : "document_node",
    nodeId: `${isArchive ? "archive" : "document"}:${documentId}`,
    ref: `script:${isArchive ? "archive" : "document"}:${documentId}`,
    type: isScript ? "script.document" : isArchive ? "script.archive" : "script.note",
    title: trim(data.title) || (isScript ? "剧本文档" : isArchive ? "档案文档" : "文本节点"),
    body: {
      content: typeof data.content === "string" ? data.content : data.text || "",
      format: isScript ? "fountain" : isArchive ? "markdown" : trim(data.format) || "markdown",
      documentKind: isScript ? "script" : isArchive ? "archive" : trim(data.documentKind) || "note",
    },
    locked: false,
    x: node.position?.x,
    y: node.position?.y,
    meta: {
      documentId,
      nodeId: node.id,
      nodeRef: getNodeFlowNodeRef(node),
      nodeType: node.type,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      preview: data.preview || "",
    },
  };
};

const spaceBlockToScriptNode = (block: FlowSpatialBlock): ScriptResourceNode => ({
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

const timelineBlockToScriptNode = (block: FlowTimelineBlock): ScriptResourceNode => ({
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

const buildScriptResourceNodesFromNodeFlow = (nodeFlow: NodeFlowFile): ScriptResourceNode[] =>
  nodeFlow.nodes
    .map(documentNodeFlowNodeToScriptNode)
    .filter((node): node is ScriptResourceNode => Boolean(node));

export const buildScriptResourceNodes = (projectData: ProjectData, nodeFlow?: NodeFlowFile): ScriptResourceNode[] => {
  if (nodeFlow) return buildScriptResourceNodesFromNodeFlow(nodeFlow);
  const canvas = ensureFlow(projectData.flow);
  const nodes: ScriptResourceNode[] = [];
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
  nodes.push(
    ...(canvas.flowNodes || [])
      .map(documentFlowNodeToScriptNode)
      .filter((node): node is ScriptResourceNode => Boolean(node))
  );
  const archiveFlowNodes = (canvas.flowNodes || []).filter((node) => node.type === "mdText").map(archiveFlowNodeToScriptNode);
  const archiveFlowDocumentIds = new Set(
    archiveFlowNodes.map((node) => (typeof node.meta?.documentId === "string" ? node.meta.documentId : ""))
  );
  nodes.push(...archiveFlowNodes);
  nodes.push(...(canvas.textNodes || []).filter((node) => !archiveFlowDocumentIds.has(node.id)).map(archiveToScriptNode));

  return nodes;
};

const resolveLinkedRef = (nodeId: string) => {
  if (nodeId.startsWith("md-")) return `script:archive:${nodeId.slice(3)}`;
  if (nodeId.startsWith("script-")) return `script:document:${nodeId}`;
  if (nodeId.startsWith("space:")) return `script:space:${nodeId.slice(6)}`;
  if (nodeId.startsWith("timeline:")) return `script:timeline:${nodeId.slice(9)}`;
  if (nodeId.startsWith("text-")) return `script:document:${nodeId}`;
  return nodeId;
};

const buildScriptResourceLinksFromNodeFlow = (nodeFlow: NodeFlowFile): ScriptResourceLink[] => {
  const nodes = buildScriptResourceNodesFromNodeFlow(nodeFlow);
  const refByRawNodeId = new Map(
    nodes
      .map((node) => {
        const rawNodeId = typeof node.meta?.nodeId === "string" ? node.meta.nodeId : "";
        return rawNodeId ? ([rawNodeId, node.ref] as const) : null;
      })
      .filter((item): item is readonly [string, string] => Boolean(item))
  );
  const refByNodeFlowRef = new Map(
    nodes
      .map((node) => {
        const rawRef = typeof node.meta?.nodeRef === "string" ? node.meta.nodeRef : "";
        return rawRef ? ([rawRef, node.ref] as const) : null;
      })
      .filter((item): item is readonly [string, string] => Boolean(item))
  );
  const byRef = new Map(nodes.map((node) => [node.ref, node]));
  const links: ScriptResourceLink[] = [];
  const pushLink = (fromRef: string | undefined, toRef: string | undefined, type: ScriptResourceLink["type"]) => {
    if (!fromRef || !toRef || fromRef === toRef) return;
    if (!byRef.has(fromRef) || !byRef.has(toRef)) return;
    links.push({
      id: `script-link:${fromRef}->${toRef}`,
      fromRef,
      toRef,
      type,
      fromTitle: byRef.get(fromRef)?.title,
      toTitle: byRef.get(toRef)?.title,
    });
  };

  nodeFlow.links.forEach((link) => {
    pushLink(refByRawNodeId.get(link.source), refByRawNodeId.get(link.target), "links_to");
  });
  (nodeFlow.graphLinks || []).forEach((link) => {
    pushLink(refByNodeFlowRef.get(link.sourceRef), refByNodeFlowRef.get(link.targetRef), "links_to");
  });

  return links;
};

export const buildScriptResourceLinks = (projectData: ProjectData, nodeFlow?: NodeFlowFile): ScriptResourceLink[] => {
  if (nodeFlow) return buildScriptResourceLinksFromNodeFlow(nodeFlow);
  const nodes = buildScriptResourceNodes(projectData);
  const byRef = new Map(nodes.map((node) => [node.ref, node]));
  const refByRawNodeId = new Map(
    nodes
      .map((node) => {
        const rawNodeId = typeof node.meta?.nodeId === "string" ? node.meta.nodeId : "";
        return rawNodeId ? ([rawNodeId, node.ref] as const) : null;
      })
      .filter((item): item is readonly [string, string] => Boolean(item))
  );
  const links: ScriptResourceLink[] = [];
  const pushLink = (fromRef: string, rawToId: string, type: ScriptResourceLink["type"]) => {
    const toRef = refByRawNodeId.get(rawToId) || resolveLinkedRef(rawToId);
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

  const canvas = ensureFlow(projectData.flow);
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

export const buildScriptResourceMaps = (projectData: ProjectData, nodeFlow?: NodeFlowFile): ScriptResourceMap[] => {
  const nodes = buildScriptResourceNodes(projectData, nodeFlow);
  const links = buildScriptResourceLinks(projectData, nodeFlow);
  const count = (predicate: (node: ScriptResourceNode) => boolean) => nodes.filter(predicate).length;
  return [
    {
      mapId: "script:map:source",
      name: "Project Documents",
      view: "source",
      nodeCount: count((node) => node.resourceType === "document_node" || node.resourceType === "archive_node"),
      linkCount: 0,
    },
    {
      mapId: "script:map:foundation",
      name: "Script Foundation",
      view: "foundation",
      nodeCount: nodes.length,
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
  locator: { nodeId?: string; nodeRef?: string },
  nodeFlow?: NodeFlowFile
) => {
  const nodeId = trim(locator.nodeId);
  const nodeRef = trim(locator.nodeRef);
  return buildScriptResourceNodes(projectData, nodeFlow).find((node) => {
    if (nodeId && node.nodeId === nodeId) return true;
    if (nodeId && node.ref === nodeId) return true;
    if (nodeRef && node.ref === nodeRef) return true;
    if (nodeRef && node.nodeId === nodeRef) return true;
    return false;
  }) || null;
};

export const findScriptResourceLink = (projectData: ProjectData, linkId: string, nodeFlow?: NodeFlowFile) =>
  buildScriptResourceLinks(projectData, nodeFlow).find((link) => link.id === linkId) || null;

export const findScriptResourceMap = (projectData: ProjectData, locator: { mapId?: string; name?: string }, nodeFlow?: NodeFlowFile) => {
  const mapId = trim(locator.mapId);
  const name = trim(locator.name).toLowerCase();
  return buildScriptResourceMaps(projectData, nodeFlow).find((map) => {
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
