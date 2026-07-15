import type { StyloToolName } from "../../../agents/runtime/toolCatalog";

export type StyloMessageVisualTone =
  | "user"
  | "assistant"
  | "thinking"
  | "response"
  | "approval"
  | "utility"
  | "document"
  | "flow"
  | "foundation"
  | "resource"
  | "runtime"
  | "external"
  | "generation"
  | "fallback";

export type StyloMessageIconKey =
  | "user"
  | "assistant"
  | "thinking"
  | "response"
  | "approval"
  | "tool_generic"
  | "health"
  | "document_find"
  | "document_read"
  | "document_create"
  | "document_update"
  | "flow_connect"
  | "flow_move"
  | "foundation_operate"
  | "resources_list"
  | "resource_read"
  | "resource_search"
  | "runtime_manual"
  | "github_read"
  | "web_search"
  | "resource_operate"
  | "generation_prepare"
  | "generation_cancel";

export type StyloMessageVisual = {
  icon: StyloMessageIconKey;
  tone: StyloMessageVisualTone;
};

export const STYLO_PRIMARY_MESSAGE_VISUALS = {
  user: { icon: "user", tone: "user" },
  assistant: { icon: "assistant", tone: "assistant" },
  thinking: { icon: "thinking", tone: "thinking" },
  response: { icon: "response", tone: "response" },
  approval: { icon: "approval", tone: "approval" },
} as const satisfies Record<string, StyloMessageVisual>;

export const STYLO_TOOL_MESSAGE_VISUALS = {
  ping_tool: { icon: "health", tone: "utility" },
  find_documents: { icon: "document_find", tone: "document" },
  read_document: { icon: "document_read", tone: "document" },
  create_document: { icon: "document_create", tone: "document" },
  update_document: { icon: "document_update", tone: "document" },
  connect_flow_nodes: { icon: "flow_connect", tone: "flow" },
  move_flow_node: { icon: "flow_move", tone: "flow" },
  operate_foundation: { icon: "foundation_operate", tone: "foundation" },
  list_project_resources: { icon: "resources_list", tone: "resource" },
  read_project_resource: { icon: "resource_read", tone: "resource" },
  search_project_resource: { icon: "resource_search", tone: "resource" },
  read_runtime_manual: { icon: "runtime_manual", tone: "runtime" },
  access_github_repository: { icon: "github_read", tone: "external" },
  search_web: { icon: "web_search", tone: "external" },
  operate_project_resource: { icon: "resource_operate", tone: "resource" },
  prepare_generation_execution: { icon: "generation_prepare", tone: "generation" },
  cancel_generation_execution: { icon: "generation_cancel", tone: "generation" },
} as const satisfies Record<StyloToolName, StyloMessageVisual>;

const fallbackToolVisual: StyloMessageVisual = {
  icon: "tool_generic",
  tone: "fallback",
};

export const resolveStyloToolMessageVisual = (toolName: string): StyloMessageVisual =>
  (STYLO_TOOL_MESSAGE_VISUALS as Record<string, StyloMessageVisual>)[toolName] || fallbackToolVisual;
