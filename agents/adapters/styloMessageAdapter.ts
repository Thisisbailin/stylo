import type { ChatMessage } from "../../node-workspace/components/stylo/types";

const parsePlanFromText = (text: string) => {
  const lines = (text || "").split("\n");
  const planItems: string[] = [];
  let inPlan = false;

  const headingRegex = /^\s*(计划|Plan)\b\s*[:：]?\s*$/i;
  const listRegex = /^\s*(?:[-*•]|\d+\.|\d+、)\s*(.+)$/;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!inPlan && headingRegex.test(line)) {
      inPlan = true;
      continue;
    }
    if (!inPlan) continue;
    if (!line.trim()) {
      if (planItems.length > 0) break;
      continue;
    }
    const match = line.match(listRegex);
    if (match) {
      planItems.push(match[1].trim());
      continue;
    }
    break;
  }

  return {
    text: (text || "").trim(),
    planItems: planItems.length ? planItems : undefined,
  };
};

export const buildAssistantChatMessage = (text: string): ChatMessage => {
  const parsed = parsePlanFromText(text);
  return {
    role: "assistant",
    kind: "chat",
    text: parsed.text,
    meta: {
      planItems: parsed.planItems,
    },
  };
};
