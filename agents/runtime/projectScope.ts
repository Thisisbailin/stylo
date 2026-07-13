import type { ProjectData } from "../../types";

export const DEFAULT_STYLO_PROJECT_ID = "flow-project-main";
export const STYLO_CONVERSATION_STORAGE_PREFIX = "stylo_conversations_v2";
export const STYLO_ACTIVITY_STORAGE_PREFIX = "stylo_agent_tool_activity_v2";

const normalizeScopePart = (value: string | undefined, fallback: string) => {
  const normalized = (value || "").trim();
  return normalized || fallback;
};

const encodeScopePart = (value: string) => encodeURIComponent(value);

export const resolveStyloProjectId = (projectData: Pick<ProjectData, "activeFlowProjectId" | "flowProjects">) =>
  normalizeScopePart(
    projectData.activeFlowProjectId || projectData.flowProjects?.[0]?.id,
    DEFAULT_STYLO_PROJECT_ID
  );

export const buildStyloScopedProjectData = (projectData: ProjectData, projectId: string): ProjectData => {
  const normalizedProjectId = assertStyloProjectScope(projectId, projectData);
  const activeProject = projectData.flowProjects?.find((project) => project.id === normalizedProjectId);
  const scopedFlow = activeProject?.flow || projectData.flow;
  return {
    ...projectData,
    activeFlowProjectId: normalizedProjectId,
    flow: scopedFlow,
    roles: projectData.roles || [],
    designAssets: projectData.designAssets || [],
    flowProjects: activeProject
      ? [{ ...activeProject, flow: scopedFlow || activeProject.flow }]
      : projectData.flowProjects?.filter((project) => project.id === normalizedProjectId),
  };
};

export const buildStyloConversationStorageKey = (projectId: string) =>
  `${STYLO_CONVERSATION_STORAGE_PREFIX}:${encodeScopePart(normalizeScopePart(projectId, DEFAULT_STYLO_PROJECT_ID))}`;

export const buildStyloActivityStorageKey = (projectId: string) =>
  `${STYLO_ACTIVITY_STORAGE_PREFIX}:${encodeScopePart(normalizeScopePart(projectId, DEFAULT_STYLO_PROJECT_ID))}`;

export const buildStyloSessionPrefix = (projectId: string) =>
  `stylo:${encodeScopePart(normalizeScopePart(projectId, DEFAULT_STYLO_PROJECT_ID))}:`;

export const buildStyloSessionId = (projectId: string, conversationId: string) =>
  `${buildStyloSessionPrefix(projectId)}${encodeScopePart(normalizeScopePart(conversationId, "default"))}`;

const qualifyStyloAccountScopePart = (
  accountScope: string,
  value: string | undefined,
  fallback: string
) => {
  const normalizedAccountScope = normalizeScopePart(accountScope, "guest");
  const normalizedValue = normalizeScopePart(value, fallback);
  return `${normalizedAccountScope}:${normalizedValue}`;
};

/**
 * Local Agent records are account data. Keep their storage namespace distinct
 * even when two Clerk accounts use the same project id on the same device.
 */
export const buildStyloAccountStorageKeys = (accountScope: string, projectId: string) => {
  const storageProjectScope = qualifyStyloAccountScopePart(
    accountScope,
    projectId,
    DEFAULT_STYLO_PROJECT_ID
  );
  return {
    conversationStorageKey: buildStyloConversationStorageKey(storageProjectScope),
    activityStorageKey: buildStyloActivityStorageKey(storageProjectScope),
  };
};

/**
 * Server sessions remain project-scoped for bridge validation, while the
 * conversation segment carries the account scope used by the local UI.
 */
export const buildStyloAccountSessionId = (
  accountScope: string,
  projectId: string,
  conversationId: string
) =>
  buildStyloSessionId(
    projectId,
    qualifyStyloAccountScopePart(accountScope, conversationId, "default")
  );

export const buildStyloAccountSessionPrefix = (
  accountScope: string,
  projectId: string
) =>
  `${buildStyloSessionPrefix(projectId)}${encodeScopePart(normalizeScopePart(accountScope, "guest"))}%3A`;

export const isStyloAccountSessionInProject = (
  sessionId: string,
  accountScope: string,
  projectId: string
) => sessionId.startsWith(buildStyloAccountSessionPrefix(accountScope, projectId));

export const isStyloSessionInProject = (sessionId: string, projectId: string) =>
  sessionId.startsWith(buildStyloSessionPrefix(projectId));

export const assertStyloProjectScope = (projectId: string, projectData?: Pick<ProjectData, "activeFlowProjectId">) => {
  const normalizedProjectId = normalizeScopePart(projectId, "");
  if (!normalizedProjectId) {
    throw new Error("Stylo 请求缺少 projectId，已拒绝执行以避免跨项目混淆。");
  }
  const activeProjectId = (projectData?.activeFlowProjectId || "").trim();
  if (activeProjectId && activeProjectId !== normalizedProjectId) {
    throw new Error(
      `Stylo 项目作用域不匹配：请求项目 ${normalizedProjectId}，当前快照项目 ${activeProjectId}。`
    );
  }
  return normalizedProjectId;
};
