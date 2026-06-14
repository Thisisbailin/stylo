import {
  Episode,
  PerformanceMetrics,
  ProjectData,
  ProjectRoleIdentity,
  RequestStats,
  Scene,
  TokenUsage,
} from "../types";

type MergeResult<T> = {
  merged: T;
  conflicts: string[];
};

const isEqual = (a: unknown, b: unknown) => {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

type StringMergeMode = "prefer-remote" | "prefer-local" | "keep-both";

const mergeTextKeepBoth = (remote?: string, local?: string) => {
  const remoteVal = typeof remote === "string" ? remote : "";
  const localVal = typeof local === "string" ? local : "";
  if (!remoteVal && !localVal) return "";
  if (!remoteVal) return localVal;
  if (!localVal) return remoteVal;
  if (remoteVal === localVal) return remoteVal;
  return `${remoteVal}\n\n${localVal}`;
};

const mergeString = (
  remote: unknown,
  local: unknown,
  path: string,
  conflicts: string[],
  mode: StringMergeMode = "prefer-remote",
  markConflict = true
) => {
  const remoteVal = typeof remote === "string" ? remote : "";
  const localVal = typeof local === "string" ? local : "";
  if (!remoteVal && !localVal) return "";
  if (!remoteVal) return localVal;
  if (!localVal) return remoteVal;
  if (remoteVal === localVal) return remoteVal;
  if (markConflict) conflicts.push(path);
  if (mode === "keep-both") return mergeTextKeepBoth(remoteVal, localVal);
  if (mode === "prefer-local") return localVal;
  return remoteVal;
};

const mergeOptionalString = (
  remote: unknown,
  local: unknown,
  path: string,
  conflicts: string[],
  mode: StringMergeMode = "prefer-remote",
  markConflict = true
) => {
  const remoteVal = typeof remote === "string" ? remote : "";
  const localVal = typeof local === "string" ? local : "";
  if (!remoteVal && !localVal) return undefined;
  return mergeString(remoteVal, localVal, path, conflicts, mode, markConflict);
};

const EPISODE_STATUS_ORDER: Episode["status"][] = [
  "pending",
  "generating",
  "completed",
  "error"
];

const mergeStatusByOrder = <T extends string>(
  remote: T | undefined,
  local: T | undefined,
  order: T[],
  path: string,
  conflicts: string[]
): T | undefined => {
  if (!remote && !local) return undefined;
  if (!remote) return local;
  if (!local) return remote;
  if (remote === local) return remote;
  if (remote === ("error" as T) && local !== ("error" as T)) {
    conflicts.push(path);
    return local;
  }
  if (local === ("error" as T) && remote !== ("error" as T)) {
    conflicts.push(path);
    return remote;
  }
  const remoteIndex = order.indexOf(remote);
  const localIndex = order.indexOf(local);
  if (remoteIndex === -1 && localIndex === -1) {
    conflicts.push(path);
    return remote;
  }
  if (remoteIndex === localIndex) return remote;
  conflicts.push(path);
  return remoteIndex > localIndex ? remote : local;
};

const mergeTokenUsage = (remote?: TokenUsage, local?: TokenUsage): TokenUsage | undefined => {
  if (!remote && !local) return undefined;
  return {
    promptTokens: Math.max(remote?.promptTokens ?? 0, local?.promptTokens ?? 0),
    responseTokens: Math.max(remote?.responseTokens ?? 0, local?.responseTokens ?? 0),
    totalTokens: Math.max(remote?.totalTokens ?? 0, local?.totalTokens ?? 0)
  };
};

const mergeRequestStats = (remote?: RequestStats, local?: RequestStats): RequestStats => ({
  total: Math.max(remote?.total ?? 0, local?.total ?? 0),
  success: Math.max(remote?.success ?? 0, local?.success ?? 0),
  error: Math.max(remote?.error ?? 0, local?.error ?? 0)
});

const mergePerformanceMetrics = (remote?: PerformanceMetrics, local?: PerformanceMetrics): PerformanceMetrics => ({
  context: mergeRequestStats(remote?.context, local?.context)
});

const mergeArrayByKey = <T>(
  remoteArr: T[],
  localArr: T[],
  keyFn: (item: T) => string | number,
  mergeItem: (remoteItem: T, localItem: T, path: string) => MergeResult<T>,
  path: string
): MergeResult<T[]> => {
  const conflicts: string[] = [];
  const merged: T[] = [];
  const localMap = new Map<string | number, T>();
  const localOrder: Array<string | number> = [];

  localArr.forEach((item) => {
    const key = keyFn(item);
    if (!localMap.has(key)) localOrder.push(key);
    localMap.set(key, item);
  });

  const remoteKeys = new Set<string | number>();

  remoteArr.forEach((item) => {
    const key = keyFn(item);
    remoteKeys.add(key);
    const localItem = localMap.get(key);
    if (localItem) {
      const result = mergeItem(item, localItem, `${path}[${key}]`);
      merged.push(result.merged);
      conflicts.push(...result.conflicts);
      localMap.delete(key);
    } else {
      merged.push(item);
    }
  });

  localOrder.forEach((key) => {
    if (!remoteKeys.has(key) && localMap.has(key)) {
      merged.push(localMap.get(key)!);
    }
  });

  return { merged, conflicts };
};

const mergeScenes = (remote: Scene[], local: Scene[], path: string): MergeResult<Scene[]> =>
  mergeArrayByKey(
    remote || [],
    local || [],
    (scene) => scene.id,
    (remoteScene, localScene, itemPath) => {
      const conflicts: string[] = [];
      const merged: Scene = {
        id: remoteScene.id,
        title: mergeString(remoteScene.title, localScene.title, `${itemPath}.title`, conflicts),
        content: mergeString(remoteScene.content, localScene.content, `${itemPath}.content`, conflicts, "keep-both")
      };
      return { merged, conflicts };
    },
    path
  );

const mergeEpisodes = (remote: Episode[], local: Episode[], path: string): MergeResult<Episode[]> =>
  mergeArrayByKey(
    remote || [],
    local || [],
    (episode) => episode.id,
    (remoteEp, localEp, itemPath) => {
      const conflicts: string[] = [];
      const sceneResult = mergeScenes(remoteEp.scenes || [], localEp.scenes || [], `${itemPath}.scenes`);
      conflicts.push(...sceneResult.conflicts);

      const merged: Episode = {
        id: remoteEp.id,
        title: mergeString(remoteEp.title, localEp.title, `${itemPath}.title`, conflicts, "prefer-remote"),
        content: mergeString(remoteEp.content, localEp.content, `${itemPath}.content`, conflicts, "keep-both"),
        scenes: sceneResult.merged,
        status: mergeStatusByOrder(remoteEp.status, localEp.status, EPISODE_STATUS_ORDER, `${itemPath}.status`, conflicts) || remoteEp.status,
        errorMsg: remoteEp.errorMsg ?? localEp.errorMsg
      };
      return { merged, conflicts };
    },
    path
  );

const mergeRoles = (remote: ProjectRoleIdentity[], local: ProjectRoleIdentity[], path: string): MergeResult<ProjectRoleIdentity[]> =>
  mergeArrayByKey(
    remote || [],
    local || [],
    (role) => role.id,
    (remoteRole, localRole, itemPath) => {
      const conflicts: string[] = [];
      if (!isEqual(remoteRole, localRole)) conflicts.push(itemPath);
      const merged = isEqual(remoteRole, localRole) ? remoteRole : remoteRole;
      return { merged, conflicts };
    },
    path
  );

export const mergeProjectData = (remote: ProjectData, local: ProjectData): MergeResult<ProjectData> => {
  const conflicts: string[] = [];

  const episodeResult = mergeEpisodes(remote.episodes || [], local.episodes || [], "episodes");
  const rolesResult = mergeRoles(remote.roles || [], local.roles || [], "roles");
  conflicts.push(...episodeResult.conflicts, ...rolesResult.conflicts);

  const merged: ProjectData = {
    fileName: mergeString(remote.fileName, local.fileName, "fileName", conflicts, "prefer-remote"),
    rawScript: mergeString(remote.rawScript, local.rawScript, "rawScript", conflicts, "keep-both"),
    episodes: episodeResult.merged,
    roles: rolesResult.merged,
    designAssets: remote.designAssets || local.designAssets || [],
    canvas: remote.canvas || local.canvas,
    flow: remote.flow || local.flow,
    phase5Usage: mergeTokenUsage(remote.phase5Usage, local.phase5Usage),
    stats: mergePerformanceMetrics(remote.stats, local.stats)
  };

  return { merged, conflicts };
};
