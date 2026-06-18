import type { ProjectData, FlowState } from "../../types";
import type { NodeFlowFile, NodeFlowNode } from "../../node-workspace/types";
import { getNodeFlowNodeRef } from "../../node-workspace/nodeflow/model";

export type ScriptResourceNode = {
  resourceType: "document_node" | "archive_node" | "folder_node";
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
  view: "documents" | "flow" | "archives" | "folders";
  nodeCount: number;
  linkCount: number;
};

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const ensureFlow = (canvas?: FlowState): FlowState => ({
  flowNodes: Array.isArray(canvas?.flowNodes) ? canvas.flowNodes : [],
  links: Array.isArray(canvas?.links) ? canvas.links : [],
  graphLinks: Array.isArray(canvas?.graphLinks) ? canvas.graphLinks : [],
});

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
    title: trim(data.title) || (isScript ? "Script document" : isArchive ? "Archive document" : "Text node"),
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

const folderFlowNodeToScriptNode = (node: NodeFlowNode): ScriptResourceNode | null => {
  if (node.type !== "folder") return null;
  const data = node.data as { title?: string; label?: string };
  return {
    resourceType: "folder_node",
    nodeId: `folder:${node.id}`,
    ref: `script:folder:${node.id}`,
    type: "script.folder",
    title: trim(data.title || data.label) || "Folder",
    body: {},
    locked: false,
    x: node.position?.x,
    y: node.position?.y,
    meta: {
      nodeId: node.id,
      nodeRef: getNodeFlowNodeRef(node),
      nodeType: node.type,
    },
  };
};

const buildScriptResourceNodesFromNodeFlow = (nodeFlow: NodeFlowFile): ScriptResourceNode[] => [
  ...nodeFlow.nodes
    .map(folderFlowNodeToScriptNode)
    .filter((node): node is ScriptResourceNode => Boolean(node)),
  ...nodeFlow.nodes
    .map(documentNodeFlowNodeToScriptNode)
    .filter((node): node is ScriptResourceNode => Boolean(node)),
];

export const buildScriptResourceNodes = (projectData: ProjectData, nodeFlow?: NodeFlowFile): ScriptResourceNode[] => {
  if (nodeFlow) return buildScriptResourceNodesFromNodeFlow(nodeFlow);
  const canvas = ensureFlow(projectData.flow);
  const nodes: ScriptResourceNode[] = [
    ...(canvas.flowNodes || [])
      .map(folderFlowNodeToScriptNode)
      .filter((node): node is ScriptResourceNode => Boolean(node)),
    ...(canvas.flowNodes || [])
      .map(documentNodeFlowNodeToScriptNode)
      .filter((node): node is ScriptResourceNode => Boolean(node)),
  ];

  return nodes;
};

const resolveLinkedRef = (nodeId: string) => {
  if (nodeId.startsWith("md-")) return `script:archive:${nodeId.slice(3)}`;
  if (nodeId.startsWith("script-")) return `script:document:${nodeId}`;
  if (nodeId.startsWith("project-root-") || nodeId.includes("--axis") || nodeId.includes("--block")) return `script:folder:${nodeId}`;
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
  const resolveResourceRef = (value: string) => refByRawNodeId.get(value) || refByNodeFlowRef.get(value) || resolveLinkedRef(value);
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
  const refByNodeFlowRef = new Map(
    nodes
      .map((node) => {
        const rawRef = typeof node.meta?.nodeRef === "string" ? node.meta.nodeRef : "";
        return rawRef ? ([rawRef, node.ref] as const) : null;
      })
      .filter((item): item is readonly [string, string] => Boolean(item))
  );
  const links: ScriptResourceLink[] = [];
  const resolveRef = (value: string) => refByRawNodeId.get(value) || refByNodeFlowRef.get(value) || resolveLinkedRef(value);
  const pushLink = (rawFrom: string, rawToId: string, type: ScriptResourceLink["type"]) => {
    const fromRef = resolveRef(rawFrom);
    const toRef = resolveRef(rawToId);
    const from = byRef.get(fromRef);
    const to = byRef.get(toRef);
    if (!from || !to || fromRef === toRef) return;
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
  canvas.links.forEach((link) => pushLink(link.source, link.target, "links_to"));
  (canvas.graphLinks || []).forEach((link) => pushLink(link.sourceRef, link.targetRef, "links_to"));

  return links;
};

export const buildScriptResourceMaps = (projectData: ProjectData, nodeFlow?: NodeFlowFile): ScriptResourceMap[] => {
  const nodes = buildScriptResourceNodes(projectData, nodeFlow);
  const links = buildScriptResourceLinks(projectData, nodeFlow);
  const count = (predicate: (node: ScriptResourceNode) => boolean) => nodes.filter(predicate).length;
  return [
    {
      mapId: "script:map:documents",
      name: "Project Documents",
      view: "documents",
      nodeCount: count((node) => node.resourceType === "document_node" || node.resourceType === "archive_node"),
      linkCount: 0,
    },
    {
      mapId: "script:map:flow",
      name: "Flow Resource Graph",
      view: "flow",
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
      mapId: "script:map:folders",
      name: "Folder Nodes",
      view: "folders",
      nodeCount: count((node) => node.resourceType === "folder_node"),
      linkCount: links.filter((link) => link.fromRef.includes(":folder:") || link.toRef.includes(":folder:")).length,
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
