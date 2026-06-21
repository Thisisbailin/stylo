import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Download, Focus, Minimize2, MoreHorizontal, Trash2, X } from "lucide-react";
import type { ProjectData } from "../../types";
import type { NodeFlowNode } from "../types";
import { projectRolesToCharacters } from "../../utils/projectRoles";

type Character = ReturnType<typeof projectRolesToCharacters>[number];

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  onClose?: () => void;
  getAuthToken?: (options?: { skipCache?: boolean }) => Promise<string | null>;
  initialScriptNodeId?: string | null;
  isQalamOpen?: boolean;
  onOpenQalam?: () => void;
  onSubmitToQalam?: (text: string) => void;
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
  body: content || "",
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
  const matches = body.match(/@([\w\u4e00-\u9fa5-]+)/g) || [];
  return Array.from(new Set(matches.map((item) => item.slice(1))));
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

const FOUNTAIN_FORMAT_ORDER: FountainLineKind[] = [
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

const FOUNTAIN_FORMAT_LABELS: Record<FountainLineKind, string> = {
  action: "动作",
  scene_heading: "场景",
  character: "角色",
  dual_dialogue: "双人对白",
  dialogue: "对白",
  parenthetical: "括注",
  lyric: "歌词",
  transition: "转场",
  centered: "居中",
  note: "注释",
  boneyard: "隐藏",
  section: "章节",
  synopsis: "梗概",
  page_break: "分页",
};

const FOUNTAIN_FORMAT_META: Record<FountainLineKind, { marker: string; sample: string }> = {
  action: { marker: "!", sample: "!Action description" },
  scene_heading: { marker: ".", sample: ".INT. APARTMENT - DAY" },
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

const SCENE_BOUNDARY_LABEL_OPTIONS = ["INT.", "EXT.", "INT./EXT.", "I/E"];
const SCENE_TIME_LABEL_OPTIONS = ["DAY", "NIGHT", "DAWN", "DUSK", "MORNING", "AFTERNOON", "EVENING", "LATER"];

const FOUNTAIN_EMPTY_TEMPLATE_LINES = new Set([
  ".INT. 场景名 - DAY",
  "@CHARACTER",
  "@角色名",
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

const isCharacterLine = (line: string) => /^@/.test(line.trim());
const isDualDialogueLine = (line: string) => /^@?.*[A-Za-z\u4e00-\u9fa5].*\^\s*$/.test(line.trim());
const isAutomaticSceneHeading = (line: string) =>
  /^(INT|EXT|EST|INT\.\/EXT|INT\/EXT|I\/E)(\.|\s)/i.test(line.trim());
const isAutomaticTransition = (line: string) => {
  const trimmed = line.trim();
  return trimmed === trimmed.toUpperCase() && /TO:$/.test(trimmed);
};
const isAutomaticCharacterCue = (line: string, previousLine = "", nextLine = "") => {
  const trimmed = line.trim();
  if (!trimmed || !/[A-Z\u4e00-\u9fa5]/.test(trimmed)) return false;
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

const formatFountainLine = (line: string, targetKind: FountainLineKind) => {
  const raw = getFountainRawContent(line);

  switch (targetKind) {
    case "scene_heading":
      return raw ? `.${raw.toUpperCase()}` : ".INT. 场景名 - DAY";
    case "character":
      return raw ? `@${raw.toUpperCase()}` : "@CHARACTER";
    case "dual_dialogue": {
      const cleaned = raw.replace(/\s*\^\s*$/, "").trim();
      return cleaned ? `@${cleaned.toUpperCase()} ^` : "@CHARACTER ^";
    }
    case "dialogue":
      return raw;
    case "parenthetical":
      return raw ? `(${raw})` : "(beat)";
    case "lyric":
      return `~${raw || "Lyric line"}`;
    case "transition":
      return raw
        ? `> ${raw.toUpperCase().endsWith(":") ? raw.toUpperCase() : `${raw.toUpperCase()}:`}`
        : "> CUT TO:";
    case "centered":
      return raw ? `> ${raw} <` : "> CENTERED TEXT <";
    case "note":
      return `[[${raw || "Note"}]]`;
    case "boneyard":
      return raw ? `/* ${raw} */` : "/* Hidden text */";
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
      return { start: 2, end: Math.max(2, formattedLine.length - 2) };
    case "boneyard":
      return { start: 3, end: Math.max(3, formattedLine.length - 3) };
    case "section":
    case "synopsis":
      return { start: 2, end: formattedLine.length };
    case "page_break":
      return { start: formattedLine.length, end: formattedLine.length };
    case "dialogue":
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
  if (kind === "character") return stripFountainMarkup(line).toUpperCase();
  if (kind === "dual_dialogue") return stripFountainMarkup(line).replace(/\s*\^\s*$/, "").toUpperCase();
  if (kind === "scene_heading") return stripFountainMarkup(line).toUpperCase();
  if (kind === "transition") return stripFountainMarkup(line).toUpperCase();
  return stripFountainMarkup(line);
};

const getSceneHeadingSlots = (displayLine: string) => {
  const clean = displayLine.replace(/\s+/g, " ").trim();
  const boundaryMatch = clean.match(/^(INT\.\/EXT\.?|INT\/EXT\.?|INT\.|EXT\.|EST\.|I\/E)(?:\s+|$)/i);
  const rawBoundary = boundaryMatch?.[1]?.toUpperCase();
  const boundary = rawBoundary?.startsWith("INT/EXT") ? "INT./EXT." : rawBoundary || SCENE_BOUNDARY_LABEL_OPTIONS[0];
  const remainder = boundaryMatch ? clean.slice(boundaryMatch[0].length).trim() : clean;
  const chunks = remainder.split(/\s+-\s+/).map((item) => item.trim()).filter(Boolean);
  const lastChunk = chunks[chunks.length - 1]?.toUpperCase();
  const hasTime = !!lastChunk && SCENE_TIME_LABEL_OPTIONS.includes(lastChunk);
  const time = hasTime ? lastChunk : SCENE_TIME_LABEL_OPTIONS[0];
  const sceneName = hasTime ? chunks.slice(0, -1).join(" - ") : remainder;
  return {
    boundary,
    sceneName,
    time,
  };
};

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
  onOpenQalam,
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
  const [cursorPos, setCursorPos] = useState(0);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [dismissedMentionStart, setDismissedMentionStart] = useState<number | null>(null);
  const [viewportSize, setViewportSize] = useState(
    typeof window !== "undefined"
      ? { width: window.innerWidth, height: window.innerHeight }
      : { width: 1440, height: 960 }
  );
  const [agentLine, setAgentLine] = useState<AgentLineState | null>(null);
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(true);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const agentComposerRef = useRef<HTMLTextAreaElement>(null);
  const writingRoomRef = useRef<HTMLDivElement>(null);
  const agentLineTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    const nextNodeId = scriptNode?.id || null;
    if (nextNodeId === loadedScriptNodeId) return;
    const nextDraft = buildDraftFromDocument(scriptNodeTitle, scriptNodeContent);
    setDraft(nextDraft);
    setLoadedScriptNodeId(nextNodeId);
    setAgentLine(null);
  }, [loadedScriptNodeId, scriptNode?.id, scriptNodeContent, scriptNodeTitle]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
    downloadTextFile(filename, draft.body, "text/plain;charset=utf-8");
  }, [draft.body, projectData.fileName]);

  const parserIssues = useMemo(() => {
    const issues: string[] = [];

    const lines = deferredDraft.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    lines.forEach((line, lineIndex) => {
      const mentions = (line.match(/@([\w\u4e00-\u9fa5-]+)/g) || []).map((item) => item.slice(1));
      mentions.forEach((name) => {
        if (!["CHARACTER", "角色", "角色名"].includes(name) && !characterMap.has(name)) {
          issues.push(`第 ${lineIndex + 1} 行引用了未绑定角色 @${name}`);
        }
      });
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
  };

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

  const currentFountainKind = useMemo(() => {
    const bounds = getLineBoundsAt(draft.body, cursorPos);
    return analyzeFountainLines(draft.body)[bounds.lineIndex]?.kind || "action";
  }, [cursorPos, draft.body]);
  const currentFountainMeta = FOUNTAIN_FORMAT_META[currentFountainKind];
  const currentSceneHeadingSlots = useMemo(() => {
    if (currentFountainKind !== "scene_heading") return null;
    const bounds = getLineBoundsAt(draft.body, cursorPos);
    return getSceneHeadingSlots(displayFountainLine(bounds.line, "scene_heading"));
  }, [currentFountainKind, cursorPos, draft.body]);

  const updateCurrentSceneHeading = useCallback(
    (patch: Partial<{ boundary: string; sceneName: string; time: string }>) => {
      const editor = editorRef.current;
      if (!editor) return;
      const bounds = getLineBoundsAt(editor.value, cursorPos);
      const currentSlots = getSceneHeadingSlots(displayFountainLine(bounds.line, "scene_heading"));
      const nextSlots = { ...currentSlots, ...patch };
      const nextLine = `.${nextSlots.boundary} ${nextSlots.sceneName} - ${nextSlots.time}`;
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

  const applyFountainLineFormat = useCallback(
    (editor: HTMLTextAreaElement, nextKind: FountainLineKind) => {
      const text = editor.value;
      const selectionStart = editor.selectionStart || 0;
      const selectionEnd = editor.selectionEnd || selectionStart;
      const cursor = selectionStart;
      const bounds = getLineBoundsAt(text, cursor);
      const lines = text.split(/\r?\n/);
      const rawLine = getFountainRawContent(bounds.line);
      const formattedLine = formatFountainLine(bounds.line, nextKind);
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
          const characterCue = "@角色名";
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

  const cycleFountainLineFormat = useCallback(
    (editor: HTMLTextAreaElement, direction: 1 | -1) => {
      const text = editor.value;
      const cursor = editor.selectionStart || 0;
      const bounds = getLineBoundsAt(text, cursor);
      const lines = text.split(/\r?\n/);
      const currentKind = getFountainLineKind(bounds.line, getPreviousNonEmptyLine(lines, bounds.lineIndex));
      const currentIndex = Math.max(0, FOUNTAIN_FORMAT_ORDER.indexOf(currentKind));
      const nextKind =
        FOUNTAIN_FORMAT_ORDER[
          (currentIndex + direction + FOUNTAIN_FORMAT_ORDER.length) % FOUNTAIN_FORMAT_ORDER.length
        ];
      applyFountainLineFormat(editor, nextKind);
    },
    [applyFountainLineFormat]
  );

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

      if (event.key === "Enter") {
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

    if (event.key === "Tab") {
      event.preventDefault();
      setDismissedMentionStart(null);
      cycleFountainLineFormat(event.currentTarget, event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      activateAgentLine(event.currentTarget);
    }
  };

  const applyToProject = useCallback(() => {
    const nodeId = scriptNode?.id || initialScriptNodeId;
    if (!nodeId) return;
    const title = draft.title.trim() || scriptNodeTitle || "剧本文档";
    const content = draft.body;
    const preview = content.replace(/\s+/g, " ").slice(0, 180);
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
  }, [draft.body, draft.title, initialScriptNodeId, scriptNode?.id, scriptNodeTitle, setProjectData]);

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

  const isCompactLayout = viewportSize.width < 1180;
  const qalamPanelWidth = isCompactLayout
    ? Math.max(320, viewportSize.width - 32)
    : Math.min(440, Math.max(360, Math.floor(viewportSize.width * 0.3)));
  const screenplayLineCount = useMemo(
    () => Math.max(1, draft.body.split(/\r?\n/).length),
    [draft.body]
  );
  const scriptCharacterCount = draft.body.trim().length;
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
          .filter((name) => name && name !== "场景名")
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
  const stageStyle = isQalamOpen
    ? isCompactLayout
      ? { paddingTop: `${Math.max(316, Math.floor(viewportSize.height * 0.36))}px` }
      : { paddingLeft: `${qalamPanelWidth + 44}px` }
    : undefined;
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
            <div className={`writing-studio-grid ${isInfoPanelOpen ? "is-info-open" : ""}`}>
              <section className="writing-script-shell">
                <header className="writing-floating-header" aria-label="Script editor actions">
                  <div className="writing-header-actions">
                    <button
                      type="button"
                      onClick={() => setIsInfoPanelOpen((current) => !current)}
                      className="writing-icon-button writing-more-button"
                      title={isInfoPanelOpen ? "隐藏信息" : "显示信息"}
                    >
                      {isInfoPanelOpen ? <X size={18} strokeWidth={1.8} /> : <MoreHorizontal size={18} strokeWidth={1.8} />}
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
                                onClick={(event) => {
                                  setDismissedMentionStart(null);
                                  setCursorPos(event.currentTarget.selectionStart || 0);
                                }}
                                onSelect={(event) => {
                                  setDismissedMentionStart(null);
                                  setCursorPos(event.currentTarget.selectionStart || 0);
                                }}
                                onKeyUp={(event) => {
                                  if (event.key !== "Escape") setDismissedMentionStart(null);
                                  setCursorPos(event.currentTarget.selectionStart || 0);
                                }}
                                onKeyDown={handleEditorKeyDown}
                                rows={18}
                                aria-label="剧本正文"
                                spellCheck
                                placeholder={".INT. 场景名 - DAY\n\n在这里开始写作。使用下方格式栏设置当前行。"}
                                className="writing-editor relative z-10 w-full overflow-hidden border-none bg-transparent px-10 pb-10 pt-8 font-sans text-[17px] leading-9 outline-none"
                              />

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

                <div className="writing-format-dock">
                  <div className="writing-format-dock__content">
                    {currentSceneHeadingSlots ? (
                      <div className="writing-scene-format-fields" aria-label="当前场景格式">
                        <label className="writing-scene-format-field is-choice">
                          <span>内/外景</span>
                          <select
                            value={currentSceneHeadingSlots.boundary}
                            onChange={(event) => updateCurrentSceneHeading({ boundary: event.target.value })}
                            aria-label="内外景"
                          >
                            {SCENE_BOUNDARY_LABEL_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                        <label className="writing-scene-format-field is-name">
                          <span>场景名</span>
                          <input
                            value={currentSceneHeadingSlots.sceneName}
                            onChange={(event) => updateCurrentSceneHeading({ sceneName: event.target.value })}
                            aria-label="场景名"
                            placeholder="场景名"
                          />
                        </label>
                        <label className="writing-scene-format-field is-choice">
                          <span>时间</span>
                          <select
                            value={currentSceneHeadingSlots.time}
                            onChange={(event) => updateCurrentSceneHeading({ time: event.target.value })}
                            aria-label="场景时间"
                          >
                            {SCENE_TIME_LABEL_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ) : null}

                    <div className="writing-format-bar">
                      {FOUNTAIN_QUICK_FORMATS.map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          title={FOUNTAIN_FORMAT_META[kind].sample}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            const editor = editorRef.current;
                            if (!editor) return;
                            applyFountainLineFormat(editor, kind);
                          }}
                          className={`writing-format-button ${currentFountainKind === kind ? "is-active" : ""}`}
                        >
                          <span className="writing-format-button__marker">{FOUNTAIN_FORMAT_META[kind].marker}</span>
                          <span>{FOUNTAIN_FORMAT_LABELS[kind]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {isInfoPanelOpen ? (
              <aside className="writing-card writing-info-card">
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
                  <div className="writing-side-label">Format</div>
                  <div className="writing-guide-list">
                    <div className="writing-format-summary">
                      <span className="writing-format-summary__marker">{currentFountainMeta.marker}</span>
                      <span>{FOUNTAIN_FORMAT_LABELS[currentFountainKind]}</span>
                    </div>
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
