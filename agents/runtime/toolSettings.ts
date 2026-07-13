import type { QalamToolSettings } from "../../types";

export type NormalizedQalamToolSettings = {
  projectData: { enabled: boolean };
  workflowBuilder: { enabled: boolean };
  runtimeIntelligence: {
    enabled: boolean;
    webSearchEnabled: boolean;
    githubAccessEnabled: boolean;
  };
};

export const normalizeQalamToolSettings = (
  value: QalamToolSettings | undefined
): NormalizedQalamToolSettings => ({
  projectData: {
    enabled: value?.projectData?.enabled ?? true,
  },
  workflowBuilder: {
    enabled: value?.workflowBuilder?.enabled ?? true,
  },
  runtimeIntelligence: {
    enabled: value?.runtimeIntelligence?.enabled ?? true,
    webSearchEnabled: value?.runtimeIntelligence?.webSearchEnabled ?? true,
    githubAccessEnabled: value?.runtimeIntelligence?.githubAccessEnabled ?? true,
  },
});
