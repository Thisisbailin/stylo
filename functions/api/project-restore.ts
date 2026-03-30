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
  fileName: string;
  rawScript: string;
  shotGuide: string;
  soraGuide: string;
  storyboardGuide: string;
  dramaGuide: string;
  globalStyleGuide: string;
  designAssets: Array<Record<string, unknown>>;
  context: {
    projectSummary: string;
    episodeSummaries: { episodeId: number; summary: string }[];
    roles: Array<Record<string, unknown>>;
    characters?: Array<Record<string, unknown>>;
    locations?: Array<Record<string, unknown>>;
  };
  contextUsage: Record<string, unknown>;
  phase1Usage: Record<string, unknown>;
  phase4Usage: Record<string, unknown>;
  phase5Usage: Record<string, unknown>;
  stats: Record<string, unknown>;
};

const emptyTokenUsage = { promptTokens: 0, responseTokens: 0, totalTokens: 0 };
const emptyStats = {
  context: { total: 0, success: 0, error: 0 },
  shotGen: { total: 0, success: 0, error: 0 },
  soraGen: { total: 0, success: 0, error: 0 },
  storyboardGen: { total: 0, success: 0, error: 0 },
};
const DEFAULT_META: ProjectMeta = {
  fileName: "",
  rawScript: "",
  shotGuide: "",
  soraGuide: "",
  storyboardGuide: "",
  dramaGuide: "",
  globalStyleGuide: "",
  designAssets: [],
  context: {
    projectSummary: "",
    episodeSummaries: [],
    roles: [],
    characters: [],
    locations: []
  },
  contextUsage: emptyTokenUsage,
  phase1Usage: {},
  phase4Usage: emptyTokenUsage,
  phase5Usage: emptyTokenUsage,
  stats: emptyStats
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
  fileName: typeof projectData?.fileName === "string" ? projectData.fileName : "",
  rawScript: typeof projectData?.rawScript === "string" ? projectData.rawScript : "",
  shotGuide: typeof projectData?.shotGuide === "string" ? projectData.shotGuide : "",
  soraGuide: typeof projectData?.soraGuide === "string" ? projectData.soraGuide : "",
  storyboardGuide: typeof projectData?.storyboardGuide === "string" ? projectData.storyboardGuide : "",
  dramaGuide: typeof projectData?.dramaGuide === "string" ? projectData.dramaGuide : "",
  globalStyleGuide: typeof projectData?.globalStyleGuide === "string" ? projectData.globalStyleGuide : "",
  designAssets: Array.isArray(projectData?.designAssets) ? projectData.designAssets : [],
  context: {
    projectSummary: typeof projectData?.context?.projectSummary === "string" ? projectData.context.projectSummary : "",
    episodeSummaries: Array.isArray(projectData?.context?.episodeSummaries) ? projectData.context.episodeSummaries : [],
    roles: Array.isArray(projectData?.context?.roles) ? projectData.context.roles : [],
  },
  contextUsage: projectData?.contextUsage || emptyTokenUsage,
  phase1Usage: projectData?.phase1Usage || {},
  phase4Usage: projectData?.phase4Usage || emptyTokenUsage,
  phase5Usage: projectData?.phase5Usage || emptyTokenUsage,
  stats: { ...emptyStats, ...(projectData?.stats || {}) }
});

const collectProjectParts = (projectData: any) => {
  const episodes = Array.isArray(projectData?.episodes) ? projectData.episodes : [];
  const scenes: Array<{ episodeId: number; scene: any }> = [];
  const shots: Array<{ episodeId: number; shot: any }> = [];

  episodes.forEach((episode: any) => {
    const episodeId = episode?.id;
    if (!Array.isArray(episode?.scenes)) return;
    episode.scenes.forEach((scene: any) => {
      scenes.push({ episodeId, scene });
    });
  });

  episodes.forEach((episode: any) => {
    const episodeId = episode?.id;
    if (!Array.isArray(episode?.shots)) return;
    episode.shots.forEach((shot: any) => {
      shots.push({ episodeId, shot });
    });
  });

  const episodeRows = episodes.map((episode: any) => ({
    id: episode.id,
    title: episode.title,
    content: episode.content,
    summary: episode.summary,
    status: episode.status,
    errorMsg: episode.errorMsg,
    shotGenUsage: episode.shotGenUsage,
    soraGenUsage: episode.soraGenUsage,
    storyboardGenUsage: episode.storyboardGenUsage
  }));

  return {
    episodes: episodeRows,
    scenes,
    shots,
    roles: Array.isArray(projectData?.context?.roles) ? projectData.context.roles : [],
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
    "CREATE TABLE IF NOT EXISTS user_project_shots (user_id TEXT NOT NULL, episode_id INTEGER NOT NULL, shot_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, episode_id, shot_id))"
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
  await ensureColumn(env, "user_project_shots", "updated_at", "INTEGER");
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

  const shotsResult = await env.DB.prepare(
    "SELECT episode_id, shot_id, data FROM user_project_shots WHERE user_id = ?1"
  )
    .bind(userId)
    .all();

  const charactersResult = await env.DB.prepare(
    "SELECT char_id, data FROM user_project_characters WHERE user_id = ?1"
  )
    .bind(userId)
    .all();

  const locationsResult = await env.DB.prepare(
    "SELECT loc_id, data FROM user_project_locations WHERE user_id = ?1"
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
      summary: epData.summary,
      status: epData.status || "pending",
      errorMsg: epData.errorMsg,
      shotGenUsage: epData.shotGenUsage,
      soraGenUsage: epData.soraGenUsage,
      storyboardGenUsage: epData.storyboardGenUsage,
      scenes: [],
      shots: []
    });
  });

  const getEpisode = (episodeId: number) => {
    if (!episodesMap.has(episodeId)) {
      episodesMap.set(episodeId, {
        id: episodeId,
        title: "",
        content: "",
        scenes: [],
        shots: [],
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
      title: sceneData.title || "",
      content: sceneData.content || ""
    });
  });

  (shotsResult?.results || []).forEach((row: any) => {
    const shotData = safeJsonParse<Record<string, unknown>>(row.data, {});
    const episode = getEpisode(row.episode_id);
    episode.shots.push({ ...shotData, id: row.shot_id });
  });

  const characters = (charactersResult?.results || []).map((row: any) => {
    const data = safeJsonParse<Record<string, unknown>>(row.data, {});
    return { ...data, id: row.char_id };
  });

  const locations = (locationsResult?.results || []).map((row: any) => {
    const data = safeJsonParse<Record<string, unknown>>(row.data, {});
    return { ...data, id: row.loc_id };
  });

  const metaRoles = Array.isArray(meta.context?.roles) ? meta.context.roles : [];
  const metaCharacters = Array.isArray(meta.context?.characters) ? meta.context.characters : [];
  const metaLocations = Array.isArray(meta.context?.locations) ? meta.context.locations : [];

  const projectData = {
    fileName: meta.fileName || "",
    rawScript: meta.rawScript || "",
    episodes: Array.from(episodesMap.values()),
    context: {
      projectSummary: meta.context?.projectSummary || "",
      episodeSummaries: meta.context?.episodeSummaries || [],
      roles: metaRoles,
      characters: metaRoles.length ? [] : (characters.length > 0 ? characters : metaCharacters),
      locations: metaRoles.length ? [] : (locations.length > 0 ? locations : metaLocations)
    },
    shotGuide: meta.shotGuide || "",
    soraGuide: meta.soraGuide || "",
    storyboardGuide: meta.storyboardGuide || "",
    dramaGuide: meta.dramaGuide || "",
    globalStyleGuide: meta.globalStyleGuide || "",
    designAssets: Array.isArray(meta.designAssets) ? meta.designAssets : [],
    contextUsage: meta.contextUsage || emptyTokenUsage,
    phase1Usage: meta.phase1Usage || {},
    phase4Usage: meta.phase4Usage || emptyTokenUsage,
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
      await context.env.DB.prepare(
        "INSERT OR IGNORE INTO user_project_snapshots (user_id, version, data, created_at) VALUES (?1, ?2, ?3, ?4)"
      )
        .bind(userId, currentSnapshot.updatedAt, JSON.stringify({ projectData: currentSnapshot.projectData }), Date.now())
        .run();
    }

    const parsed = JSON.parse(snapshot.data as string);
    const projectData = parsed?.projectData ?? parsed;
    const validation = validateProjectPayload(projectData);
    if (!validation.ok) {
      if (userId) await logAudit(context.env, userId, "project.restore", "invalid", { error: validation.error, version, ...auditDevice });
      return jsonResponse({ error: `Snapshot invalid: ${validation.error}` }, { status: 400 });
    }

    const meta = buildMetaFromProject(projectData);
    const parts = collectProjectParts(projectData);
    const updatedAt = Date.now();

    await context.env.DB.prepare("DELETE FROM user_project_episodes WHERE user_id = ?1").bind(userId).run();
    await context.env.DB.prepare("DELETE FROM user_project_scenes WHERE user_id = ?1").bind(userId).run();
    await context.env.DB.prepare("DELETE FROM user_project_shots WHERE user_id = ?1").bind(userId).run();
    await context.env.DB.prepare("DELETE FROM user_project_characters WHERE user_id = ?1").bind(userId).run();
    await context.env.DB.prepare("DELETE FROM user_project_locations WHERE user_id = ?1").bind(userId).run();

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

    for (const shot of parts.shots) {
      await context.env.DB.prepare(
        "INSERT INTO user_project_shots (user_id, episode_id, shot_id, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)"
      )
        .bind(userId, shot.episodeId, shot.shot.id, JSON.stringify(shot.shot), updatedAt)
        .run();
    }

    await context.env.DB.prepare(
      "INSERT INTO user_project_meta (user_id, data, updated_at, last_op_id) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id) DO UPDATE SET data=?2, updated_at=?3, last_op_id=?4"
    )
      .bind(userId, JSON.stringify(meta), updatedAt, null)
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
