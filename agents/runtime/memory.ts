import type { AgentInputItem } from "@openai/agents";
import type { StyloRunInput } from "./types";

const buildUserMessageContent = (input: StyloRunInput) => {
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

export const buildRunInputItems = (input: StyloRunInput): AgentInputItem[] => [
  {
    role: "user",
    content: buildUserMessageContent(input) as any,
  } as AgentInputItem,
];
