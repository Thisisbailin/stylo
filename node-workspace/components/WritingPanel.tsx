import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Check, CheckCheck, Download, Focus, Info, MessageSquare, Minimize2, Quote, RotateCcw, SendHorizontal, Trash2, X, XCircle } from "lucide-react";
import type { ProjectData } from "../../types";
import type { NodeFlowNode } from "../types";
import { projectRolesToCharacters } from "../../utils/projectRoles";
import type { AgentUiContext } from "../../agents/runtime/types";
import type { AgentScriptEditProposalBatch, ScriptDocumentCommit } from "./qalam/interactionTypes";

type Character = ReturnType<typeof projectRolesToCharacters>[number];

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  onClose?: () => void;
  getAuthToken?: (options?: { skipCache?: boolean }) => Promise<string | null>;
  initialScriptNodeId?: string | null;
  isQalamOpen?: boolean;
  sidePanelWidth?: number;
  agentScriptEditProposals?: AgentScriptEditProposalBatch | null;
  onResolveAgentScriptEditProposal?: (proposalId: string) => void;
  onCommitScriptDocument?: (commit: ScriptDocumentCommit) => void;
  onOpenQalam?: () => void;
  onCloseQalam?: () => void;
  onSubmitToQalam?: (text: string, uiContext?: AgentUiContext) => void;
};

type WritingDraft = {
  title: string;
  body: string;
};

type AgentLineState = {
  anchor: number;
  top: number;
  text: string;
  phase: "active" | "sent";
};

type ScriptPatchLineStatus = "pending" | "accepted" | "rejected";

type ScriptPatchLine = {
  id: string;
  kind: "equal" | "delete" | "insert";
  line: string;
  status: ScriptPatchLineStatus;
};

type PendingScriptPatch = {
  id: string;
  baseTitle: string;
  nextTitle: string;
  baseBody: string;
  nextBody: string;
  lines: ScriptPatchLine[];
};

type SelectionBubbleState = {
  text: string;
  start: number;
  end: number;
  top: number;
  message: string;
};

type ReviewedScriptSnapshot = {
  title: string;
  body: string;
};

const buildCharacterDetail = (character?: Character) => {
  if (!character) return "";
  return [
    character.name ? `角色：${character.name}` : "",
    character.role ? `身份：${character.role}` : "",
    typeof character.appearanceCount === "number" ? `出现次数：${character.appearanceCount}` : "",
    character.episodeUsage ? `分集：${character.episodeUsage}` : "",
    character.bio || "",
  ]
    .filter(Boolean)
    .join("\n");
};

const buildDraftFromDocument = (title: string, content: string): WritingDraft => ({
  title: title.trim() || "剧本文档",
  body: normalizeFountainDocumentToHollywood(content || ""),
});

const downloadTextFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const countCharactersInBody = (body: string) => {
  const names = analyzeFountainLines(body)
    .filter(({ kind }) => kind === "character" || kind === "dual_dialogue")
    .map(({ line }) => stripFountainMarkup(line).trim())
    .filter(Boolean);
  return Array.from(new Set(names));
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const splitScriptLines = (text: string) => text.split(/\r?\n/);

const createPatchLineId = (prefix: string, index: number) => `${prefix}-${index}-${Date.now().toString(36)}`;

const buildFallbackLinePatch = (baseBody: string, nextBody: string): ScriptPatchLine[] => {
  const baseLines = splitScriptLines(baseBody);
  const nextLines = splitScriptLines(nextBody);
  const max = Math.max(baseLines.length, nextLines.length);
  const lines: ScriptPatchLine[] = [];
  for (let index = 0; index < max; index += 1) {
    const oldLine = baseLines[index];
    const newLine = nextLines[index];
    if (oldLine === newLine) {
      lines.push({ id: createPatchLineId("eq", lines.length), kind: "equal", line: oldLine || "", status: "accepted" });
      continue;
    }
    if (oldLine != null) {
      lines.push({ id: createPatchLineId("del", lines.length), kind: "delete", line: oldLine, status: "pending" });
    }
    if (newLine != null) {
      lines.push({ id: createPatchLineId("ins", lines.length), kind: "insert", line: newLine, status: "pending" });
    }
  }
  return lines;
};

const buildScriptLinePatch = (baseBody: string, nextBody: string): ScriptPatchLine[] => {
  if (baseBody === nextBody) {
    return splitScriptLines(baseBody).map((line, index) => ({
      id: createPatchLineId("eq", index),
      kind: "equal",
      line,
      status: "accepted",
    }));
  }

  const baseLines = splitScriptLines(baseBody);
  const nextLines = splitScriptLines(nextBody);
  if (baseLines.length * nextLines.length > 160000) {
    return buildFallbackLinePatch(baseBody, nextBody);
  }

  const dp = Array.from({ length: baseLines.length + 1 }, () => Array(nextLines.length + 1).fill(0));
  for (let i = baseLines.length - 1; i >= 0; i -= 1) {
    for (let j = nextLines.length - 1; j >= 0; j -= 1) {
      dp[i][j] = baseLines[i] === nextLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const lines: ScriptPatchLine[] = [];
  let i = 0;
  let j = 0;
  while (i < baseLines.length || j < nextLines.length) {
    if (i < baseLines.length && j < nextLines.length && baseLines[i] === nextLines[j]) {
      lines.push({ id: createPatchLineId("eq", lines.length), kind: "equal", line: baseLines[i], status: "accepted" });
      i += 1;
      j += 1;
    } else if (j < nextLines.length && (i >= baseLines.length || dp[i][j + 1] >= dp[i + 1][j])) {
      lines.push({ id: createPatchLineId("ins", lines.length), kind: "insert", line: nextLines[j], status: "pending" });
      j += 1;
    } else if (i < baseLines.length) {
      lines.push({ id: createPatchLineId("del", lines.length), kind: "delete", line: baseLines[i], status: "pending" });
      i += 1;
    }
  }
  return lines;
};

const hasPendingPatchLines = (patch: PendingScriptPatch) =>
  patch.lines.some((line) => line.kind !== "equal" && line.status === "pending");

const deriveReviewedScriptBody = (patch: PendingScriptPatch) =>
  patch.lines
    .flatMap((line) => {
      if (line.kind === "equal") return [line.line];
      if (line.kind === "delete") return line.status === "accepted" ? [] : [line.line];
      return line.status === "accepted" ? [line.line] : [];
    })
    .join("\n");

type FountainLineKind =
  | "action"
  | "scene_heading"
  | "character"
  | "dual_dialogue"
  | "dialogue"
  | "parenthetical"
  | "lyric"
  | "transition"
  | "centered"
  | "note"
  | "boneyard"
  | "section"
  | "synopsis"
  | "page_break";

const FOUNTAIN_FORMAT_LABELS: Record<FountainLineKind, string> = {
  action: "Action",
  scene_heading: "Scene",
  character: "Character",
  dual_dialogue: "Dual",
  dialogue: "Dialogue",
  parenthetical: "Paren",
  lyric: "Lyric",
  transition: "Transition",
  centered: "Centered",
  note: "Note",
  boneyard: "Boneyard",
  section: "Section",
  synopsis: "Synopsis",
  page_break: "Page",
};

const FOUNTAIN_FORMAT_META: Record<FountainLineKind, { marker: string; sample: string }> = {
  action: { marker: "!", sample: "!Action description" },
  scene_heading: { marker: ".", sample: ".INT. LOCATION - DAY" },
  character: { marker: "@", sample: "@CHARACTER" },
  dual_dialogue: { marker: "^", sample: "@CHARACTER ^" },
  dialogue: { marker: "\"", sample: "Dialogue text" },
  parenthetical: { marker: "()", sample: "(beat)" },
  lyric: { marker: "~", sample: "~Lyric line" },
  transition: { marker: ">", sample: "> CUT TO:" },
  centered: { marker: "><", sample: "> CENTERED TEXT <" },
  note: { marker: "[[]]", sample: "[[Note]]" },
  boneyard: { marker: "/* */", sample: "/* Hidden text */" },
  section: { marker: "#", sample: "# Section" },
  synopsis: { marker: "=", sample: "= Synopsis" },
  page_break: { marker: "===", sample: "===" },
};

const FOUNTAIN_QUICK_FORMATS: FountainLineKind[] = [
  "action",
  "scene_heading",
  "character",
  "dual_dialogue",
  "dialogue",
  "parenthetical",
  "lyric",
  "transition",
  "centered",
  "note",
  "boneyard",
  "section",
  "synopsis",
  "page_break",
];

const CHINESE_FOUNTAIN_MARKERS: Record<FountainLineKind, string> = {
  action: "△",
  scene_heading: "【场景】",
  character: "【角色】",
  dual_dialogue: "【双人对白】",
  dialogue: "【对白】",
  parenthetical: "【括注】",
  lyric: "【歌词】",
  transition: "【转场】",
  centered: "【居中】",
  note: "【注释】",
  boneyard: "【隐藏】",
  section: "【章节】",
  synopsis: "【梗概】",
  page_break: "【分页】",
};

const SCENE_BOUNDARY_OPTIONS = [
  { label: "INT.", fountain: "INT." },
  { label: "EXT.", fountain: "EXT." },
  { label: "INT./EXT.", fountain: "INT./EXT." },
  { label: "I/E", fountain: "I/E" },
] as const;
const SCENE_TIME_OPTIONS = [
  { label: "DAY", fountain: "DAY" },
  { label: "NIGHT", fountain: "NIGHT" },
  { label: "DAWN", fountain: "DAWN" },
  { label: "DUSK", fountain: "DUSK" },
  { label: "MORNING", fountain: "MORNING" },
  { label: "AFTERNOON", fountain: "AFTERNOON" },
  { label: "EVENING", fountain: "EVENING" },
  { label: "LATER", fountain: "LATER" },
] as const;

const SCENE_BOUNDARY_LABEL_OPTIONS = SCENE_BOUNDARY_OPTIONS.map(({ label }) => label);
const SCENE_TIME_LABEL_OPTIONS = SCENE_TIME_OPTIONS.map(({ label }) => label);
const TRANSITION_LABEL_OPTIONS = ["CUT TO", "DISSOLVE TO", "FADE OUT", "FADE IN", "SMASH CUT TO"];
const PLACEHOLDER_SCENE_NAME = "LOCATION";
const PLACEHOLDER_CHARACTER_NAME = "CHARACTER";

const mergeUnique = (items: string[]) => {
  const seen = new Set<string>();
  return items
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
};

const FOUNTAIN_EMPTY_TEMPLATE_LINES = new Set([
  ".INT. LOCATION - DAY",
  "@CHARACTER",
  "@CHARACTER ^",
  "(beat)",
  "~Lyric line",
  "> CUT TO:",
  "> CENTERED TEXT <",
  "[[Note]]",
  "/* Hidden text */",
  "# Section",
  "= Synopsis",
  "===",
  "【场景】内景｜场景名｜日",
  "【角色】角色名",
  "【双人对白】角色名",
  "【对白】对白内容",
  "【括注】动作提示",
  "【歌词】歌词内容",
  "【转场】切至",
  "【居中】居中文本",
  "【注释】创作备注",
  "【隐藏】暂不采用的内容",
  "【章节】章节名",
  "【梗概】段落梗概",
  "【分页】",
]);

const isFountainEmptyTemplateLine = (line: string) => FOUNTAIN_EMPTY_TEMPLATE_LINES.has(line.trim());

const getLineBoundsAt = (text: string, cursor: number) => {
  const safeCursor = clamp(cursor, 0, text.length);
  const lineStart = text.lastIndexOf("\n", Math.max(0, safeCursor - 1)) + 1;
  const nextBreak = text.indexOf("\n", safeCursor);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const lineIndex = text.slice(0, lineStart).split("\n").length - 1;
  return {
    lineStart,
    lineEnd,
    lineIndex,
    line: text.slice(lineStart, lineEnd),
  };
};

const getFountainRawContent = (line: string) =>
  isFountainEmptyTemplateLine(line) ? "" : stripFountainMarkup(line).trim();

const stripFountainMarkup = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith(CHINESE_FOUNTAIN_MARKERS.action)) {
    return trimmed.slice(CHINESE_FOUNTAIN_MARKERS.action.length).trim();
  }
  const chineseMarker = Object.entries(CHINESE_FOUNTAIN_MARKERS).find(
    ([kind, marker]) => kind !== "action" && trimmed.startsWith(marker)
  );
  if (chineseMarker) return trimmed.slice(chineseMarker[1].length).trim();
  if (/^={3,}$/.test(trimmed)) return "";
  if (/^\[\[.*\]\]$/.test(trimmed)) return trimmed.replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
  if (/^\/\*/.test(trimmed)) return trimmed.replace(/^\/\*\s*/, "").replace(/\s*\*\/$/, "").trim();
  if (/^>.*<$/.test(trimmed)) return trimmed.replace(/^>\s*/, "").replace(/\s*<$/, "").trim();
  if (/^>/.test(trimmed)) return trimmed.replace(/^>\s*/, "").trim();
  if (/^#+\s*/.test(trimmed)) return trimmed.replace(/^#+\s*/, "").trim();
  if (/^=\s*/.test(trimmed)) return trimmed.replace(/^=\s*/, "").trim();
  if (/^@/.test(trimmed)) return trimmed.replace(/^@+/, "").replace(/\s*\^\s*$/, "").trim();
  if (/^!/.test(trimmed)) return trimmed.replace(/^!+/, "").trim();
  if (/^~/.test(trimmed)) return trimmed.replace(/^~+/, "").trim();
  if (/^\..+/.test(trimmed)) return trimmed.replace(/^\.+/, "").trim();
  if (/^\(.+\)$/.test(trimmed)) return trimmed.replace(/^\(/, "").replace(/\)$/, "").trim();
  return line.replace(/\s*\^\s*$/, "");
};

const isCharacterLine = (line: string) => {
  const trimmed = line.trim();
  return trimmed.startsWith(CHINESE_FOUNTAIN_MARKERS.character) || /^@/.test(trimmed);
};
const isDualDialogueLine = (line: string) => {
  const trimmed = line.trim();
  return trimmed.startsWith(CHINESE_FOUNTAIN_MARKERS.dual_dialogue) || /^@?.*[A-Za-z\u4e00-\u9fa5].*\^\s*$/.test(trimmed);
};
const isAutomaticSceneHeading = (line: string) =>
  /^(INT|EXT|EST|INT\.\/EXT|INT\/EXT|I\/E)(\.|\s)/i.test(line.trim());
const isAutomaticTransition = (line: string) => {
  const trimmed = line.trim();
  return trimmed === trimmed.toUpperCase() && /TO:$/.test(trimmed);
};
const isAutomaticCharacterCue = (line: string, previousLine = "", nextLine = "") => {
  const trimmed = line.trim();
  if (!trimmed || !/[A-Z]/.test(trimmed)) return false;
  if (trimmed !== trimmed.toUpperCase()) return false;
  if (/^\d+$/.test(trimmed)) return false;
  return !previousLine.trim() && !!nextLine.trim();
};

type FountainLineAnalysis = {
  line: string;
  kind: FountainLineKind;
};

const getPreviousNonEmptyLine = (lines: string[], lineIndex: number) => {
  for (let i = lineIndex - 1; i >= 0; i -= 1) {
    if (lines[i]?.trim()) return lines[i];
  }
  return "";
};

const getFountainLineKind = (line: string, previousNonEmptyLine = "", isInBoneyard = false): FountainLineKind => {
  const trimmed = line.trim();
  const chineseKind = (Object.entries(CHINESE_FOUNTAIN_MARKERS) as Array<[FountainLineKind, string]>).find(
    ([, marker]) => trimmed.startsWith(marker)
  )?.[0];
  if (chineseKind) return chineseKind;
  if (isInBoneyard || trimmed.includes("/*") || trimmed.includes("*/")) return "boneyard";
  if (!trimmed) return "action";
  if (/^={3,}$/.test(trimmed)) return "page_break";
  if (/^#+\s*/.test(trimmed)) return "section";
  if (/^=\s*/.test(trimmed)) return "synopsis";
  if (/^\[\[.*\]\]$/.test(trimmed)) return "note";
  if (/^~/.test(trimmed)) return "lyric";
  if (/^!/.test(trimmed)) return "action";
  if (/^>.*<$/.test(trimmed)) return "centered";
  if (/^>/.test(trimmed)) return "transition";
  if (/^\(.+\)$/.test(trimmed)) return "parenthetical";
  if (isDualDialogueLine(trimmed)) return "dual_dialogue";
  if (/^@/.test(trimmed)) return "character";
  if (/^\./.test(trimmed)) return "scene_heading";
  if (isAutomaticSceneHeading(trimmed)) return "scene_heading";
  if (isAutomaticTransition(trimmed)) return "transition";
  if (isCharacterLine(previousNonEmptyLine) || isDualDialogueLine(previousNonEmptyLine)) return "dialogue";
  return "action";
};

const analyzeFountainLines = (body: string): FountainLineAnalysis[] => {
  const lines = body.split(/\r?\n/);
  let isInBoneyard = false;
  let previousKind: FountainLineKind | null = null;
  return lines.map((line, index) => {
    const startsBoneyard = line.includes("/*");
    const endsBoneyard = line.includes("*/");
    let kind = getFountainLineKind(line, getPreviousNonEmptyLine(lines, index), isInBoneyard || startsBoneyard);
    if (kind === "action" && isAutomaticCharacterCue(line, lines[index - 1] || "", lines[index + 1] || "")) {
      kind = isDualDialogueLine(line) ? "dual_dialogue" : "character";
    }
    if (
      kind === "action" &&
      line.trim() &&
      (previousKind === "character" ||
        previousKind === "dual_dialogue" ||
        previousKind === "parenthetical" ||
        previousKind === "dialogue")
    ) {
      kind = "dialogue";
    }
    if (startsBoneyard && !endsBoneyard) isInBoneyard = true;
    if (endsBoneyard) isInBoneyard = false;
    previousKind = line.trim() ? kind : null;
    return { line, kind };
  });
};

const formatChineseFountainLine = (rawContent: string, targetKind: FountainLineKind) => {
  const raw = rawContent.trim();
  switch (targetKind) {
    case "scene_heading":
      return raw ? `.${raw.toUpperCase()}` : ".INT. LOCATION - DAY";
    case "character":
      return `@${(raw || "CHARACTER").toUpperCase()}`;
    case "dual_dialogue":
      return `@${(raw.replace(/\s*\^\s*$/, "").trim() || "CHARACTER").toUpperCase()} ^`;
    case "dialogue":
      return raw || "Dialogue text";
    case "parenthetical":
      return `(${raw || "beat"})`;
    case "lyric":
      return `~${raw || "Lyric line"}`;
    case "transition":
      return `> ${(raw.replace(/[：:]$/, "") || "CUT TO").toUpperCase()}:`;
    case "centered":
      return `> ${raw || "CENTERED TEXT"} <`;
    case "note":
      return `[[${raw || "Note"}]]`;
    case "boneyard":
      return `/* ${raw || "Hidden text"} */`;
    case "section":
      return `# ${raw || "Section"}`;
    case "synopsis":
      return `= ${raw || "Synopsis"}`;
    case "page_break":
      return "===";
    case "action":
    default:
      return raw ? `!${raw}` : "";
  }
};

const getFountainTemplateSelection = (formattedLine: string, targetKind: FountainLineKind) => {
  const leading = formattedLine.length - formattedLine.trimStart().length;
  const trimmed = formattedLine.trim();
  switch (targetKind) {
    case "scene_heading": {
      const sceneNameStart = formattedLine.indexOf(" ") + 1;
      const sceneNameEnd = formattedLine.lastIndexOf(" - ");
      return {
        start: Math.max(1, sceneNameStart),
        end: sceneNameEnd > sceneNameStart ? sceneNameEnd : formattedLine.length,
      };
    }
    case "character":
      return { start: leading + 1, end: formattedLine.length };
    case "dual_dialogue":
      return { start: leading + 1, end: Math.max(leading + 1, formattedLine.length - 2) };
    case "parenthetical":
      return { start: leading + 1, end: Math.max(leading + 1, formattedLine.length - 1) };
    case "lyric":
      return { start: leading + 1, end: formattedLine.length };
    case "transition": {
      const start = leading + (trimmed.startsWith("> ") ? 2 : 0);
      const end = trimmed.endsWith(":") ? formattedLine.length - 1 : formattedLine.length;
      return { start, end: Math.max(start, end) };
    }
    case "centered":
      return { start: leading + 2, end: Math.max(leading + 2, formattedLine.length - 2) };
    case "note":
      return { start: leading + 2, end: Math.max(leading + 2, formattedLine.length - 2) };
    case "boneyard":
      return { start: leading + 3, end: Math.max(leading + 3, formattedLine.length - 3) };
    case "section":
    case "synopsis":
      return { start: leading + 2, end: formattedLine.length };
    case "page_break":
      return { start: formattedLine.length, end: formattedLine.length };
    case "action":
    default:
      return { start: 0, end: formattedLine.length };
  }
};

const getFountainContentOffset = (line: string) => {
  const leading = line.length - line.trimStart().length;
  const trimmed = line.trim();
  if (!trimmed) return leading;

  const trimmedOffset = line.indexOf(trimmed);
  const withTrimmedOffset = (offset: number) => trimmedOffset + Math.max(0, offset);

  if (trimmed.startsWith(CHINESE_FOUNTAIN_MARKERS.action)) {
    const markerEnd = CHINESE_FOUNTAIN_MARKERS.action.length;
    return withTrimmedOffset(markerEnd + (trimmed[markerEnd] === " " ? 1 : 0));
  }
  const chineseMarker = (Object.entries(CHINESE_FOUNTAIN_MARKERS) as Array<[FountainLineKind, string]>).find(
    ([kind, marker]) => kind !== "action" && trimmed.startsWith(marker)
  );
  if (chineseMarker) return withTrimmedOffset(chineseMarker[1].length);

  if (/^>.*<$/.test(trimmed)) return withTrimmedOffset(trimmed.startsWith("> ") ? 2 : 1);
  if (/^\[\[/.test(trimmed)) return withTrimmedOffset(2);
  if (/^\/\*/.test(trimmed)) return withTrimmedOffset(trimmed.startsWith("/* ") ? 3 : 2);
  if (/^#+\s+/.test(trimmed)) return withTrimmedOffset(trimmed.match(/^#+\s+/)?.[0].length || 0);
  if (/^=\s+/.test(trimmed)) return withTrimmedOffset(2);
  if (/^>\s+/.test(trimmed)) return withTrimmedOffset(trimmed.match(/^>\s+/)?.[0].length || 0);
  if (/^[@!~.]/.test(trimmed)) return withTrimmedOffset(1);
  if (/^\(.+\)$/.test(trimmed)) return withTrimmedOffset(1);
  return leading;
};

const displayFountainLine = (line: string, kind: FountainLineKind) => {
  if (kind === "page_break") return " ";
  if (kind === "dual_dialogue") return stripFountainMarkup(line).replace(/\s*\^\s*$/, "");
  return stripFountainMarkup(line);
};

const getFountainHiddenPrefix = (line: string) => {
  const offset = getFountainContentOffset(line);
  return offset > 0 ? line.slice(0, offset) : "";
};

const renderCleanFountainLine = (line: string, kind: FountainLineKind) => {
  const hiddenPrefix = getFountainHiddenPrefix(line);
  const rawDisplay = displayFountainLine(line, kind);
  const content = rawDisplay || " ";

  if (kind === "scene_heading") {
    const slots = getSceneHeadingSlots(rawDisplay);
    return (
      <>
        <span className="writing-line-hidden-prefix">{hiddenPrefix}</span>
        <span className="writing-scene-inline-label">{slots.boundary}</span>
        <span className="writing-scene-inline-label is-location">{slots.sceneName || PLACEHOLDER_SCENE_NAME}</span>
        <span className="writing-scene-inline-label">{slots.time}</span>
      </>
    );
  }

  if (kind === "page_break") {
    return <span className="writing-page-break-line" />;
  }

  return (
    <>
      <span className="writing-line-hidden-prefix">{hiddenPrefix}</span>
      <span className="writing-line-visible-text">{content}</span>
    </>
  );
};

const getChineseBoundaryLabel = (value: string) => {
  const normalized = value.trim().toUpperCase();
  const chineseBoundaryAliases: Record<string, string> = {
    内景: "INT.",
    外景: "EXT.",
    内外景: "INT./EXT.",
    "内/外": "I/E",
  };
  if (chineseBoundaryAliases[value.trim()]) return chineseBoundaryAliases[value.trim()];
  return SCENE_BOUNDARY_OPTIONS.find(
    ({ label, fountain }) => label === value.trim() || fountain === normalized
  )?.label || "INT.";
};

const getChineseTimeLabel = (value: string) => {
  const normalized = value.trim().toUpperCase();
  const chineseTimeAliases: Record<string, string> = {
    日: "DAY",
    夜: "NIGHT",
    黎明: "DAWN",
    黄昏: "DUSK",
    上午: "MORNING",
    下午: "AFTERNOON",
    傍晚: "EVENING",
    稍后: "LATER",
  };
  if (chineseTimeAliases[value.trim()]) return chineseTimeAliases[value.trim()];
  return SCENE_TIME_OPTIONS.find(
    ({ label, fountain }) => label === value.trim() || fountain === normalized
  )?.label || "DAY";
};

const getSceneHeadingSlots = (displayLine: string) => {
  const clean = displayLine.replace(/\s+/g, " ").trim();
  const chineseChunks = clean.split(/[｜|]/).map((item) => item.trim());
  if (chineseChunks.length >= 2) {
    return {
      boundary: getChineseBoundaryLabel(chineseChunks[0] || "内景"),
      sceneName: chineseChunks.slice(1, -1).join("｜") || "",
      time: getChineseTimeLabel(chineseChunks[chineseChunks.length - 1] || "DAY"),
    };
  }
  const boundaryMatch = clean.match(/^(INT\.\/EXT\.?|INT\/EXT\.?|INT\.|EXT\.|EST\.|I\/E)(?:\s+|$)/i);
  const rawBoundary = boundaryMatch?.[1]?.toUpperCase();
  const boundary = getChineseBoundaryLabel(rawBoundary?.startsWith("INT/EXT") ? "INT./EXT." : rawBoundary || "INT.");
  const remainder = boundaryMatch ? clean.slice(boundaryMatch[0].length).trim() : clean;
  const chunks = remainder.split(/\s+-\s+/).map((item) => item.trim()).filter(Boolean);
  const lastChunk = chunks[chunks.length - 1]?.toUpperCase();
  const hasTime = !!lastChunk && SCENE_TIME_OPTIONS.some(({ fountain }) => fountain === lastChunk);
  const time = hasTime ? getChineseTimeLabel(lastChunk) : "DAY";
  const sceneName = hasTime ? chunks.slice(0, -1).join(" - ") : remainder;
  return {
    boundary,
    sceneName,
    time,
  };
};

const normalizeFountainLineToChinese = (line: string, kind: FountainLineKind) => {
  if (!line.trim()) return "";
  if (
    line.trim().startsWith(CHINESE_FOUNTAIN_MARKERS.action) ||
    Object.values(CHINESE_FOUNTAIN_MARKERS).some((marker) => line.trim().startsWith(marker))
  ) {
    return line;
  }
  const raw = stripFountainMarkup(line);
  if (kind === "scene_heading") {
    const slots = getSceneHeadingSlots(raw);
    return `${CHINESE_FOUNTAIN_MARKERS.scene_heading}${slots.boundary}｜${slots.sceneName || PLACEHOLDER_SCENE_NAME}｜${slots.time}`;
  }
  return formatChineseFountainLine(raw, kind);
};

function normalizeFountainDocumentToChinese(body: string) {
  if (!body) return "";
  return analyzeFountainLines(body)
    .map(({ line, kind }) => normalizeFountainLineToChinese(line, kind))
    .join("\n");
}

const serializeChineseFountainLine = (line: string, kind: FountainLineKind) => {
  if (!line.trim()) return "";
  const isChineseLine =
    line.trim().startsWith(CHINESE_FOUNTAIN_MARKERS.action) ||
    Object.values(CHINESE_FOUNTAIN_MARKERS).some((marker) => line.trim().startsWith(marker));
  if (!isChineseLine) return line;

  const raw = stripFountainMarkup(line);
  switch (kind) {
    case "scene_heading": {
      const slots = getSceneHeadingSlots(raw);
      const boundary = SCENE_BOUNDARY_OPTIONS.find(({ label }) => label === slots.boundary)?.fountain || "INT.";
      const time = SCENE_TIME_OPTIONS.find(({ label }) => label === slots.time)?.fountain || "DAY";
      return `.${boundary} ${slots.sceneName || PLACEHOLDER_SCENE_NAME} - ${time}`;
    }
    case "character":
      return `@${raw}`;
    case "dual_dialogue":
      return `@${raw} ^`;
    case "dialogue":
      return raw;
    case "parenthetical":
      return `(${raw})`;
    case "lyric":
      return `~${raw}`;
    case "transition":
      return `> ${raw}${/[：:]$/.test(raw) ? "" : ":"}`;
    case "centered":
      return `> ${raw} <`;
    case "note":
      return `[[${raw}]]`;
    case "boneyard":
      return `/* ${raw} */`;
    case "section":
      return `# ${raw}`;
    case "synopsis":
      return `= ${raw}`;
    case "page_break":
      return "===";
    case "action":
    default:
      return `!${raw}`;
  }
};

const serializeChineseFountainDocument = (body: string) =>
  analyzeFountainLines(body)
    .map(({ line, kind }) => serializeChineseFountainLine(line, kind))
    .join("\n");

function normalizeFountainDocumentToHollywood(body: string) {
  if (!body) return "";
  const serialized = serializeChineseFountainDocument(body);
  return analyzeFountainLines(serialized)
    .map(({ line, kind }) => {
      if (!line.trim()) return "";
      const raw = stripFountainMarkup(line);
      switch (kind) {
        case "scene_heading": {
          const slots = getSceneHeadingSlots(raw);
          return `.${slots.boundary} ${slots.sceneName || PLACEHOLDER_SCENE_NAME} - ${slots.time}`;
        }
        case "character":
          return `@${raw.toUpperCase() || PLACEHOLDER_CHARACTER_NAME}`;
        case "dual_dialogue":
          return `@${raw.replace(/\s*\^\s*$/, "").toUpperCase() || PLACEHOLDER_CHARACTER_NAME} ^`;
        case "transition":
          return `> ${raw.replace(/[：:]$/, "").toUpperCase() || "CUT TO"}:`;
        default:
          return line;
      }
    })
    .join("\n");
}

const ensureFlow = (flow: ProjectData["flow"]): NonNullable<ProjectData["flow"]> => ({
  flowNodes: Array.isArray(flow?.flowNodes) ? flow.flowNodes : [],
  links: Array.isArray(flow?.links) ? flow.links : [],
  graphLinks: Array.isArray(flow?.graphLinks) ? flow.graphLinks : [],
  globalAssetHistory: Array.isArray(flow?.globalAssetHistory) ? flow.globalAssetHistory : [],
  linkStyle: flow?.linkStyle,
  activeView: flow?.activeView,
});

const findScriptNode = (projectData: ProjectData, nodeId?: string | null): NodeFlowNode | null => {
  const flowNodes = Array.isArray(projectData.flow?.flowNodes) ? projectData.flow.flowNodes : [];
  if (nodeId) {
    const explicit = flowNodes.find((node) => node.id === nodeId && node.type === "scriptPage");
    if (explicit) return explicit;
  }
  return flowNodes.find((node) => node.type === "scriptPage") || null;
};

const getScriptNodeTitle = (node: NodeFlowNode | null) => {
  const data = (node?.data || {}) as { title?: string };
  return data.title?.trim() || "剧本文档";
};

const getScriptNodeContent = (node: NodeFlowNode | null) => {
  const data = (node?.data || {}) as { text?: string; content?: string };
  return typeof data.content === "string" ? data.content : data.text || "";
};

export const WritingPanel: React.FC<Props> = ({
  projectData,
  setProjectData,
  onClose,
  initialScriptNodeId,
  isQalamOpen = false,
  sidePanelWidth = 420,
  agentScriptEditProposals = null,
  onResolveAgentScriptEditProposal,
  onCommitScriptDocument,
  onOpenQalam,
  onCloseQalam,
  onSubmitToQalam,
}) => {
  const scriptNode = useMemo(
    () => findScriptNode(projectData, initialScriptNodeId),
    [initialScriptNodeId, projectData.flow?.flowNodes]
  );
  const scriptNodeTitle = useMemo(() => getScriptNodeTitle(scriptNode), [scriptNode]);
  const scriptNodeContent = useMemo(() => getScriptNodeContent(scriptNode), [scriptNode]);
  const [loadedScriptNodeId, setLoadedScriptNodeId] = useState<string | null>(() => scriptNode?.id || null);
  const [draft, setDraft] = useState<WritingDraft>(() => buildDraftFromDocument(scriptNodeTitle, scriptNodeContent));
  const draftRef = useRef<WritingDraft>(draft);
  const [pendingScriptPatch, setPendingScriptPatch] = useState<PendingScriptPatch | null>(null);
  const [lastReviewedPatch, setLastReviewedPatch] = useState<ReviewedScriptSnapshot | null>(null);
  const [cursorPos, setCursorPos] = useState(0);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [dismissedMentionStart, setDismissedMentionStart] = useState<number | null>(null);
  const [agentLine, setAgentLine] = useState<AgentLineState | null>(null);
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(!isQalamOpen);
  const [isFormatGuideOpen, setIsFormatGuideOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(true);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [selectionBubble, setSelectionBubble] = useState<SelectionBubbleState | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const agentComposerRef = useRef<HTMLTextAreaElement>(null);
  const writingRoomRef = useRef<HTMLDivElement>(null);
  const agentLineTimerRef = useRef<number | null>(null);
  const handledAgentProposalIdsRef = useRef<Set<string>>(new Set());
  const pendingLocalCommitRef = useRef<WritingDraft | null>(null);

  const knownCharacters = useMemo(
    () => projectRolesToCharacters(projectData.roles || []).filter((character) => !!character?.name?.trim()) as Character[],
    [projectData.roles]
  );
  const characterMap = useMemo(() => {
    const map = new Map<string, Character>();
    knownCharacters.forEach((character) => {
      if (character.name?.trim()) map.set(character.name.trim(), character);
    });
    return map;
  }, [knownCharacters]);
  const deferredDraft = useDeferredValue(draft);

  const commitDraftToProject = useCallback(
    (nextDraft: WritingDraft) => {
      const nodeId = scriptNode?.id || initialScriptNodeId;
      if (!nodeId) return;
      const title = nextDraft.title.trim() || scriptNodeTitle || "剧本文档";
      const content = nextDraft.body;
      const preview = analyzeFountainLines(nextDraft.body)
        .map(({ line, kind }) => displayFountainLine(line, kind))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
      pendingLocalCommitRef.current = { title, body: content };
      if (onCommitScriptDocument) {
        onCommitScriptDocument({ nodeId, title, content, preview });
        return;
      }
      setProjectData((previous) => {
        const flow = ensureFlow(previous.flow);
        let didUpdate = false;
        const flowNodes = (flow.flowNodes || []).map((node) => {
          if (node.id !== nodeId || node.type !== "scriptPage") return node;
          didUpdate = true;
          const data = (node.data || {}) as Record<string, unknown>;
          const documentId =
            typeof data.documentId === "string" && data.documentId.trim()
              ? data.documentId
              : node.id.replace(/^script-/, "") || node.id;
          return {
            ...node,
            data: {
              ...data,
              title,
              text: content,
              content,
              documentId,
              documentKind: "script",
              format: "fountain",
              preview,
              updatedAt: Date.now(),
            },
          };
        });
        if (!didUpdate) return previous;
        return {
          ...previous,
          rawScript: "",
          episodes: [],
          flow: {
            ...flow,
            flowNodes,
          },
        };
      });
    },
    [initialScriptNodeId, onCommitScriptDocument, scriptNode?.id, scriptNodeTitle, setProjectData]
  );

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const nextNodeId = scriptNode?.id || null;
    if (nextNodeId === loadedScriptNodeId) return;
    const nextDraft = buildDraftFromDocument(scriptNodeTitle, scriptNodeContent);
    setDraft(nextDraft);
    setLoadedScriptNodeId(nextNodeId);
    setAgentLine(null);
    setSelectionBubble(null);
    setPendingScriptPatch(null);
    pendingLocalCommitRef.current = null;
  }, [loadedScriptNodeId, scriptNode?.id, scriptNodeContent, scriptNodeTitle]);

  useEffect(() => {
    if (!scriptNode?.id || scriptNode.id !== loadedScriptNodeId) return;
    if (pendingScriptPatch) return;
    const currentDraft = draftRef.current;
    const pendingLocalCommit = pendingLocalCommitRef.current;
    if (pendingLocalCommit) {
      if (
        scriptNodeContent === pendingLocalCommit.body &&
        scriptNodeTitle === pendingLocalCommit.title &&
        currentDraft.body === pendingLocalCommit.body &&
        currentDraft.title === pendingLocalCommit.title
      ) {
        pendingLocalCommitRef.current = null;
      }
      return;
    }
    if (isEditorFocused) return;
    const externalDraft = buildDraftFromDocument(scriptNodeTitle, scriptNodeContent);
    if (externalDraft.body === currentDraft.body && externalDraft.title === currentDraft.title) return;
    setDraft(externalDraft);
  }, [isEditorFocused, loadedScriptNodeId, pendingScriptPatch, scriptNode?.id, scriptNodeContent, scriptNodeTitle]);

  useEffect(() => {
    if (!scriptNode?.id || !agentScriptEditProposals) return;
    const proposal = agentScriptEditProposals.proposals.find((item) => item.nodeId === scriptNode.id);
    if (!proposal || handledAgentProposalIdsRef.current.has(proposal.id)) return;
    handledAgentProposalIdsRef.current.add(proposal.id);
    const currentDraft = draftRef.current;
    const proposedDraft = buildDraftFromDocument(proposal.title, proposal.content);
    if (proposedDraft.body === currentDraft.body && proposedDraft.title === currentDraft.title) {
      onResolveAgentScriptEditProposal?.(proposal.id);
      return;
    }
    const lines = buildScriptLinePatch(currentDraft.body, proposedDraft.body);
    if (!lines.some((line) => line.kind !== "equal")) {
      pendingLocalCommitRef.current = proposedDraft;
      setDraft(proposedDraft);
      commitDraftToProject(proposedDraft);
      onResolveAgentScriptEditProposal?.(proposal.id);
      return;
    }
    setSelectionBubble(null);
    setPendingScriptPatch({
      id: proposal.id,
      baseTitle: currentDraft.title,
      nextTitle: proposedDraft.title,
      baseBody: currentDraft.body,
      nextBody: proposedDraft.body,
      lines,
    });
  }, [agentScriptEditProposals, commitDraftToProject, onResolveAgentScriptEditProposal, scriptNode?.id]);

  useEffect(() => {
    setIsInfoPanelOpen(!isQalamOpen);
  }, [isQalamOpen]);

  useEffect(() => {
    if (!agentLine) return;
    requestAnimationFrame(() => {
      agentComposerRef.current?.focus();
    });
  }, [agentLine]);

  useEffect(() => {
    const composer = agentComposerRef.current;
    if (!composer || !agentLine) return;
    composer.style.height = "0px";
    composer.style.height = `${Math.min(136, composer.scrollHeight)}px`;
  }, [agentLine?.text, agentLine]);

  useEffect(() => {
    return () => {
      if (agentLineTimerRef.current) {
        window.clearTimeout(agentLineTimerRef.current);
      }
    };
  }, []);

  const handleExportFountain = useCallback(() => {
    const title = projectData.fileName?.replace(/\.[^/.]+$/, "") || "qalam-script";
    const filename = `${title || "qalam-script"}.fountain`;
    downloadTextFile(filename, normalizeFountainDocumentToHollywood(draft.body), "text/plain;charset=utf-8");
  }, [draft.body, projectData.fileName]);

  const parserIssues = useMemo(() => {
    const issues: string[] = [];

    analyzeFountainLines(deferredDraft.body).forEach(({ line, kind }, lineIndex) => {
      if (kind !== "character" && kind !== "dual_dialogue") return;
      const name = stripFountainMarkup(line).trim();
      if (![PLACEHOLDER_CHARACTER_NAME, "角色", "角色名"].includes(name) && !characterMap.has(name)) {
        issues.push(`第 ${lineIndex + 1} 行引用了未绑定角色 ${name}`);
      }
    });

    return Array.from(new Set(issues));
  }, [characterMap, deferredDraft]);

  const mentionState = useMemo(() => {
    const textBefore = draft.body.slice(0, cursorPos);
    const match = textBefore.match(/@([\w\u4e00-\u9fa5-]*)$/);
    if (!match) return null;
    const start = textBefore.lastIndexOf("@");
    if (dismissedMentionStart !== null && dismissedMentionStart === start) return null;
    return {
      query: match[1] || "",
      start,
      end: cursorPos,
    };
  }, [cursorPos, dismissedMentionStart, draft.body]);

  const filteredCharacters = useMemo(() => {
    if (!mentionState) return [];
    const query = mentionState.query.trim().toLowerCase();
    if (!query) return knownCharacters.slice(0, 8);
    return knownCharacters
      .filter((character) => {
        const name = character.name.toLowerCase();
        const role = (character.role || "").toLowerCase();
        return name.includes(query) || role.includes(query);
      })
      .slice(0, 8);
  }, [knownCharacters, mentionState]);

  useEffect(() => {
    setActiveMentionIndex(0);
  }, [mentionState?.query]);

  useEffect(() => {
    if (!mentionState) {
      setDismissedMentionStart(null);
    }
  }, [mentionState]);

  const insertMention = (characterName: string) => {
    if (!mentionState) return;
    const nextText = `${draft.body.slice(0, mentionState.start)}@${characterName}${draft.body.slice(mentionState.end)}`;
    const nextPos = mentionState.start + characterName.length + 1;
    setDraft((current) => ({ ...current, body: nextText }));
    setDismissedMentionStart(null);
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      editor.selectionStart = nextPos;
      editor.selectionEnd = nextPos;
      setCursorPos(nextPos);
    });
  };

  const computeAgentLineTop = useCallback((editor: HTMLTextAreaElement, anchor: number) => {
    const style = window.getComputedStyle(editor);
    const lineHeight = parseFloat(style.lineHeight) || 34;
    const paddingTop = parseFloat(style.paddingTop) || 24;
    const paddingBottom = parseFloat(style.paddingBottom) || 24;
    const lineIndex = editor.value.slice(0, anchor).split("\n").length - 1;
    const anchorTop = paddingTop + lineIndex * lineHeight - editor.scrollTop;
    return Math.max(paddingTop, Math.min(editor.clientHeight - paddingBottom - 96, anchorTop));
  }, []);

  const handleEditorScroll = () => {
    const editor = editorRef.current;
    if (!editor) return;
    setAgentLine((current) =>
      current ? { ...current, top: computeAgentLineTop(editor, current.anchor) } : current
    );
    setSelectionBubble((current) =>
      current ? { ...current, top: Math.max(12, computeAgentLineTop(editor, current.start) - 52) } : current
    );
  };

  const updateSelectionBubble = useCallback(
    (editor: HTMLTextAreaElement) => {
      const start = editor.selectionStart || 0;
      const end = editor.selectionEnd || start;
      if (start === end) {
        setSelectionBubble(null);
        return;
      }
      const text = editor.value.slice(start, end).trim();
      if (!text) {
        setSelectionBubble(null);
        return;
      }
      setSelectionBubble((current) => ({
        text,
        start,
        end,
        top: Math.max(12, computeAgentLineTop(editor, start) - 52),
        message:
          current?.start === start && current.end === end && current.text === text
            ? current.message
            : "",
      }));
    },
    [computeAgentLineTop]
  );

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.style.height = "auto";
    const nextHeight = Math.max(640, editor.scrollHeight);
    editor.style.height = `${nextHeight}px`;

    setAgentLine((current) =>
      current ? { ...current, top: computeAgentLineTop(editor, current.anchor) } : current
    );
  }, [computeAgentLineTop, draft.body]);

  const openWritingQalam = useCallback(() => {
    onOpenQalam?.();
  }, [onOpenQalam]);

  const closeAgentLine = useCallback(() => {
    setAgentLine(null);
    requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const activateAgentLine = useCallback(
    (editor: HTMLTextAreaElement) => {
      openWritingQalam();
      const anchor = editor.selectionStart || 0;
      setAgentLine({
        anchor,
        top: computeAgentLineTop(editor, anchor),
        text: "",
        phase: "active",
      });
    },
    [computeAgentLineTop, openWritingQalam]
  );

  const analyzedDraftLines = useMemo(() => analyzeFountainLines(draft.body), [draft.body]);
  const currentLineBounds = useMemo(() => getLineBoundsAt(draft.body, cursorPos), [cursorPos, draft.body]);
  const currentFountainKind = analyzedDraftLines[currentLineBounds.lineIndex]?.kind || "action";
  const currentFountainMeta = FOUNTAIN_FORMAT_META[currentFountainKind];
  const currentSceneHeadingSlots = useMemo(() => {
    if (currentFountainKind !== "scene_heading") return null;
    return getSceneHeadingSlots(displayFountainLine(currentLineBounds.line, "scene_heading"));
  }, [currentFountainKind, currentLineBounds.line]);
  const currentLineContent = useMemo(
    () => stripFountainMarkup(currentLineBounds.line),
    [currentLineBounds.line]
  );
  const parsedCharacterNames = useMemo(
    () =>
      mergeUnique(
        analyzedDraftLines
          .filter(({ kind }) => kind === "character" || kind === "dual_dialogue")
          .map(({ line }) => stripFountainMarkup(line))
          .filter((name) => name !== PLACEHOLDER_CHARACTER_NAME)
      ),
    [analyzedDraftLines]
  );
  const characterSuggestions = useMemo(
    () => mergeUnique([...parsedCharacterNames, ...knownCharacters.map((character) => character.name || "")]),
    [knownCharacters, parsedCharacterNames]
  );
  const sceneNameSuggestions = useMemo(
    () =>
      mergeUnique(
        analyzedDraftLines
          .filter(({ kind }) => kind === "scene_heading")
          .map(({ line }) => getSceneHeadingSlots(displayFountainLine(line, "scene_heading")).sceneName)
          .filter((name) => name !== PLACEHOLDER_SCENE_NAME)
      ),
    [analyzedDraftLines]
  );
  const sceneSummaries = useMemo(
    () =>
      analyzedDraftLines
        .filter(({ kind }) => kind === "scene_heading")
        .map(({ line }) => getSceneHeadingSlots(displayFountainLine(line, "scene_heading")))
        .filter((scene) => scene.sceneName && scene.sceneName !== PLACEHOLDER_SCENE_NAME),
    [analyzedDraftLines]
  );

  const replaceCurrentLine = useCallback(
    (nextLine: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const bounds = getLineBoundsAt(editor.value, cursorPos);
      const nextBody = `${editor.value.slice(0, bounds.lineStart)}${nextLine}${editor.value.slice(bounds.lineEnd)}`;
      const relativeCursor = Math.max(0, cursorPos - bounds.lineStart);
      const nextCursor = bounds.lineStart + Math.min(relativeCursor, nextLine.length);
      setDraft((current) => ({ ...current, body: nextBody }));
      setCursorPos(nextCursor);
      requestAnimationFrame(() => {
        editor.selectionStart = nextCursor;
        editor.selectionEnd = nextCursor;
      });
    },
    [cursorPos]
  );

  const updateCurrentSceneHeading = useCallback(
    (patch: Partial<{ boundary: string; sceneName: string; time: string }>) => {
      const editor = editorRef.current;
      if (!editor) return;
      const bounds = getLineBoundsAt(editor.value, cursorPos);
      const currentSlots = getSceneHeadingSlots(displayFountainLine(bounds.line, "scene_heading"));
      const nextSlots = { ...currentSlots, ...patch };
      const nextLine = `.${nextSlots.boundary} ${nextSlots.sceneName || PLACEHOLDER_SCENE_NAME} - ${nextSlots.time}`;
      replaceCurrentLine(nextLine);
    },
    [cursorPos, replaceCurrentLine]
  );

  const updateCurrentLineContent = useCallback(
    (value: string) => replaceCurrentLine(formatChineseFountainLine(value, currentFountainKind)),
    [currentFountainKind, replaceCurrentLine]
  );

  const applyFountainLineFormat = useCallback(
    (editor: HTMLTextAreaElement, nextKind: FountainLineKind) => {
      const text = editor.value;
      const selectionStart = editor.selectionStart || 0;
      const selectionEnd = editor.selectionEnd || selectionStart;
      const cursor = selectionStart;
      const bounds = getLineBoundsAt(text, cursor);
      const lines = text.split(/\r?\n/);
      const currentKind = getFountainLineKind(bounds.line, getPreviousNonEmptyLine(lines, bounds.lineIndex));
      if (currentKind === nextKind && bounds.line.trim()) {
        editor.focus();
        return;
      }
      const rawLine =
        currentKind === "scene_heading"
          ? getSceneHeadingSlots(displayFountainLine(bounds.line, currentKind)).sceneName
          : getFountainRawContent(bounds.line);
      const formattedLine = formatChineseFountainLine(rawLine, nextKind);
      const templateSelection = getFountainTemplateSelection(formattedLine, nextKind);
      const contentOffset = getFountainContentOffset(bounds.line);
      const rawSelectionStart = Math.max(0, Math.min(rawLine.length, selectionStart - bounds.lineStart - contentOffset));
      const rawSelectionEnd = Math.max(rawSelectionStart, Math.min(rawLine.length, selectionEnd - bounds.lineStart - contentOffset));
      const targetEditableLength = Math.max(0, templateSelection.end - templateSelection.start);
      const mapSelection = (baseOffset = 0) => {
        const mappedStart =
          bounds.lineStart + baseOffset + templateSelection.start + Math.min(rawSelectionStart, targetEditableLength);
        const mappedEnd =
          bounds.lineStart + baseOffset + templateSelection.start + Math.min(rawSelectionEnd, targetEditableLength);
        return { start: mappedStart, end: mappedEnd };
      };

      let nextText = `${text.slice(0, bounds.lineStart)}${formattedLine}${text.slice(bounds.lineEnd)}`;
      const mappedSelection = mapSelection();
      let nextSelectionStart = mappedSelection.start;
      let nextSelectionEnd = mappedSelection.end;

      if (!rawLine && formattedLine) {
        nextSelectionStart = bounds.lineStart + templateSelection.start;
        nextSelectionEnd = bounds.lineStart + templateSelection.end;
      }

      if (nextKind === "dialogue") {
        const previousLine = getPreviousNonEmptyLine(lines, bounds.lineIndex);
        if (!isCharacterLine(previousLine)) {
          const characterCue = `@${PLACEHOLDER_CHARACTER_NAME}`;
          const insert = rawLine ? `${characterCue}\n${formattedLine}` : characterCue;
          nextText = `${text.slice(0, bounds.lineStart)}${insert}${text.slice(bounds.lineEnd)}`;
          nextSelectionStart = bounds.lineStart + 1;
          nextSelectionEnd = bounds.lineStart + characterCue.length;
        }
      }

      setDraft((current) => ({ ...current, body: nextText }));
      requestAnimationFrame(() => {
        editor.focus();
        editor.selectionStart = nextSelectionStart;
        editor.selectionEnd = nextSelectionEnd;
        setCursorPos(nextSelectionEnd);
      });
    },
    []
  );

  const completeCurrentLineFromSuggestions = useCallback(
    (editor: HTMLTextAreaElement, direction: 1 | -1) => {
      const text = editor.value;
      const cursor = editor.selectionStart || 0;
      const bounds = getLineBoundsAt(text, cursor);
      const lines = text.split(/\r?\n/);
      const currentKind = getFountainLineKind(bounds.line, getPreviousNonEmptyLine(lines, bounds.lineIndex));
      const currentContent = stripFountainMarkup(bounds.line).trim();
      let nextLine: string | null = null;
      let selectionStart = cursor;
      let selectionEnd = cursor;

      const pickSuggestion = (options: string[], currentValue: string) => {
        if (!options.length) return "";
        const exactIndex = options.findIndex((option) => option === currentValue);
        if (exactIndex >= 0) {
          return options[(exactIndex + direction + options.length) % options.length];
        }
        const matched = options.find((option) => option.toLowerCase().startsWith(currentValue.toLowerCase()));
        return matched || options[direction === 1 ? 0 : options.length - 1];
      };

      if (currentKind === "character" || currentKind === "dual_dialogue") {
        const nextName = pickSuggestion(characterSuggestions, currentContent);
        if (!nextName) return false;
        nextLine = formatChineseFountainLine(nextName, currentKind);
        selectionStart = bounds.lineStart + getFountainTemplateSelection(nextLine, currentKind).start;
        selectionEnd = bounds.lineStart + nextLine.length;
      } else if (currentKind === "scene_heading") {
        const slots = getSceneHeadingSlots(displayFountainLine(bounds.line, "scene_heading"));
        const nextSceneName = pickSuggestion(sceneNameSuggestions, slots.sceneName);
        if (!nextSceneName) return false;
        nextLine = `.${slots.boundary} ${nextSceneName} - ${slots.time}`;
        const selection = getFountainTemplateSelection(nextLine, "scene_heading");
        selectionStart = bounds.lineStart + selection.start;
        selectionEnd = bounds.lineStart + selection.end;
      } else if (currentKind === "transition") {
        const nextTransition = pickSuggestion(TRANSITION_LABEL_OPTIONS, currentContent);
        if (!nextTransition) return false;
        nextLine = formatChineseFountainLine(nextTransition, "transition");
        selectionStart = bounds.lineStart + getFountainTemplateSelection(nextLine, "transition").start;
        selectionEnd = bounds.lineStart + nextLine.length;
      } else {
        return false;
      }

      const nextBody = `${text.slice(0, bounds.lineStart)}${nextLine}${text.slice(bounds.lineEnd)}`;
      setDraft((current) => ({ ...current, body: nextBody }));
      requestAnimationFrame(() => {
        editor.focus();
        editor.selectionStart = selectionStart;
        editor.selectionEnd = selectionEnd;
        setCursorPos(selectionEnd);
      });
      return true;
    },
    [characterSuggestions, sceneNameSuggestions]
  );

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape" && isFormatGuideOpen) {
      event.preventDefault();
      setIsFormatGuideOpen(false);
      return;
    }
    if (mentionState && filteredCharacters.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveMentionIndex((current) => (current + 1) % filteredCharacters.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveMentionIndex((current) => (current - 1 + filteredCharacters.length) % filteredCharacters.length);
        return;
      }

      if ((event.key === "Enter" || event.key === "Tab") && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        insertMention(filteredCharacters[activeMentionIndex]?.name || filteredCharacters[0].name);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedMentionStart(mentionState.start);
        return;
      }
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      activateAgentLine(event.currentTarget);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      setDismissedMentionStart(null);
      setIsFormatGuideOpen(true);
      return;
    }

    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      event.currentTarget.selectionStart === event.currentTarget.selectionEnd
    ) {
      const editor = event.currentTarget;
      const selectionStart = editor.selectionStart || 0;
      const bounds = getLineBoundsAt(editor.value, selectionStart);
      if (selectionStart !== bounds.lineEnd) return;

      const nextKind: FountainLineKind =
        currentFountainKind === "character" ||
        currentFountainKind === "dual_dialogue" ||
        currentFountainKind === "parenthetical"
          ? "dialogue"
          : currentFountainKind === "lyric"
            ? "lyric"
            : "action";
      const nextLine = formatChineseFountainLine("", nextKind);
      const nextTemplateSelection = getFountainTemplateSelection(nextLine, nextKind);
      const nextBody = `${editor.value.slice(0, selectionStart)}\n${nextLine}${editor.value.slice(selectionStart)}`;
      const nextSelectionStart = selectionStart + 1 + nextTemplateSelection.start;
      const nextSelectionEnd = selectionStart + 1 + nextTemplateSelection.end;
      event.preventDefault();
      setDraft((current) => ({ ...current, body: nextBody }));
      requestAnimationFrame(() => {
        editor.focus();
        editor.selectionStart = nextSelectionStart;
        editor.selectionEnd = nextSelectionEnd;
        setCursorPos(nextSelectionEnd);
      });
    }
  };

  const applyToProject = useCallback(() => {
    if (pendingScriptPatch) return;
    commitDraftToProject(draft);
  }, [commitDraftToProject, draft, pendingScriptPatch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      applyToProject();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [applyToProject]);

  const submitAgentLine = useCallback(() => {
    const text = agentLine?.text.trim();
    if (!text) {
      closeAgentLine();
      return;
    }
    onSubmitToQalam?.(text);
    setAgentLine((current) => (current ? { ...current, phase: "sent" } : current));
    if (agentLineTimerRef.current) {
      window.clearTimeout(agentLineTimerRef.current);
    }
    agentLineTimerRef.current = window.setTimeout(() => {
      setAgentLine(null);
      requestAnimationFrame(() => editorRef.current?.focus());
    }, 260);
  }, [agentLine, closeAgentLine, onSubmitToQalam]);

  const updatePatchReview = useCallback(
    (updater: (line: ScriptPatchLine) => ScriptPatchLine) => {
      if (!pendingScriptPatch) return;
      const nextPatch = {
        ...pendingScriptPatch,
        lines: pendingScriptPatch.lines.map((line) => (line.kind === "equal" ? line : updater(line))),
      };
      const nextBody = deriveReviewedScriptBody(nextPatch);
      const isComplete = !hasPendingPatchLines(nextPatch);
      const acceptedAllChanges = nextPatch.lines
        .filter((line) => line.kind !== "equal")
        .every((line) => line.status === "accepted");
      const reviewedTitle = isComplete && acceptedAllChanges ? nextPatch.nextTitle : nextPatch.baseTitle;
      setDraft((draftCurrent) => ({
        ...draftCurrent,
        title: isComplete ? reviewedTitle || draftCurrent.title : draftCurrent.title,
        body: nextBody,
      }));
      if (isComplete) {
        const reviewedDraft = {
          title: reviewedTitle || pendingScriptPatch.baseTitle,
          body: nextBody,
        };
        pendingLocalCommitRef.current = reviewedDraft;
        commitDraftToProject(reviewedDraft);
        setLastReviewedPatch({ title: pendingScriptPatch.baseTitle, body: pendingScriptPatch.baseBody });
        setPendingScriptPatch(null);
        onResolveAgentScriptEditProposal?.(pendingScriptPatch.id);
        return;
      }
      setPendingScriptPatch(nextPatch);
    },
    [commitDraftToProject, onResolveAgentScriptEditProposal, pendingScriptPatch]
  );

  const reviewPatchLine = useCallback(
    (lineId: string, status: ScriptPatchLineStatus) => {
      updatePatchReview((line) => (line.id === lineId ? { ...line, status } : line));
    },
    [updatePatchReview]
  );

  const acceptAllPatchLines = useCallback(() => {
    updatePatchReview((line) => ({ ...line, status: "accepted" }));
  }, [updatePatchReview]);

  const rejectAllPatchLines = useCallback(() => {
    updatePatchReview((line) => ({ ...line, status: "rejected" }));
  }, [updatePatchReview]);

  const undoReviewedPatch = useCallback(() => {
    if (!lastReviewedPatch) return;
    pendingLocalCommitRef.current = lastReviewedPatch;
    setDraft(lastReviewedPatch);
    commitDraftToProject(lastReviewedPatch);
    setPendingScriptPatch(null);
    setLastReviewedPatch(null);
    requestAnimationFrame(() => editorRef.current?.focus());
  }, [commitDraftToProject, lastReviewedPatch]);

  const submitSelectionToQalam = useCallback(() => {
    const selection = selectionBubble;
    const selectedText = selection?.text.trim();
    const message = selection?.message.trim();
    if (!selection || !selectedText || !message || !scriptNode?.id) return;
    const data = (scriptNode.data || {}) as Record<string, unknown>;
    openWritingQalam();
    onSubmitToQalam?.(message, {
      documentSelection: {
        kind: "script",
        nodeId: scriptNode.id,
        documentId: typeof data.documentId === "string" ? data.documentId : undefined,
        title: draft.title,
        selectedText,
        range: {
          start: selection.start,
          end: selection.end,
        },
      },
    });
    setSelectionBubble(null);
  }, [draft.title, onSubmitToQalam, openWritingQalam, scriptNode, selectionBubble]);

  const screenplayLineCount = useMemo(
    () => Math.max(1, draft.body.split(/\r?\n/).length),
    [draft.body]
  );
  const scriptCharacterCount = useMemo(
    () =>
      analyzedDraftLines
        .map(({ line, kind }) => displayFountainLine(line, kind))
        .join("")
        .trim().length,
    [analyzedDraftLines]
  );
  const screenplaySceneCount = useMemo(
    () => analyzeFountainLines(deferredDraft.body).filter(({ kind }) => kind === "scene_heading").length,
    [deferredDraft]
  );
  const sceneMentionCount = countCharactersInBody(draft.body).length;
  const locationCount = useMemo(
    () =>
      new Set(
        analyzeFountainLines(deferredDraft.body)
          .filter(({ kind }) => kind === "scene_heading")
          .map(({ line }) => getSceneHeadingSlots(displayFountainLine(line, "scene_heading")).sceneName)
          .filter((name) => name && name !== PLACEHOLDER_SCENE_NAME && name !== "场景名")
      ).size,
    [deferredDraft]
  );
  const scriptStats = [
    { label: "场景", value: screenplaySceneCount },
    { label: "行数", value: screenplayLineCount },
    { label: "角色", value: sceneMentionCount },
    { label: "地点", value: locationCount },
    { label: "问题", value: parserIssues.length },
  ];
  const stageStyle = { paddingLeft: `${sidePanelWidth + 3}px` };
  const switchSidePanel = () => {
    if (isInfoPanelOpen) {
      setIsInfoPanelOpen(false);
      onOpenQalam?.();
      return;
    }
    onCloseQalam?.();
    setIsInfoPanelOpen(true);
  };
  const handleClose = () => {
    applyToProject();
    onClose?.();
  };

  return (
    <div
      ref={writingRoomRef}
      className={`writing-room fixed inset-0 z-[61] overflow-hidden text-[var(--app-text-primary)] ${isFocusMode ? "is-focus-mode" : ""} ${isEditorFocused ? "is-editor-focused" : ""}`}
    >
      <div className="writing-canvas-backdrop absolute inset-0" aria-hidden="true" />
      <div className="relative h-[100dvh] overflow-hidden">
        <main className="pointer-events-none relative z-[1] flex h-[100dvh] min-h-0 justify-center overflow-hidden px-4 py-5 md:px-6 md:py-7">
          <div
            className="writing-stage pointer-events-auto h-[calc(100dvh-40px)] min-h-0 w-full transition-[padding] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={stageStyle}
          >
            <div className="writing-studio-grid">
              <section className="writing-script-shell">
                <header className="writing-floating-header" aria-label="Script editor actions">
                  <div className="writing-header-actions">
                    <button
                      type="button"
                      onClick={switchSidePanel}
                      className="writing-icon-button writing-more-button"
                      title={isInfoPanelOpen ? "切换到 Agent" : "切换到稿纸信息"}
                    >
                      {isInfoPanelOpen ? <MessageSquare size={17} strokeWidth={1.8} /> : <Info size={17} strokeWidth={1.8} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsFocusMode((current) => !current)}
                      className={`writing-icon-button ${isFocusMode ? "is-active" : ""}`}
                      title={isFocusMode ? "专注模式已开" : "专注模式已关"}
                    >
                      <Focus size={17} strokeWidth={1.8} />
                    </button>
                    <button type="button" onClick={handleClose} className="writing-icon-button" title="退出全屏编辑">
                      <Minimize2 size={17} strokeWidth={1.8} />
                    </button>
                  </div>
                </header>
                <div className="writing-paper-stack">
                  <div className="writing-script-paper is-active">
                    <div className="writing-paper-title-row">
                      <input
                        value={draft.title}
                        onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                        className="writing-card-title-input"
                        placeholder="剧本文档"
                        aria-label="剧本文档标题"
                      />
                    </div>

                    <div className="writing-paper-body relative flex-1">
                              <textarea
                                ref={editorRef}
                                value={draft.body}
                                onFocus={() => setIsEditorFocused(true)}
                                onBlur={() => setIsEditorFocused(false)}
                                onChange={(event) => {
                                  const nextBody = event.target.value;
                                  const nextCursor = event.target.selectionStart || 0;
                                  setDraft((current) => ({ ...current, body: nextBody }));
                                  setCursorPos(nextCursor);
                                }}
                                onScroll={handleEditorScroll}
                                onMouseDown={() => {
                                  if (agentLine) setAgentLine(null);
                                }}
                                onMouseUp={(event) => updateSelectionBubble(event.currentTarget)}
                                onClick={(event) => {
                                  setDismissedMentionStart(null);
                                  setCursorPos(event.currentTarget.selectionStart || 0);
                                  updateSelectionBubble(event.currentTarget);
                                }}
                                onSelect={(event) => {
                                  setDismissedMentionStart(null);
                                  setCursorPos(event.currentTarget.selectionStart || 0);
                                  updateSelectionBubble(event.currentTarget);
                                }}
                                onKeyUp={(event) => {
                                  if (event.key !== "Escape") setDismissedMentionStart(null);
                                  setCursorPos(event.currentTarget.selectionStart || 0);
                                  updateSelectionBubble(event.currentTarget);
                                }}
                                onKeyDown={handleEditorKeyDown}
                                readOnly={!!pendingScriptPatch}
                                rows={18}
                                aria-label="剧本正文"
                                spellCheck
                                placeholder={pendingScriptPatch ? "Review Qalam's line changes first." : ".INT. LOCATION - DAY\n\nAction begins here."}
                                className="writing-editor relative z-10 w-full overflow-hidden border-none bg-transparent px-10 pb-10 pt-8 font-sans text-[17px] leading-9 outline-none"
                              />

                              {selectionBubble && !pendingScriptPatch ? (
                                <form
                                  className="writing-selection-bubble"
                                  style={{ top: `${selectionBubble.top}px` }}
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    submitSelectionToQalam();
                                  }}
                                >
                                  <span className="writing-selection-bubble__context" title={selectionBubble.text}>
                                    <Quote size={12} strokeWidth={1.9} />
                                    <span>{selectionBubble.text.replace(/\s+/g, " ").slice(0, 28)}</span>
                                  </span>
                                  <input
                                    value={selectionBubble.message}
                                    onChange={(event) =>
                                      setSelectionBubble((current) =>
                                        current ? { ...current, message: event.target.value } : current
                                      )
                                    }
                                    placeholder="询问 Qalam"
                                    aria-label="针对选中文本向 Qalam 提问"
                                  />
                                  <button
                                    type="submit"
                                    className="is-send"
                                    disabled={!selectionBubble.message.trim()}
                                    aria-label="发送消息"
                                  >
                                    <SendHorizontal size={14} strokeWidth={1.9} />
                                  </button>
                                  <button
                                    type="button"
                                    className="is-ghost"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => setSelectionBubble(null)}
                                    aria-label="关闭选区对话入口"
                                  >
                                    <X size={13} strokeWidth={1.9} />
                                  </button>
                                </form>
                              ) : null}

                              {pendingScriptPatch ? (
                                <div className="writing-patch-review" role="dialog" aria-label="Qalam 行级修改审核">
                                  <div className="writing-patch-review__head">
                                    <div>
                                      <span>Qalam 修改</span>
                                      <strong>{pendingScriptPatch.lines.filter((line) => line.kind !== "equal").length} 行待审</strong>
                                    </div>
                                    <div className="writing-patch-review__actions">
                                      <button type="button" onClick={acceptAllPatchLines} title="一键审核通过">
                                        <CheckCheck size={14} strokeWidth={1.9} />
                                      </button>
                                      <button type="button" onClick={rejectAllPatchLines} title="全部拒绝">
                                        <XCircle size={14} strokeWidth={1.9} />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="writing-patch-review__list">
                                    {pendingScriptPatch.lines
                                      .filter((line) => line.kind !== "equal")
                                      .slice(0, 24)
                                      .map((line) => (
                                        <div key={`review-${line.id}`} className={`writing-patch-review__item is-${line.kind} is-${line.status}`}>
                                          <span>{line.kind === "delete" ? "删除" : "新增"}</span>
                                          <p>{stripFountainMarkup(line.line) || line.line || "空行"}</p>
                                          {line.status === "pending" ? (
                                            <div>
                                              <button type="button" onClick={() => reviewPatchLine(line.id, "accepted")} title="通过此行">
                                                <Check size={13} strokeWidth={2} />
                                              </button>
                                              <button type="button" onClick={() => reviewPatchLine(line.id, "rejected")} title="拒绝此行">
                                                <X size={13} strokeWidth={2} />
                                              </button>
                                            </div>
                                          ) : (
                                            <em>{line.status === "accepted" ? "已通过" : "已拒绝"}</em>
                                          )}
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              ) : lastReviewedPatch ? (
                                <button type="button" className="writing-patch-undo" onClick={undoReviewedPatch}>
                                  <RotateCcw size={14} strokeWidth={1.9} />
                                  <span>撤销上次审核</span>
                                </button>
                              ) : null}

                              {agentLine ? (
                                <div
                                  className={`writing-agent-line absolute left-6 right-6 z-20 ${agentLine.phase === "sent" ? "is-sent" : ""}`}
                                  style={{ top: `${agentLine.top}px` }}
                                >
                                  <div className="writing-agent-line__label">Qalam Dialogue</div>
                                  <textarea
                                    ref={agentComposerRef}
                                    value={agentLine.text}
                                    onChange={(event) =>
                                      setAgentLine((current) =>
                                        current ? { ...current, text: event.target.value, phase: "active" } : current
                                      )
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" && !event.shiftKey) {
                                        event.preventDefault();
                                        submitAgentLine();
                                        return;
                                      }
                                      if (event.key === "Escape") {
                                        event.preventDefault();
                                        closeAgentLine();
                                      }
                                    }}
                                    placeholder="在这里继续输入即可和 Qalam 对话。按 Enter 发送，按 Esc 返回剧本。"
                                    className="writing-agent-line__input"
                                  />
                                </div>
                              ) : null}

                              {mentionState && filteredCharacters.length > 0 ? (
                                <div className="mention-picker animate-in fade-in slide-in-from-top-1 absolute left-10 top-8 z-30 w-[320px]">
                                  <div className="mention-picker-header">
                                    <div className="mention-picker-title">角色提及</div>
                                    <div className="text-[10px] text-[var(--app-text-muted)]">↑↓ 选择，Enter 插入，Esc 关闭</div>
                                  </div>
                                  <div className="mention-picker-grid">
                                    {filteredCharacters.map((character, index) => (
                                      <button
                                        key={character.id}
                                        type="button"
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          insertMention(character.name);
                                        }}
                                        className={`mention-picker-item ${index === activeMentionIndex ? "is-active" : ""}`}
                                        title={buildCharacterDetail(character)}
                                      >
                                        <span className="font-semibold">@{character.name}</span>
                                        <span className="text-[10px] text-[var(--node-text-secondary)]">{character.role || "角色"}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                    </div>
                  </div>
                </div>

                {isFormatGuideOpen ? (
                <div
                  className="writing-format-dock"
                  role="dialog"
                  aria-label="Fountain 格式引导"
                  style={{ paddingLeft: sidePanelWidth + 18 }}
                >
                  <button
                    type="button"
                    className="writing-format-dock__backdrop"
                    onClick={() => setIsFormatGuideOpen(false)}
                    aria-label="关闭 Fountain 格式引导"
                  />
                  <div className="writing-format-dock__content">
                    <div className="writing-format-dock__header">
                      <div>
                        <strong>Fountain 格式</strong>
                        <span>选择当前行类型，Esc 关闭</span>
                      </div>
                      <button type="button" onClick={() => setIsFormatGuideOpen(false)} aria-label="关闭格式引导">
                        <X size={14} strokeWidth={1.9} />
                      </button>
                    </div>
                    {currentSceneHeadingSlots ? (
                      <div className="writing-scene-format-fields" aria-label="Current scene heading">
                        <label className="writing-scene-format-field is-choice">
                          <span>Prefix</span>
                          <select
                            value={currentSceneHeadingSlots.boundary}
                            onChange={(event) => updateCurrentSceneHeading({ boundary: event.target.value })}
                            aria-label="Scene prefix"
                          >
                            {SCENE_BOUNDARY_LABEL_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                        <label className="writing-scene-format-field is-name">
                          <span>Location</span>
                          <input
                            value={currentSceneHeadingSlots.sceneName}
                            list="writing-scene-options"
                            onChange={(event) => updateCurrentSceneHeading({ sceneName: event.target.value })}
                            aria-label="Location"
                            placeholder="LOCATION"
                          />
                        </label>
                        <label className="writing-scene-format-field is-choice">
                          <span>Time</span>
                          <select
                            value={currentSceneHeadingSlots.time}
                            onChange={(event) => updateCurrentSceneHeading({ time: event.target.value })}
                            aria-label="Scene time"
                          >
                            {SCENE_TIME_LABEL_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ) : null}

                    {currentFountainKind === "character" || currentFountainKind === "dual_dialogue" ? (
                      <div className="writing-context-format-fields" aria-label="Current character cue">
                        <label className="writing-context-format-field">
                          <span>{currentFountainKind === "dual_dialogue" ? "Dual character" : "Character"}</span>
                          <input
                            value={currentLineContent}
                            list="writing-character-options"
                            onChange={(event) => updateCurrentLineContent(event.target.value)}
                            aria-label="Character name"
                            placeholder="CHARACTER"
                          />
                        </label>
                      </div>
                    ) : null}

                    {currentFountainKind === "transition" ? (
                      <div className="writing-context-format-fields" aria-label="Current transition">
                        <label className="writing-context-format-field">
                          <span>Transition</span>
                          <input
                            value={currentLineContent}
                            list="writing-transition-options"
                            onChange={(event) => updateCurrentLineContent(event.target.value)}
                            aria-label="Transition"
                            placeholder="CUT TO"
                          />
                        </label>
                      </div>
                    ) : null}

                    <datalist id="writing-character-options">
                      {characterSuggestions.map((name) => (
                        <option key={name} value={name}>
                          {characterMap.get(name)?.role || "Draft character"}
                        </option>
                      ))}
                    </datalist>
                    <datalist id="writing-scene-options">
                      {sceneNameSuggestions.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                    <datalist id="writing-transition-options">
                      {TRANSITION_LABEL_OPTIONS.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>

                    <div className="writing-format-bar">
                      {FOUNTAIN_QUICK_FORMATS.map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          title={FOUNTAIN_FORMAT_META[kind].sample}
                          aria-pressed={currentFountainKind === kind}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            const editor = editorRef.current;
                            if (!editor) return;
                            applyFountainLineFormat(editor, kind);
                          }}
                          className={`writing-format-button is-${kind} ${currentFountainKind === kind ? "is-active" : ""}`}
                        >
                          <span className="writing-format-button__marker">{FOUNTAIN_FORMAT_META[kind].marker}</span>
                          <span>{FOUNTAIN_FORMAT_LABELS[kind]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                ) : null}
              </section>

              {isInfoPanelOpen ? (
              <aside className="writing-card writing-info-card" style={{ width: sidePanelWidth - 3 }}>
                <header className="writing-info-panel-header">
                  <div>
                    <strong>稿纸 Info</strong>
                    <span>{draft.title}</span>
                  </div>
                  <button type="button" onClick={switchSidePanel} title="切换到 Agent" aria-label="切换到 Agent">
                    <MessageSquare size={16} strokeWidth={1.8} />
                  </button>
                </header>
                <div className="writing-side-section">
                  <div className="writing-side-label">操作</div>
                  <div className="writing-side-actions">
                    <button type="button" onClick={handleExportFountain} className="writing-side-action">
                      <Download size={15} strokeWidth={1.8} />
                      <span>导出 Fountain</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm("清空当前剧本文档？此操作会覆盖尚未导出的内容。")) return;
                        setDraft((current) => ({ ...current, body: "" }));
                        setAgentLine(null);
                      }}
                      className="writing-side-action writing-side-action--danger"
                      title="清空当前剧本文档"
                    >
                      <Trash2 size={15} strokeWidth={1.8} />
                      <span>清空文档</span>
                    </button>
                  </div>
                </div>

                <div className="writing-side-section">
                  <div className="writing-side-label">当前格式</div>
                  <div className="writing-guide-list">
                    <div className="writing-format-summary">
                      <span className="writing-format-summary__marker">{currentFountainMeta.marker}</span>
                      <span>{FOUNTAIN_FORMAT_LABELS[currentFountainKind]}</span>
                    </div>
                  </div>
                </div>

                <div className="writing-side-section">
                  <div className="writing-side-label">人物</div>
                  <div className="writing-reference-list">
                    {characterSuggestions.length ? (
                      characterSuggestions.slice(0, 18).map((name) => (
                        <button
                          key={name}
                          type="button"
                          className="writing-reference-chip"
                          onClick={() => {
                            if (currentFountainKind !== "character" && currentFountainKind !== "dual_dialogue") return;
                            updateCurrentLineContent(name);
                          }}
                          title={characterMap.get(name) ? buildCharacterDetail(characterMap.get(name)) : name}
                        >
                          <span>{name}</span>
                          {characterMap.get(name)?.role ? <small>{characterMap.get(name)?.role}</small> : null}
                        </button>
                      ))
                    ) : (
                      <span className="writing-empty-reference">暂无人物</span>
                    )}
                  </div>
                </div>

                <div className="writing-side-section">
                  <div className="writing-side-label">场景</div>
                  <div className="writing-reference-list">
                    {sceneSummaries.length ? (
                      sceneSummaries.slice(0, 18).map((scene, index) => (
                        <button
                          key={`${scene.boundary}-${scene.sceneName}-${scene.time}-${index}`}
                          type="button"
                          className="writing-reference-chip is-scene"
                          onClick={() => {
                            if (!currentSceneHeadingSlots) return;
                            updateCurrentSceneHeading(scene);
                          }}
                          title={`${scene.boundary}｜${scene.sceneName}｜${scene.time}`}
                        >
                          <span>{scene.sceneName}</span>
                          <small>{scene.boundary} · {scene.time}</small>
                        </button>
                      ))
                    ) : (
                      <span className="writing-empty-reference">暂无场景</span>
                    )}
                  </div>
                </div>

                <div className="writing-side-section">
                  <div className="writing-side-label">剧本数据</div>
                  <div className="writing-stat-list">
                    {scriptStats.map((stat) => (
                      <div key={stat.label} className="writing-stat-row">
                        <span>{stat.label}</span>
                        <strong>{stat.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="writing-side-foot">
                  <BarChart3 size={16} strokeWidth={1.8} />
                  <span>
                    场景 {screenplaySceneCount} · {scriptCharacterCount} 字
                  </span>
                </div>
              </aside>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
