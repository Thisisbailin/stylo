import type { ProjectData, ProjectRoleIdentity } from "../../types";
import type { NodeFlowExecutionApprovalProposal } from "../../node-workspace/nodeflow/approvals";
import type {
  AgentEnvironmentCapabilityManifest,
  AgentEnvironmentRecentAction,
  AgentSessionMessage,
  QalamAgentEnvironment,
} from "./types";
import { LIST_PROJECT_RESOURCE_TYPES } from "../tools/listProjectResources";
import { READ_PROJECT_RESOURCE_TYPES } from "../tools/readProjectResource";
import { SEARCH_PROJECT_RESOURCE_SCOPES } from "../tools/searchProjectResource";
import { EDIT_PROJECT_RESOURCE_TYPES } from "../tools/editUnderstandingResource";
import { OPERATE_PROJECT_RESOURCE_TYPES, OPERATE_WORKFLOW_NODE_KINDS } from "../tools/operateProjectResource";

const PROJECT_SUMMARY_LIMIT = 480;
const EPISODE_SUMMARY_LIMIT = 200;
const ROLE_SUMMARY_LIMIT = 120;
const MAX_EPISODE_SUMMARIES = 6;
const MAX_PRIMARY_ROLES = 8;
const MAX_SCENE_ROLES = 8;
const MAX_RECENT_ACTIONS = 6;

const clipText = (value: string | undefined, limit: number) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit)}...`;
};

const summarizeRole = (role: ProjectRoleIdentity) => ({
  id: role.id,
  mention: role.mention,
  displayName: role.displayName || `@${role.mention}`,
  summary: clipText(role.summary || role.description || "", ROLE_SUMMARY_LIMIT),
  episodeUsage: role.episodeUsage?.trim() || undefined,
});

const sortRoles = (roles: ProjectRoleIdentity[]) =>
  [...roles].sort((a, b) => {
    const score = (item: ProjectRoleIdentity) => Number(!!item.isMain) * 4 + Number(!!item.isCore) * 3;
    return score(b) - score(a) || a.displayName.localeCompare(b.displayName, "zh-Hans-CN");
  });

const buildCapabilityManifest = (): AgentEnvironmentCapabilityManifest => ({
  read: {
    tools: ["list_project_resources", "read_project_resource", "search_project_resource"],
    resources: [...LIST_PROJECT_RESOURCE_TYPES, ...READ_PROJECT_RESOURCE_TYPES],
    scopes: [...SEARCH_PROJECT_RESOURCE_SCOPES],
  },
  edit: {
    tools: ["edit_project_resource"],
    resources: [...EDIT_PROJECT_RESOURCE_TYPES],
  },
  operate: {
    tools: ["operate_project_resource"],
    resources: [...OPERATE_PROJECT_RESOURCE_TYPES],
    nodeKinds: [...OPERATE_WORKFLOW_NODE_KINDS],
  },
});

export const summarizeRecentSuccessfulActions = (messages: AgentSessionMessage[] | undefined): AgentEnvironmentRecentAction[] => {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  return messages
    .filter(
      (message): message is Extract<AgentSessionMessage, { role: "tool" }> =>
        message.role === "tool" && message.toolStatus === "success"
    )
    .slice(-MAX_RECENT_ACTIONS)
    .reverse()
    .map((message) => ({
      toolName: message.toolName,
      summary: clipText(message.text || "", 180) || message.toolName,
      createdAt: message.createdAt,
    }));
};

export const buildAgentEnvironment = ({
  projectData,
  executionApprovals,
  runtimeMode,
  enabledTools,
  sessionMessages,
}: {
  projectData: ProjectData;
  executionApprovals?: NodeFlowExecutionApprovalProposal[];
  runtimeMode: "browser" | "edge_full";
  enabledTools: string[];
  sessionMessages?: AgentSessionMessage[];
}): QalamAgentEnvironment => {
  const roles = Array.isArray(projectData.context?.roles) ? projectData.context.roles : [];
  const primaryRoles = sortRoles(roles.filter((role) => role.kind === "person"))
    .slice(0, MAX_PRIMARY_ROLES)
    .map(summarizeRole);
  const sceneRoles = sortRoles(roles.filter((role) => role.kind === "scene"))
    .slice(0, MAX_SCENE_ROLES)
    .map(summarizeRole);

  const episodeSummaries = (projectData.context?.episodeSummaries || [])
    .filter((entry) => typeof entry?.episodeId === "number" && (entry.summary || "").trim())
    .sort((a, b) => a.episodeId - b.episodeId)
    .slice(0, MAX_EPISODE_SUMMARIES)
    .map((entry) => {
      const episode = (projectData.episodes || []).find((item) => item.id === entry.episodeId);
      return {
        episodeId: entry.episodeId,
        label: episode?.title?.trim() || `第${entry.episodeId}集`,
        summary: clipText(entry.summary, EPISODE_SUMMARY_LIMIT),
      };
    });

  const capabilityManifest = buildCapabilityManifest();
  const enabledToolSet = new Set(enabledTools);

  return {
    project: {
      fileName: projectData.fileName?.trim() || undefined,
      episodeCount: (projectData.episodes || []).length,
      projectSummary: clipText(projectData.context?.projectSummary, PROJECT_SUMMARY_LIMIT) || undefined,
      episodeSummaries,
      primaryRoles,
      sceneRoles,
      knowledgeCoverage: {
        hasProjectSummary: Boolean(projectData.context?.projectSummary?.trim()),
        episodeSummaryCount: (projectData.context?.episodeSummaries || []).filter((item) => item.summary?.trim()).length,
        primaryRoleCount: roles.filter((role) => role.kind === "person").length,
        sceneRoleCount: roles.filter((role) => role.kind === "scene").length,
      },
    },
    capabilityManifest,
    executionApprovals: {
      pendingCount: (executionApprovals || []).length,
      pendingNodeTitles: (executionApprovals || [])
        .slice(0, 8)
        .map((item) => item.nodeTitle)
        .filter(Boolean),
    },
    runtimeCapabilities: {
      runtimeMode,
      enabledTools,
      canRead: capabilityManifest.read.tools.some((tool) => enabledToolSet.has(tool)),
      canEdit: capabilityManifest.edit.tools.some((tool) => enabledToolSet.has(tool)),
      canOperate: capabilityManifest.operate.tools.some((tool) => enabledToolSet.has(tool)),
    },
    recentSuccessfulActions: summarizeRecentSuccessfulActions(sessionMessages),
  };
};
