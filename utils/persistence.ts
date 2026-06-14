import { ProjectData } from "../types";

export const FORCE_CLOUD_CLEAR_KEY = "qalam_force_cloud_clear";

export const dropFileReplacer = (_key: string, value: any) => {
  if (typeof File !== "undefined" && value instanceof File) return undefined;
  return value;
};

export const isProjectEmpty = (data: ProjectData) => {
  const hasEps = Array.isArray(data.episodes) && data.episodes.length > 0;
  const hasScript = !!(data.rawScript && data.rawScript.trim().length > 0);
  const hasDesignAssets = Array.isArray(data.designAssets) && data.designAssets.length > 0;
  const hasRoles = Array.isArray(data.roles) && data.roles.length > 0;
  return !hasEps && !hasScript && !hasDesignAssets && !hasRoles;
};

export const backupData = (key: string, data: ProjectData) => {
  try {
    localStorage.setItem(key, JSON.stringify(data, dropFileReplacer));
  } catch (e) {
    console.warn(`Failed to backup data to ${key}`, e);
  }
};
