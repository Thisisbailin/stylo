import { Episode, ProjectData, ProjectRoleIdentity, Scene } from "../types";

export type EpisodeDelta = Omit<Episode, "scenes">;
export type SceneDelta = Scene & { episodeId: number };

export type ProjectMetaDelta = {
  fileName: string;
  rawScript: string;
  dramaGuide: string;
  globalStyleGuide: string;
  designAssets: ProjectData["designAssets"];
  nodeFlow: ProjectData["nodeFlow"];
  nodeDefaults: ProjectData["nodeDefaults"];
  context: {
    projectSummary: string;
    episodeSummaries: { episodeId: number; summary: string }[];
    roles: ProjectRoleIdentity[];
  };
  contextUsage: ProjectData["contextUsage"];
  phase1Usage: ProjectData["phase1Usage"];
  phase5Usage: ProjectData["phase5Usage"];
  stats: ProjectData["stats"];
};

export type ProjectDelta = {
  meta?: ProjectMetaDelta;
  episodes?: EpisodeDelta[];
  scenes?: SceneDelta[];
  roles?: ProjectRoleIdentity[];
  deleted?: {
    episodes?: number[];
    scenes?: { episodeId: number; sceneId: string }[];
    roles?: string[];
  };
};

const stableStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
};

const buildMeta = (data: ProjectData): ProjectMetaDelta => ({
  fileName: data.fileName,
  rawScript: data.rawScript,
  dramaGuide: data.dramaGuide,
  globalStyleGuide: data.globalStyleGuide,
  designAssets: data.designAssets,
  nodeFlow: data.nodeFlow,
  nodeDefaults: data.nodeDefaults,
  context: {
    projectSummary: data.context.projectSummary,
    episodeSummaries: data.context.episodeSummaries,
    roles: data.context.roles,
  },
  contextUsage: data.contextUsage,
  phase1Usage: data.phase1Usage,
  phase5Usage: data.phase5Usage,
  stats: data.stats,
});

const toEpisodeDelta = (episode: Episode): EpisodeDelta => ({
  id: episode.id,
  title: episode.title,
  content: episode.content,
  summary: episode.summary,
  status: episode.status,
  errorMsg: episode.errorMsg,
});

const toSceneDelta = (episodeId: number, scene: Scene): SceneDelta => ({
  episodeId,
  id: scene.id,
  title: scene.title,
  content: scene.content,
  partition: scene.partition,
  timeOfDay: scene.timeOfDay,
  location: scene.location,
  metadata: scene.metadata,
});

const mapByKey = <T>(items: T[], keyFn: (item: T) => string) => {
  const map = new Map<string, T>();
  items.forEach((item) => map.set(keyFn(item), item));
  return map;
};

export const computeProjectDelta = (current: ProjectData, base: ProjectData | null): ProjectDelta => {
  if (!base) {
    return {
      meta: buildMeta(current),
      episodes: current.episodes.map(toEpisodeDelta),
      scenes: current.episodes.flatMap((ep) => ep.scenes.map((scene) => toSceneDelta(ep.id, scene))),
      roles: current.context.roles,
      deleted: {},
    };
  }

  const delta: ProjectDelta = { deleted: {} };

  const currentMeta = buildMeta(current);
  const baseMeta = buildMeta(base);
  if (stableStringify(currentMeta) !== stableStringify(baseMeta)) {
    delta.meta = currentMeta;
  }

  const currentEpisodes = current.episodes.map(toEpisodeDelta);
  const baseEpisodes = base.episodes.map(toEpisodeDelta);
  const currentEpisodesMap = mapByKey(currentEpisodes, (ep) => String(ep.id));
  const baseEpisodesMap = mapByKey(baseEpisodes, (ep) => String(ep.id));
  const episodeUpserts: EpisodeDelta[] = [];
  const episodeDeletes: number[] = [];

  currentEpisodesMap.forEach((episode, key) => {
    const baseEpisode = baseEpisodesMap.get(key);
    if (!baseEpisode || stableStringify(episode) !== stableStringify(baseEpisode)) {
      episodeUpserts.push(episode);
    }
  });
  baseEpisodesMap.forEach((_episode, key) => {
    if (!currentEpisodesMap.has(key)) {
      episodeDeletes.push(Number(key));
    }
  });
  if (episodeUpserts.length > 0) delta.episodes = episodeUpserts;
  if (episodeDeletes.length > 0) delta.deleted!.episodes = episodeDeletes;

  const currentScenes = current.episodes.flatMap((ep) => ep.scenes.map((scene) => toSceneDelta(ep.id, scene)));
  const baseScenes = base.episodes.flatMap((ep) => ep.scenes.map((scene) => toSceneDelta(ep.id, scene)));
  const currentScenesMap = mapByKey(currentScenes, (scene) => `${scene.episodeId}::${scene.id}`);
  const baseScenesMap = mapByKey(baseScenes, (scene) => `${scene.episodeId}::${scene.id}`);
  const sceneUpserts: SceneDelta[] = [];
  const sceneDeletes: { episodeId: number; sceneId: string }[] = [];

  currentScenesMap.forEach((scene, key) => {
    const baseScene = baseScenesMap.get(key);
    if (!baseScene || stableStringify(scene) !== stableStringify(baseScene)) {
      sceneUpserts.push(scene);
    }
  });
  baseScenesMap.forEach((scene, key) => {
    if (!currentScenesMap.has(key)) {
      sceneDeletes.push({ episodeId: scene.episodeId, sceneId: scene.id });
    }
  });
  if (sceneUpserts.length > 0) delta.scenes = sceneUpserts;
  if (sceneDeletes.length > 0) delta.deleted!.scenes = sceneDeletes;

  const currentRolesMap = mapByKey(current.context.roles, (role) => role.id);
  const baseRolesMap = mapByKey(base.context.roles, (role) => role.id);
  const roleUpserts: ProjectRoleIdentity[] = [];
  const roleDeletes: string[] = [];
  currentRolesMap.forEach((role, key) => {
    const baseRole = baseRolesMap.get(key);
    if (!baseRole || stableStringify(role) !== stableStringify(baseRole)) {
      roleUpserts.push(role);
    }
  });
  baseRolesMap.forEach((_role, key) => {
    if (!currentRolesMap.has(key)) {
      roleDeletes.push(key);
    }
  });
  if (roleUpserts.length > 0) delta.roles = roleUpserts;
  if (roleDeletes.length > 0) delta.deleted!.roles = roleDeletes;

  if (Object.keys(delta.deleted || {}).length === 0) {
    delete delta.deleted;
  }

  return delta;
};

export const isDeltaEmpty = (delta: ProjectDelta) => {
  if (delta.meta) return false;
  if (delta.episodes && delta.episodes.length > 0) return false;
  if (delta.scenes && delta.scenes.length > 0) return false;
  if (delta.roles && delta.roles.length > 0) return false;
  if (delta.deleted && Object.values(delta.deleted).some((list) => list && list.length > 0)) return false;
  return true;
};
