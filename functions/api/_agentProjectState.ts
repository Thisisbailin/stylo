import type { ProjectData } from "../../types";
import type { NodeFlowFile } from "../../node-workspace/types";
import { parseNodeFlowFile } from "../../node-workspace/nodeflow/schema";
import type { D1DatabaseLike, D1PreparedStatementLike } from "./_types";

type D1Rows<T> = { results?: T[] };
type D1StatementWithAll = D1PreparedStatementLike & {
  all<T = Record<string, unknown>>(): Promise<D1Rows<T>>;
};

type AgentProjectRows = {
  meta: Record<string, unknown>;
  project: Record<string, unknown>;
  nodes: Record<string, unknown>[];
  updatedAt: number;
};

const EMPTY_STATS = { context: { total: 0, success: 0, error: 0 } };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseRecord = (value: unknown) => {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const asArray = <T = unknown>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
const asNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const buildAgentProjectStateFromRealtimeDocument = (
  projectId: string,
  value: unknown,
  updatedAt: number,
): { projectData: ProjectData; nodeFlow: NodeFlowFile; updatedAt: number } => {
  const projectRecord = parseRecord(value);
  if (!Object.keys(projectRecord).length) {
    throw new Error("云端实时项目文档为空，请等待项目同步完成后重试。");
  }
  const projectData = projectRecord as unknown as ProjectData;
  const flowProjects = Array.isArray(projectData.flowProjects) ? projectData.flowProjects : [];
  const activeProject = flowProjects.find((project) => project.id === projectId) || flowProjects[0];
  const flow = activeProject?.flow || projectData.flow || {};
  const canvas = isRecord(projectData.canvas) ? projectData.canvas : {};
  const viewport = isRecord(canvas.viewport) ? canvas.viewport : undefined;
  const projectTitle = activeProject?.title?.trim() || projectData.fileName?.trim() || "Stylo Flow Workspace";
  const roles = Array.isArray(projectData.roles) ? projectData.roles : [];
  const designAssets = Array.isArray(projectData.designAssets) ? projectData.designAssets : [];
  const nodes = Array.isArray(flow.flowNodes) ? flow.flowNodes : [];

  const nodeFlow = parseNodeFlowFile({
    version: 2,
    revision: Math.max(0, Math.trunc(asNumber(flow.revision))),
    name: projectTitle.slice(0, 256),
    nodes,
    links: Array.isArray(flow.links) ? flow.links : [],
    graphLinks: Array.isArray(flow.graphLinks) ? flow.graphLinks : [],
    linkStyle: flow.linkStyle,
    globalAssetHistory: Array.isArray(flow.globalAssetHistory) ? flow.globalAssetHistory : [],
    nodeFlowContext: {
      rawScript: typeof projectData.rawScript === "string" ? projectData.rawScript : "",
      episodes: Array.isArray(projectData.episodes) ? projectData.episodes : [],
      roles,
      designAssets,
    },
    viewport,
    activeView: typeof flow.activeView === "string" ? flow.activeView : null,
  });

  return { projectData, nodeFlow, updatedAt };
};

export const buildAgentProjectStateFromRows = (
  projectId: string,
  rows: AgentProjectRows
): { projectData: ProjectData; nodeFlow: NodeFlowFile; updatedAt: number } => {
  const storedFlow = isRecord(rows.project.flow) ? rows.project.flow : {};
  const roles = asArray(rows.project.roles).length
    ? asArray(rows.project.roles)
    : asArray(rows.meta.roles);
  const designAssets = asArray(rows.project.designAssets).length
    ? asArray(rows.project.designAssets)
    : asArray(rows.meta.designAssets);
  const flow = {
    ...storedFlow,
    flowNodes: rows.nodes,
    links: asArray(storedFlow.links),
  };
  const projectTitle = typeof rows.project.title === "string" && rows.project.title.trim()
    ? rows.project.title.trim()
    : typeof rows.meta.fileName === "string" && rows.meta.fileName.trim()
      ? rows.meta.fileName.trim()
      : "Stylo Flow Workspace";
  const hydratedProject = {
    ...rows.project,
    id: projectId,
    title: projectTitle,
    flow,
    roles,
    designAssets,
  };
  const canvas = isRecord(rows.meta.canvas) ? rows.meta.canvas : {};
  const viewport = isRecord(canvas.viewport) ? canvas.viewport : undefined;

  const projectData: ProjectData = {
    fileName: projectTitle,
    rawScript: "",
    episodes: [],
    roles: roles as ProjectData["roles"],
    designAssets: designAssets as ProjectData["designAssets"],
    canvas: canvas as ProjectData["canvas"],
    flow: flow as unknown as ProjectData["flow"],
    activeFlowProjectId: projectId,
    flowProjects: [hydratedProject as unknown as NonNullable<ProjectData["flowProjects"]>[number]],
    phase5Usage: isRecord(rows.meta.phase5Usage)
      ? rows.meta.phase5Usage as unknown as ProjectData["phase5Usage"]
      : undefined,
    stats: isRecord(rows.meta.stats)
      ? rows.meta.stats as unknown as ProjectData["stats"]
      : EMPTY_STATS,
  };

  const nodeFlow = parseNodeFlowFile({
    version: 2,
    revision: Math.max(0, Math.trunc(asNumber(storedFlow.revision))),
    name: projectTitle.slice(0, 256),
    nodes: rows.nodes,
    links: asArray(storedFlow.links),
    graphLinks: asArray(storedFlow.graphLinks),
    linkStyle: storedFlow.linkStyle,
    globalAssetHistory: asArray(storedFlow.globalAssetHistory),
    nodeFlowContext: {
      rawScript: "",
      episodes: [],
      roles,
      designAssets,
    },
    viewport,
    activeView: typeof storedFlow.activeView === "string" ? storedFlow.activeView : null,
  });

  return { projectData, nodeFlow, updatedAt: rows.updatedAt };
};

export const loadAgentProjectState = async (
  db: D1DatabaseLike,
  userId: string,
  projectId: string
) => {
  const realtimeRow = await db.prepare(
    `SELECT project_data, updated_at
     FROM user_project_documents
     WHERE user_id = ?1 AND project_id = ?2`,
  ).bind(userId, projectId).first<Record<string, unknown>>();
  if (realtimeRow) {
    return buildAgentProjectStateFromRealtimeDocument(
      projectId,
      realtimeRow.project_data,
      asNumber(realtimeRow.updated_at),
    );
  }

  const metaRow = await db.prepare(
    "SELECT data, updated_at FROM user_project_meta WHERE user_id = ?1 AND project_id = ?2"
  ).bind(userId, projectId).first<Record<string, unknown>>();
  if (!metaRow) throw new Error("云端项目尚未建立，请等待项目同步完成后重试。");

  const projectRow = await db.prepare(
    "SELECT data, updated_at FROM user_project_flow_projects WHERE user_id = ?1 AND project_id = ?2"
  ).bind(userId, projectId).first<Record<string, unknown>>();
  if (!projectRow) throw new Error("云端找不到当前 Flow 项目，请等待项目同步完成后重试。");

  const nodeRows = await (db.prepare(
    "SELECT data FROM user_project_flow_nodes WHERE user_id = ?1 AND project_id = ?2 ORDER BY node_index ASC"
  ).bind(userId, projectId) as D1StatementWithAll).all<Record<string, unknown>>();

  return buildAgentProjectStateFromRows(projectId, {
    meta: parseRecord(metaRow.data),
    project: parseRecord(projectRow.data),
    nodes: (nodeRows.results || []).map((row) => parseRecord(row.data)),
    updatedAt: asNumber(projectRow.updated_at, asNumber(metaRow.updated_at)),
  });
};
