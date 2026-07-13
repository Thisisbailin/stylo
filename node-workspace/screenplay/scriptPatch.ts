export type ScriptPatchLineStatus = "pending" | "accepted" | "rejected";

export type ScriptPatchLine = {
  id: string;
  kind: "equal" | "delete" | "insert";
  line: string;
  status: ScriptPatchLineStatus;
};

export type PendingScriptPatch = {
  id: string;
  baseTitle: string;
  nextTitle: string;
  baseBody: string;
  nextBody: string;
  lines: ScriptPatchLine[];
};

const splitLines = (text: string) => text.replace(/\r\n?/g, "\n").split("\n");
const createLineId = (prefix: string, index: number) => `${prefix}-${index}`;

const buildFallbackPatch = (baseBody: string, nextBody: string): ScriptPatchLine[] => {
  const baseLines = splitLines(baseBody);
  const nextLines = splitLines(nextBody);
  const max = Math.max(baseLines.length, nextLines.length);
  const lines: ScriptPatchLine[] = [];
  for (let index = 0; index < max; index += 1) {
    const oldLine = baseLines[index];
    const newLine = nextLines[index];
    if (oldLine === newLine) {
      lines.push({ id: createLineId("equal", lines.length), kind: "equal", line: oldLine || "", status: "accepted" });
    } else {
      if (oldLine != null) lines.push({ id: createLineId("delete", lines.length), kind: "delete", line: oldLine, status: "pending" });
      if (newLine != null) lines.push({ id: createLineId("insert", lines.length), kind: "insert", line: newLine, status: "pending" });
    }
  }
  return lines;
};

export const buildScriptLinePatch = (baseBody: string, nextBody: string): ScriptPatchLine[] => {
  if (baseBody === nextBody) {
    return splitLines(baseBody).map((line, index) => ({
      id: createLineId("equal", index),
      kind: "equal",
      line,
      status: "accepted",
    }));
  }

  const baseLines = splitLines(baseBody);
  const nextLines = splitLines(nextBody);
  if (baseLines.length * nextLines.length > 160_000) return buildFallbackPatch(baseBody, nextBody);

  const matrix = Array.from({ length: baseLines.length + 1 }, () => Array<number>(nextLines.length + 1).fill(0));
  for (let left = baseLines.length - 1; left >= 0; left -= 1) {
    for (let right = nextLines.length - 1; right >= 0; right -= 1) {
      matrix[left][right] = baseLines[left] === nextLines[right]
        ? matrix[left + 1][right + 1] + 1
        : Math.max(matrix[left + 1][right], matrix[left][right + 1]);
    }
  }

  const result: ScriptPatchLine[] = [];
  let left = 0;
  let right = 0;
  while (left < baseLines.length || right < nextLines.length) {
    if (left < baseLines.length && right < nextLines.length && baseLines[left] === nextLines[right]) {
      result.push({ id: createLineId("equal", result.length), kind: "equal", line: baseLines[left], status: "accepted" });
      left += 1;
      right += 1;
    } else if (right < nextLines.length && (left >= baseLines.length || matrix[left][right + 1] >= matrix[left + 1][right])) {
      result.push({ id: createLineId("insert", result.length), kind: "insert", line: nextLines[right], status: "pending" });
      right += 1;
    } else {
      result.push({ id: createLineId("delete", result.length), kind: "delete", line: baseLines[left], status: "pending" });
      left += 1;
    }
  }
  return result;
};

export const hasPendingPatchLines = (patch: PendingScriptPatch) =>
  patch.lines.some((line) => line.kind !== "equal" && line.status === "pending");

export const deriveReviewedScriptBody = (patch: PendingScriptPatch) =>
  patch.lines
    .flatMap((line) => {
      if (line.kind === "equal") return [line.line];
      if (line.kind === "delete") return line.status === "accepted" ? [] : [line.line];
      return line.status === "accepted" ? [line.line] : [];
    })
    .join("\n");
