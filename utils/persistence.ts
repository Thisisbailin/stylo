import { ProjectData } from "../types";

export const FORCE_CLOUD_CLEAR_KEY = "stylo_force_cloud_clear";

export const dropFileReplacer = (_key: string, value: any) => {
  if (typeof File !== "undefined" && value instanceof File) return undefined;
  return value;
};

export const isProjectEmpty = (data: ProjectData) => {
  const hasEps = Array.isArray(data.episodes) && data.episodes.length > 0;
  const hasScript = !!(data.rawScript && data.rawScript.trim().length > 0);
  const hasDesignAssets = Array.isArray(data.designAssets) && data.designAssets.length > 0;
  const hasRoles = Array.isArray(data.roles) && data.roles.length > 0;
  const hasActiveFlowNodes = Array.isArray(data.flow?.flowNodes) && data.flow.flowNodes.length > 0;
  const hasActiveFlowLinks =
    (Array.isArray(data.flow?.links) && data.flow.links.length > 0) ||
    (Array.isArray(data.flow?.graphLinks) && data.flow.graphLinks.length > 0);
  const hasActiveFlowAssets =
    Array.isArray(data.flow?.globalAssetHistory) && data.flow.globalAssetHistory.length > 0;
  const hasFlowProjects =
    Array.isArray(data.flowProjects) &&
    data.flowProjects.some((project) => {
      const flow = project?.flow;
      return (
        (Array.isArray(flow?.flowNodes) && flow.flowNodes.length > 0) ||
        (Array.isArray(flow?.links) && flow.links.length > 0) ||
        (Array.isArray(flow?.graphLinks) && flow.graphLinks.length > 0) ||
        (Array.isArray(flow?.globalAssetHistory) && flow.globalAssetHistory.length > 0)
      );
    });
  return !hasEps && !hasScript && !hasDesignAssets && !hasRoles && !hasActiveFlowNodes && !hasActiveFlowLinks && !hasActiveFlowAssets && !hasFlowProjects;
};

export const backupData = (key: string, data: ProjectData) => {
  try {
    localStorage.setItem(key, JSON.stringify(data, dropFileReplacer));
  } catch (e) {
    console.warn(`Failed to backup data to ${key}`, e);
  }
};
