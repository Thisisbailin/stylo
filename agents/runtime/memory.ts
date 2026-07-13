import type { AgentInputItem } from "@openai/agents";
import type { AgentSessionMessage, QalamAgentMemory, QalamRunInput } from "./types";

const MAX_RECENT_TOOLS = 6;
const MAX_MEMORY_TEXT = 220;

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
      recentSuccessfulTools: [],
      recentFailedTools: [],
    };
  }

  const toolMessages = messages.filter(
    (message): message is Extract<AgentSessionMessage, { role: "tool" }> => message.role === "tool"
  );

  return {
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
