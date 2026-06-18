import { ProjectData } from "../types";

export type ProjectPatch = {
  set: Record<string, unknown>;
  unset: string[];
};

const PROJECT_PATCH_KEYS = [
  "fileName",
  "rawScript",
  "episodes",
  "roles",
  "designAssets",
  "canvas",
  "flow",
  "activeFlowProjectId",
  "flowProjects",
  "phase5Usage",
  "stats"
] as const;

const stableStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
};

export const computeProjectPatch = (current: ProjectData, base: ProjectData | null): ProjectPatch => {
  if (!base) {
    const set: Record<string, unknown> = {};
    PROJECT_PATCH_KEYS.forEach((key) => {
      set[key] = (current as any)[key];
    });
    return { set, unset: [] };
  }

  const set: Record<string, unknown> = {};
  const unset: string[] = [];

  PROJECT_PATCH_KEYS.forEach((key) => {
    const currentValue = (current as any)[key];
    const baseValue = (base as any)[key];
    const currentMissing = typeof currentValue === "undefined";
    const baseMissing = typeof baseValue === "undefined";

    if (currentMissing && !baseMissing) {
      unset.push(key);
      return;
    }
    if (!currentMissing && baseMissing) {
      set[key] = currentValue;
      return;
    }
    if (stableStringify(currentValue) !== stableStringify(baseValue)) {
      set[key] = currentValue;
    }
  });

  return { set, unset };
};

export const applyProjectPatch = (base: ProjectData | null, patch: ProjectPatch): ProjectData => {
  const baseData = base && typeof base === "object" ? base : ({} as ProjectData);
  const next = { ...baseData } as ProjectData;
  for (const [key, value] of Object.entries(patch.set)) {
    (next as any)[key] = value;
  }
  for (const key of patch.unset) {
    delete (next as any)[key];
  }
  return next;
};
