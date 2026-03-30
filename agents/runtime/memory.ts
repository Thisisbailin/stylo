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

const extractItemText = (item: AgentInputItem) => {
  if (!item || typeof item !== "object") return "";
  if ((item as any).role === "user" || (item as any).role === "assistant") {
    const content = (item as any).content;
    if (typeof content === "string") return content.trim();
    if (!Array.isArray(content)) return "";
    return content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        if (typeof (part as any).text === "string") return (part as any).text;
        if (typeof (part as any).transcript === "string") return (part as any).transcript;
        if (typeof (part as any).refusal === "string") return (part as any).refusal;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if ((item as any).type === "function_call_result") {
    const output = (item as any).output;
    if (typeof output === "string") return clipText(output);
    if (output == null) return "";
    try {
      return clipText(JSON.stringify(output));
    } catch {
      return clipText(String(output));
    }
  }
  return "";
};

const buildMemoryFromHistoryItems = (
  historyItems: AgentInputItem[],
  seedMemory?: QalamAgentMemory
): QalamAgentMemory => {
  const recentTurns = historyItems
    .filter((item) => (item as any)?.role === "user" || (item as any)?.role === "assistant")
    .slice(-MAX_RECENT_TURNS)
    .map((item) => ({
      role: (item as any).role as "user" | "assistant",
      text: clipText(extractItemText(item), 280),
      createdAt: undefined,
    }))
    .filter((item) => item.text);

  const toolResults = historyItems
    .filter((item) => (item as any)?.type === "function_call_result")
    .map((item) => {
      const raw = item as any;
      return {
        toolName: typeof raw.name === "string" ? raw.name : "tool",
        status: raw.status === "completed" ? ("success" as const) : ("error" as const),
        summary: clipText(extractItemText(item)),
        createdAt: undefined,
      };
    })
    .filter((item) => item.summary);

  const mergeRecords = (
    seed: typeof seedMemory.recentSuccessfulTools,
    next: typeof seedMemory.recentSuccessfulTools
  ) =>
    [...(seed || []), ...next]
      .filter((item) => item?.summary)
      .slice(-MAX_RECENT_TOOLS);

  return {
    recentTurns: recentTurns.length ? recentTurns : seedMemory?.recentTurns || [],
    recentSuccessfulTools: mergeRecords(
      seedMemory?.recentSuccessfulTools || [],
      toolResults.filter((item) => item.status === "success")
    ),
    recentFailedTools: mergeRecords(
      seedMemory?.recentFailedTools || [],
      toolResults.filter((item) => item.status === "error")
    ),
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

const buildMemoryNote = (memory: QalamAgentMemory) => {
  const lines: string[] = [];

  if (memory.recentTurns.length) {
    lines.push(
      `Recent Turns: ${memory.recentTurns.map((turn) => `${turn.role}: ${turn.text}`).join(" | ")}`
    );
  }
  if (memory.recentSuccessfulTools.length) {
    lines.push(
      `Recent Successful Tool Results: ${memory.recentSuccessfulTools
        .map((tool) => `${tool.toolName}: ${tool.summary}`)
        .join(" | ")}`
    );
  }
  if (memory.recentFailedTools.length) {
    lines.push(
      `Recent Failed Tool Results: ${memory.recentFailedTools
        .map((tool) => `${tool.toolName}: ${tool.summary}`)
        .join(" | ")}`
    );
  }

  if (!lines.length) return null;

  return {
    role: "assistant",
    content: [
      {
        type: "output_text",
        text: `[Session Memory Snapshot]\n${lines.join("\n")}`,
      },
    ],
  } as AgentInputItem;
};

export const createAgentSessionInputCallback =
  (seedMemory?: QalamAgentMemory, historyWindow = HISTORY_REPLAY_WINDOW) =>
  async (historyItems: AgentInputItem[], newItems: AgentInputItem[]) => {
    const trimmedHistory = historyItems.slice(-historyWindow).map(compactHistoryItem);
    const memory = buildMemoryFromHistoryItems(historyItems, seedMemory);
    const memoryNote = buildMemoryNote(memory);
    return [...trimmedHistory, ...(memoryNote ? [memoryNote] : []), ...newItems];
  };
