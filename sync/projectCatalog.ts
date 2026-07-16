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

const createDeleteSessionId = () => globalThis.crypto?.randomUUID?.() ||
  `delete-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

export const deleteCloudProject = async (
  session: AccountApiSession,
  projectId: string,
  activeLeaseId?: string,
) => {
  const sessionId = createDeleteSessionId();
  let leaseId = activeLeaseId || "";
  const ownsTemporaryLease = !leaseId;
  if (ownsTemporaryLease) {
    const acquireResponse = await session.request("/api/project-lease", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "acquire",
        projectId,
        sessionId,
        clientLabel: "Stylo · 删除项目",
      }),
    });
    const payload = await parseJsonResponse<{ leaseId?: string; owner?: { clientLabel?: string } }>(
      acquireResponse,
      "取得项目删除权失败",
    );
    if (!acquireResponse.ok || !payload.leaseId) {
      const owner = payload.owner?.clientLabel;
      throw new Error(owner ? `该项目正在由 ${owner} 编辑，暂时不能删除。` : "该项目当前不能删除。");
    }
    leaseId = payload.leaseId;
  }

  try {
    const response = await session.request(`/api/account-data-reset?projectId=${encodeURIComponent(projectId)}`, {
      method: "DELETE",
      headers: { "x-project-edit-lease": leaseId },
    });
    await requireOkResponse(response, "删除云端项目失败");
  } finally {
    if (ownsTemporaryLease && leaseId) {
      await session.request("/api/project-lease", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "release", projectId, sessionId, leaseId }),
      }).catch(() => undefined);
    }
  }
};
