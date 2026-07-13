export type QalamToolCategory = "utility" | "lookup" | "mutation" | "approval";
export type QalamToolCapability = "project_read" | "project_write" | "runtime_read" | "external_read" | "generation_approval";
export type QalamToolInteraction = "read" | "edit" | "operate" | "approve";

export type QalamToolDescriptor = {
  name: string;
  label: string;
  category: QalamToolCategory;
  capability: QalamToolCapability;
  interaction: QalamToolInteraction;
  cacheWithinRun: boolean;
  maxCallsPerRun: number;
  countsAsFullRead?: boolean;
};

const defineToolCatalog = <T extends readonly QalamToolDescriptor[]>(catalog: T) => catalog;

export const QALAM_TOOL_CATALOG = defineToolCatalog([
  { name: "ping_tool", label: "检查运行状态", category: "utility", capability: "runtime_read", interaction: "read", cacheWithinRun: true, maxCallsPerRun: 1 },
  { name: "find_documents", label: "查找文档", category: "lookup", capability: "project_read", interaction: "read", cacheWithinRun: true, maxCallsPerRun: 8 },
  { name: "read_document", label: "读取文档", category: "lookup", capability: "project_read", interaction: "read", cacheWithinRun: true, maxCallsPerRun: 14, countsAsFullRead: true },
  { name: "create_document", label: "创建文档", category: "mutation", capability: "project_write", interaction: "edit", cacheWithinRun: false, maxCallsPerRun: 5 },
  { name: "update_document", label: "更新文档", category: "mutation", capability: "project_write", interaction: "edit", cacheWithinRun: false, maxCallsPerRun: 8 },
  { name: "connect_flow_nodes", label: "连接 Flow 节点", category: "mutation", capability: "project_write", interaction: "operate", cacheWithinRun: false, maxCallsPerRun: 6 },
  { name: "move_flow_node", label: "移动 Flow 节点", category: "mutation", capability: "project_write", interaction: "operate", cacheWithinRun: false, maxCallsPerRun: 6 },
  { name: "operate_foundation", label: "调整 Foundation", category: "mutation", capability: "project_write", interaction: "operate", cacheWithinRun: false, maxCallsPerRun: 6 },
  { name: "list_project_resources", label: "浏览项目资源", category: "lookup", capability: "project_read", interaction: "read", cacheWithinRun: true, maxCallsPerRun: 4 },
  { name: "read_project_resource", label: "读取项目资源", category: "lookup", capability: "project_read", interaction: "read", cacheWithinRun: true, maxCallsPerRun: 10, countsAsFullRead: true },
  { name: "search_project_resource", label: "搜索项目资源", category: "lookup", capability: "project_read", interaction: "read", cacheWithinRun: true, maxCallsPerRun: 8 },
  { name: "read_runtime_manual", label: "查阅运行手册", category: "lookup", capability: "runtime_read", interaction: "read", cacheWithinRun: true, maxCallsPerRun: 3 },
  { name: "access_github_repository", label: "读取 GitHub 仓库", category: "lookup", capability: "external_read", interaction: "read", cacheWithinRun: true, maxCallsPerRun: 6 },
  { name: "search_web", label: "搜索网页", category: "lookup", capability: "external_read", interaction: "read", cacheWithinRun: true, maxCallsPerRun: 6 },
  { name: "operate_project_resource", label: "操作项目资源", category: "mutation", capability: "project_write", interaction: "operate", cacheWithinRun: false, maxCallsPerRun: 4 },
  { name: "prepare_generation_execution", label: "准备生成审批", category: "approval", capability: "generation_approval", interaction: "approve", cacheWithinRun: false, maxCallsPerRun: 2 },
  { name: "cancel_generation_execution", label: "取消生成审批", category: "approval", capability: "generation_approval", interaction: "approve", cacheWithinRun: false, maxCallsPerRun: 2 },
] as const);

export type QalamToolName = (typeof QALAM_TOOL_CATALOG)[number]["name"];

const TOOL_DESCRIPTOR_BY_NAME = new Map<string, QalamToolDescriptor>(
  QALAM_TOOL_CATALOG.map((descriptor) => [descriptor.name, descriptor])
);

export const getQalamToolDescriptor = (toolName: string): QalamToolDescriptor => {
  const descriptor = TOOL_DESCRIPTOR_BY_NAME.get(toolName);
  if (!descriptor) throw new Error(`Unknown Qalam tool: ${toolName}`);
  return descriptor;
};

export const findQalamToolDescriptor = (toolName: string) => TOOL_DESCRIPTOR_BY_NAME.get(toolName);

export const listQalamToolNames = (capabilities?: QalamToolCapability[]) => {
  if (!capabilities?.length) return QALAM_TOOL_CATALOG.map((descriptor) => descriptor.name);
  const allowed = new Set(capabilities);
  return QALAM_TOOL_CATALOG.filter((descriptor) => allowed.has(descriptor.capability)).map((descriptor) => descriptor.name);
};
