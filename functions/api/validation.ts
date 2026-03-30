import { SHOT_REQUIRED_STRING_KEYS } from "../../utils/shotSchema";

type ValidationResult = { ok: true } | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

const PROJECT_PATCH_KEYS = new Set([
  "fileName",
  "rawScript",
  "episodes",
  "context",
  "contextUsage",
  "phase1Usage",
  "phase4Usage",
  "phase5Usage",
  "shotGuide",
  "soraGuide",
  "storyboardGuide",
  "dramaGuide",
  "globalStyleGuide",
  "designAssets",
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
    if (!Array.isArray(ep.shots)) return { ok: false, error: `episodes[${i}].shots is not an array` };

    for (let j = 0; j < ep.shots.length; j += 1) {
      const shot = ep.shots[j];
      if (!isRecord(shot)) return { ok: false, error: `episodes[${i}].shots[${j}] is not an object` };
      const required = SHOT_REQUIRED_STRING_KEYS;
      for (const key of required) {
        if (!isString(shot[key])) {
          return { ok: false, error: `episodes[${i}].shots[${j}].${key} is not a string` };
        }
      }
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
    const stringKeys = ["fileName", "rawScript", "shotGuide", "soraGuide", "storyboardGuide", "dramaGuide", "globalStyleGuide"];
    for (const key of stringKeys) {
      if (meta[key] !== undefined && !isString(meta[key])) {
        return { ok: false, error: `delta.meta.${key} is not a string` };
      }
    }
    if (meta.designAssets !== undefined && !Array.isArray(meta.designAssets)) {
      return { ok: false, error: "delta.meta.designAssets is not an array" };
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
      if (context.characters !== undefined) {
        if (!Array.isArray(context.characters)) return { ok: false, error: "delta.meta.context.characters is not an array" };
      }
      if (context.locations !== undefined) {
        if (!Array.isArray(context.locations)) return { ok: false, error: "delta.meta.context.locations is not an array" };
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

  if (delta.shots !== undefined) {
    if (!Array.isArray(delta.shots)) return { ok: false, error: "delta.shots is not an array" };
    for (let i = 0; i < delta.shots.length; i += 1) {
      const shot = delta.shots[i];
      if (!isRecord(shot)) return { ok: false, error: `delta.shots[${i}] is not an object` };
      if (!isNumber(shot.episodeId)) return { ok: false, error: `delta.shots[${i}].episodeId is not a number` };
      const required = SHOT_REQUIRED_STRING_KEYS;
      for (const key of required) {
        if (!isString(shot[key])) {
          return { ok: false, error: `delta.shots[${i}].${key} is not a string` };
        }
      }
    }
  }

  if (delta.characters !== undefined) {
    if (!Array.isArray(delta.characters)) return { ok: false, error: "delta.characters is not an array" };
    for (let i = 0; i < delta.characters.length; i += 1) {
      const char = delta.characters[i];
      if (!isRecord(char)) return { ok: false, error: `delta.characters[${i}] is not an object` };
      if (!isString(char.id)) return { ok: false, error: `delta.characters[${i}].id is not a string` };
      if (!isString(char.name)) return { ok: false, error: `delta.characters[${i}].name is not a string` };
      if (!isString(char.role)) return { ok: false, error: `delta.characters[${i}].role is not a string` };
      if (!isBoolean(char.isMain)) return { ok: false, error: `delta.characters[${i}].isMain is not a boolean` };
      if (!isString(char.bio)) return { ok: false, error: `delta.characters[${i}].bio is not a string` };
    }
  }

  if (delta.locations !== undefined) {
    if (!Array.isArray(delta.locations)) return { ok: false, error: "delta.locations is not an array" };
    for (let i = 0; i < delta.locations.length; i += 1) {
      const loc = delta.locations[i];
      if (!isRecord(loc)) return { ok: false, error: `delta.locations[${i}] is not an object` };
      if (!isString(loc.id)) return { ok: false, error: `delta.locations[${i}].id is not a string` };
      if (!isString(loc.name)) return { ok: false, error: `delta.locations[${i}].name is not a string` };
      if (!isString(loc.type)) return { ok: false, error: `delta.locations[${i}].type is not a string` };
      if (!isString(loc.description)) return { ok: false, error: `delta.locations[${i}].description is not a string` };
      if (!isString(loc.visuals)) return { ok: false, error: `delta.locations[${i}].visuals is not a string` };
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
