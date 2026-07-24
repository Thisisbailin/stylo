import type { ProjectData } from "../types";
import { mergeStyloScopedProjectData } from "../agents/runtime/projectScope";
import { normalizeProjectData } from "../utils/projectData";
import type { AccountApiSession } from "./authenticatedFetch";
import { parseJsonResponse, requireOkResponse } from "./authenticatedFetch";

export type CloudProjectCatalogEntry = {
  projectId: string;
  title: string;
  updatedAt: number;
};

export const loadCloudProjectCatalog = async (session: AccountApiSession) => {
  const response = await session.request("/api/projects");
  await requireOkResponse(response, "加载云端项目目录失败");
  const payload = await parseJsonResponse<{ projects?: CloudProjectCatalogEntry[] }>(
    response,
    "加载云端项目目录失败",
  );
  return Array.isArray(payload.projects) ? payload.projects.slice(0, 100) : [];
};

export const loadCloudProject = async (session: AccountApiSession, projectId: string) => {
  const response = await session.request(`/api/project?projectId=${encodeURIComponent(projectId)}`);
  if (response.status === 404) return null;
  await requireOkResponse(response, "加载云端项目失败");
  const payload = await parseJsonResponse<{ projectData?: ProjectData | { projectData?: ProjectData } }>(
    response,
    "加载云端项目失败",
  );
  const candidate = payload.projectData && "projectData" in payload.projectData
    ? payload.projectData.projectData
    : payload.projectData;
  return candidate ? normalizeProjectData(candidate) : null;
};

export const mergeMissingCloudProjects = (
  local: ProjectData,
  remoteProjects: Array<{ projectId: string; data: ProjectData }>,
) => remoteProjects.reduce(
  (current, remote) => mergeStyloScopedProjectData(current, remote.data, remote.projectId),
  local,
);

export const deleteCloudProject = async (
  session: AccountApiSession,
  projectId: string,
) => {
  const response = await session.request(`/api/project-delete?projectId=${encodeURIComponent(projectId)}`, {
    method: "DELETE",
  });
  await requireOkResponse(response, "永久删除项目失败");
};
