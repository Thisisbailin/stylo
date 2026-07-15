import { ProjectData } from "../types";

export const FORCE_CLOUD_CLEAR_KEY = "stylo_force_cloud_clear";

export const dropFileReplacer = (_key: string, value: any) => {
  if (typeof File !== "undefined" && value instanceof File) return undefined;
  return value;
};

const hasUserFlowContent = (flow: ProjectData["flow"]) => {
  const nodes = Array.isArray(flow?.flowNodes) ? flow.flowNodes : [];
  const userNodeIds = new Set(
    nodes
      .filter((node) => {
        const data = node?.data as Record<string, unknown> | undefined;
        return typeof data?.foundationRole !== "string";
      })
      .map((node) => node.id),
  );
  const hasUserLinks = Array.isArray(flow?.links) && flow.links.some(
    (link) => userNodeIds.has(link.source) || userNodeIds.has(link.target),
  );
  return (
    userNodeIds.size > 0 ||
    hasUserLinks ||
    (Array.isArray(flow?.graphLinks) && flow.graphLinks.length > 0) ||
    (Array.isArray(flow?.globalAssetHistory) && flow.globalAssetHistory.length > 0)
  );
};

export const isProjectEmpty = (data: ProjectData) => {
  const hasEps = Array.isArray(data.episodes) && data.episodes.length > 0;
  const hasScript = !!(data.rawScript && data.rawScript.trim().length > 0);
  const hasDesignAssets = Array.isArray(data.designAssets) && data.designAssets.length > 0;
  const hasRoles = Array.isArray(data.roles) && data.roles.length > 0;
  const hasActiveFlowContent = hasUserFlowContent(data.flow);
  const hasFlowProjects =
    Array.isArray(data.flowProjects) &&
    data.flowProjects.some((project) => hasUserFlowContent(project?.flow));
  return !hasEps && !hasScript && !hasDesignAssets && !hasRoles && !hasActiveFlowContent && !hasFlowProjects;
};

export const backupData = (key: string, data: ProjectData) => {
  try {
    localStorage.setItem(key, JSON.stringify(data, dropFileReplacer));
  } catch (e) {
    console.warn(`Failed to backup data to ${key}`, e);
  }
};
