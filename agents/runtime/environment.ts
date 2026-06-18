import type { ProjectData, ProjectRoleIdentity } from "../../types";
import type { NodeFlowExecutionApprovalProposal } from "../../node-workspace/nodeflow/approvals";
import type { NodeFlowFile } from "../../node-workspace/types";
import type {
  AgentEnvironmentCapabilityManifest,
  AgentEnvironmentRecentAction,
  AgentSessionMessage,
  QalamAgentEnvironment,
} from "./types";
import { LIST_PROJECT_RESOURCE_TARGETS } from "../tools/listProjectResources";
import { READ_PROJECT_RESOURCE_TARGETS } from "../tools/readProjectResource";
import { SEARCH_PROJECT_RESOURCE_FACETS, SEARCH_PROJECT_RESOURCE_LAYERS } from "../tools/searchProjectResource";
import { OPERATE_NODEFLOW_TARGETS, OPERATE_NODEFLOW_NODE_KINDS } from "../tools/operateProjectResource";
import { buildScriptResourceLinks, buildScriptResourceNodes } from "../tools/scriptResources";

const ROLE_SUMMARY_LIMIT = 120;
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
    tools: ["find_documents", "read_document", "list_project_resources", "read_project_resource", "search_project_resource"],
    resources: [...LIST_PROJECT_RESOURCE_TARGETS, ...READ_PROJECT_RESOURCE_TARGETS],
    scopes: [...SEARCH_PROJECT_RESOURCE_LAYERS, ...SEARCH_PROJECT_RESOURCE_FACETS],
  },
  edit: {
    tools: ["create_document", "update_document"],
    resources: [...OPERATE_NODEFLOW_TARGETS],
  },
  operate: {
    tools: ["connect_flow_nodes", "move_flow_node", "operate_project_resource"],
    resources: [...OPERATE_NODEFLOW_TARGETS],
    nodeKinds: [...OPERATE_NODEFLOW_NODE_KINDS],
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
  nodeFlowSnapshot,
  executionApprovals,
  runtimeMode,
  enabledTools,
  sessionMessages,
}: {
  projectData: ProjectData;
  nodeFlowSnapshot: NodeFlowFile;
  executionApprovals?: NodeFlowExecutionApprovalProposal[];
  runtimeMode: "browser" | "edge_full";
  enabledTools: string[];
  sessionMessages?: AgentSessionMessage[];
}): QalamAgentEnvironment => {
  const roles = Array.isArray(projectData.roles) ? projectData.roles : [];
  const primaryRoles = sortRoles(roles.filter((role) => role.kind === "person"))
    .slice(0, MAX_PRIMARY_ROLES)
    .map(summarizeRole);
  const sceneRoles = sortRoles(roles.filter((role) => role.kind === "scene"))
    .slice(0, MAX_SCENE_ROLES)
    .map(summarizeRole);

  const scriptNodes = buildScriptResourceNodes(projectData, nodeFlowSnapshot);
  const scriptLinks = buildScriptResourceLinks(projectData, nodeFlowSnapshot);
  const documentNodeCount = scriptNodes.filter((node) => node.resourceType === "document_node").length;
  const archiveNodeCount = scriptNodes.filter((node) => node.resourceType === "archive_node").length;
  const folderNodeCount = scriptNodes.filter((node) => node.resourceType === "folder_node").length;

  const capabilityManifest = buildCapabilityManifest();
  const enabledToolSet = new Set(enabledTools);

  return {
    project: {
      fileName: projectData.fileName?.trim() || undefined,
      episodeCount: 0,
      sceneCount: 0,
      primaryRoles,
      sceneRoles,
      scriptCoverage: {
        primaryRoleCount: roles.filter((role) => role.kind === "person").length,
        sceneRoleCount: roles.filter((role) => role.kind === "scene").length,
        archiveCount: archiveNodeCount,
        folderNodeCount,
      },
      readingLayers: {
        script: {
          nodeCount: scriptNodes.length,
          linkCount: scriptLinks.length,
          documentNodeCount,
          archiveNodeCount,
          folderNodeCount,
        },
        nodeflow: {
          nodeCount: nodeFlowSnapshot.nodes.length,
          linkCount: nodeFlowSnapshot.links.length,
          graphLinkCount: (nodeFlowSnapshot.graphLinks || []).length,
        },
      },
      graphWorld: {
        centerSurface: "Nodes",
        planes: {
          front: "Flow",
          back: "Script",
        },
        actions: {
          read: {
            covers: ["script", "nodeflow"],
          },
          edit: {
            target: "script",
          },
          operate: {
            target: "nodeflow",
          },
        },
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
