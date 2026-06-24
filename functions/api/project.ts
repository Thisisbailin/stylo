import { verifyToken } from "@clerk/backend";
import { validateProjectDelta, validateProjectPayload } from "./validation";
import { logAudit } from "./audit";
import { getSyncRolloutInfo, RolloutEnv } from "./rollout";

type Env = {
  DB: any; // D1 binding injected by Cloudflare Pages
  CLERK_SECRET_KEY: string;
  CLERK_JWT_KEY?: string;
} & RolloutEnv;

const JSON_HEADERS = { "content-type": "application/json" };
const SNAPSHOT_LIMIT = 10;
const MAX_PROJECT_BYTES = 1_800_000;
const MAX_FLOW_PROJECTS = 3;

const jsonResponse = (body: unknown, init: ResponseInit = {}) => {
  const headers = { ...JSON_HEADERS, ...(init.headers || {}) };
  return new Response(JSON.stringify(body), { ...init, headers });
};

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

async function ensureMetaTable(env: Env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_project_meta (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL, last_op_id TEXT)"
  ).run();
}

async function ensureEpisodesTable(env: Env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_project_episodes (user_id TEXT NOT NULL, episode_id INTEGER NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, episode_id))"
  ).run();
}

async function ensureScenesTable(env: Env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_project_scenes (user_id TEXT NOT NULL, episode_id INTEGER NOT NULL, scene_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, episode_id, scene_id))"
  ).run();
}

async function ensureFlowProjectsTable(env: Env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_project_flow_projects (user_id TEXT NOT NULL, project_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, project_id))"
  ).run();
}

async function ensureFlowNodesTable(env: Env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_project_flow_nodes (user_id TEXT NOT NULL, project_id TEXT NOT NULL, node_id TEXT NOT NULL, node_index INTEGER NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, project_id, node_id))"
  ).run();
}

async function ensureSnapshotsTable(env: Env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_project_snapshots (user_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, version))"
  ).run();
}

async function ensureProjectWriteGuardsTable(env: Env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_project_write_guards (guard_id TEXT PRIMARY KEY, ok INTEGER NOT NULL)"
  ).run();
}

async function ensureTables(env: Env) {
  await ensureMetaTable(env);
  await ensureEpisodesTable(env);
  await ensureScenesTable(env);
  await ensureFlowProjectsTable(env);
  await ensureFlowNodesTable(env);
  await ensureSnapshotsTable(env);
  await ensureProjectWriteGuardsTable(env);
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
  await ensureColumn(env, "user_project_snapshots", "data", "TEXT");
  await ensureColumn(env, "user_project_snapshots", "version", "INTEGER");
  await ensureColumn(env, "user_project_snapshots", "created_at", "INTEGER");
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
  return { serialized, bytes };
};

const tryInsertSnapshot = async (env: Env, userId: string, version: number, projectData: unknown) => {
  const serialized = JSON.stringify({ projectData });
  const bytes = new TextEncoder().encode(serialized).length;
  if (bytes > MAX_PROJECT_BYTES) {
    console.warn("Skipping project snapshot larger than D1 row limit guard", { userId, version, bytes });
    return false;
  }
  await env.DB.prepare(
    "INSERT OR IGNORE INTO user_project_snapshots (user_id, version, data, created_at) VALUES (?1, ?2, ?3, ?4)"
  )
    .bind(userId, version, serialized, Date.now())
    .run();
  return true;
};

const buildSnapshotStatements = (
  env: Env,
  userId: string,
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
      "INSERT OR IGNORE INTO user_project_snapshots (user_id, version, data, created_at) VALUES (?1, ?2, ?3, ?4)"
    ).bind(userId, version, serialized, Date.now()),
    env.DB.prepare(
      "DELETE FROM user_project_snapshots WHERE user_id = ?1 AND version NOT IN (SELECT version FROM user_project_snapshots WHERE user_id = ?1 ORDER BY version DESC LIMIT ?2)"
    ).bind(userId, SNAPSHOT_LIMIT),
  ];
};

const createProjectWriteGuardId = (userId: string, opId?: string) =>
  `${userId}:${opId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;

const buildProjectWriteGuardStatement = (
  env: Env,
  userId: string,
  guardId: string,
  existing: boolean,
  expectedUpdatedAt?: number
) => {
  if (existing) {
    return env.DB.prepare(
      `INSERT INTO user_project_write_guards (guard_id, ok)
       VALUES (?1, (
         SELECT CASE
           WHEN EXISTS (
             SELECT 1 FROM user_project_meta
             WHERE user_id = ?2 AND updated_at = ?3
           )
           THEN 1 ELSE NULL
         END
       ))`
    ).bind(guardId, userId, expectedUpdatedAt);
  }
  return env.DB.prepare(
    `INSERT INTO user_project_write_guards (guard_id, ok)
     VALUES (?1, (
       SELECT CASE
         WHEN NOT EXISTS (
           SELECT 1 FROM user_project_meta
           WHERE user_id = ?2
         )
         THEN 1 ELSE NULL
       END
     ))`
  ).bind(guardId, userId);
};

const isProjectWriteGuardError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "");
  return /user_project_write_guards/i.test(message) || (/NOT NULL/i.test(message) && /\bok\b/i.test(message));
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

const loadProjectData = async (env: Env, userId: string) => {
  const metaRow = await env.DB.prepare(
    "SELECT data, updated_at FROM user_project_meta WHERE user_id = ?1"
  )
    .bind(userId)
    .first();

  if (!metaRow) return null;

  const meta = safeJsonParse<ProjectMeta>(metaRow.data as string, DEFAULT_META);

  const episodesResult = await env.DB.prepare(
    "SELECT episode_id, data FROM user_project_episodes WHERE user_id = ?1 ORDER BY episode_id ASC"
  )
    .bind(userId)
    .all();

  const scenesResult = await env.DB.prepare(
    "SELECT episode_id, scene_id, data FROM user_project_scenes WHERE user_id = ?1 ORDER BY episode_id ASC, scene_id ASC"
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
  const activeFlowProjectId =
    typeof meta.activeFlowProjectId === "string"
      ? meta.activeFlowProjectId
      : typeof flowProjects[0]?.id === "string"
        ? flowProjects[0].id as string
        : undefined;
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

const stripOuterQuotes = (value: string) => {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
};

const getInvalidCharCodes = (value: string, allowDot: boolean) => {
  const codes = new Set<number>();
  for (const ch of value) {
    const isAllowed = allowDot ? /[A-Za-z0-9._-]/.test(ch) : /[A-Za-z0-9_-]/.test(ch);
    if (!isAllowed) {
      codes.add(ch.codePointAt(0) ?? 0);
    }
  }
  return Array.from(codes).slice(0, 6);
};

const extractBearerToken = (authHeader: string) => {
  const match = authHeader.match(/Bearer\s+([^,]+)/i);
  const raw = match ? match[1] : authHeader;
  const trimmed = stripOuterQuotes(raw.trim());
  const whitespaceStripped = trimmed.replace(/\s+/g, "");
  const invalidCharCodes = getInvalidCharCodes(whitespaceStripped, true);
  const sanitized = whitespaceStripped.replace(/[^A-Za-z0-9._-]/g, "");
  const token = invalidCharCodes.length ? sanitized : whitespaceStripped;
  return {
    tokenRaw: trimmed,
    tokenWhitespaceStripped: whitespaceStripped,
    tokenSanitized: sanitized,
    tokenInvalidCharCodes: invalidCharCodes,
    tokenSanitizedUsed: token !== whitespaceStripped,
    token
  };
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

async function getUserId(request: Request, env: Env) {
  const authHeader = request.headers.get("authorization") || "";
  const { tokenRaw, tokenWhitespaceStripped, tokenSanitized, tokenInvalidCharCodes, tokenSanitizedUsed, token } =
    extractBearerToken(authHeader);

  const rawSecret = typeof env.CLERK_SECRET_KEY === "string" ? env.CLERK_SECRET_KEY : "";
  const rawJwtKey = typeof env.CLERK_JWT_KEY === "string" ? env.CLERK_JWT_KEY : "";
  const asciiCleaned = rawSecret.replace(/[^\x20-\x7E]/g, "");
  let secretKey = stripOuterQuotes(asciiCleaned.replace(/\s+/g, ""));
  const jwtKeyRaw = rawJwtKey;
  const jwtKey = normalizeJwtKey(jwtKeyRaw);
  if (!secretKey && !jwtKey) {
    throw new Response("Missing CLERK_SECRET_KEY on server", { status: 500 });
  }

  if (!token) {
    throw new Response(JSON.stringify({ error: "Unauthorized", detail: "Missing bearer token" }), { status: 401, headers: JSON_HEADERS });
  }

  const decodePart = (part?: string) => {
    if (!part) return null;
    try {
      const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
      const json = atob(padded);
      return JSON.parse(json);
    } catch {
      return null;
    }
  };
  const tokenParts = token.split(".");
  const [headerPart, payloadPart] = tokenParts;
  const tokenHeader = decodePart(headerPart);
  const tokenPayload = decodePart(payloadPart);
  const signaturePart = tokenParts.length === 3 ? tokenParts[2] : "";
  const signatureInvalidCharCodes = getInvalidCharCodes(signaturePart, false);

  const verifyAttempt = async (options: { jwtKey?: string; secretKey?: string }) => {
    try {
      const payload = await verifyToken(token, options);
      if (payload?.sub) return { sub: payload.sub };
      return { error: new Error("Token payload missing sub") };
    } catch (err) {
      return { error: err };
    }
  };

  const jwtAttempt = jwtKey ? await verifyAttempt({ jwtKey }) : null;
  if (jwtAttempt?.sub) return jwtAttempt.sub;
  const secretAttempt = secretKey ? await verifyAttempt({ secretKey }) : null;
  if (secretAttempt?.sub) return secretAttempt.sub;

  const jwtError = jwtAttempt?.error instanceof Error ? jwtAttempt.error.message : undefined;
  const secretError = secretAttempt?.error instanceof Error ? secretAttempt.error.message : undefined;
  const detail = jwtError || secretError || "Token verification failed";
  const debug = {
    secretKeyLength: secretKey.length,
    secretKeyAsciiCleanedLength: asciiCleaned.length,
    secretKeyNonAsciiRemoved: rawSecret.length - asciiCleaned.length,
    secretKeyHasWhitespace: /\s/.test(rawSecret),
    secretKeyTrimmedLength: rawSecret.trim().length,
    usingJwtKey: Boolean(jwtKey),
    jwtKeyLength: jwtKey.length || undefined,
    jwtKeyRawLength: jwtKeyRaw.length || undefined,
    jwtKeyHasWhitespace: /\s/.test(jwtKeyRaw),
    jwtKeyHasHeader: jwtKeyRaw.includes("BEGIN PUBLIC KEY"),
    jwtKeyNormalizedLength: jwtKey.length || undefined,
    jwtKeyError: jwtError,
    secretKeyError: secretError,
    tokenRawLength: tokenRaw.length,
    tokenWhitespaceStrippedLength: tokenWhitespaceStripped.length,
    tokenSanitizedLength: tokenSanitized.length,
    tokenSanitizedUsed,
    tokenHasWhitespace: /\s/.test(tokenRaw),
    tokenInvalidCharCodes,
    tokenSegments: tokenParts.length,
    tokenSignatureLength: signaturePart.length,
    tokenSignatureInvalidCharCodes: signatureInvalidCharCodes,
    tokenKid: tokenHeader?.kid,
    tokenAlg: tokenHeader?.alg,
    tokenTyp: tokenHeader?.typ,
    tokenIssuer: tokenPayload?.iss,
    tokenAzp: tokenPayload?.azp,
    tokenIat: tokenPayload?.iat,
    tokenExp: tokenPayload?.exp,
    tokenSub: tokenPayload?.sub
  };
  console.warn("verifyToken failed", { jwtError, secretError });
  console.warn("verifyToken debug", debug);
  throw new Response(JSON.stringify({ error: "Unauthorized", detail, debug }), { status: 401, headers: JSON_HEADERS });
}

export const onRequestGet = async (context: {
  request: Request;
  env: Env;
}) => {
  let userId: string | null = null;
  try {
    userId = await getUserId(context.request, context.env);
    const rollout = getSyncRolloutInfo(userId, context.env);
    if (!rollout.enabled) {
      const deviceId = getDeviceId(context.request);
      if (userId) {
        await logAudit(context.env, userId, "project.get", "disabled", { rolloutPercent: rollout.percent, ...(deviceId ? { deviceId } : {}) });
      }
      return jsonResponse({ error: "Sync disabled for this account", rollout: { percent: rollout.percent } }, { status: 403 });
    }
    await ensureSchema(context.env);

    const data = await loadProjectData(context.env, userId);
    if (!data) {
      return new Response("Not Found", { status: 404 });
    }

    return jsonResponse(
      { projectData: data.projectData, updatedAt: data.updatedAt },
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
    return jsonResponse({ error: "Failed to load project", detail }, { status: 500 });
  }
};

export const onRequestPut = async (context: {
  request: Request;
  env: Env;
}) => {
  let userId: string | null = null;
  try {
    userId = await getUserId(context.request, context.env);
    const rollout = getSyncRolloutInfo(userId, context.env);
    if (!rollout.enabled) {
      const deviceId = getDeviceId(context.request);
      if (userId) {
        await logAudit(context.env, userId, "project.put", "disabled", { rolloutPercent: rollout.percent, ...(deviceId ? { deviceId } : {}) });
      }
      return jsonResponse({ error: "Sync disabled for this account", rollout: { percent: rollout.percent } }, { status: 403 });
    }
    await ensureSchema(context.env);

    const body = await context.request.json();
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

    const clientUpdatedAt = typeof (body as any).updatedAt === "number" ? (body as any).updatedAt : undefined;
    const opId = typeof (body as any).opId === "string" ? (body as any).opId : undefined;

    const existingMeta = await context.env.DB.prepare(
      "SELECT data, updated_at, last_op_id FROM user_project_meta WHERE user_id = ?1"
    )
      .bind(userId)
      .first();

    if (existingMeta && opId && existingMeta.last_op_id === opId) {
      return jsonResponse(
        { ok: true, updatedAt: existingMeta.updated_at },
        { headers: { etag: String(existingMeta.updated_at) } }
      );
    }

    if (existingMeta) {
      if (typeof clientUpdatedAt !== "number") {
        if (userId) await logAudit(context.env, userId, "project.put", "conflict", { reason: "missing_version", updatedAt: existingMeta.updated_at, mode, ...auditDevice });
        const remoteData = await loadProjectData(context.env, userId);
        return jsonResponse(
          { error: "Conflict", projectData: remoteData?.projectData, updatedAt: existingMeta.updated_at },
          { status: 409 }
        );
      }
      if (clientUpdatedAt !== existingMeta.updated_at) {
        if (userId) await logAudit(context.env, userId, "project.put", "conflict", { reason: "version_mismatch", updatedAt: existingMeta.updated_at, mode, ...auditDevice });
        const remoteData = await loadProjectData(context.env, userId);
        return jsonResponse(
          { error: "Conflict", projectData: remoteData?.projectData, updatedAt: existingMeta.updated_at },
          { status: 409 }
        );
      }
    }

    const snapshotData = existingMeta ? await loadProjectData(context.env, userId) : null;

    let meta = existingMeta
      ? safeJsonParse<ProjectMeta>(existingMeta.data as string, DEFAULT_META)
      : DEFAULT_META;
    let hasChanges = false;
    const updatedAt = Date.now();
    let flowProjectsToStore: Array<Record<string, unknown>> | null = null;

    if (delta?.meta) {
      const incomingMeta = delta.meta as any;
      const incomingFlowProjects = toFlowProjects(incomingMeta.flowProjects);
      if (incomingFlowProjects.length > 0 || Object.prototype.hasOwnProperty.call(incomingMeta, "flowProjects")) {
        flowProjectsToStore = incomingFlowProjects;
      }
      meta = {
        ...meta,
        ...delta.meta,
      };
      meta = compactMeta(meta);
      hasChanges = true;
    }

    if (!delta) {
      const builtMeta = buildMetaFromProject(projectData);
      flowProjectsToStore = toFlowProjects(builtMeta.flowProjects);
      meta = compactMeta(builtMeta);
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

    const guardId = createProjectWriteGuardId(userId, opId);
    const statements = [
      buildProjectWriteGuardStatement(
        context.env,
        userId,
        guardId,
        Boolean(existingMeta),
        clientUpdatedAt
      ),
      ...(snapshotData ? buildSnapshotStatements(context.env, userId, snapshotData.updatedAt, snapshotData.projectData) : []),
    ];

    if (delta) {
      const episodes = delta.episodes || [];
      const scenes = delta.scenes || [];
      const roles = delta.roles || [];

      for (const episode of episodes) {
        const episodeData = {
          id: episode.id,
          title: episode.title,
          content: episode.content,
          status: episode.status,
          errorMsg: episode.errorMsg,
        };
        statements.push(context.env.DB.prepare(
          "INSERT INTO user_project_episodes (user_id, episode_id, data, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id, episode_id) DO UPDATE SET data=?3, updated_at=?4"
        )
          .bind(userId, episode.id, JSON.stringify(episodeData), updatedAt)
        );
        hasChanges = true;
      }

      for (const scene of scenes) {
        const { episodeId: _episodeId, ...sceneData } = scene as Record<string, unknown>;
        statements.push(context.env.DB.prepare(
          "INSERT INTO user_project_scenes (user_id, episode_id, scene_id, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(user_id, episode_id, scene_id) DO UPDATE SET data=?4, updated_at=?5"
        )
          .bind(userId, (scene as any).episodeId, (scene as any).id, JSON.stringify(sceneData), updatedAt)
        );
        hasChanges = true;
      }

      if (roles.length > 0) {
        hasChanges = true;
      }

      if (flowProjectsToStore) {
        statements.push(context.env.DB.prepare("DELETE FROM user_project_flow_projects WHERE user_id = ?1").bind(userId));
        statements.push(context.env.DB.prepare("DELETE FROM user_project_flow_nodes WHERE user_id = ?1").bind(userId));
        for (const flowProject of flowProjectsToStore) {
          const projectId = typeof flowProject.id === "string" ? flowProject.id : "";
          if (!projectId) continue;
          const split = splitFlowProject(flowProject);
          statements.push(context.env.DB.prepare(
            "INSERT INTO user_project_flow_projects (user_id, project_id, data, updated_at) VALUES (?1, ?2, ?3, ?4)"
          )
            .bind(userId, projectId, JSON.stringify(split.project), updatedAt)
          );
          for (const flowNode of split.nodes) {
            statements.push(context.env.DB.prepare(
              "INSERT INTO user_project_flow_nodes (user_id, project_id, node_id, node_index, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
            )
              .bind(userId, projectId, flowNode.nodeId, flowNode.nodeIndex, JSON.stringify(flowNode.node), updatedAt)
            );
          }
        }
        hasChanges = true;
      }

      const deleted = delta.deleted || {};
      if (deleted.episodes && deleted.episodes.length > 0) {
        for (const episodeId of deleted.episodes) {
          statements.push(context.env.DB.prepare(
            "DELETE FROM user_project_episodes WHERE user_id = ?1 AND episode_id = ?2"
          )
            .bind(userId, episodeId)
          );
          statements.push(context.env.DB.prepare(
            "DELETE FROM user_project_scenes WHERE user_id = ?1 AND episode_id = ?2"
          )
            .bind(userId, episodeId)
          );
        }
        hasChanges = true;
      }
      if (deleted.scenes && deleted.scenes.length > 0) {
        for (const scene of deleted.scenes) {
          statements.push(context.env.DB.prepare(
            "DELETE FROM user_project_scenes WHERE user_id = ?1 AND episode_id = ?2 AND scene_id = ?3"
          )
            .bind(userId, scene.episodeId, scene.sceneId)
          );
        }
        hasChanges = true;
      }
      if (deleted.roles && deleted.roles.length > 0) {
        hasChanges = true;
      }
    } else {
      const parts = collectProjectParts(projectData);

      statements.push(context.env.DB.prepare("DELETE FROM user_project_episodes WHERE user_id = ?1").bind(userId));
      statements.push(context.env.DB.prepare("DELETE FROM user_project_scenes WHERE user_id = ?1").bind(userId));
      statements.push(context.env.DB.prepare("DELETE FROM user_project_flow_projects WHERE user_id = ?1").bind(userId));
      statements.push(context.env.DB.prepare("DELETE FROM user_project_flow_nodes WHERE user_id = ?1").bind(userId));

      for (const episode of parts.episodes) {
        statements.push(context.env.DB.prepare(
          "INSERT INTO user_project_episodes (user_id, episode_id, data, updated_at) VALUES (?1, ?2, ?3, ?4)"
        )
          .bind(userId, episode.id, JSON.stringify(episode), updatedAt)
        );
      }

      for (const scene of parts.scenes) {
        statements.push(context.env.DB.prepare(
          "INSERT INTO user_project_scenes (user_id, episode_id, scene_id, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)"
        )
          .bind(userId, scene.episodeId, scene.scene.id, JSON.stringify(scene.scene), updatedAt)
        );
      }

      for (const flowProject of flowProjectsToStore || []) {
        const projectId = typeof flowProject.id === "string" ? flowProject.id : "";
        if (!projectId) continue;
        const split = splitFlowProject(flowProject);
        statements.push(context.env.DB.prepare(
          "INSERT INTO user_project_flow_projects (user_id, project_id, data, updated_at) VALUES (?1, ?2, ?3, ?4)"
        )
          .bind(userId, projectId, JSON.stringify(split.project), updatedAt)
        );
        for (const flowNode of split.nodes) {
          statements.push(context.env.DB.prepare(
            "INSERT INTO user_project_flow_nodes (user_id, project_id, node_id, node_index, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
          )
            .bind(userId, projectId, flowNode.nodeId, flowNode.nodeIndex, JSON.stringify(flowNode.node), updatedAt)
          );
        }
      }

    }

    if (hasChanges) {
      statements.push(context.env.DB.prepare(
        "INSERT INTO user_project_meta (user_id, data, updated_at, last_op_id) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id) DO UPDATE SET data=?2, updated_at=?3, last_op_id=?4"
      )
        .bind(userId, metaSerialized, updatedAt, opId || null)
      );
    }

    statements.push(context.env.DB.prepare("DELETE FROM user_project_write_guards WHERE guard_id = ?1").bind(guardId));

    try {
      await context.env.DB.batch(statements);
    } catch (batchError) {
      if (isProjectWriteGuardError(batchError)) {
        if (userId) await logAudit(context.env, userId, "project.put", "conflict", { reason: "cas_guard_failed", updatedAt: existingMeta?.updated_at, mode, ...auditDevice });
        const remoteData = await loadProjectData(context.env, userId);
        return jsonResponse(
          { error: "Conflict", projectData: remoteData?.projectData, updatedAt: remoteData?.updatedAt ?? existingMeta?.updated_at },
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
      { ok: true, updatedAt },
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
    return jsonResponse({ error: "Failed to save project", detail }, { status: 500 });
  }
};
