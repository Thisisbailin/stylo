import type { AgentInputItem } from "@openai/agents";

const cloneItem = <T,>(value: T): T => structuredClone(value);

const getFunctionCallId = (item: AgentInputItem): string | null => {
  if (!item || typeof item !== "object" || (item as any).type !== "function_call") return null;
  const callId = (item as any).callId;
  return typeof callId === "string" && callId.trim() ? callId : null;
};

const getFunctionResultCallId = (item: AgentInputItem): string | null => {
  if (!item || typeof item !== "object" || (item as any).type !== "function_call_result") return null;
  const callId = (item as any).callId;
  return typeof callId === "string" && callId.trim() ? callId : null;
};

export const repairSessionToolTransactions = (items: AgentInputItem[]): AgentInputItem[] => {
  const callIds = new Set<string>();
  const resultIds = new Set<string>();
  items.forEach((item) => {
    const callId = getFunctionCallId(item);
    if (callId) callIds.add(callId);
    const resultId = getFunctionResultCallId(item);
    if (resultId) resultIds.add(resultId);
  });
  const completeIds = new Set([...callIds].filter((callId) => resultIds.has(callId)));
  return items
    .filter((item) => {
      const callId = getFunctionCallId(item);
      if (callId) return completeIds.has(callId);
      const resultId = getFunctionResultCallId(item);
      if (resultId) return completeIds.has(resultId);
      return true;
    })
    .map(cloneItem);
};

export const trimSessionItemsSafely = (items: AgentInputItem[], limit?: number): AgentInputItem[] => {
  if (limit !== undefined && limit <= 0) return [];
  let start = limit === undefined ? 0 : Math.max(items.length - limit, 0);
  if (start > 0) {
    let expanded = true;
    while (expanded) {
      expanded = false;
      const resultIds = new Set(
        items
          .slice(start)
          .map(getFunctionResultCallId)
          .filter((callId): callId is string => !!callId)
      );
      for (let index = 0; index < start; index += 1) {
        const callId = getFunctionCallId(items[index]);
        if (callId && resultIds.has(callId)) {
          start = index;
          expanded = true;
          break;
        }
      }
    }
  }
  const sliced = items.slice(start);
  return repairSessionToolTransactions(sliced);
};
