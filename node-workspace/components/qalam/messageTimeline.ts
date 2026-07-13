import type { ApprovalMessage, ChatMessage, Message, StatusMessage, ToolMessage } from "./types";
import { isApprovalMessage, isStatusMessage, isToolMessage } from "./types";

export type ToolMessageThread = {
  key: string;
  request?: ToolMessage;
  result?: ToolMessage;
};

export type QalamDisplayMessage =
  | { kind: "status"; key: string; order: number; message: StatusMessage }
  | { kind: "tool"; key: string; order: number; thread: ToolMessageThread }
  | { kind: "approval"; key: string; order: number; message: ApprovalMessage }
  | { kind: "chat"; key: string; order: number; message: ChatMessage };

const runIdOf = (item: QalamDisplayMessage) => {
  if (item.kind === "status") return item.message.statusCard.runId;
  if (item.kind === "tool") return item.thread.request?.tool.runId || item.thread.result?.tool.runId;
  if (item.kind === "chat" && item.message.role === "assistant") return item.message.meta?.runId;
  return undefined;
};

const phaseOf = (item: QalamDisplayMessage) => {
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

const compareTimelineItems = (left: QalamDisplayMessage, right: QalamDisplayMessage) => {
  const order = left.order - right.order;
  if (order !== 0) return order;
  const leftRunId = runIdOf(left);
  return leftRunId && leftRunId === runIdOf(right) ? phaseOf(left) - phaseOf(right) : 0;
};

export const buildQalamMessageTimeline = (messages: Message[]): QalamDisplayMessage[] => {
  const items: QalamDisplayMessage[] = [];
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

