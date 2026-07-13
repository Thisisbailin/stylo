import { findStyloToolDescriptor } from "../../../agents/runtime/toolCatalog";
import type { StyloRunResult } from "../../../agents/runtime/types";
import { isToolMessage, type Message } from "./types";

export const hasDurableAgentResult = (result: StyloRunResult) => Boolean(
  result.updatedProjectPatch ||
  result.updatedProjectData ||
  result.updatedNodeFlow ||
  result.updatedExecutionApprovals
);

export const shouldRejectStaleAgentResult = (
  result: StyloRunResult,
  baseRevision: number,
  currentRevision: number
) => hasDurableAgentResult(result) && baseRevision !== currentRevision;

export const buildAgentRevisionConflictMessage = (baseRevision: number, currentRevision: number) =>
  `Flow 已从修订 ${baseRevision} 更新到 ${currentRevision}；为避免覆盖较新的编辑，本轮 Agent 写入未应用。请基于当前 Flow 重新执行。`;

export const reconcileStaleAgentMessages = (
  messages: Message[],
  result: StyloRunResult,
  conflictMessage: string
) => {
  const staleCallIds = new Set(
    result.toolCalls
      .filter((call) => {
        const category = findStyloToolDescriptor(call.name)?.category;
        return category === "mutation" || category === "approval";
      })
      .map((call) => call.callId)
  );
  const reconciled = messages.map((message) =>
    isToolMessage(message) && message.tool.callId && staleCallIds.has(message.tool.callId)
      ? { ...message, tool: { ...message.tool, status: "error" as const, summary: conflictMessage } }
      : message
  );
  const nextOrder = reconciled.reduce((max, message) => Math.max(max, message.order || 0), 0) + 1;
  return [...reconciled, {
    role: "assistant" as const,
    kind: "chat" as const,
    order: nextOrder,
    text: conflictMessage,
  }];
};
