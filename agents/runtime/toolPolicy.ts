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
      "list_project_resources",
      "read_project_resource",
      "search_project_resource"
    );
  }
  if (!toolSettings.workflowBuilder.enabled) {
    disabledTools.push("operate_project_resource");
  }
  return Array.from(new Set(disabledTools));
};
