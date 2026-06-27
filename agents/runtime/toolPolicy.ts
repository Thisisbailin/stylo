import { normalizeQalamToolSettings } from "../../node-workspace/components/qalam/tooling";
import type { QalamAgentConfig, QalamResolvedSkill } from "./types";

const STABILIZATION_DISABLED_TOOLS = [
  "ping_tool",
] as const;

export const buildDisabledTools = (
  config: Pick<QalamAgentConfig, "qalamTools">,
  enabledSkills: Array<Pick<QalamResolvedSkill, "disabledTools">>
) => {
  const toolSettings = normalizeQalamToolSettings(config.qalamTools);
  const disabledTools = enabledSkills.flatMap((skill) => skill?.disabledTools || []);
  disabledTools.push(...STABILIZATION_DISABLED_TOOLS);
  if (!toolSettings.projectData.enabled) {
    disabledTools.push(
      "find_documents",
      "read_document",
      "list_project_resources",
      "read_project_resource",
      "search_project_resource"
    );
  }
  if (!toolSettings.runtimeIntelligence.enabled) {
    disabledTools.push("read_runtime_manual", "access_github_repository", "search_web");
  }
  if (!toolSettings.runtimeIntelligence.webSearchEnabled) {
    disabledTools.push("search_web");
  }
  if (!toolSettings.runtimeIntelligence.githubAccessEnabled) {
    disabledTools.push("access_github_repository");
  }
  if (!toolSettings.workflowBuilder.enabled) {
    disabledTools.push(
      "create_document",
      "update_document",
      "connect_flow_nodes",
      "move_flow_node",
      "operate_project_resource"
    );
  }
  return Array.from(new Set(disabledTools));
};
