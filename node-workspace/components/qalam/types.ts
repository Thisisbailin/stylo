export type ToolStatus = "queued" | "running" | "success" | "error";
export type TraceStatus = "running" | "success" | "error";
export type TraceEntryStatus = "info" | "running" | "success" | "error";
export type TraceStage = "runtime" | "session" | "model" | "tool" | "result";

export type ToolPayload = {
  name: string;
  status: ToolStatus;
  summary?: string;
  evidence?: string[];
  output?: string;
  callId?: string;
  runId?: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  kind?: "chat";
  order?: number;
  meta?: {
    runId?: string;
    messageId?: string;
    isStreaming?: boolean;
    isFinal?: boolean;
    planItems?: string[];
    searchEnabled?: boolean;
    searchUsed?: boolean;
    searchQueries?: string[];
  };
};

export type ToolMessage = { role: "assistant"; kind: "tool" | "tool_result"; order?: number; tool: ToolPayload };
export type StatusStep = {
  id: string;
  label: string;
  status: "running" | "success" | "error";
  detail?: string;
};

export type StatusPayload = {
  id: string;
  runId: string;
  status: TraceStatus;
  headline: string;
  detail?: string;
  summary?: string;
  steps: StatusStep[];
  startedAt: number;
  updatedAt: number;
  isThinking?: boolean;
};
export type StatusMessage = { role: "assistant"; kind: "status"; order?: number; statusCard: StatusPayload };
export type ApprovalChoice = "approve_once" | "approve_always" | "reject_once";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "executing" | "completed" | "failed";
export type ApprovalStep = {
  id: string;
  label: string;
  status: "info" | "running" | "success" | "error";
  detail?: string;
  at: number;
};
export type ApprovalPayload = {
  id: string;
  nodeId: string;
  nodeRef?: string;
  nodeTitle: string;
  action: "image_generation" | "video_generation";
  providerLabel: string;
  modelLabel: string;
  promptPreview?: string | null;
  inputSummary?: string[];
  status: ApprovalStatus;
  summary?: string;
  steps: ApprovalStep[];
  createdAt: number;
  updatedAt: number;
};
export type ApprovalMessage = { role: "assistant"; kind: "approval"; order?: number; approval: ApprovalPayload };

export type Message = ChatMessage | ToolMessage | StatusMessage | ApprovalMessage;

export const isToolMessage = (message: Message): message is ToolMessage =>
  message.kind === "tool" || message.kind === "tool_result";

export const isStatusMessage = (message: Message): message is StatusMessage => message.kind === "status";
export const isApprovalMessage = (message: Message): message is ApprovalMessage => message.kind === "approval";
