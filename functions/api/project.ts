import { validateProjectDelta, validateProjectPayload } from "./validation";
import type { ProjectData } from "../../types";
import { logAudit } from "./audit";
import { getUserId, jsonResponse, JSON_HEADERS } from "./_auth";
import { readJsonRequest } from "./_request";
import {
  buildProjectWriteGuardCleanupStatement,
  buildProjectWriteGuardStatement,
  createProjectWriteGuardId,
  isProjectWriteGuardError,
} from "./_projectWriteGuard";
import { bindOperationId, normalizeOperationId } from "./_idempotency";
import { normalizeFlowProjectsForStorage } from "./_projectFlowMigration";
import { buildBulkProjectInsertStatements } from "./_projectBulkStatements";
import { hasInlineProjectMedia } from "../../utils/cloudProjectData";
import { buildProjectEditLeaseGuardStatement, requireProjectEditLease } from "./_projectEditLease";
import { requireRequestProjectId } from "./_projectScope";

type Env = {
  DB: any; // D1 binding injected by Cloudflare Pages
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
};

const SNAPSHOT_LIMIT = 10;
const MAX_PROJECT_BYTES = 1_800_000;
const MAX_PROJECT_REQUEST_BYTES = 32 * 1024 * 1024;
const MAX_FLOW_PROJECTS = 3;

const emptyStats = {
  context: { total: 0, success: 0, error: 0 }
};

type ProjectMeta = {
  schemaVersion?: number;
  fileName: string;
  rawScript: string;
  roles: Array<Record<string, unknown>>;
  designAssets: Array<Record<string, unknown>>;
  canvas?: Record<string, unknown>;
  activeFlowProjectId?: string;
  flow?: Record<string, unknown>;
  flowProjects?: Array<Record<string, unknown>>;
  nodeDefaults: Record<string, unknown> | null;
  scriptCanvas: Record<string, unknown> | null;
  phase5Usage?: Record<string, unknown>;
  stats: typeof emptyStats;
};

const DEFAULT_META: ProjectMeta = {
  schemaVersion: 2,
  fileName: "",
  rawScript: "",
  roles: [],
  designAssets: [],
  canvas: {},
  activeFlowProjectId: undefined,
  flow: undefined,
  flowProjects: undefined,
  nodeDefaults: null,
  scriptCanvas: null,
  phase5Usage: { promptTokens: 0, responseTokens: 0, totalTokens: 0 },
  stats: emptyStats
};

type ProjectDelta = {
  meta?: Partial<ProjectMeta>;
  episodes?: Array<Record<string, unknown>>;
  scenes?: Array<Record<string, unknown>>;
  roles?: Array<Record<string, unknown>>;
  deleted?: {
    episodes?: number[];
    scenes?: { episodeId: number; sceneId: string }[];
    roles?: string[];
  };
};

const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const getDeviceId = (request: Request, body?: any) => {
  const headerId = request.headers.get("x-device-id") || request.headers.get("X-Device-Id");
  const bodyId = body && typeof body.deviceId === "string" ? body.deviceId : undefined;
  return headerId || bodyId || undefined;
};

const toFlowProjects = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((project): project is Record<string, unknown> => !!project && typeof project === "object")
        .slice(0, MAX_FLOW_PROJECTS)
    : [];

const readProjectRevision = (value: unknown) => {
  if (!value || typeof value !== "object") return null;
  const project = value as Record<string, unknown>;
  const activeProjectId = typeof project.activeFlowProjectId === "string"
    ? project.activeFlowProjectId
    : undefined;
  const flowProjects = Array.isArray(project.flowProjects)
    ? project.flowProjects.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
  const activeProject = flowProjects.find((item) => item.id === activeProjectId) || flowProjects[0];
  const activeFlow = activeProject?.flow && typeof activeProject.flow === "object"
    ? activeProject.flow as Record<string, unknown>
    : null;
  const legacyFlow = project.flow && typeof project.flow === "object"
    ? project.flow as Record<string, unknown>
    : null;
  const revision = activeFlow?.revision ?? legacyFlow?.revision;
  return typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0
    ? revision
    : null;
};

const splitFlowProject = (project: Record<string, unknown>) => {
  const flow = project.flow && typeof project.flow === "object" ? project.flow as Record<string, unknown> : {};
  const flowNodes = Array.isArray(flow.flowNodes) ? flow.flowNodes : [];
  return {
    project: {
      ...project,
      flow: {
        ...flow,
        flowNodes: [],
      },
    },
    nodes: flowNodes
      .filter((node): node is Record<string, unknown> => !!node && typeof node === "object")
      .map((node, index) => ({
        node,
        nodeId: typeof node.id === "string" ? node.id : `node-${index}`,
        nodeIndex: index,
      })),
  };
};

const toFlowStorageRows = (flowProjects: Array<Record<string, unknown>>) => {
  const projects: Array<{ projectId: string; data: unknown }> = [];
  const nodes: Array<{
    projectId: string;
    nodeId: string;
    nodeIndex: number;
    data: unknown;
  }> = [];
  flowProjects.forEach((flowProject) => {
    const projectId = typeof flowProject.id === "string" ? flowProject.id : "";
    if (!projectId) return;
    const split = splitFlowProject(flowProject);
    projects.push({ projectId, data: split.project });
    split.nodes.forEach((flowNode) => {
      nodes.push({
        projectId,
        nodeId: flowNode.nodeId,
        nodeIndex: flowNode.nodeIndex,
        data: flowNode.node,
      });
    });
  });
  return { projects, nodes };
};

const hydrateFlowProject = (
  project: Record<string, unknown>,
  nodesByProject: Map<string, Array<Record<string, unknown>>>
) => {
  const projectId = typeof project.id === "string" ? project.id : "";
  const flow = project.flow && typeof project.flow === "object" ? project.flow as Record<string, unknown> : {};
  const nodes = projectId ? nodesByProject.get(projectId) || [] : [];
  return {
    ...project,
    flow: {
      ...flow,
      flowNodes: nodes.length > 0 ? nodes : Array.isArray(flow.flowNodes) ? flow.flowNodes : [],
    },
  };
};

const compactMeta = (meta: ProjectMeta): ProjectMeta => {
  const { flow, flowProjects, ...rest } = meta;
  return {
    ...rest,
    schemaVersion: 2,
    flow: undefined,
    flowProjects: undefined,
  };
};

const serializeWithSizeGuard = (value: unknown, label: string) => {
  const serialized = JSON.stringify(value);
  const bytes = new TextEncoder().encode(serialized).length;
  if (bytes > MAX_PROJECT_BYTES) {
    throw new Response(
      JSON.stringify({ error: `${label} payload too large`, detail: `size=${bytes}` }),
      { status: 413, headers: JSON_HEADERS }
    );
  }
  return { serialized, bytes };
};

const tryInsertSnapshot = async (env: Env, userId: string, projectId: string, version: number, projectData: unknown) => {
  const serialized = JSON.stringify({ projectData });
  const bytes = new TextEncoder().encode(serialized).length;
  if (bytes > MAX_PROJECT_BYTES) {
    console.warn("Skipping project snapshot larger than D1 row limit guard", { userId, version, bytes });
    return false;
  }
  await env.DB.prepare(
    "INSERT OR IGNORE INTO user_project_snapshots (user_id, project_id, version, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)"
  )
    .bind(userId, projectId, version, serialized, Date.now())
    .run();
  return true;
};

const buildSnapshotStatements = (
  env: Env,
  userId: string,
  projectId: string,
  version: number,
  projectData: unknown
) => {
  const serialized = JSON.stringify({ projectData });
  const bytes = new TextEncoder().encode(serialized).length;
  if (bytes > MAX_PROJECT_BYTES) {
    console.warn("Skipping project snapshot larger than D1 row limit guard", { userId, version, bytes });
    return [];
  }
  return [
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_project_snapshots (user_id, project_id, version, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)"
    ).bind(userId, projectId, version, serialized, Date.now()),
    env.DB.prepare(
      "DELETE FROM user_project_snapshots WHERE user_id = ?1 AND project_id = ?2 AND version NOT IN (SELECT version FROM user_project_snapshots WHERE user_id = ?1 AND project_id = ?2 ORDER BY version DESC LIMIT ?3)"
    ).bind(userId, projectId, SNAPSHOT_LIMIT),
  ];
};

const buildMetaFromProject = (projectData: any): ProjectMeta => ({
  schemaVersion: 2,
  fileName: typeof projectData?.fileName === "string" ? projectData.fileName : "",
  rawScript: typeof projectData?.rawScript === "string" ? projectData.rawScript : "",
  roles: Array.isArray(projectData?.roles) ? projectData.roles : [],
  designAssets: Array.isArray(projectData?.designAssets) ? projectData.designAssets : [],
  canvas: projectData?.canvas && typeof projectData.canvas === "object" ? projectData.canvas : {},
  activeFlowProjectId: typeof projectData?.activeFlowProjectId === "string" ? projectData.activeFlowProjectId : undefined,
  flow: projectData?.flow && typeof projectData.flow === "object" ? projectData.flow : undefined,
  flowProjects: toFlowProjects(projectData?.flowProjects),
  nodeDefaults: projectData?.nodeDefaults && typeof projectData.nodeDefaults === "object" ? projectData.nodeDefaults : null,
  scriptCanvas: projectData?.scriptCanvas && typeof projectData.scriptCanvas === "object" ? projectData.scriptCanvas : null,
  phase5Usage: projectData?.phase5Usage || DEFAULT_META.phase5Usage,
  stats: { ...emptyStats, ...(projectData?.stats || {}) }
});

const collectProjectParts = (projectData: any) => {
  const episodes = Array.isArray(projectData?.episodes) ? projectData.episodes : [];
  const scenes: Array<{ episodeId: number; scene: any }> = [];

  episodes.forEach((episode: any) => {
    const episodeId = episode?.id;
    if (!Array.isArray(episode?.scenes)) return;
    episode.scenes.forEach((scene: any) => {
      scenes.push({ episodeId, scene });
    });
  });

  const episodeRows = episodes.map((episode: any) => ({
    id: episode.id,
    title: episode.title,
    content: episode.content,
    characters: Array.isArray(episode.characters) ? episode.characters : undefined,
    status: episode.status,
    errorMsg: episode.errorMsg
  }));

  return {
    episodes: episodeRows,
    scenes,
    roles: Array.isArray(projectData?.roles) ? projectData.roles : [],
  };
};

const loadProjectData = async (env: Env, userId: string, projectId: string) => {
  const metaRow = await env.DB.prepare(
    "SELECT data, updated_at FROM user_project_meta WHERE user_id = ?1 AND project_id = ?2"
  )
    .bind(userId, projectId)
    .first();

  if (!metaRow) return null;

  const meta = safeJsonParse<ProjectMeta>(metaRow.data as string, DEFAULT_META);

  const episodesResult = await env.DB.prepare(
    "SELECT episode_id, data FROM user_project_episodes WHERE user_id = ?1 AND project_id = ?2 ORDER BY episode_id ASC"
  )
    .bind(userId, projectId)
    .all();

  const scenesResult = await env.DB.prepare(
    "SELECT episode_id, scene_id, data FROM user_project_scenes WHERE user_id = ?1 AND project_id = ?2 ORDER BY episode_id ASC, scene_id ASC"
  )
    .bind(userId, projectId)
    .all();

  const flowProjectsResult = await env.DB.prepare(
    "SELECT project_id, data FROM user_project_flow_projects WHERE user_id = ?1 AND project_id = ?2"
  )
    .bind(userId, projectId)
    .all();

  const flowNodesResult = await env.DB.prepare(
    "SELECT project_id, node_id, node_index, data FROM user_project_flow_nodes WHERE user_id = ?1 AND project_id = ?2 ORDER BY node_index ASC"
  )
    .bind(userId, projectId)
    .all();

  const episodesMap = new Map<number, any>();
  const getEpisode = (episodeId: number) => {
    if (!episodesMap.has(episodeId)) {
      episodesMap.set(episodeId, {
        id: episodeId,
        title: "",
        content: "",
        scenes: [],
        status: "pending"
      });
    }
    return episodesMap.get(episodeId);
  };

  (episodesResult?.results || []).forEach((row: any) => {
    const epData = safeJsonParse<Record<string, unknown>>(row.data, {});
    const episodeId = row.episode_id;
    episodesMap.set(episodeId, {
      id: episodeId,
      title: epData.title || "",
      content: epData.content || "",
      characters: Array.isArray(epData.characters) ? epData.characters : undefined,
      status: epData.status || "pending",
      errorMsg: epData.errorMsg,
      scenes: [],
    });
  });

  (scenesResult?.results || []).forEach((row: any) => {
    const sceneData = safeJsonParse<Record<string, unknown>>(row.data, {});
    const { episodeId: _episodeId, ...rest } = sceneData as Record<string, unknown>;
    const episode = getEpisode(row.episode_id);
    episode.scenes.push({
      id: row.scene_id,
      ...rest,
      title: (rest as any).title || "",
      content: (rest as any).content || ""
    });
  });

  const metaRoles = Array.isArray(meta.roles) ? meta.roles : [];
  const nodesByProject = new Map<string, Array<Record<string, unknown>>>();
  (flowNodesResult?.results || []).forEach((row: any) => {
    const node = safeJsonParse<Record<string, unknown>>(row.data, {});
    if (!node || typeof node !== "object") return;
    const projectId = String(row.project_id || "");
    if (!projectId) return;
    const list = nodesByProject.get(projectId) || [];
    list.push(node);
    nodesByProject.set(projectId, list);
  });
  const flowProjectsFromRows = (flowProjectsResult?.results || [])
    .map((row: any) => safeJsonParse<Record<string, unknown>>(row.data, {}))
    .filter((project: any) => project && typeof project.id === "string")
    .map((project: Record<string, unknown>) => hydrateFlowProject(project, nodesByProject))
    .slice(0, MAX_FLOW_PROJECTS);
  const flowProjects = flowProjectsFromRows.length > 0
    ? flowProjectsFromRows
    : toFlowProjects(meta.flowProjects);
  const activeFlowProjectId = projectId;
  const activeFlowProject = activeFlowProjectId
    ? flowProjects.find((project: any) => project.id === activeFlowProjectId)
    : flowProjects[0];

  const episodes = Array.from(episodesMap.values()).sort((a, b) => a.id - b.id);

  const projectData = {
    fileName: meta.fileName || "",
    rawScript: meta.rawScript || "",
    episodes,
    roles: metaRoles,
    designAssets: Array.isArray(meta.designAssets) ? meta.designAssets : [],
    canvas: meta.canvas && typeof meta.canvas === "object" ? meta.canvas : {},
    flow: (activeFlowProject as any)?.flow || meta.flow,
    activeFlowProjectId,
    flowProjects,
    nodeDefaults: meta.nodeDefaults && typeof meta.nodeDefaults === "object" ? meta.nodeDefaults : null,
    scriptCanvas: meta.scriptCanvas && typeof meta.scriptCanvas === "object" ? meta.scriptCanvas : undefined,
    phase5Usage: meta.phase5Usage || DEFAULT_META.phase5Usage,
    stats: { ...emptyStats, ...(meta.stats || {}) }
  };

  const updatedAt =
    typeof metaRow.updated_at === "number" ? metaRow.updated_at : Number(metaRow.updated_at) || 0;
  return { projectData, updatedAt };
};

export const onRequestGet = async (context: {
  request: Request;
  env: Env;
}) => {
  let userId: string | null = null;
  try {
    userId = await getUserId(context.request, context.env);
    const projectId = requireRequestProjectId(context.request);
    const data = await loadProjectData(context.env, userId, projectId);
    if (!data) {
      return new Response("Not Found", { status: 404 });
    }

    return jsonResponse(
      {
        projectData: data.projectData,
        updatedAt: data.updatedAt,
        projectRevision: readProjectRevision(data.projectData),
      },
      { headers: { etag: String(data.updatedAt) } }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("GET /api/project error", err);
    const detail = err?.message || (typeof err === "string" ? err : "Unknown error");
    if (userId) {
      const deviceId = getDeviceId(context.request);
      await logAudit(context.env, userId, "project.get", "error", { error: "Failed to load project", detail, deviceId });
    }
    return jsonResponse({ error: "Failed to load project" }, { status: 500 });
  }
};

export const onRequestPut = async (context: {
  request: Request;
  env: Env;
}) => {
  let userId: string | null = null;
  try {
    userId = await getUserId(context.request, context.env);
    const editLease = await requireProjectEditLease(context.env, context.request, userId);
    const projectId = editLease.project_id;

    const body = await readJsonRequest<Record<string, unknown>>(
      context.request,
      MAX_PROJECT_REQUEST_BYTES
    );
    if (!body || typeof body !== "object") {
      const deviceId = getDeviceId(context.request);
      if (userId) await logAudit(context.env, userId, "project.put", "invalid", { error: "Invalid payload", deviceId });
      return jsonResponse({ error: "Invalid payload." }, { status: 400 });
    }

    const deviceId = getDeviceId(context.request, body);
    const auditDevice = deviceId ? { deviceId } : {};
    const delta = (body as any).delta as ProjectDelta | undefined;
    const hasFull = Object.prototype.hasOwnProperty.call(body, "projectData");
    const projectData = hasFull ? (body as any).projectData : delta ? undefined : body;
    const mode = delta ? "delta" : "full";

    const scopedPayload = (delta?.meta || projectData) as Record<string, unknown> | undefined;
    const payloadProjectId = typeof scopedPayload?.activeFlowProjectId === "string"
      ? scopedPayload.activeFlowProjectId.trim()
      : "";
    const payloadProjects = Array.isArray(scopedPayload?.flowProjects)
      ? scopedPayload.flowProjects.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      : [];
    if (
      (payloadProjectId && payloadProjectId !== projectId) ||
      payloadProjects.some((item) => item.id !== projectId)
    ) {
      return jsonResponse(
        { error: "Project payload does not match requested projectId", code: "PROJECT_SCOPE_MISMATCH" },
        { status: 400 },
      );
    }

    if (delta) {
      const deltaValidation = validateProjectDelta(delta);
      if (!deltaValidation.ok) {
        const error = (deltaValidation as any).error;
        if (userId) await logAudit(context.env, userId, "project.put", "invalid", { error, mode, ...auditDevice });
        return jsonResponse({ error }, { status: 400 });
      }
    } else {
      const validation = validateProjectPayload(projectData);
      if (!validation.ok) {
        const error = (validation as any).error;
        if (userId) await logAudit(context.env, userId, "project.put", "invalid", { error, mode, ...auditDevice });
        return jsonResponse({ error }, { status: 400 });
      }
    }

    const inlineMediaScope = delta?.meta || projectData;
    if (
      inlineMediaScope &&
      hasInlineProjectMedia(inlineMediaScope as Pick<ProjectData, "flow" | "flowProjects">)
    ) {
      const error = "Inline media is not allowed in cloud project state";
      if (userId) await logAudit(context.env, userId, "project.put", "invalid", { error, mode, ...auditDevice });
      return jsonResponse(
        {
          error,
          detail: "媒体二进制必须保留在项目文件包中；云端项目状态只接受媒体元数据。",
        },
        { status: 422 }
      );
    }

    const bodyUpdatedAt = typeof (body as any).updatedAt === "number" &&
      Number.isSafeInteger((body as any).updatedAt) && (body as any).updatedAt >= 0
      ? (body as any).updatedAt as number
      : undefined;
    const ifMatchHeader = context.request.headers.get("if-match");
    const ifMatchVersion = ifMatchHeader !== null && /^\d+$/.test(ifMatchHeader.trim())
      ? Number(ifMatchHeader.trim())
      : undefined;
    if (ifMatchHeader !== null && ifMatchVersion === undefined) {
      return jsonResponse({ error: "Invalid If-Match project version" }, { status: 400 });
    }
    if (bodyUpdatedAt !== undefined && ifMatchVersion !== undefined && bodyUpdatedAt !== ifMatchVersion) {
      return jsonResponse({ error: "Project version differs between body and If-Match" }, { status: 400 });
    }
    const clientUpdatedAt = ifMatchVersion ?? bodyUpdatedAt;
    const rawProjectRevision = (body as any).projectRevision;
    const clientProjectRevision = typeof rawProjectRevision === "number" &&
      Number.isSafeInteger(rawProjectRevision) && rawProjectRevision >= 0
      ? rawProjectRevision as number
      : null;
    if (rawProjectRevision !== undefined && clientProjectRevision === null) {
      return jsonResponse({ error: "Invalid projectRevision" }, { status: 400 });
    }
    const payloadProjectRevision = readProjectRevision(delta?.meta || projectData);
    if (
      clientProjectRevision !== null &&
      payloadProjectRevision !== null &&
      clientProjectRevision !== payloadProjectRevision
    ) {
      return jsonResponse({ error: "projectRevision does not match project payload" }, { status: 400 });
    }
    const rawOpId = (body as any).opId;
    const opId = rawOpId === undefined ? "" : normalizeOperationId(rawOpId);
    if (rawOpId !== undefined && !opId) {
      return jsonResponse({ error: "Invalid opId" }, { status: 400 });
    }
    const boundOpId = opId
      ? await bindOperationId("project-put", opId, {
          mode,
          updatedAt: clientUpdatedAt,
          projectRevision: clientProjectRevision,
          payload: delta || projectData,
        })
      : "";

    const existingMeta = await context.env.DB.prepare(
      "SELECT data, updated_at, last_op_id FROM user_project_meta WHERE user_id = ?1 AND project_id = ?2"
    )
      .bind(userId, projectId)
      .first();

    if (existingMeta && boundOpId && existingMeta.last_op_id === boundOpId) {
      return jsonResponse(
        {
          ok: true,
          updatedAt: existingMeta.updated_at,
          projectRevision: clientProjectRevision,
        },
        { headers: { etag: String(existingMeta.updated_at) } }
      );
    }

    if (existingMeta) {
      if (typeof clientUpdatedAt !== "number") {
        if (userId) await logAudit(context.env, userId, "project.put", "conflict", { reason: "missing_version", updatedAt: existingMeta.updated_at, mode, ...auditDevice });
        const remoteData = await loadProjectData(context.env, userId, projectId);
        return jsonResponse(
          {
            error: "Conflict",
            projectData: remoteData?.projectData,
            updatedAt: existingMeta.updated_at,
            projectRevision: readProjectRevision(remoteData?.projectData),
          },
          { status: 409 }
        );
      }
      if (clientUpdatedAt !== existingMeta.updated_at) {
        if (userId) await logAudit(context.env, userId, "project.put", "conflict", { reason: "version_mismatch", updatedAt: existingMeta.updated_at, mode, ...auditDevice });
        const remoteData = await loadProjectData(context.env, userId, projectId);
        return jsonResponse(
          {
            error: "Conflict",
            projectData: remoteData?.projectData,
            updatedAt: existingMeta.updated_at,
            projectRevision: readProjectRevision(remoteData?.projectData),
          },
          { status: 409 }
        );
      }
    }

    const snapshotData = existingMeta ? await loadProjectData(context.env, userId, projectId) : null;

    let meta = existingMeta
      ? safeJsonParse<ProjectMeta>(existingMeta.data as string, DEFAULT_META)
      : DEFAULT_META;
    let hasChanges = false;
    const storageTimestamp = Date.now();
    let flowProjectsToStore: Array<Record<string, unknown>> | null = null;

    if (delta?.meta && Object.keys(delta.meta).length > 0) {
      const incomingMeta = delta.meta as any;
      const incomingFlowProjects = normalizeFlowProjectsForStorage({
        flowProjects: incomingMeta.flowProjects,
        legacyFlow: incomingMeta.flow,
        activeFlowProjectId: incomingMeta.activeFlowProjectId || meta.activeFlowProjectId,
        fileName: incomingMeta.fileName || meta.fileName,
        roles: incomingMeta.roles || meta.roles,
        designAssets: incomingMeta.designAssets || meta.designAssets,
        timestamp: storageTimestamp,
        limit: MAX_FLOW_PROJECTS,
      });
      if (incomingFlowProjects.length > 0 || Object.prototype.hasOwnProperty.call(incomingMeta, "flowProjects")) {
        flowProjectsToStore = incomingFlowProjects;
      }
      meta = {
        ...meta,
        ...delta.meta,
        activeFlowProjectId: incomingMeta.activeFlowProjectId || meta.activeFlowProjectId ||
          (typeof incomingFlowProjects[0]?.id === "string" ? incomingFlowProjects[0].id : undefined),
      };
      meta = compactMeta(meta);
      hasChanges = true;
    }

    if (!delta) {
      const builtMeta = buildMetaFromProject(projectData);
      flowProjectsToStore = normalizeFlowProjectsForStorage({
        flowProjects: builtMeta.flowProjects,
        legacyFlow: builtMeta.flow,
        activeFlowProjectId: builtMeta.activeFlowProjectId,
        fileName: builtMeta.fileName,
        roles: builtMeta.roles,
        designAssets: builtMeta.designAssets,
        timestamp: storageTimestamp,
        limit: MAX_FLOW_PROJECTS,
      });
      meta = compactMeta({
        ...builtMeta,
        activeFlowProjectId: builtMeta.activeFlowProjectId ||
          (typeof flowProjectsToStore[0]?.id === "string" ? flowProjectsToStore[0].id : undefined),
      });
      hasChanges = true;
    }

    if (
      typeof meta.activeFlowProjectId === "string" &&
      meta.activeFlowProjectId.trim() &&
      flowProjectsToStore &&
      flowProjectsToStore.length > 0 &&
      !flowProjectsToStore.some((project) => project.id === meta.activeFlowProjectId)
    ) {
      const error = "activeFlowProjectId does not exist in stored flowProjects";
      if (userId) await logAudit(context.env, userId, "project.put", "invalid", { error, mode, ...auditDevice });
      return jsonResponse({ error }, { status: 400 });
    }

    if (delta) {
      if (
        (delta.episodes?.length || 0) > 0 ||
        (delta.scenes?.length || 0) > 0 ||
        (delta.deleted?.episodes?.length || 0) > 0 ||
        (delta.deleted?.scenes?.length || 0) > 0
      ) {
        hasChanges = true;
      }
      if (delta.roles && delta.roles.length > 0) {
        const rolesById = new Map(
          (Array.isArray(meta.roles) ? meta.roles : [])
            .filter((role) => typeof role.id === "string")
            .map((role) => [role.id as string, role])
        );
        delta.roles.forEach((role) => {
          if (typeof role.id === "string") rolesById.set(role.id, role);
        });
        meta = { ...meta, roles: Array.from(rolesById.values()) };
        hasChanges = true;
      }
      if (delta.deleted?.roles && delta.deleted.roles.length > 0) {
        const deletedRoleIds = new Set(delta.deleted.roles);
        meta = {
          ...meta,
          roles: (Array.isArray(meta.roles) ? meta.roles : []).filter(
            (role) => typeof role.id !== "string" || !deletedRoleIds.has(role.id)
          ),
        };
        hasChanges = true;
      }
    }

    if (!hasChanges && delta) {
      const unchangedVersion = existingMeta ? Number(existingMeta.updated_at) || 0 : 0;
      return jsonResponse(
        {
          ok: true,
          updatedAt: unchangedVersion,
          projectRevision: clientProjectRevision,
        },
        { headers: { etag: String(unchangedVersion) } }
      );
    }

    const updatedAt = Math.max(storageTimestamp, Number(existingMeta?.updated_at || 0) + 1);

    let metaSerialized = "";
    try {
      metaSerialized = serializeWithSizeGuard(meta, "Project meta").serialized;
      if (flowProjectsToStore) {
        for (const flowProject of flowProjectsToStore) {
          const split = splitFlowProject(flowProject);
          serializeWithSizeGuard(split.project, `Flow project ${String(flowProject.id || "")}`);
          for (const node of split.nodes) {
            serializeWithSizeGuard(node.node, `Flow node ${String(flowProject.id || "")}/${node.nodeId}`);
          }
        }
      }
    } catch (err) {
      if (err instanceof Response) {
        if (userId) {
          const payload = await err.clone().json().catch(() => ({}));
          await logAudit(context.env, userId, "project.put", "invalid", {
            error: payload?.error || "Project payload too large",
            mode,
            ...auditDevice
          });
        }
        return err;
      }
      throw err;
    }

    const guardId = createProjectWriteGuardId(userId, boundOpId || undefined);
    const leaseGuardId = `${guardId}:lease`;
    const statements = [
      buildProjectEditLeaseGuardStatement(context.env.DB, editLease, leaseGuardId),
      buildProjectWriteGuardStatement(
        context.env.DB,
        userId,
        projectId,
        guardId,
        Boolean(existingMeta),
        clientUpdatedAt
      ),
      ...(snapshotData ? buildSnapshotStatements(context.env, userId, projectId, snapshotData.updatedAt, snapshotData.projectData) : []),
    ];

    if (delta) {
      const episodes = delta.episodes || [];
      const scenes = delta.scenes || [];
      const flowRows = toFlowStorageRows(flowProjectsToStore || []);
      if (flowProjectsToStore) {
        statements.push(context.env.DB.prepare("DELETE FROM user_project_flow_projects WHERE user_id = ?1 AND project_id = ?2").bind(userId, projectId));
        statements.push(context.env.DB.prepare("DELETE FROM user_project_flow_nodes WHERE user_id = ?1 AND project_id = ?2").bind(userId, projectId));
      }

      statements.push(...buildBulkProjectInsertStatements(
        context.env.DB,
        userId,
        projectId,
        updatedAt,
        {
          episodes: episodes.map((episode) => ({
            id: Number(episode.id),
            data: {
              id: episode.id,
              title: episode.title,
              content: episode.content,
              status: episode.status,
              errorMsg: episode.errorMsg,
            },
          })),
          scenes: scenes.map((scene) => {
            const { episodeId, ...data } = scene as Record<string, unknown>;
            return {
              episodeId: Number(episodeId),
              sceneId: String((scene as Record<string, unknown>).id),
              data,
            };
          }),
          flowProjects: flowRows.projects,
          flowNodes: flowRows.nodes,
        },
        { upsertEpisodesAndScenes: true }
      ));

      const deleted = delta.deleted || {};
      if (deleted.episodes && deleted.episodes.length > 0) {
        const ids = JSON.stringify(deleted.episodes);
        statements.push(context.env.DB.prepare(
          "DELETE FROM user_project_episodes WHERE user_id = ?1 AND project_id = ?2 AND episode_id IN (SELECT value FROM json_each(?3))"
        ).bind(userId, projectId, ids));
        statements.push(context.env.DB.prepare(
          "DELETE FROM user_project_scenes WHERE user_id = ?1 AND project_id = ?2 AND episode_id IN (SELECT value FROM json_each(?3))"
        ).bind(userId, projectId, ids));
      }
      if (deleted.scenes && deleted.scenes.length > 0) {
        statements.push(context.env.DB.prepare(
          `DELETE FROM user_project_scenes
           WHERE user_id = ?1
             AND project_id = ?2
             AND EXISTS (
               SELECT 1 FROM json_each(?3)
               WHERE CAST(json_extract(value, '$.episodeId') AS INTEGER) = user_project_scenes.episode_id
                 AND json_extract(value, '$.sceneId') = user_project_scenes.scene_id
             )`
        ).bind(userId, projectId, JSON.stringify(deleted.scenes)));
      }
    } else {
      const parts = collectProjectParts(projectData);

      statements.push(context.env.DB.prepare("DELETE FROM user_project_episodes WHERE user_id = ?1 AND project_id = ?2").bind(userId, projectId));
      statements.push(context.env.DB.prepare("DELETE FROM user_project_scenes WHERE user_id = ?1 AND project_id = ?2").bind(userId, projectId));
      statements.push(context.env.DB.prepare("DELETE FROM user_project_flow_projects WHERE user_id = ?1 AND project_id = ?2").bind(userId, projectId));
      statements.push(context.env.DB.prepare("DELETE FROM user_project_flow_nodes WHERE user_id = ?1 AND project_id = ?2").bind(userId, projectId));

      const flowRows = toFlowStorageRows(flowProjectsToStore || []);
      statements.push(...buildBulkProjectInsertStatements(
        context.env.DB,
        userId,
        projectId,
        updatedAt,
        {
          episodes: parts.episodes.map((episode: any) => ({ id: episode.id, data: episode })),
          scenes: parts.scenes.map((scene) => ({
            episodeId: scene.episodeId,
            sceneId: scene.scene.id,
            data: scene.scene,
          })),
          flowProjects: flowRows.projects,
          flowNodes: flowRows.nodes,
        }
      ));

    }

    if (hasChanges) {
      statements.push(context.env.DB.prepare(
        "INSERT INTO user_project_meta (user_id, project_id, data, updated_at, last_op_id) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(user_id, project_id) DO UPDATE SET data=?3, updated_at=?4, last_op_id=?5"
      )
        .bind(userId, projectId, metaSerialized, updatedAt, boundOpId || null)
      );
    }

    statements.push(buildProjectWriteGuardCleanupStatement(context.env.DB, guardId));
    statements.push(buildProjectWriteGuardCleanupStatement(context.env.DB, leaseGuardId));

    try {
      await context.env.DB.batch(statements);
    } catch (batchError) {
      if (isProjectWriteGuardError(batchError)) {
        try {
          await requireProjectEditLease(context.env, context.request, userId);
        } catch (leaseError) {
          if (leaseError instanceof Response) return leaseError;
          throw leaseError;
        }
        const latestMeta = await context.env.DB.prepare(
          "SELECT updated_at, last_op_id FROM user_project_meta WHERE user_id = ?1 AND project_id = ?2"
        ).bind(userId, projectId).first();
        const latestUpdatedAt = latestMeta ? Number(latestMeta.updated_at) || 0 : 0;
        if (boundOpId && latestMeta?.last_op_id === boundOpId) {
          return jsonResponse(
            {
              ok: true,
              updatedAt: latestUpdatedAt,
              projectRevision: clientProjectRevision,
            },
            { headers: { etag: String(latestUpdatedAt) } }
          );
        }
        if (userId) await logAudit(context.env, userId, "project.put", "conflict", { reason: "cas_guard_failed", updatedAt: existingMeta?.updated_at, mode, ...auditDevice });
        const remoteData = await loadProjectData(context.env, userId, projectId);
        return jsonResponse(
          {
            error: "Conflict",
            projectData: remoteData?.projectData,
            updatedAt: remoteData?.updatedAt ?? existingMeta?.updated_at,
            projectRevision: readProjectRevision(remoteData?.projectData),
          },
          { status: 409 }
        );
      }
      throw batchError;
    }

    if (userId) {
      await logAudit(context.env, userId, "project.put", "ok", {
        updatedAt,
        opId,
        mode,
        ...auditDevice
      });
    }
    return jsonResponse(
      { ok: true, updatedAt, projectRevision: clientProjectRevision },
      { headers: { etag: String(updatedAt) } }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("PUT /api/project error", err);
    const detail = err?.message || (typeof err === "string" ? err : "Unknown error");
    if (userId) {
      const deviceId = getDeviceId(context.request);
      await logAudit(context.env, userId, "project.put", "error", { error: "Failed to save project", detail, deviceId });
    }
    return jsonResponse({ error: "Failed to save project" }, { status: 500 });
  }
};
