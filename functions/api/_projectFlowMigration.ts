const DEFAULT_FLOW_PROJECT_ID = "flow-project-main";
const DEFAULT_FLOW_PROJECT_COLOR = "#38bdf8";
const DEFAULT_FLOW_PROJECT_DURATION_MINUTES = 120;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * Converts the pre-multi-project top-level `flow` shape into the current
 * persisted flow-project model before callers compact project metadata.
 */
export const normalizeFlowProjectsForStorage = ({
  flowProjects,
  legacyFlow,
  activeFlowProjectId,
  fileName,
  roles,
  designAssets,
  timestamp,
  limit = 3,
}: {
  flowProjects: unknown;
  legacyFlow: unknown;
  activeFlowProjectId: unknown;
  fileName: unknown;
  roles: unknown;
  designAssets: unknown;
  timestamp: number;
  limit?: number;
}): Array<Record<string, unknown>> => {
  const currentProjects = Array.isArray(flowProjects)
    ? flowProjects.filter(isRecord).slice(0, limit)
    : [];
  if (currentProjects.length > 0 || !isRecord(legacyFlow)) return currentProjects;

  const id = typeof activeFlowProjectId === "string" && activeFlowProjectId.trim()
    ? activeFlowProjectId.trim()
    : DEFAULT_FLOW_PROJECT_ID;
  const title = typeof fileName === "string" && fileName.trim() ? fileName.trim() : "主项目";
  const flowNodes = Array.isArray(legacyFlow.flowNodes) ? legacyFlow.flowNodes : [];
  const detectedRootId = flowNodes.find(
    (node) => isRecord(node) && typeof node.id === "string" && node.id.startsWith("project-root-")
  )?.id;

  return [{
    id,
    title,
    color: DEFAULT_FLOW_PROJECT_COLOR,
    durationMin: DEFAULT_FLOW_PROJECT_DURATION_MINUTES,
    rootNodeId: typeof detectedRootId === "string" ? detectedRootId : `project-root-${id}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    roles: Array.isArray(roles) ? roles : [],
    designAssets: Array.isArray(designAssets) ? designAssets : [],
    flow: legacyFlow,
  }];
};
