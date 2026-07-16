import { validateProjectPayload } from "./validation";
import { logAudit } from "./audit";
import { getUserId, jsonResponse, JSON_HEADERS } from "./_auth";
import { readJsonRequest } from "./_request";
import { buildProjectEditLeaseGuardStatement, requireProjectEditLease } from "./_projectEditLease";
import {
  buildProjectWriteGuardCleanupStatement,
  buildProjectWriteGuardStatement,
  createProjectWriteGuardId,
  isProjectWriteGuardError,
} from "./_projectWriteGuard";
import { bindOperationId, normalizeOperationId } from "./_idempotency";
import { normalizeFlowProjectsForStorage } from "./_projectFlowMigration";
import { buildBulkProjectInsertStatements } from "./_projectBulkStatements";

type Env = {
  DB: any;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
};

const MAX_PROJECT_BYTES = 1_800_000;
const MAX_FLOW_PROJECTS = 3;
const SNAPSHOT_LIMIT = 10;
const MAX_RESTORE_REQUEST_BYTES = 16 * 1024;

const getDeviceId = (request: Request, body?: any) => {
  const headerId = request.headers.get("x-device-id") || request.headers.get("X-Device-Id");
  const bodyId = body && typeof body.deviceId === "string" ? body.deviceId : undefined;
  return headerId || bodyId || undefined;
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
  phase5Usage: Record<string, unknown>;
  stats: Record<string, unknown>;
};

const emptyTokenUsage = { promptTokens: 0, responseTokens: 0, totalTokens: 0 };
const emptyStats = {
  context: { total: 0, success: 0, error: 0 },
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
  phase5Usage: emptyTokenUsage,
  stats: emptyStats
};

const toFlowProjects = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((project): project is Record<string, unknown> => !!project && typeof project === "object")
        .slice(0, MAX_FLOW_PROJECTS)
    : [];

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
  return serialized;
};

const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
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
  phase5Usage: projectData?.phase5Usage || emptyTokenUsage,
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

const loadCurrentProjectSnapshot = async (env: Env, userId: string, projectId: string) => {
  const metaRow = await env.DB.prepare(
    "SELECT data, updated_at FROM user_project_meta WHERE user_id = ?1 AND project_id = ?2"
  )
    .bind(userId, projectId)
    .first();
  if (!metaRow) return null;

  const meta = safeJsonParse<ProjectMeta>(metaRow.data as string, DEFAULT_META);

  const episodesResult = await env.DB.prepare(
    "SELECT episode_id, data FROM user_project_episodes WHERE user_id = ?1 AND project_id = ?2"
  )
    .bind(userId, projectId)
    .all();

  const scenesResult = await env.DB.prepare(
    "SELECT episode_id, scene_id, data FROM user_project_scenes WHERE user_id = ?1 AND project_id = ?2"
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
  (episodesResult?.results || []).forEach((row: any) => {
    const epData = safeJsonParse<Record<string, unknown>>(row.data, {});
    episodesMap.set(row.episode_id, {
      id: row.episode_id,
      title: epData.title || "",
      content: epData.content || "",
      characters: Array.isArray(epData.characters) ? epData.characters : undefined,
      status: epData.status || "pending",
      errorMsg: epData.errorMsg,
      scenes: []
    });
  });

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

  (scenesResult?.results || []).forEach((row: any) => {
    const sceneData = safeJsonParse<Record<string, unknown>>(row.data, {});
    const episode = getEpisode(row.episode_id);
    episode.scenes.push({
      id: row.scene_id,
      ...sceneData,
      title: sceneData.title || "",
      content: sceneData.content || ""
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

  const projectData = {
    fileName: meta.fileName || "",
    rawScript: meta.rawScript || "",
    episodes: Array.from(episodesMap.values()),
    roles: metaRoles,
    designAssets: Array.isArray(meta.designAssets) ? meta.designAssets : [],
    canvas: meta.canvas && typeof meta.canvas === "object" ? meta.canvas : {},
    flow: (activeFlowProject as any)?.flow || meta.flow,
    activeFlowProjectId,
    flowProjects,
    nodeDefaults: meta.nodeDefaults && typeof meta.nodeDefaults === "object" ? meta.nodeDefaults : null,
    scriptCanvas: meta.scriptCanvas && typeof meta.scriptCanvas === "object" ? meta.scriptCanvas : undefined,
    phase5Usage: meta.phase5Usage || emptyTokenUsage,
    stats: { ...emptyStats, ...(meta.stats || {}) }
  };

  return { projectData, updatedAt: metaRow.updated_at };
};

type RestoreRequest = {
  version?: unknown;
  expectedUpdatedAt?: unknown;
  opId?: unknown;
  deviceId?: unknown;
  projectId?: unknown;
};

const parseVersionTag = (value: string | null): number | undefined => {
  if (value === null) return undefined;
  const withoutWeakPrefix = value.trim().replace(/^W\//i, "");
  const normalized = withoutWeakPrefix.startsWith('"') && withoutWeakPrefix.endsWith('"')
    ? withoutWeakPrefix.slice(1, -1)
    : withoutWeakPrefix.includes('"')
      ? ""
      : withoutWeakPrefix;
  if (!/^\d+$/.test(normalized)) return undefined;
  const version = Number(normalized);
  return Number.isSafeInteger(version) && version >= 0 ? version : undefined;
};

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  let userId: string | null = null;
  try {
    userId = await getUserId(context.request, context.env);
    const editLease = await requireProjectEditLease(context.env, context.request, userId);
    const projectId = editLease.project_id;

    const body = await readJsonRequest<RestoreRequest>(context.request, MAX_RESTORE_REQUEST_BYTES);
    const deviceId = getDeviceId(context.request, body);
    const auditDevice = deviceId ? { deviceId } : {};
    const version = typeof body.version === "number" && Number.isSafeInteger(body.version)
      ? body.version
      : undefined;
    if (!version || version < 1) {
      if (userId) await logAudit(context.env, userId, "project.restore", "invalid", { error: "Missing version", ...auditDevice });
      return jsonResponse({ error: "A positive integer snapshot version is required" }, { status: 400 });
    }

    const opId = normalizeOperationId(body.opId);
    if (!opId) {
      return jsonResponse({ error: "A valid opId is required" }, { status: 400 });
    }
    const boundOpId = await bindOperationId("project-restore", opId, { projectId, version });

    const ifMatchHeader = context.request.headers.get("if-match");
    const headerVersion = parseVersionTag(ifMatchHeader);
    if (ifMatchHeader !== null && headerVersion === undefined) {
      return jsonResponse({ error: "Invalid If-Match project version" }, { status: 400 });
    }
    const bodyVersion = typeof body.expectedUpdatedAt === "number" &&
      Number.isSafeInteger(body.expectedUpdatedAt) && body.expectedUpdatedAt >= 0
      ? body.expectedUpdatedAt
      : undefined;
    const expectedUpdatedAt = headerVersion ?? bodyVersion;
    if (expectedUpdatedAt === undefined) {
      if (userId) {
        await logAudit(context.env, userId, "project.restore", "conflict", {
          reason: "missing_precondition",
          version,
          ...auditDevice,
        });
      }
      return jsonResponse(
        { error: "A current project version is required in If-Match" },
        { status: 428 }
      );
    }

    const currentMeta = await context.env.DB.prepare(
      "SELECT updated_at, last_op_id FROM user_project_meta WHERE user_id = ?1 AND project_id = ?2"
    ).bind(userId, projectId).first();
    const currentUpdatedAt = currentMeta ? Number(currentMeta.updated_at) || 0 : 0;

    if (currentMeta?.last_op_id === boundOpId) {
      return jsonResponse(
        { ok: true, updatedAt: currentUpdatedAt },
        { headers: { etag: String(currentUpdatedAt) } }
      );
    }

    if (expectedUpdatedAt !== currentUpdatedAt) {
      if (userId) {
        await logAudit(context.env, userId, "project.restore", "conflict", {
          reason: "version_mismatch",
          expectedUpdatedAt,
          updatedAt: currentUpdatedAt,
          version,
          ...auditDevice,
        });
      }
      return jsonResponse(
        { error: "Conflict", updatedAt: currentUpdatedAt },
        { status: 409, headers: { etag: String(currentUpdatedAt) } }
      );
    }

    const snapshot = await context.env.DB.prepare(
      "SELECT data FROM user_project_snapshots WHERE user_id = ?1 AND project_id = ?2 AND version = ?3"
    )
      .bind(userId, projectId, version)
      .first();

    if (!snapshot) {
      if (userId) await logAudit(context.env, userId, "project.restore", "invalid", { error: "Snapshot not found", version, ...auditDevice });
      return jsonResponse({ error: "Snapshot not found" }, { status: 404 });
    }

    const currentSnapshot = currentMeta
      ? await loadCurrentProjectSnapshot(context.env, userId, projectId)
      : null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(snapshot.data as string);
    } catch {
      return jsonResponse({ error: "Snapshot data is corrupt" }, { status: 400 });
    }
    const projectData = parsed && typeof parsed === "object" && "projectData" in parsed
      ? (parsed as { projectData: unknown }).projectData
      : parsed;
    const validation = validateProjectPayload(projectData);
    if (!validation.ok) {
      const error = (validation as any).error;
      if (userId) await logAudit(context.env, userId, "project.restore", "invalid", { error, version, ...auditDevice });
      return jsonResponse({ error: `Snapshot invalid: ${error}` }, { status: 400 });
    }
    const snapshotScope = projectData as Record<string, unknown>;
    const snapshotProjects = Array.isArray(snapshotScope.flowProjects)
      ? snapshotScope.flowProjects.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      : [];
    if (
      snapshotScope.activeFlowProjectId !== projectId ||
      snapshotProjects.some((item) => item.id !== projectId)
    ) {
      return jsonResponse(
        { error: "Snapshot does not belong to requested projectId", code: "PROJECT_SCOPE_MISMATCH" },
        { status: 400 },
      );
    }

    const builtMeta = buildMetaFromProject(projectData);
    const flowProjectsToStore = normalizeFlowProjectsForStorage({
      flowProjects: builtMeta.flowProjects,
      legacyFlow: builtMeta.flow,
      activeFlowProjectId: builtMeta.activeFlowProjectId,
      fileName: builtMeta.fileName,
      roles: builtMeta.roles,
      designAssets: builtMeta.designAssets,
      timestamp: version,
      limit: MAX_FLOW_PROJECTS,
    });
    const meta = compactMeta({
      ...builtMeta,
      activeFlowProjectId: builtMeta.activeFlowProjectId ||
        (typeof flowProjectsToStore[0]?.id === "string" ? flowProjectsToStore[0].id : undefined),
    });
    const parts = collectProjectParts(projectData);
    const updatedAt = Math.max(Date.now(), currentUpdatedAt + 1);
    const metaSerialized = serializeWithSizeGuard(meta, "Project meta");
    flowProjectsToStore.forEach((flowProject) => {
      const split = splitFlowProject(flowProject);
      serializeWithSizeGuard(split.project, `Flow project ${String(flowProject.id || "")}`);
      split.nodes.forEach((node) => {
        serializeWithSizeGuard(node.node, `Flow node ${String(flowProject.id || "")}/${node.nodeId}`);
      });
    });

    const guardId = createProjectWriteGuardId(userId, boundOpId);
    const leaseGuardId = `${guardId}:lease`;
    const statements = [
      buildProjectEditLeaseGuardStatement(context.env.DB, editLease, leaseGuardId),
      buildProjectWriteGuardStatement(
        context.env.DB,
        userId,
        projectId,
        guardId,
        Boolean(currentMeta),
        expectedUpdatedAt
      ),
    ];

    if (currentSnapshot) {
      const snapshotPayload = JSON.stringify({ projectData: currentSnapshot.projectData });
      const snapshotBytes = new TextEncoder().encode(snapshotPayload).length;
      if (snapshotBytes <= MAX_PROJECT_BYTES) {
        statements.push(context.env.DB.prepare(
          "INSERT OR IGNORE INTO user_project_snapshots (user_id, project_id, version, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)"
        ).bind(userId, projectId, currentSnapshot.updatedAt, snapshotPayload, Date.now()));
        statements.push(context.env.DB.prepare(
          "DELETE FROM user_project_snapshots WHERE user_id = ?1 AND project_id = ?2 AND version NOT IN (SELECT version FROM user_project_snapshots WHERE user_id = ?1 AND project_id = ?2 ORDER BY version DESC LIMIT ?3)"
        ).bind(userId, projectId, SNAPSHOT_LIMIT));
      } else {
        console.warn("Skipping pre-restore snapshot larger than D1 row limit guard", {
          userId,
          version: currentSnapshot.updatedAt,
          bytes: snapshotBytes,
        });
      }
    }

    statements.push(context.env.DB.prepare("DELETE FROM user_project_episodes WHERE user_id = ?1 AND project_id = ?2").bind(userId, projectId));
    statements.push(context.env.DB.prepare("DELETE FROM user_project_scenes WHERE user_id = ?1 AND project_id = ?2").bind(userId, projectId));
    statements.push(context.env.DB.prepare("DELETE FROM user_project_flow_projects WHERE user_id = ?1 AND project_id = ?2").bind(userId, projectId));
    statements.push(context.env.DB.prepare("DELETE FROM user_project_flow_nodes WHERE user_id = ?1 AND project_id = ?2").bind(userId, projectId));
    statements.push(context.env.DB.prepare("DELETE FROM user_project_characters WHERE user_id = ?1 AND project_id = ?2").bind(userId, projectId));
    statements.push(context.env.DB.prepare("DELETE FROM user_project_locations WHERE user_id = ?1 AND project_id = ?2").bind(userId, projectId));

    const flowProjectRows: Array<{ projectId: string; data: unknown }> = [];
    const flowNodeRows: Array<{
      projectId: string;
      nodeId: string;
      nodeIndex: number;
      data: unknown;
    }> = [];
    for (const flowProject of flowProjectsToStore) {
      const projectId = typeof flowProject.id === "string" ? flowProject.id : "";
      if (!projectId) continue;
      const split = splitFlowProject(flowProject);
      flowProjectRows.push({ projectId, data: split.project });
      for (const flowNode of split.nodes) {
        flowNodeRows.push({
          projectId,
          nodeId: flowNode.nodeId,
          nodeIndex: flowNode.nodeIndex,
          data: flowNode.node,
        });
      }
    }

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
        flowProjects: flowProjectRows,
        flowNodes: flowNodeRows,
      }
    ));

    statements.push(context.env.DB.prepare(
      "INSERT INTO user_project_meta (user_id, project_id, data, updated_at, last_op_id) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(user_id, project_id) DO UPDATE SET data=?3, updated_at=?4, last_op_id=?5"
    ).bind(userId, projectId, metaSerialized, updatedAt, boundOpId));
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
        if (latestMeta?.last_op_id === boundOpId) {
          return jsonResponse(
            { ok: true, updatedAt: latestUpdatedAt },
            { headers: { etag: String(latestUpdatedAt) } }
          );
        }
        if (userId) {
          await logAudit(context.env, userId, "project.restore", "conflict", {
            reason: "cas_guard_failed",
            expectedUpdatedAt,
            updatedAt: latestUpdatedAt,
            version,
            ...auditDevice,
          });
        }
        return jsonResponse(
          { error: "Conflict", updatedAt: latestUpdatedAt },
          { status: 409, headers: { etag: String(latestUpdatedAt) } }
        );
      }
      throw batchError;
    }

    if (userId) {
      await logAudit(context.env, userId, "project.restore", "ok", {
        updatedAt,
        previousUpdatedAt: currentUpdatedAt,
        opId,
        version,
        ...auditDevice,
      });
    }
    return jsonResponse(
      { ok: true, updatedAt },
      { headers: { etag: String(updatedAt) } }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("POST /api/project-restore error", err);
    if (userId) {
      const deviceId = getDeviceId(context.request);
      await logAudit(context.env, userId, "project.restore", "error", { error: "Failed to restore snapshot", deviceId });
    }
    return jsonResponse({ error: "Failed to restore snapshot" }, { status: 500 });
  }
};
