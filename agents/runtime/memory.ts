import type { AgentInputItem } from "@openai/agents";
import type { AgentSessionMessage, QalamAgentMemory, QalamRunInput } from "./types";

const MAX_RECENT_TURNS = 8;
const MAX_RECENT_TOOLS = 6;
const MAX_MEMORY_TEXT = 220;
const HISTORY_REPLAY_WINDOW = 12;

const clipText = (value: string, limit = MAX_MEMORY_TEXT) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit)}...`;
};

const buildUserMessageContent = (input: QalamRunInput) => {
  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: input.userText.trim(),
    },
  ];

  (input.attachments || []).forEach((attachment) => {
    if (attachment.kind !== "image" || !attachment.url) return;
    content.push({
      type: "input_image",
      image_url: attachment.url,
      detail: "auto",
    });
  });

  return content;
};

export const buildRunInputItems = (input: QalamRunInput): AgentInputItem[] => [
  {
    role: "user",
    content: buildUserMessageContent(input) as any,
  } as AgentInputItem,
];

export const buildAgentMemorySnapshot = (messages: AgentSessionMessage[] | undefined): QalamAgentMemory => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      recentTurns: [],
      recentSuccessfulTools: [],
      recentFailedTools: [],
    };
  }

  const recentTurns = messages
    .filter((message): message is Extract<AgentSessionMessage, { role: "user" | "assistant" }> => message.role === "user" || message.role === "assistant")
    .slice(-MAX_RECENT_TURNS)
    .map((message) => ({
      role: message.role,
      text: clipText(message.text, 280),
      createdAt: message.createdAt,
    }));

  const toolMessages = messages.filter(
    (message): message is Extract<AgentSessionMessage, { role: "tool" }> => message.role === "tool"
  );

  return {
    recentTurns,
    recentSuccessfulTools: toolMessages
      .filter((message) => message.toolStatus === "success")
      .slice(-MAX_RECENT_TOOLS)
      .reverse()
      .map((message) => ({
        toolName: message.toolName,
        status: "success" as const,
        summary: clipText(message.text),
        createdAt: message.createdAt,
      })),
    recentFailedTools: toolMessages
      .filter((message) => message.toolStatus === "error")
      .slice(-MAX_RECENT_TOOLS)
      .reverse()
      .map((message) => ({
        toolName: message.toolName,
        status: "error" as const,
        summary: clipText(message.text),
        createdAt: message.createdAt,
      })),
  };
};

const compactHistoryItem = (item: AgentInputItem): AgentInputItem => {
  if (!item || typeof item !== "object") return item;
  const cloned = structuredClone(item);
  if ((cloned as any).role === "user" || (cloned as any).role === "assistant") {
    const content = (cloned as any).content;
    if (Array.isArray(content)) {
      (cloned as any).content = content.map((part) => {
        if (!part || typeof part !== "object") return part;
        const next = { ...(part as any) };
        if (typeof next.text === "string") next.text = clipText(next.text, 1200);
        if (typeof next.transcript === "string") next.transcript = clipText(next.transcript, 1200);
        return next;
      });
    }
  }
  if ((cloned as any).type === "function_call_result" && typeof (cloned as any).output === "string") {
    (cloned as any).output = clipText((cloned as any).output, 1000);
  }
  return cloned;
};

export const createAgentSessionInputCallback =
  (_seedMemory?: QalamAgentMemory, historyWindow = HISTORY_REPLAY_WINDOW) =>
  async (historyItems: AgentInputItem[], newItems: AgentInputItem[]) => {
    const trimmedHistory = historyItems.slice(-historyWindow).map(compactHistoryItem);
    return [...trimmedHistory, ...newItems];
  };
