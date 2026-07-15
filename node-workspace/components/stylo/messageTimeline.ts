import type { ApprovalMessage, ChatMessage, Message, StatusMessage, ToolMessage } from "./types";
import { isApprovalMessage, isStatusMessage, isToolMessage } from "./types";

export type ToolMessageThread = {
  key: string;
  request?: ToolMessage;
  result?: ToolMessage;
};

export type StyloTimelineLeaf =
  | { kind: "status"; key: string; order: number; message: StatusMessage }
  | { kind: "tool"; key: string; order: number; thread: ToolMessageThread }
  | { kind: "approval"; key: string; order: number; message: ApprovalMessage }
  | { kind: "chat"; key: string; order: number; message: ChatMessage };

export type StyloDisplayMessage = StyloTimelineLeaf;

const runIdOf = (item: StyloTimelineLeaf) => {
  if (item.kind === "status") return item.message.statusCard.runId;
  if (item.kind === "tool") return item.thread.request?.tool.runId || item.thread.result?.tool.runId;
  if (item.kind === "chat" && item.message.role === "assistant") return item.message.meta?.runId;
  return undefined;
};

const phaseOf = (item: StyloTimelineLeaf) => {
  if (item.kind === "status") {
    if (item.message.statusCard.headline.includes("连接")) return 0;
    if (item.message.statusCard.isThinking) return 10;
    if (/生成|回复/.test(item.message.statusCard.headline)) return 30;
    return 15;
  }
  if (item.kind === "tool") return 20;
  if (item.kind === "approval") return 25;
  if (item.kind === "chat" && item.message.role === "assistant") return 40;
  return 0;
};

const compareTimelineItems = (left: StyloTimelineLeaf, right: StyloTimelineLeaf) => {
  const order = left.order - right.order;
  if (order !== 0) return order;
  const leftRunId = runIdOf(left);
  return leftRunId && leftRunId === runIdOf(right) ? phaseOf(left) - phaseOf(right) : 0;
};

const isFinalAssistant = (item: StyloTimelineLeaf) =>
  item.kind === "chat" &&
  item.message.role === "assistant" &&
  Boolean(item.message.meta?.runId) &&
  item.message.meta?.isStreaming !== true &&
  item.message.meta?.isFinal !== false;

const isRedundantFinalResponseStatus = (item: StyloTimelineLeaf) =>
  item.kind === "status" &&
  item.message.statusCard.status === "success" &&
  item.message.statusCard.isThinking !== true &&
  /(?:最终回答|本轮内容|生成|回复)/.test(item.message.statusCard.headline);

const isSuccessfulConnectionStatus = (item: StyloTimelineLeaf) =>
  item.kind === "status" &&
  item.message.statusCard.status === "success" &&
  /Agent 已启动|连接 Agent/.test(item.message.statusCard.headline);

const isRedundantStreamingStatus = (item: StyloTimelineLeaf) =>
  item.kind === "status" &&
  item.message.statusCard.status !== "error" &&
  item.message.statusCard.isThinking !== true &&
  /生成内容|最终回答|本轮内容/.test(item.message.statusCard.headline);

const isCompletedThinkingStatus = (item: StyloTimelineLeaf) =>
  item.kind === "status" &&
  item.message.statusCard.isThinking === true &&
  item.message.statusCard.status === "success";

const buildTimelineLeaves = (messages: Message[]): StyloTimelineLeaf[] => {
  const items: StyloTimelineLeaf[] = [];
  const toolIndex = new Map<string, number>();

  messages.forEach((message, index) => {
    const order = message.order ?? index;
    if (isToolMessage(message)) {
      const callId = message.tool.callId || `${message.kind}-${index}`;
      const existingIndex = toolIndex.get(callId);
      if (existingIndex == null) {
        toolIndex.set(callId, items.length);
        items.push({
          kind: "tool",
          key: callId,
          order,
          thread: {
            key: callId,
            ...(message.kind === "tool" ? { request: message } : { result: message }),
          },
        });
        return;
      }
      const existing = items[existingIndex];
      if (existing.kind !== "tool") return;
      items[existingIndex] = {
        ...existing,
        order: Math.min(existing.order, order),
        thread: {
          ...existing.thread,
          ...(message.kind === "tool" ? { request: message } : { result: message }),
        },
      };
      return;
    }
    if (isStatusMessage(message)) {
      items.push({ kind: "status", key: message.statusCard.id || `${message.statusCard.runId}-${index}`, order, message });
      return;
    }
    if (isApprovalMessage(message)) {
      items.push({ kind: "approval", key: message.approval.id || `${message.approval.nodeId}-${index}`, order, message });
      return;
    }
    items.push({ kind: "chat", key: message.meta?.messageId || `chat-${index}`, order, message });
  });

  return items.sort(compareTimelineItems);
};

export const buildStyloMessageTimeline = (messages: Message[]): StyloDisplayMessage[] => {
  const leaves = buildTimelineLeaves(messages);
  const finalRunIds = new Set(
    leaves
      .filter(isFinalAssistant)
      .map(runIdOf)
      .filter((runId): runId is string => Boolean(runId))
  );
  return leaves.filter((item) => {
    const runId = runIdOf(item);
    if (isSuccessfulConnectionStatus(item) || isRedundantStreamingStatus(item)) return false;
    if (runId && finalRunIds.has(runId) && isCompletedThinkingStatus(item)) return false;
    if (runId && finalRunIds.has(runId) && isRedundantFinalResponseStatus(item)) return false;
    return true;
  });
};
