import {
  Character,
  CharacterForm,
  Episode,
  Location,
  LocationZone,
  PerformanceMetrics,
  Phase1Usage,
  ProjectContext,
  ProjectData,
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

const mergeOptionalNumberMax = (
  remote: unknown,
  local: unknown,
  path: string,
  conflicts: string[]
) => {
  const remoteVal = typeof remote === "number" ? remote : undefined;
  const localVal = typeof local === "number" ? local : undefined;
  if (typeof remoteVal !== "number" && typeof localVal !== "number") return undefined;
  if (typeof remoteVal !== "number") return localVal;
  if (typeof localVal !== "number") return remoteVal;
  if (remoteVal === localVal) return remoteVal;
  conflicts.push(path);
  return Math.max(remoteVal, localVal);
};

const mergeOptionalNumberPreferRemote = (
  remote: unknown,
  local: unknown,
  path: string,
  conflicts: string[]
) => {
  const remoteVal = typeof remote === "number" ? remote : undefined;
  const localVal = typeof local === "number" ? local : undefined;
  if (typeof remoteVal !== "number" && typeof localVal !== "number") return undefined;
  if (typeof remoteVal !== "number") return localVal;
  if (typeof localVal !== "number") return remoteVal;
  if (remoteVal === localVal) return remoteVal;
  conflicts.push(path);
  return remoteVal;
};

const mergeOptionalBooleanPreferTrue = (
  remote: unknown,
  local: unknown,
  path: string,
  conflicts: string[]
) => {
  const remoteVal = typeof remote === "boolean" ? remote : undefined;
  const localVal = typeof local === "boolean" ? local : undefined;
  if (typeof remoteVal !== "boolean" && typeof localVal !== "boolean") return undefined;
  if (typeof remoteVal !== "boolean") return localVal;
  if (typeof localVal !== "boolean") return remoteVal;
  if (remoteVal === localVal) return remoteVal;
  conflicts.push(path);
  return remoteVal || localVal;
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

const mergePhase1Usage = (remote?: Phase1Usage, local?: Phase1Usage): Phase1Usage => ({
  projectSummary: mergeTokenUsage(remote?.projectSummary, local?.projectSummary) || { promptTokens: 0, responseTokens: 0, totalTokens: 0 },
  episodeSummaries: mergeTokenUsage(remote?.episodeSummaries, local?.episodeSummaries) || { promptTokens: 0, responseTokens: 0, totalTokens: 0 },
  charList: mergeTokenUsage(remote?.charList, local?.charList) || { promptTokens: 0, responseTokens: 0, totalTokens: 0 },
  charDeepDive: mergeTokenUsage(remote?.charDeepDive, local?.charDeepDive) || { promptTokens: 0, responseTokens: 0, totalTokens: 0 },
  locList: mergeTokenUsage(remote?.locList, local?.locList) || { promptTokens: 0, responseTokens: 0, totalTokens: 0 },
  locDeepDive: mergeTokenUsage(remote?.locDeepDive, local?.locDeepDive) || { promptTokens: 0, responseTokens: 0, totalTokens: 0 }
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
        summary: mergeOptionalString(remoteEp.summary, localEp.summary, `${itemPath}.summary`, conflicts, "keep-both"),
        status: mergeStatusByOrder(remoteEp.status, localEp.status, EPISODE_STATUS_ORDER, `${itemPath}.status`, conflicts) || remoteEp.status,
        errorMsg: remoteEp.errorMsg ?? localEp.errorMsg
      };
      return { merged, conflicts };
    },
    path
  );

const mergeCharacterForms = (remote: CharacterForm[], local: CharacterForm[], path: string): MergeResult<CharacterForm[]> =>
  mergeArrayByKey(
    remote || [],
    local || [],
    (form) => form.id || form.formName,
    (remoteForm, localForm, itemPath) => {
      const conflicts: string[] = [];
      const merged: CharacterForm = {
        id: remoteForm.id || localForm.id || remoteForm.formName,
        formName: remoteForm.formName,
        episodeRange: mergeString(remoteForm.episodeRange, localForm.episodeRange, `${itemPath}.episodeRange`, conflicts, "prefer-remote"),
        description: mergeString(remoteForm.description, localForm.description, `${itemPath}.description`, conflicts, "keep-both"),
        visualTags: mergeString(remoteForm.visualTags, localForm.visualTags, `${itemPath}.visualTags`, conflicts, "keep-both"),
        identityOrState: mergeOptionalString(remoteForm.identityOrState, localForm.identityOrState, `${itemPath}.identityOrState`, conflicts, "keep-both"),
        hair: mergeOptionalString(remoteForm.hair, localForm.hair, `${itemPath}.hair`, conflicts, "keep-both"),
        face: mergeOptionalString(remoteForm.face, localForm.face, `${itemPath}.face`, conflicts, "keep-both"),
        body: mergeOptionalString(remoteForm.body, localForm.body, `${itemPath}.body`, conflicts, "keep-both"),
        costume: mergeOptionalString(remoteForm.costume, localForm.costume, `${itemPath}.costume`, conflicts, "keep-both"),
        accessories: mergeOptionalString(remoteForm.accessories, localForm.accessories, `${itemPath}.accessories`, conflicts, "keep-both"),
        props: mergeOptionalString(remoteForm.props, localForm.props, `${itemPath}.props`, conflicts, "keep-both"),
        materialPalette: mergeOptionalString(remoteForm.materialPalette, localForm.materialPalette, `${itemPath}.materialPalette`, conflicts, "keep-both"),
        poses: mergeOptionalString(remoteForm.poses, localForm.poses, `${itemPath}.poses`, conflicts, "keep-both"),
        expressions: mergeOptionalString(remoteForm.expressions, localForm.expressions, `${itemPath}.expressions`, conflicts, "keep-both"),
        lightingOrPalette: mergeOptionalString(remoteForm.lightingOrPalette, localForm.lightingOrPalette, `${itemPath}.lightingOrPalette`, conflicts, "keep-both"),
        turnaroundNeeded: mergeOptionalBooleanPreferTrue(remoteForm.turnaroundNeeded, localForm.turnaroundNeeded, `${itemPath}.turnaroundNeeded`, conflicts),
        deliverables: mergeOptionalString(remoteForm.deliverables, localForm.deliverables, `${itemPath}.deliverables`, conflicts, "keep-both"),
        designRationale: mergeOptionalString(remoteForm.designRationale, localForm.designRationale, `${itemPath}.designRationale`, conflicts, "keep-both"),
        styleRef: mergeOptionalString(remoteForm.styleRef, localForm.styleRef, `${itemPath}.styleRef`, conflicts, "keep-both"),
        genPrompts: mergeOptionalString(remoteForm.genPrompts, localForm.genPrompts, `${itemPath}.genPrompts`, conflicts, "keep-both")
      };
      return { merged, conflicts };
    },
    path
  );

const mergeCharacters = (remote: Character[], local: Character[], path: string): MergeResult<Character[]> =>
  mergeArrayByKey(
    remote || [],
    local || [],
    (char) => char.id,
    (remoteChar, localChar, itemPath) => {
      const conflicts: string[] = [];
      const formsResult = mergeCharacterForms(remoteChar.forms || [], localChar.forms || [], `${itemPath}.forms`);
      conflicts.push(...formsResult.conflicts);
      const merged: Character = {
        id: remoteChar.id,
        name: mergeString(remoteChar.name, localChar.name, `${itemPath}.name`, conflicts, "prefer-remote"),
        role: mergeString(remoteChar.role, localChar.role, `${itemPath}.role`, conflicts, "prefer-remote"),
        isMain: remoteChar.isMain || localChar.isMain,
        bio: mergeString(remoteChar.bio, localChar.bio, `${itemPath}.bio`, conflicts, "keep-both"),
        forms: formsResult.merged,
        assetPriority: mergeOptionalString(remoteChar.assetPriority, localChar.assetPriority, `${itemPath}.assetPriority`, conflicts, "prefer-remote") as Character["assetPriority"],
        archetype: mergeOptionalString(remoteChar.archetype, localChar.archetype, `${itemPath}.archetype`, conflicts, "prefer-remote"),
        episodeUsage: mergeOptionalString(remoteChar.episodeUsage, localChar.episodeUsage, `${itemPath}.episodeUsage`, conflicts, "keep-both")
      };
      return { merged, conflicts };
    },
    path
  );

const mergeLocationZones = (remote: LocationZone[], local: LocationZone[], path: string): MergeResult<LocationZone[]> =>
  mergeArrayByKey(
    remote || [],
    local || [],
    (zone) => zone.id || zone.name,
    (remoteZone, localZone, itemPath) => {
      const conflicts: string[] = [];
      const merged: LocationZone = {
        id: remoteZone.id || localZone.id || remoteZone.name,
        name: remoteZone.name,
        kind: remoteZone.kind,
        episodeRange: mergeString(remoteZone.episodeRange, localZone.episodeRange, `${itemPath}.episodeRange`, conflicts, "prefer-remote"),
        layoutNotes: mergeString(remoteZone.layoutNotes, localZone.layoutNotes, `${itemPath}.layoutNotes`, conflicts, "keep-both"),
        keyProps: mergeString(remoteZone.keyProps, localZone.keyProps, `${itemPath}.keyProps`, conflicts, "keep-both"),
        lightingWeather: mergeString(remoteZone.lightingWeather, localZone.lightingWeather, `${itemPath}.lightingWeather`, conflicts, "keep-both"),
        materialPalette: mergeString(remoteZone.materialPalette, localZone.materialPalette, `${itemPath}.materialPalette`, conflicts, "keep-both"),
        designRationale: mergeOptionalString(remoteZone.designRationale, localZone.designRationale, `${itemPath}.designRationale`, conflicts, "keep-both"),
        deliverables: mergeOptionalString(remoteZone.deliverables, localZone.deliverables, `${itemPath}.deliverables`, conflicts, "keep-both"),
        genPrompts: mergeOptionalString(remoteZone.genPrompts, localZone.genPrompts, `${itemPath}.genPrompts`, conflicts, "keep-both")
      };
      return { merged, conflicts };
    },
    path
  );

const mergeLocations = (remote: Location[], local: Location[], path: string): MergeResult<Location[]> =>
  mergeArrayByKey(
    remote || [],
    local || [],
    (loc) => loc.id,
    (remoteLoc, localLoc, itemPath) => {
      const conflicts: string[] = [];
      const zonesResult = mergeLocationZones(remoteLoc.zones || [], localLoc.zones || [], `${itemPath}.zones`);
      conflicts.push(...zonesResult.conflicts);
      const merged: Location = {
        id: remoteLoc.id,
        name: mergeString(remoteLoc.name, localLoc.name, `${itemPath}.name`, conflicts, "prefer-remote"),
        type: remoteLoc.type,
        description: mergeString(remoteLoc.description, localLoc.description, `${itemPath}.description`, conflicts, "keep-both"),
        visuals: mergeString(remoteLoc.visuals, localLoc.visuals, `${itemPath}.visuals`, conflicts, "keep-both"),
        assetPriority: mergeOptionalString(remoteLoc.assetPriority, localLoc.assetPriority, `${itemPath}.assetPriority`, conflicts, "prefer-remote") as Location["assetPriority"],
        episodeUsage: mergeOptionalString(remoteLoc.episodeUsage, localLoc.episodeUsage, `${itemPath}.episodeUsage`, conflicts, "keep-both"),
        zones: zonesResult.merged
      };
      return { merged, conflicts };
    },
    path
  );

const mergeEpisodeSummaries = (
  remote: ProjectContext["episodeSummaries"],
  local: ProjectContext["episodeSummaries"],
  path: string
): MergeResult<ProjectContext["episodeSummaries"]> =>
  mergeArrayByKey(
    remote || [],
    local || [],
    (summary) => summary.episodeId,
    (remoteSummary, localSummary, itemPath) => {
      const conflicts: string[] = [];
      const merged = {
        episodeId: remoteSummary.episodeId,
        summary: mergeString(remoteSummary.summary, localSummary.summary, `${itemPath}.summary`, conflicts, "keep-both")
      };
      return { merged, conflicts };
    },
    path
  );

const mergeContext = (remote: ProjectContext, local: ProjectContext): MergeResult<ProjectContext> => {
  const conflicts: string[] = [];
  const episodeResult = mergeEpisodeSummaries(remote.episodeSummaries || [], local.episodeSummaries || [], "context.episodeSummaries");
  const characterResult = mergeCharacters(remote.characters || [], local.characters || [], "context.characters");
  const locationResult = mergeLocations(remote.locations || [], local.locations || [], "context.locations");
  conflicts.push(...episodeResult.conflicts, ...characterResult.conflicts, ...locationResult.conflicts);
  const merged: ProjectContext = {
    projectSummary: mergeString(remote.projectSummary, local.projectSummary, "context.projectSummary", conflicts, "keep-both"),
    episodeSummaries: episodeResult.merged,
    characters: characterResult.merged,
    locations: locationResult.merged
  };
  return { merged, conflicts };
};

export const mergeProjectData = (remote: ProjectData, local: ProjectData): MergeResult<ProjectData> => {
  const conflicts: string[] = [];

  const episodeResult = mergeEpisodes(remote.episodes || [], local.episodes || [], "episodes");
  const contextResult = mergeContext(remote.context, local.context);
  conflicts.push(...episodeResult.conflicts, ...contextResult.conflicts);

  const merged: ProjectData = {
    fileName: mergeString(remote.fileName, local.fileName, "fileName", conflicts, "prefer-remote"),
    rawScript: mergeString(remote.rawScript, local.rawScript, "rawScript", conflicts, "keep-both"),
    episodes: episodeResult.merged,
    context: contextResult.merged,
    contextUsage: mergeTokenUsage(remote.contextUsage, local.contextUsage),
    phase1Usage: mergePhase1Usage(remote.phase1Usage, local.phase1Usage),
    phase5Usage: mergeTokenUsage(remote.phase5Usage, local.phase5Usage),
    dramaGuide: mergeOptionalString(remote.dramaGuide, local.dramaGuide, "dramaGuide", conflicts, "keep-both"),
    globalStyleGuide: mergeOptionalString(remote.globalStyleGuide, local.globalStyleGuide, "globalStyleGuide", conflicts, "keep-both"),
    stats: mergePerformanceMetrics(remote.stats, local.stats)
  };

  return { merged, conflicts };
};
