import type { StyloAgentConfig, StyloResolvedSkill } from "./types";
import { listStyloToolNames } from "./toolCatalog";
import { normalizeStyloToolSettings } from "./toolSettings";

const STABILIZATION_DISABLED_TOOLS = [
  "ping_tool",
] as const;

export const buildDisabledTools = (
  config: Pick<StyloAgentConfig, "styloTools">,
  enabledSkills: Array<Pick<StyloResolvedSkill, "disabledTools">>
) => {
  const toolSettings = normalizeStyloToolSettings(config.styloTools);
  const disabledTools = enabledSkills.flatMap((skill) => skill?.disabledTools || []);
  disabledTools.push(...STABILIZATION_DISABLED_TOOLS);
  if (!toolSettings.projectData.enabled) {
    disabledTools.push(...listStyloToolNames(["project_read"]));
  }
  if (!toolSettings.runtimeIntelligence.enabled) {
    disabledTools.push(...listStyloToolNames(["runtime_read", "external_read"]));
  }
  if (!toolSettings.runtimeIntelligence.webSearchEnabled) {
    disabledTools.push("search_web");
  }
  if (!toolSettings.runtimeIntelligence.githubAccessEnabled) {
    disabledTools.push("access_github_repository");
  }
  if (!toolSettings.workflowBuilder.enabled) {
    disabledTools.push(...listStyloToolNames(["project_write", "generation_approval"]));
  }
  return Array.from(new Set(disabledTools));
};
