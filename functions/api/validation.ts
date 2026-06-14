type ValidationResult = { ok: true } | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const PROJECT_PATCH_KEYS = new Set([
  "fileName",
  "rawScript",
  "episodes",
  "context",
  "contextUsage",
  "phase1Usage",
  "phase5Usage",
  "dramaGuide",
  "globalStyleGuide",
  "designAssets",
  "nodeFlow",
  "nodeDefaults",
  "stats"
]);

export const validateProjectPayload = (data: unknown): ValidationResult => {
  if (!isRecord(data)) return { ok: false, error: "projectData is not an object" };
  const rawScript = (data as Record<string, unknown>).rawScript;
  if (rawScript !== undefined && !isString(rawScript)) {
    return { ok: false, error: "rawScript is not a string" };
  }

  const episodes = (data as Record<string, unknown>).episodes;
  if (!Array.isArray(episodes)) return { ok: false, error: "episodes is not an array" };

  for (let i = 0; i < episodes.length; i += 1) {
    const ep = episodes[i];
    if (!isRecord(ep)) return { ok: false, error: `episodes[${i}] is not an object` };
    if (!isNumber(ep.id)) return { ok: false, error: `episodes[${i}].id is not a number` };
    if (!isString(ep.title)) return { ok: false, error: `episodes[${i}].title is not a string` };
    if (!isString(ep.content)) return { ok: false, error: `episodes[${i}].content is not a string` };
    if (ep.status !== undefined && !isString(ep.status)) {
      return { ok: false, error: `episodes[${i}].status is not a string` };
    }
  }

  return { ok: true };
};

export const validateSecretsPayload = (secrets: unknown): ValidationResult => {
  if (!isRecord(secrets)) return { ok: false, error: "secrets is not an object" };
  const keys = ["textApiKey", "multiApiKey", "videoApiKey"] as const;
  for (const key of keys) {
    const value = secrets[key];
    if (value !== undefined && !isString(value)) {
      return { ok: false, error: `${key} is not a string` };
    }
  }
  return { ok: true };
};

export const validateProjectDelta = (delta: unknown): ValidationResult => {
  if (!isRecord(delta)) return { ok: false, error: "delta is not an object" };

  if (delta.meta !== undefined) {
    if (!isRecord(delta.meta)) return { ok: false, error: "delta.meta is not an object" };
    const meta = delta.meta as Record<string, unknown>;
    const stringKeys = ["fileName", "rawScript", "dramaGuide", "globalStyleGuide"];
    for (const key of stringKeys) {
      if (meta[key] !== undefined && !isString(meta[key])) {
        return { ok: false, error: `delta.meta.${key} is not a string` };
      }
    }
    if (meta.designAssets !== undefined && !Array.isArray(meta.designAssets)) {
      return { ok: false, error: "delta.meta.designAssets is not an array" };
    }
    if (meta.nodeFlow !== undefined && !isRecord(meta.nodeFlow)) {
      return { ok: false, error: "delta.meta.nodeFlow is not an object" };
    }
    if (meta.nodeDefaults !== undefined && !isRecord(meta.nodeDefaults)) {
      return { ok: false, error: "delta.meta.nodeDefaults is not an object" };
    }
    if (meta.context !== undefined) {
      if (!isRecord(meta.context)) return { ok: false, error: "delta.meta.context is not an object" };
      const context = meta.context as Record<string, unknown>;
      if (context.projectSummary !== undefined && !isString(context.projectSummary)) {
        return { ok: false, error: "delta.meta.context.projectSummary is not a string" };
      }
      if (context.episodeSummaries !== undefined) {
        if (!Array.isArray(context.episodeSummaries)) return { ok: false, error: "delta.meta.context.episodeSummaries is not an array" };
      }
      if (context.roles !== undefined) {
        if (!Array.isArray(context.roles)) return { ok: false, error: "delta.meta.context.roles is not an array" };
      }
    }
  }

  if (delta.episodes !== undefined) {
    if (!Array.isArray(delta.episodes)) return { ok: false, error: "delta.episodes is not an array" };
    for (let i = 0; i < delta.episodes.length; i += 1) {
      const ep = delta.episodes[i];
      if (!isRecord(ep)) return { ok: false, error: `delta.episodes[${i}] is not an object` };
      if (!isNumber(ep.id)) return { ok: false, error: `delta.episodes[${i}].id is not a number` };
      if (!isString(ep.title)) return { ok: false, error: `delta.episodes[${i}].title is not a string` };
      if (!isString(ep.content)) return { ok: false, error: `delta.episodes[${i}].content is not a string` };
    }
  }

  if (delta.scenes !== undefined) {
    if (!Array.isArray(delta.scenes)) return { ok: false, error: "delta.scenes is not an array" };
    for (let i = 0; i < delta.scenes.length; i += 1) {
      const scene = delta.scenes[i];
      if (!isRecord(scene)) return { ok: false, error: `delta.scenes[${i}] is not an object` };
      if (!isNumber(scene.episodeId)) return { ok: false, error: `delta.scenes[${i}].episodeId is not a number` };
      if (!isString(scene.id)) return { ok: false, error: `delta.scenes[${i}].id is not a string` };
      if (!isString(scene.title)) return { ok: false, error: `delta.scenes[${i}].title is not a string` };
      if (!isString(scene.content)) return { ok: false, error: `delta.scenes[${i}].content is not a string` };
    }
  }

  if (delta.roles !== undefined) {
    if (!Array.isArray(delta.roles)) return { ok: false, error: "delta.roles is not an array" };
    for (let i = 0; i < delta.roles.length; i += 1) {
      const role = delta.roles[i];
      if (!isRecord(role)) return { ok: false, error: `delta.roles[${i}] is not an object` };
      if (!isString(role.id)) return { ok: false, error: `delta.roles[${i}].id is not a string` };
      if (!isString(role.name)) return { ok: false, error: `delta.roles[${i}].name is not a string` };
      if (!isString(role.mention)) return { ok: false, error: `delta.roles[${i}].mention is not a string` };
      if (!Array.isArray(role.portraits)) return { ok: false, error: `delta.roles[${i}].portraits is not an array` };
    }
  }

  if (delta.deleted !== undefined) {
    if (!isRecord(delta.deleted)) return { ok: false, error: "delta.deleted is not an object" };
  }

  return { ok: true };
};

export const validateProjectPatch = (patch: unknown): ValidationResult => {
  if (!isRecord(patch)) return { ok: false, error: "patch is not an object" };
  const set = patch.set;
  const unset = patch.unset;
  if (!isRecord(set)) return { ok: false, error: "patch.set is not an object" };
  if (!Array.isArray(unset)) return { ok: false, error: "patch.unset is not an array" };

  for (const key of Object.keys(set)) {
    if (!PROJECT_PATCH_KEYS.has(key)) {
      return { ok: false, error: `patch.set has invalid key: ${key}` };
    }
  }

  for (let i = 0; i < unset.length; i += 1) {
    const key = unset[i];
    if (!isString(key)) return { ok: false, error: `patch.unset[${i}] is not a string` };
    if (!PROJECT_PATCH_KEYS.has(key)) {
      return { ok: false, error: `patch.unset has invalid key: ${key}` };
    }
  }

  return { ok: true };
};
