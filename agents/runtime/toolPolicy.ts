import type { QalamAgentConfig, QalamResolvedSkill } from "./types";
import { listQalamToolNames } from "./toolCatalog";
import { normalizeQalamToolSettings } from "./toolSettings";

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
    disabledTools.push(...listQalamToolNames(["project_read"]));
  }
  if (!toolSettings.runtimeIntelligence.enabled) {
    disabledTools.push(...listQalamToolNames(["runtime_read", "external_read"]));
  }
  if (!toolSettings.runtimeIntelligence.webSearchEnabled) {
    disabledTools.push("search_web");
  }
  if (!toolSettings.runtimeIntelligence.githubAccessEnabled) {
    disabledTools.push("access_github_repository");
  }
  if (!toolSettings.workflowBuilder.enabled) {
    disabledTools.push(...listQalamToolNames(["project_write", "generation_approval"]));
  }
  return Array.from(new Set(disabledTools));
};
