import type { ToolPayload, ToolStatus } from "./types";

export type ToolDisplayOutcome = ToolStatus | "skipped" | "no_change";

const parseToolOutput = (output?: string): Record<string, unknown> | null => {
  if (!output?.trim()) return null;
  try {
    const parsed = JSON.parse(output);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

/**
 * Transport success only means the tool returned normally. Project-facing UI
 * must distinguish a budget skip or no-op from a mutation that actually ran.
 */
export const resolveToolDisplayOutcome = (
  request?: ToolPayload,
  result?: ToolPayload
): ToolDisplayOutcome => {
  const status = result?.status || request?.status || "queued";
  if (status !== "success") return status;
  const output = parseToolOutput(result?.output);
  const summary = `${request?.summary || ""}\n${result?.summary || ""}`;
  if (
    output?.skipped === true ||
    output?.target === "tool_budget" ||
    /tool skipped|budget exhausted|duplicate lookup blocked/i.test(summary)
  ) {
    return "skipped";
  }
  if (output?.updated === false || /document not updated|not updated/i.test(summary)) {
    return "no_change";
  }
  return "success";
};
