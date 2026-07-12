import type { ProjectData } from "../../types";

export const DEFAULT_QALAM_PROJECT_ID = "flow-project-main";
export const QALAM_CONVERSATION_STORAGE_PREFIX = "qalam_conversations_v2";
export const QALAM_ACTIVITY_STORAGE_PREFIX = "qalam_agent_tool_activity_v2";

const normalizeScopePart = (value: string | undefined, fallback: string) => {
  const normalized = (value || "").trim();
  return normalized || fallback;
};

const encodeScopePart = (value: string) => encodeURIComponent(value);

export const resolveQalamProjectId = (projectData: Pick<ProjectData, "activeFlowProjectId" | "flowProjects">) =>
  normalizeScopePart(
    projectData.activeFlowProjectId || projectData.flowProjects?.[0]?.id,
    DEFAULT_QALAM_PROJECT_ID
  );

export const buildQalamScopedProjectData = (projectData: ProjectData, projectId: string): ProjectData => {
  const normalizedProjectId = assertQalamProjectScope(projectId, projectData);
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

export const buildQalamConversationStorageKey = (projectId: string) =>
  `${QALAM_CONVERSATION_STORAGE_PREFIX}:${encodeScopePart(normalizeScopePart(projectId, DEFAULT_QALAM_PROJECT_ID))}`;

export const buildQalamActivityStorageKey = (projectId: string) =>
  `${QALAM_ACTIVITY_STORAGE_PREFIX}:${encodeScopePart(normalizeScopePart(projectId, DEFAULT_QALAM_PROJECT_ID))}`;

export const buildQalamSessionPrefix = (projectId: string) =>
  `qalam:${encodeScopePart(normalizeScopePart(projectId, DEFAULT_QALAM_PROJECT_ID))}:`;

export const buildQalamSessionId = (projectId: string, conversationId: string) =>
  `${buildQalamSessionPrefix(projectId)}${encodeScopePart(normalizeScopePart(conversationId, "default"))}`;

const qualifyQalamAccountScopePart = (
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
export const buildQalamAccountStorageKeys = (accountScope: string, projectId: string) => {
  const storageProjectScope = qualifyQalamAccountScopePart(
    accountScope,
    projectId,
    DEFAULT_QALAM_PROJECT_ID
  );
  return {
    conversationStorageKey: buildQalamConversationStorageKey(storageProjectScope),
    activityStorageKey: buildQalamActivityStorageKey(storageProjectScope),
  };
};

/**
 * Server sessions remain project-scoped for bridge validation, while the
 * conversation segment carries the account scope used by the local UI.
 */
export const buildQalamAccountSessionId = (
  accountScope: string,
  projectId: string,
  conversationId: string
) =>
  buildQalamSessionId(
    projectId,
    qualifyQalamAccountScopePart(accountScope, conversationId, "default")
  );

export const isQalamSessionInProject = (sessionId: string, projectId: string) =>
  sessionId.startsWith(buildQalamSessionPrefix(projectId));

export const assertQalamProjectScope = (projectId: string, projectData?: Pick<ProjectData, "activeFlowProjectId">) => {
  const normalizedProjectId = normalizeScopePart(projectId, "");
  if (!normalizedProjectId) {
    throw new Error("Qalam 请求缺少 projectId，已拒绝执行以避免跨项目混淆。");
  }
  const activeProjectId = (projectData?.activeFlowProjectId || "").trim();
  if (activeProjectId && activeProjectId !== normalizedProjectId) {
    throw new Error(
      `Qalam 项目作用域不匹配：请求项目 ${normalizedProjectId}，当前快照项目 ${activeProjectId}。`
    );
  }
  return normalizedProjectId;
};
