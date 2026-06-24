import { verifyToken } from "@clerk/backend";
import { validateProjectPayload } from "./validation";
import { logAudit } from "./audit";
import { getSyncRolloutInfo, RolloutEnv } from "./rollout";

type Env = {
  DB: any;
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
} & RolloutEnv;

const JSON_HEADERS = { "content-type": "application/json" };
const MAX_PROJECT_BYTES = 1_800_000;
const MAX_FLOW_PROJECTS = 3;
const jsonResponse = (body: unknown, init: ResponseInit = {}) => {
  const headers = { ...JSON_HEADERS, ...(init.headers || {}) };
  return new Response(JSON.stringify(body), { ...init, headers });
};

const stripOuterQuotes = (value: string) => {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
};

const normalizeJwtKey = (value: string) => {
  const unescaped = value.replace(/\\r\\n|\\n|\\r/g, "\n");
  const trimmed = stripOuterQuotes(unescaped.trim());
  if (!trimmed) return "";
  const header = "-----BEGIN PUBLIC KEY-----";
  const trailer = "-----END PUBLIC KEY-----";
  const body = trimmed
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!body) return "";
  return `${header}\n${body}\n${trailer}`;
};

const extractBearerToken = (authHeader: string) => {
  const match = authHeader.match(/Bearer\s+([^,]+)/i);
  const raw = match ? match[1] : authHeader;
  const trimmed = stripOuterQuotes(raw.trim());
  const whitespaceStripped = trimmed.replace(/\s+/g, "");
  return whitespaceStripped.replace(/[^A-Za-z0-9._-]/g, "");
};

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

async function ensureTables(env: Env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_project_meta (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL, last_op_id TEXT)"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_project_episodes (user_id TEXT NOT NULL, episode_id INTEGER NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, episode_id))"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_project_scenes (user_id TEXT NOT NULL, episode_id INTEGER NOT NULL, scene_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, episode_id, scene_id))"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_project_flow_projects (user_id TEXT NOT NULL, project_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, project_id))"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_project_flow_nodes (user_id TEXT NOT NULL, project_id TEXT NOT NULL, node_id TEXT NOT NULL, node_index INTEGER NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, project_id, node_id))"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_project_characters (user_id TEXT NOT NULL, char_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, char_id))"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_project_locations (user_id TEXT NOT NULL, loc_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, loc_id))"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_project_snapshots (user_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, version))"
  ).run();
}

const ensureColumn = async (env: Env, table: string, column: string, type: string) => {
  const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  const columns = new Set((info?.results || []).map((row: any) => row.name));
  if (!columns.has(column)) {
    await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
  }
};

const ensureSchema = async (env: Env) => {
  await ensureTables(env);
  await ensureColumn(env, "user_project_meta", "data", "TEXT");
  await ensureColumn(env, "user_project_meta", "updated_at", "INTEGER");
  await ensureColumn(env, "user_project_meta", "last_op_id", "TEXT");
  await ensureColumn(env, "user_project_episodes", "updated_at", "INTEGER");
  await ensureColumn(env, "user_project_scenes", "updated_at", "INTEGER");
  await ensureColumn(env, "user_project_flow_projects", "updated_at", "INTEGER");
  await ensureColumn(env, "user_project_flow_nodes", "node_index", "INTEGER");
  await ensureColumn(env, "user_project_flow_nodes", "updated_at", "INTEGER");
  await ensureColumn(env, "user_project_characters", "updated_at", "INTEGER");
  await ensureColumn(env, "user_project_locations", "updated_at", "INTEGER");
  await ensureColumn(env, "user_project_snapshots", "data", "TEXT");
  await ensureColumn(env, "user_project_snapshots", "version", "INTEGER");
  await ensureColumn(env, "user_project_snapshots", "created_at", "INTEGER");
};

async function getUserId(request: Request, env: Env) {
  const authHeader = request.headers.get("authorization") || "";
  const token = extractBearerToken(authHeader);

  const rawSecret = typeof env.CLERK_SECRET_KEY === "string" ? env.CLERK_SECRET_KEY : "";
  const rawJwtKey = typeof env.CLERK_JWT_KEY === "string" ? env.CLERK_JWT_KEY : "";
  const asciiCleaned = rawSecret.replace(/[^\x20-\x7E]/g, "");
  let secretKey = stripOuterQuotes(asciiCleaned.replace(/\s+/g, ""));
  const jwtKey = normalizeJwtKey(rawJwtKey);
  if (!secretKey && !jwtKey) {
    throw new Response("Missing CLERK_SECRET_KEY on server", { status: 500 });
  }

  if (!token) {
    throw new Response(JSON.stringify({ error: "Unauthorized", detail: "Missing bearer token" }), { status: 401, headers: JSON_HEADERS });
  }

  try {
    const payload = await verifyToken(token, jwtKey ? { jwtKey } : { secretKey });
    if (payload?.sub) return payload.sub;
    throw new Error("Token payload missing sub");
  } catch (err: any) {
    const detail = err?.message || "Token verification failed";
    console.warn("verifyToken failed", err);
    throw new Response(JSON.stringify({ error: "Unauthorized", detail }), { status: 401, headers: JSON_HEADERS });
  }
}

const loadCurrentProjectSnapshot = async (env: Env, userId: string) => {
  const metaRow = await env.DB.prepare(
    "SELECT data, updated_at FROM user_project_meta WHERE user_id = ?1"
  )
    .bind(userId)
    .first();
  if (!metaRow) return null;

  const meta = safeJsonParse<ProjectMeta>(metaRow.data as string, DEFAULT_META);

  const episodesResult = await env.DB.prepare(
    "SELECT episode_id, data FROM user_project_episodes WHERE user_id = ?1"
  )
    .bind(userId)
    .all();

  const scenesResult = await env.DB.prepare(
    "SELECT episode_id, scene_id, data FROM user_project_scenes WHERE user_id = ?1"
  )
    .bind(userId)
    .all();

  const flowProjectsResult = await env.DB.prepare(
    "SELECT project_id, data FROM user_project_flow_projects WHERE user_id = ?1 ORDER BY updated_at ASC, project_id ASC"
  )
    .bind(userId)
    .all();

  const flowNodesResult = await env.DB.prepare(
    "SELECT project_id, node_id, node_index, data FROM user_project_flow_nodes WHERE user_id = ?1 ORDER BY project_id ASC, node_index ASC"
  )
    .bind(userId)
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
  const activeFlowProjectId =
    typeof meta.activeFlowProjectId === "string"
      ? meta.activeFlowProjectId
      : typeof flowProjects[0]?.id === "string"
        ? flowProjects[0].id as string
        : undefined;
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

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  let userId: string | null = null;
  try {
    userId = await getUserId(context.request, context.env);
    const rollout = getSyncRolloutInfo(userId, context.env);
    if (!rollout.enabled) {
      const deviceId = getDeviceId(context.request);
      if (userId) {
        await logAudit(context.env, userId, "project.restore", "disabled", { rolloutPercent: rollout.percent, ...(deviceId ? { deviceId } : {}) });
      }
      return jsonResponse({ error: "Sync disabled for this account", rollout: { percent: rollout.percent } }, { status: 403 });
    }
    await ensureSchema(context.env);

    const body = await context.request.json();
    const deviceId = getDeviceId(context.request, body);
    const auditDevice = deviceId ? { deviceId } : {};
    const version = typeof body?.version === "number" ? body.version : undefined;
    if (!version) {
      if (userId) await logAudit(context.env, userId, "project.restore", "invalid", { error: "Missing version", ...auditDevice });
      return jsonResponse({ error: "Missing version" }, { status: 400 });
    }

    const snapshot = await context.env.DB.prepare(
      "SELECT data FROM user_project_snapshots WHERE user_id = ?1 AND version = ?2"
    )
      .bind(userId, version)
      .first();

    if (!snapshot) {
      if (userId) await logAudit(context.env, userId, "project.restore", "invalid", { error: "Snapshot not found", version, ...auditDevice });
      return jsonResponse({ error: "Snapshot not found" }, { status: 404 });
    }

    const currentSnapshot = await loadCurrentProjectSnapshot(context.env, userId);
    if (currentSnapshot) {
      const snapshotPayload = JSON.stringify({ projectData: currentSnapshot.projectData });
      const snapshotBytes = new TextEncoder().encode(snapshotPayload).length;
      if (snapshotBytes <= MAX_PROJECT_BYTES) {
        await context.env.DB.prepare(
          "INSERT OR IGNORE INTO user_project_snapshots (user_id, version, data, created_at) VALUES (?1, ?2, ?3, ?4)"
        )
          .bind(userId, currentSnapshot.updatedAt, snapshotPayload, Date.now())
          .run();
      } else {
        console.warn("Skipping pre-restore snapshot larger than D1 row limit guard", {
          userId,
          version: currentSnapshot.updatedAt,
          bytes: snapshotBytes,
        });
      }
    }

    const parsed = JSON.parse(snapshot.data as string);
    const projectData = parsed?.projectData ?? parsed;
    const validation = validateProjectPayload(projectData);
    if (!validation.ok) {
      const error = (validation as any).error;
      if (userId) await logAudit(context.env, userId, "project.restore", "invalid", { error, version, ...auditDevice });
      return jsonResponse({ error: `Snapshot invalid: ${error}` }, { status: 400 });
    }

    const builtMeta = buildMetaFromProject(projectData);
    const flowProjectsToStore = toFlowProjects(builtMeta.flowProjects);
    const meta = compactMeta(builtMeta);
    const parts = collectProjectParts(projectData);
    const updatedAt = Date.now();
    const metaSerialized = serializeWithSizeGuard(meta, "Project meta");
    flowProjectsToStore.forEach((flowProject) => {
      const split = splitFlowProject(flowProject);
      serializeWithSizeGuard(split.project, `Flow project ${String(flowProject.id || "")}`);
      split.nodes.forEach((node) => {
        serializeWithSizeGuard(node.node, `Flow node ${String(flowProject.id || "")}/${node.nodeId}`);
      });
    });

    await context.env.DB.prepare("DELETE FROM user_project_episodes WHERE user_id = ?1").bind(userId).run();
    await context.env.DB.prepare("DELETE FROM user_project_scenes WHERE user_id = ?1").bind(userId).run();
    await context.env.DB.prepare("DELETE FROM user_project_flow_projects WHERE user_id = ?1").bind(userId).run();
    await context.env.DB.prepare("DELETE FROM user_project_flow_nodes WHERE user_id = ?1").bind(userId).run();

    for (const episode of parts.episodes) {
      await context.env.DB.prepare(
        "INSERT INTO user_project_episodes (user_id, episode_id, data, updated_at) VALUES (?1, ?2, ?3, ?4)"
      )
        .bind(userId, episode.id, JSON.stringify(episode), updatedAt)
        .run();
    }

    for (const scene of parts.scenes) {
      await context.env.DB.prepare(
        "INSERT INTO user_project_scenes (user_id, episode_id, scene_id, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)"
      )
        .bind(userId, scene.episodeId, scene.scene.id, JSON.stringify(scene.scene), updatedAt)
        .run();
    }

    for (const flowProject of flowProjectsToStore) {
      const projectId = typeof flowProject.id === "string" ? flowProject.id : "";
      if (!projectId) continue;
      const split = splitFlowProject(flowProject);
      await context.env.DB.prepare(
        "INSERT INTO user_project_flow_projects (user_id, project_id, data, updated_at) VALUES (?1, ?2, ?3, ?4)"
      )
        .bind(userId, projectId, JSON.stringify(split.project), updatedAt)
        .run();
      for (const flowNode of split.nodes) {
        await context.env.DB.prepare(
          "INSERT INTO user_project_flow_nodes (user_id, project_id, node_id, node_index, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
        )
          .bind(userId, projectId, flowNode.nodeId, flowNode.nodeIndex, JSON.stringify(flowNode.node), updatedAt)
          .run();
      }
    }

    await context.env.DB.prepare(
      "INSERT INTO user_project_meta (user_id, data, updated_at, last_op_id) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id) DO UPDATE SET data=?2, updated_at=?3, last_op_id=?4"
    )
      .bind(userId, metaSerialized, updatedAt, null)
      .run();

    if (userId) {
      await logAudit(context.env, userId, "project.restore", "ok", { updatedAt, version, ...auditDevice });
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
