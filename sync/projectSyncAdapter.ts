import type { ProjectData } from "../types";
import { computeProjectDelta, isDeltaEmpty } from "../utils/delta";
import { dropFileReplacer, isProjectEmpty } from "../utils/persistence";
import { normalizeProjectData } from "../utils/projectData";
import { toCloudProjectData } from "../utils/cloudProjectData";
import { validateProjectData } from "../utils/validation";
import {
  AccountApiSession,
  parseJsonResponse,
  requireOkResponse,
} from "./authenticatedFetch";
import type {
  VersionedSaveResult,
  VersionedSyncCodec,
  VersionedSyncTransport,
} from "./versionedSyncEngine";

type ProjectResponse = {
  projectData?: ProjectData | { projectData?: ProjectData };
  updatedAt?: number;
  projectRevision?: number | null;
  error?: string;
};

const hashString = (value: string) => {
  let left = 2166136261;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 16777619);
    right = Math.imul(right ^ code, 2246822519);
  }
  return `${(left >>> 0).toString(36)}:${(right >>> 0).toString(36)}:${value.length}`;
};

const serializeCloudProject = (value: ProjectData) =>
  JSON.stringify(toCloudProjectData(value), dropFileReplacer) || "{}";

const unwrapProjectData = (value: ProjectResponse["projectData"]) => {
  if (!value || typeof value !== "object") return null;
  return "projectData" in value && value.projectData
    ? value.projectData
    : value as ProjectData;
};

export const readActiveFlowRevision = (data: ProjectData | null | undefined) => {
  if (!data) return null;
  const activeProject = Array.isArray(data.flowProjects)
    ? data.flowProjects.find((project) => project.id === data.activeFlowProjectId) || data.flowProjects[0]
    : undefined;
  const revision = activeProject?.flow?.revision ?? data.flow?.revision;
  return typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0
    ? revision
    : null;
};

export const projectSyncCodec: VersionedSyncCodec<ProjectData> = {
  snapshot(value) {
    return normalizeProjectData(JSON.parse(serializeCloudProject(value)) as ProjectData);
  },
  fingerprint(value) {
    return hashString(serializeCloudProject(value));
  },
  validate(value) {
    const validation = validateProjectData(value);
    return validation.ok ? null : `项目数据未通过同步校验：${validation.error}`;
  },
  isEmpty: isProjectEmpty,
  revision: readActiveFlowRevision,
};

export const createProjectSyncTransport = (
  session: AccountApiSession
): VersionedSyncTransport<ProjectData> => ({
  async load(signal) {
    const response = await session.request("/api/project", {}, signal);
    if (response.status === 404) return null;
    await requireOkResponse(response, "加载云端项目失败");
    const payload = await parseJsonResponse<ProjectResponse>(response, "加载云端项目失败");
    const project = unwrapProjectData(payload.projectData);
    if (!project || typeof payload.updatedAt !== "number") {
      throw new Error("云端项目响应缺少 projectData 或 updatedAt。");
    }
    const normalized = normalizeProjectData(project);
    return {
      value: normalized,
      version: payload.updatedAt,
      revision: typeof payload.projectRevision === "number"
        ? payload.projectRevision
        : readActiveFlowRevision(normalized),
    };
  },

  async save(request, signal): Promise<VersionedSaveResult<ProjectData>> {
    const delta = request.forceFull
      ? undefined
      : computeProjectDelta(request.value, request.baseValue);
    if (delta && isDeltaEmpty(delta)) {
      return {
        kind: "saved",
        version: request.baseVersion,
        revision: readActiveFlowRevision(request.value),
      };
    }
    const projectRevision = readActiveFlowRevision(request.value);
    const body = delta
      ? {
          delta,
          updatedAt: request.baseVersion,
          opId: request.operationId,
          projectRevision,
        }
      : {
          projectData: request.value,
          updatedAt: request.baseVersion,
          opId: request.operationId,
          projectRevision,
        };
    const response = await session.request("/api/project", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "if-match": String(request.baseVersion),
      },
      body: JSON.stringify(body, dropFileReplacer),
    }, signal);

    if (response.status === 409) {
      const payload = await parseJsonResponse<ProjectResponse>(response, "读取项目冲突失败");
      const remote = unwrapProjectData(payload.projectData);
      if (!remote || typeof payload.updatedAt !== "number") {
        throw new Error("项目冲突响应缺少远端快照或版本号。");
      }
      const normalized = normalizeProjectData(remote);
      return {
        kind: "conflict",
        remote: {
          value: normalized,
          version: payload.updatedAt,
          revision: typeof payload.projectRevision === "number"
            ? payload.projectRevision
            : readActiveFlowRevision(normalized),
        },
      };
    }

    await requireOkResponse(response, "保存云端项目失败");
    const payload = await parseJsonResponse<ProjectResponse & { ok?: boolean }>(response, "保存云端项目失败");
    if (payload.ok !== true || typeof payload.updatedAt !== "number") {
      throw new Error("云端项目保存响应缺少确认版本号。");
    }
    return {
      kind: "saved",
      version: payload.updatedAt,
      revision: typeof payload.projectRevision === "number" ? payload.projectRevision : null,
    };
  },
});
