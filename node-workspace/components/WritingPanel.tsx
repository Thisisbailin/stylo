import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight, Download, Focus, Minimize2, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import type { Character, ProjectData } from "../../types";
import type { NodeFlowNode } from "../types";
import { projectRolesToCharacters } from "../../utils/projectRoles";

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

type WritingScene = {
  id: string;
  title: string;
  timeOfDay: string;
  location: string;
  castLine: string;
  body: string;
};

type WritingEpisode = {
  id: number;
  title: string;
  scenes: WritingScene[];
};

type AgentLineState = {
  anchor: number;
  top: number;
  text: string;
  phase: "active" | "sent";
};

const SCENE_BOUNDARY_OPTIONS = ["INT.", "EXT.", "INT./EXT.", "I/E"];
const SCENE_TIME_OPTIONS = ["DAY", "NIGHT", "DAWN", "DUSK", "MORNING", "AFTERNOON", "EVENING", "LATER"];
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const buildCharacterMatcher = (characters: Character[]) => {
  const names = characters
    .map((character) => character.name?.trim())
    .filter((name): name is string => !!name)
    .sort((a, b) => b.length - a.length);
  if (!names.length) return null;
  return new RegExp(`(${names.map((name) => escapeRegExp(name)).join("|")})`, "g");
};

const createEmptyScene = (episodeId: number, sceneIndex: number): WritingScene => ({
  id: `${episodeId}-${sceneIndex}`,
  title: `SCENE ${sceneIndex}`,
  timeOfDay: "",
  location: "",
  castLine: "",
  body: "",
});

const createEmptyEpisode = (episodeId: number, title = "剧本文档", body = ""): WritingEpisode => ({
  id: episodeId,
  title,
  scenes: [{ ...createEmptyScene(episodeId, 1), id: "1", title: "SCRIPT", body }],
});

const buildDraftFromDocument = (title: string, content: string): WritingEpisode[] => [
  createEmptyEpisode(1, title.trim() || "剧本文档", content || ""),
];

const exportDraftLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return "";

  const actionMatch = trimmed.match(/^#\s*(.+)$/);
  if (actionMatch) {
    return `△${actionMatch[1].trim()}`;
  }

  const qualifiedMatch = trimmed.match(/^@([^\s/:：]+)\s*\/\s*(os|vo)\s*[:：]?\s*(.+)$/i);
  if (qualifiedMatch) {
    const [, speaker, mode, body] = qualifiedMatch;
    const label = mode.toUpperCase();
    return `${speaker.trim()}（${label}）：${body.trim()}`;
  }

  const dialogueMatch = trimmed.match(/^@([^：:]+?)\s*[:：]\s*(.+)$/);
  if (dialogueMatch) {
    const [, speaker, body] = dialogueMatch;
    return `${speaker.trim()}：${body.trim()}`;
  }

  return trimmed;
};

const exportScene = (scene: WritingScene) => {
  const header = [scene.id.trim(), scene.title.trim(), scene.timeOfDay.trim(), scene.location.trim()]
    .filter(Boolean)
    .join(" ");
  const bodyLines = scene.body
    .split(/\r?\n/)
    .map(exportDraftLine)
    .filter(Boolean);
  return [header, scene.castLine.trim() ? `人物：${scene.castLine.trim()}` : "", ...bodyLines]
    .filter(Boolean)
    .join("\n");
};

const exportEpisode = (episode: WritingEpisode) =>
  [
    episode.title.trim() || `Episode ${episode.id}`,
    "",
    ...episode.scenes.map((scene) => exportScene(scene)),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

const buildSceneFountainHeader = (scene: WritingScene) => {
  const heading = [scene.location.trim() || "INT.", scene.title.trim() || "SCENE", scene.timeOfDay.trim()]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return heading ? `.${heading}` : "";
};

const exportFountainDocument = (episodes: WritingEpisode[], title: string) =>
  [
    title.trim() ? `Title: ${title.trim()}` : "",
    "",
    ...episodes.flatMap((episode) => [
      `# ${episode.title.trim() || `Episode ${episode.id}`}`,
      "",
      ...episode.scenes.flatMap((scene) => [
        buildSceneFountainHeader(scene),
        "",
        scene.body.trim(),
        "",
      ]),
    ]),
  ]
    .filter((line, index, lines) => line.trim() || (index > 0 && lines[index - 1]?.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const serializeDraftDocument = (episodes: WritingEpisode[], title: string) => {
  const onlyEpisode = episodes.length === 1 ? episodes[0] : null;
  const onlyScene = onlyEpisode?.scenes.length === 1 ? onlyEpisode.scenes[0] : null;
  const isPlainDocument =
    !!onlyScene &&
    onlyScene.id === "1" &&
    (!onlyScene.title.trim() || onlyScene.title.trim().toUpperCase() === "SCRIPT") &&
    !onlyScene.location.trim() &&
    !onlyScene.timeOfDay.trim() &&
    !onlyScene.castLine.trim();
  return isPlainDocument ? onlyScene.body : exportFountainDocument(episodes, title);
};

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

const parseCastNames = (castLine: string) =>
  castLine
    .split(/[、，,／/|\s]+/)
    .map((name) => name.trim().replace(/^@/, ""))
    .filter(Boolean);

const countCharactersInBody = (body: string) => {
  const matches = body.match(/@([\w\u4e00-\u9fa5-]+)/g) || [];
  return Array.from(new Set(matches.map((item) => item.slice(1))));
};

const joinNodes = (parts: React.ReactNode[]) => parts.flatMap((part, index) => (index === 0 ? [part] : [<br key={`br-${index}`} />, part]));

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
  action: "Action",
  scene_heading: "Scene Heading",
  character: "Character",
  dual_dialogue: "Dual Dialogue",
  dialogue: "Dialogue",
  parenthetical: "Parenthetical",
  lyric: "Lyric",
  transition: "Transition",
  centered: "Centered",
  note: "Note",
  boneyard: "Boneyard",
  section: "Section",
  synopsis: "Synopsis",
  page_break: "Page Break",
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

const FOUNTAIN_VISUAL_TEMPLATE_INDENT: Partial<Record<FountainLineKind, string>> = {
  transition: "                                ",
  centered: "                    ",
  dual_dialogue: "                         ",
  character: "                  ",
  parenthetical: "              ",
};

const FOUNTAIN_EMPTY_TEMPLATE_LINES = new Set([
  ".INT. APARTMENT - DAY",
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
  const templateIndent = raw ? "" : FOUNTAIN_VISUAL_TEMPLATE_INDENT[targetKind] || "";

  switch (targetKind) {
    case "scene_heading":
      return raw ? `.${raw.toUpperCase()}` : ".INT. APARTMENT - DAY";
    case "character":
      return raw ? `@${raw.toUpperCase()}` : `${templateIndent}@CHARACTER`;
    case "dual_dialogue": {
      const cleaned = raw.replace(/\s*\^\s*$/, "").trim();
      return cleaned ? `@${cleaned.toUpperCase()} ^` : `${templateIndent}@CHARACTER ^`;
    }
    case "dialogue":
      return raw;
    case "parenthetical":
      return raw ? `(${raw})` : `${templateIndent}(beat)`;
    case "lyric":
      return `~${raw || "Lyric line"}`;
    case "transition":
      return raw
        ? `> ${raw.toUpperCase().endsWith(":") ? raw.toUpperCase() : `${raw.toUpperCase()}:`}`
        : `${templateIndent}> CUT TO:`;
    case "centered":
      return raw ? `> ${raw} <` : `${templateIndent}> CENTERED TEXT <`;
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
    case "scene_heading":
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

const ensureFlow = (flow: ProjectData["flow"]): NonNullable<ProjectData["flow"]> => ({
  pages: Array.isArray(flow?.pages) ? flow.pages : [],
  images: Array.isArray(flow?.images) ? flow.images : [],
  textNodes: Array.isArray(flow?.textNodes) ? flow.textNodes : [],
  flowNodes: Array.isArray(flow?.flowNodes) ? flow.flowNodes : [],
  links: Array.isArray(flow?.links) ? flow.links : [],
  graphLinks: Array.isArray(flow?.graphLinks) ? flow.graphLinks : [],
  globalAssetHistory: Array.isArray(flow?.globalAssetHistory) ? flow.globalAssetHistory : [],
  linkStyle: flow?.linkStyle,
  activeView: flow?.activeView,
  timeline: flow?.timeline,
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
  const [draft, setDraft] = useState<WritingEpisode[]>(() => buildDraftFromDocument(scriptNodeTitle, scriptNodeContent));
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<number>(() => draft[0]?.id || 1);
  const [selectedSceneId, setSelectedSceneId] = useState<string>(() => {
    const initialEpisode = draft[0];
    return initialEpisode?.scenes[0]?.id || "1-1";
  });
  const [cursorPos, setCursorPos] = useState(0);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [dismissedMentionStart, setDismissedMentionStart] = useState<number | null>(null);
  const [viewportSize, setViewportSize] = useState(
    typeof window !== "undefined"
      ? { width: window.innerWidth, height: window.innerHeight }
      : { width: 1440, height: 960 }
  );
  const [agentLine, setAgentLine] = useState<AgentLineState | null>(null);
  const [activeGuideIndex, setActiveGuideIndex] = useState(0);
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(true);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const agentComposerRef = useRef<HTMLTextAreaElement>(null);
  const writingRoomRef = useRef<HTMLDivElement>(null);
  const paperStackRef = useRef<HTMLDivElement>(null);
  const episodeRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const scenePaperRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingSceneSelectionRef = useRef<string | null>(null);
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
  const characterMatcher = useMemo(() => buildCharacterMatcher(knownCharacters), [knownCharacters]);

  useEffect(() => {
    const nextNodeId = scriptNode?.id || null;
    if (nextNodeId === loadedScriptNodeId) return;
    const nextDraft = buildDraftFromDocument(scriptNodeTitle, scriptNodeContent);
    setDraft(nextDraft);
    setSelectedEpisodeId(nextDraft[0]?.id || 1);
    setSelectedSceneId(nextDraft[0]?.scenes[0]?.id || "1");
    setLoadedScriptNodeId(nextNodeId);
    setAgentLine(null);
  }, [loadedScriptNodeId, scriptNode?.id, scriptNodeContent, scriptNodeTitle]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const selectedEpisode =
    draft.find((episode) => episode.id === selectedEpisodeId) || draft[0] || createEmptyEpisode(1);
  const selectedScene =
    selectedEpisode.scenes.find((scene) => scene.id === selectedSceneId) ||
    selectedEpisode.scenes[0] ||
    createEmptyScene(selectedEpisode.id, 1);

  useEffect(() => {
    if (!draft.some((episode) => episode.id === selectedEpisodeId)) {
      setSelectedEpisodeId(draft[0]?.id || 1);
    }
  }, [draft, selectedEpisodeId]);

  useEffect(() => {
    if (selectedEpisode.scenes.some((scene) => scene.id === selectedSceneId)) {
      if (pendingSceneSelectionRef.current === selectedSceneId) {
        pendingSceneSelectionRef.current = null;
      }
      return;
    }

    if (pendingSceneSelectionRef.current === selectedSceneId) {
      return;
    }

    if (!selectedEpisode.scenes.some((scene) => scene.id === selectedSceneId)) {
      setSelectedSceneId(selectedEpisode.scenes[0]?.id || `${selectedEpisode.id}-1`);
    }
  }, [selectedEpisode, selectedSceneId]);

  useEffect(() => {
    setAgentLine(null);
  }, [selectedEpisodeId, selectedSceneId]);

  useEffect(() => {
    const node = episodeRefs.current[selectedEpisodeId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedEpisodeId]);

  useEffect(() => {
    const node = scenePaperRefs.current[selectedSceneId];
    if (!node) return;
    const paperStack = paperStackRef.current;
    if (!paperStack) {
      node.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
      return;
    }

    const roomRect = paperStack.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const headerOffset = viewportSize.width < 760 ? 70 : 76;
    paperStack.scrollTo({
      top: Math.max(0, paperStack.scrollTop + nodeRect.top - roomRect.top - headerOffset),
      behavior: "smooth",
    });
  }, [selectedEpisode.scenes.length, selectedSceneId, viewportSize.width]);

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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveGuideIndex((current) => (current + 1) % 4);
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (agentLine) {
        event.preventDefault();
        setAgentLine(null);
        requestAnimationFrame(() => editorRef.current?.focus());
        return;
      }
      onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [agentLine, onClose]);

  const patchEpisode = (episodeId: number, updater: (episode: WritingEpisode) => WritingEpisode) => {
    setDraft((prev) => prev.map((episode) => (episode.id === episodeId ? updater(episode) : episode)));
  };

  const patchScene = (episodeId: number, sceneId: string, updater: (scene: WritingScene) => WritingScene) => {
    patchEpisode(episodeId, (episode) => ({
      ...episode,
      scenes: episode.scenes.map((scene) => (scene.id === sceneId ? updater(scene) : scene)),
    }));
  };

  const addScene = () => {
    const nextSceneIndex = selectedEpisode.scenes.length + 1;
    const nextScene = createEmptyScene(selectedEpisode.id, nextSceneIndex);
    pendingSceneSelectionRef.current = nextScene.id;
    patchEpisode(selectedEpisode.id, (episode) => ({
      ...episode,
      scenes: [...episode.scenes, nextScene],
    }));
    setSelectedSceneId(nextScene.id);
    requestAnimationFrame(() => {
      setSelectedSceneId(nextScene.id);
    });
  };

  const deleteScene = (sceneId: string) => {
    if (selectedEpisode.scenes.length <= 1) return;
    const sceneIndex = Math.max(0, selectedEpisode.scenes.findIndex((scene) => scene.id === sceneId));
    const sceneToDelete = selectedEpisode.scenes[sceneIndex];
    const hasContent = !!sceneToDelete && (sceneToDelete.body.trim() || sceneToDelete.title.trim() || sceneToDelete.castLine.trim());
    if (hasContent && !window.confirm(`删除场景 ${sceneToDelete.id || sceneIndex + 1}？`)) {
      return;
    }

    const nextScenes = selectedEpisode.scenes.filter((scene) => scene.id !== sceneId);
    const nextScene = nextScenes[Math.min(sceneIndex, nextScenes.length - 1)] || nextScenes[0];
    patchEpisode(selectedEpisode.id, (episode) => ({
      ...episode,
      scenes: nextScenes,
    }));
    if (nextScene) setSelectedSceneId(nextScene.id);
    setAgentLine(null);
  };

  const handleExportFountain = useCallback(() => {
    const title = projectData.fileName?.replace(/\.[^/.]+$/, "") || "qalam-script";
    const filename = `${title || "qalam-script"}.fountain`;
    downloadTextFile(filename, serializeDraftDocument(draft, title), "text/plain;charset=utf-8");
  }, [draft, projectData.fileName]);

  const parserIssues = useMemo(() => {
    const issues: string[] = [];
    const sceneIdSet = new Set<string>();

    draft.forEach((episode) => {
      episode.scenes.forEach((scene, index) => {
        const sceneKey = scene.id.trim();
        if (sceneIdSet.has(sceneKey)) {
          issues.push(`${sceneKey} appears more than once in the draft.`);
        }
        sceneIdSet.add(sceneKey);
        if (!scene.title.trim()) issues.push(`${sceneKey || `${episode.id}-${index + 1}`} is missing a slugline label.`);
        if (!scene.timeOfDay.trim()) issues.push(`${sceneKey || `${episode.id}-${index + 1}`} is missing time of day.`);
        if (!scene.location.trim()) issues.push(`${sceneKey || `${episode.id}-${index + 1}`} is missing INT./EXT. context.`);

        parseCastNames(scene.castLine).forEach((name) => {
          if (!characterMap.has(name)) {
            issues.push(`${sceneKey || `${episode.id}-${index + 1}`} cast line includes an unbound character: ${name}`);
          }
        });

        const lines = scene.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        if (!lines.length) {
          issues.push(`${sceneKey || `${episode.id}-${index + 1}`} still has no screenplay lines.`);
        }
        lines.forEach((line, lineIndex) => {
          const mentions = (line.match(/@([\w\u4e00-\u9fa5-]+)/g) || []).map((item) => item.slice(1));
          mentions.forEach((name) => {
            if (!characterMap.has(name)) {
              issues.push(`${sceneKey || `${episode.id}-${index + 1}`} line ${lineIndex + 1} references unknown mention @${name}`);
            }
          });
        });
      });
    });

    return Array.from(new Set(issues));
  }, [characterMap, draft]);

  const renderBoundText = useCallback(
    (text: string) => {
      if (!text) return "(Empty)";
      if (!characterMatcher) return text;
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      characterMatcher.lastIndex = 0;
      while ((match = characterMatcher.exec(text))) {
        const [matchedName] = match;
        const start = match.index;
        const end = start + matchedName.length;
        if (start > lastIndex) {
          parts.push(<React.Fragment key={`text-${lastIndex}`}>{text.slice(lastIndex, start)}</React.Fragment>);
        }
        const character = characterMap.get(matchedName);
        parts.push(
          <span
            key={`${matchedName}-${start}`}
            className="text-mention"
            data-kind="character"
            data-status={character ? "match" : "missing"}
            data-tooltip={buildCharacterDetail(character) || undefined}
          >
            @{matchedName}
          </span>
        );
        lastIndex = end;
      }
      if (lastIndex < text.length) {
        parts.push(<React.Fragment key={`text-${lastIndex}`}>{text.slice(lastIndex)}</React.Fragment>);
      }
      return parts;
    },
    [characterMap, characterMatcher]
  );

  const mentionState = useMemo(() => {
    const textBefore = selectedScene.body.slice(0, cursorPos);
    const match = textBefore.match(/@([\w\u4e00-\u9fa5-]*)$/);
    if (!match) return null;
    const start = textBefore.lastIndexOf("@");
    if (dismissedMentionStart !== null && dismissedMentionStart === start) return null;
    return {
      query: match[1] || "",
      start,
      end: cursorPos,
    };
  }, [cursorPos, dismissedMentionStart, selectedScene.body]);

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
  }, [mentionState?.query, selectedScene.id]);

  useEffect(() => {
    if (!mentionState) {
      setDismissedMentionStart(null);
    }
  }, [mentionState]);

  const insertMention = (characterName: string) => {
    if (!mentionState) return;
    const nextText = `${selectedScene.body.slice(0, mentionState.start)}@${characterName}${selectedScene.body.slice(mentionState.end)}`;
    const nextPos = mentionState.start + characterName.length + 1;
    patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, body: nextText }));
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

  const syncEditorScroll = () => {
    const editor = editorRef.current;
    const highlight = highlightRef.current;
    if (!editor || !highlight) return;
    highlight.scrollTop = editor.scrollTop;
    highlight.scrollLeft = editor.scrollLeft;
    setAgentLine((current) =>
      current ? { ...current, top: computeAgentLineTop(editor, current.anchor) } : current
    );
  };

  useEffect(() => {
    const editor = editorRef.current;
    const highlight = highlightRef.current;
    if (!editor) return;

    editor.style.height = "auto";
    const nextHeight = Math.max(640, editor.scrollHeight);
    editor.style.height = `${nextHeight}px`;
    if (highlight) {
      highlight.style.height = `${nextHeight}px`;
    }

    setAgentLine((current) =>
      current ? { ...current, top: computeAgentLineTop(editor, current.anchor) } : current
    );
  }, [computeAgentLineTop, selectedScene.body, selectedScene.id]);

  const handleSceneIdChange = useCallback(
    (previousId: string, nextId: string) => {
      patchScene(selectedEpisode.id, previousId, (scene) => ({ ...scene, id: nextId }));
      if (selectedSceneId === previousId) {
        setSelectedSceneId(nextId);
      }
    },
    [selectedEpisode.id, selectedSceneId]
  );

  const renderWritingLine = useCallback(
    (line: string, lineIndex: number, kind: FountainLineKind) => {
      if (!line) return <span className="writing-line-empty"> </span>;

      const inlineRegex = /(\[\[[\s\S]*?\]\]|\*\*\*[^*\n]+?\*\*\*|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|_[^_\n]+?_|@[\w\u4e00-\u9fa5-]+)/g;
      const parts: React.ReactNode[] = [];
      const displayLine = displayFountainLine(line, kind);
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      const pushText = (text: string, key: string) => {
        if (!text) return;
        parts.push(<React.Fragment key={key}>{text}</React.Fragment>);
      };

      inlineRegex.lastIndex = 0;
      while ((match = inlineRegex.exec(displayLine))) {
        const [full] = match;
        const start = match.index;
        const end = start + full.length;
        if (start > lastIndex) {
          pushText(displayLine.slice(lastIndex, start), `text-${lineIndex}-${lastIndex}`);
        }

        if (full.startsWith("@")) {
          const name = full.slice(1);
          const character = characterMap.get(name);
          parts.push(
            <span
              key={`mention-${lineIndex}-${name}-${start}`}
              className="text-mention"
              data-kind="character"
              data-status={character ? "match" : "missing"}
              data-tooltip={buildCharacterDetail(character) || undefined}
            >
              @{name}
            </span>
          );
        } else if (full.startsWith("[[")) {
          parts.push(
            <span key={`note-${lineIndex}-${start}`} className="writing-inline-note">
              {full.replace(/^\[\[/, "").replace(/\]\]$/, "").trim()}
            </span>
          );
        } else if (full.startsWith("***")) {
          parts.push(
            <strong key={`bold-italic-${lineIndex}-${start}`} className="writing-inline-bold-italic">
              {full.slice(3, -3)}
            </strong>
          );
        } else if (full.startsWith("**")) {
          parts.push(
            <strong key={`bold-${lineIndex}-${start}`} className="writing-inline-bold">
              {full.slice(2, -2)}
            </strong>
          );
        } else if (full.startsWith("*")) {
          parts.push(
            <em key={`italic-${lineIndex}-${start}`} className="writing-inline-italic">
              {full.slice(1, -1)}
            </em>
          );
        } else if (full.startsWith("_")) {
          parts.push(
            <span key={`underline-${lineIndex}-${start}`} className="writing-inline-underline">
              {full.slice(1, -1)}
            </span>
          );
        }

        lastIndex = end;
      }

      if (lastIndex < displayLine.length) {
        pushText(displayLine.slice(lastIndex), `text-${lineIndex}-${lastIndex}`);
      }

      return <span className={`writing-fountain-line writing-fountain-line--${kind}`}>{parts}</span>;
    },
    [characterMap]
  );

  const highlightedDraftBody = useMemo(() => {
    const lines = analyzeFountainLines(selectedScene.body);
    return joinNodes(
      lines.map(({ line, kind }, index) => {
        return <React.Fragment key={`line-${index}`}>{renderWritingLine(line, index, kind)}</React.Fragment>;
      })
    );
  }, [renderWritingLine, selectedScene.body]);

  const renderSceneHighlight = useCallback(
    (scene: WritingScene) => {
      const lines = analyzeFountainLines(scene.body);
      return joinNodes(
        lines.map(({ line, kind }, index) => {
          return <React.Fragment key={`${scene.id}-line-${index}`}>{renderWritingLine(line, index, kind)}</React.Fragment>;
        })
      );
    },
    [renderWritingLine]
  );

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
    const bounds = getLineBoundsAt(selectedScene.body, cursorPos);
    return analyzeFountainLines(selectedScene.body)[bounds.lineIndex]?.kind || "action";
  }, [cursorPos, selectedScene.body]);
  const currentFountainMeta = FOUNTAIN_FORMAT_META[currentFountainKind];

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
      let mappedSelection = mapSelection();
      let nextSelectionStart = mappedSelection.start;
      let nextSelectionEnd = mappedSelection.end;

      if (!rawLine && formattedLine) {
        nextSelectionStart = bounds.lineStart + templateSelection.start;
        nextSelectionEnd = bounds.lineStart + templateSelection.end;
      }

      if (nextKind === "dialogue") {
        const previousLine = getPreviousNonEmptyLine(lines, bounds.lineIndex);
        if (!isCharacterLine(previousLine)) {
          const insert = `@角色\n${formattedLine}`;
          const dialogueOffset = "@角色\n".length;
          nextText = `${text.slice(0, bounds.lineStart)}${insert}${text.slice(bounds.lineEnd)}`;
          if (!rawLine) {
            nextSelectionStart = bounds.lineStart + dialogueOffset + templateSelection.start;
            nextSelectionEnd = bounds.lineStart + dialogueOffset + templateSelection.end;
          } else {
            mappedSelection = mapSelection(dialogueOffset);
            nextSelectionStart = mappedSelection.start;
            nextSelectionEnd = mappedSelection.end;
          }
        }
      }

      patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, body: nextText }));
      requestAnimationFrame(() => {
        editor.focus();
        editor.selectionStart = nextSelectionStart;
        editor.selectionEnd = nextSelectionEnd;
        setCursorPos(nextSelectionEnd);
        syncEditorScroll();
      });
    },
    [selectedEpisode.id, selectedScene.id]
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

    if (event.key === "Enter" && !event.shiftKey && event.currentTarget.selectionStart === event.currentTarget.selectionEnd) {
      const selectionStart = event.currentTarget.selectionStart || 0;
      const textBefore = event.currentTarget.value.slice(0, selectionStart);
      if (textBefore.endsWith("\n\n")) {
        event.preventDefault();
        activateAgentLine(event.currentTarget);
        return;
      }
    }
  };

  const applyToProject = useCallback(() => {
    const nodeId = scriptNode?.id || initialScriptNodeId;
    if (!nodeId) return;
    const title = selectedEpisode.title.trim() || scriptNodeTitle || "剧本文档";
    const content = serializeDraftDocument(draft, title);
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
          pages: [],
          flowNodes,
        },
      };
    });
  }, [draft, initialScriptNodeId, scriptNode?.id, scriptNodeTitle, selectedEpisode.title, setProjectData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      applyToProject();
    }, 220);
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

  const selectedSceneIndex = Math.max(0, selectedEpisode.scenes.findIndex((scene) => scene.id === selectedScene.id));
  const isCompactLayout = viewportSize.width < 1180;
  const qalamPanelWidth = isCompactLayout
    ? Math.max(320, viewportSize.width - 32)
    : Math.min(440, Math.max(360, Math.floor(viewportSize.width * 0.3)));
  const screenplayLineCount = useMemo(
    () => Math.max(1, selectedScene.body.split(/\r?\n/).length),
    [selectedScene.body]
  );
  const scriptCharacterCount = selectedScene.body.trim().length;
  const totalSceneCount = draft.reduce((sum, episode) => sum + episode.scenes.length, 0);
  const sceneMentionCount = countCharactersInBody(selectedScene.body).length;
  const locationCount = new Set(
    draft.flatMap((episode) =>
      episode.scenes.map((scene) => scene.title.trim() || scene.location.trim()).filter(Boolean)
    )
  ).size;
  const writingGuides = useMemo(
    () => [
      "Fountain keeps the screenplay as plain text, with line prefixes carrying structure.",
      "Use Tab, Shift+Tab, or the format bar to cycle line styles.",
      "Scene metadata stays on the page and exports with the script.",
    ],
    []
  );
  const scriptStats = [
    { label: "场景", value: totalSceneCount },
    { label: "行数", value: screenplayLineCount },
    { label: "角色", value: sceneMentionCount },
    { label: "地点", value: locationCount },
    { label: "问题", value: parserIssues.length },
  ];
  const navigateScene = (delta: number) => {
    const nextIndex = selectedSceneIndex + delta;
    if (nextIndex < 0 || nextIndex >= selectedEpisode.scenes.length) return;
    setSelectedSceneId(selectedEpisode.scenes[nextIndex].id);
  };
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
                      onClick={() => navigateScene(-1)}
                      className="writing-icon-button"
                      disabled={selectedSceneIndex === 0}
                      title="上一场"
                    >
                      <ChevronLeft size={17} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateScene(1)}
                      className="writing-icon-button"
                      disabled={selectedSceneIndex === selectedEpisode.scenes.length - 1}
                      title="下一场"
                    >
                      <ChevronRight size={17} strokeWidth={1.8} />
                    </button>
                    <button type="button" onClick={addScene} className="writing-icon-button" title="新增场景">
                      <Plus size={17} strokeWidth={1.8} />
                    </button>
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
                      onClick={() => deleteScene(selectedScene.id)}
                      className="writing-icon-button writing-icon-button--danger"
                      disabled={selectedEpisode.scenes.length <= 1}
                      title={selectedEpisode.scenes.length <= 1 ? "至少保留一个场景" : "删除当前稿纸"}
                    >
                      <Trash2 size={17} strokeWidth={1.9} />
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
                <datalist id="writing-scene-boundary-options">
                  {SCENE_BOUNDARY_OPTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                <datalist id="writing-scene-time-options">
                  {SCENE_TIME_OPTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>

                <div ref={paperStackRef} className="writing-paper-stack">
                <div className="writing-paper-title-row">
                  <input
                    value={selectedEpisode.title}
                    onChange={(event) =>
                      patchEpisode(selectedEpisode.id, (current) => ({ ...current, title: event.target.value }))
                    }
                    className="writing-card-title-input"
                    placeholder="剧本文档"
                  />
                </div>
                  {selectedEpisode.scenes.map((scene) => {
                    const isActiveScene = scene.id === selectedScene.id;
                    return (
                      <div
                        key={scene.id}
                        ref={(node) => {
                          scenePaperRefs.current[scene.id] = node;
                        }}
                        className={`writing-script-paper ${isActiveScene ? "is-active" : ""}`}
                        onMouseDown={() => {
                          if (!isActiveScene) {
                            setSelectedSceneId(scene.id);
                            setAgentLine(null);
                          }
                        }}
                      >
                        <div className="writing-scene-strip">
                          <label className="writing-scene-field writing-scene-field--id">
                            <span className="writing-scene-field__label">Scene</span>
                            <input
                              value={scene.id}
                              onFocus={() => setSelectedSceneId(scene.id)}
                              onChange={(event) => handleSceneIdChange(scene.id, event.target.value)}
                              className="writing-scene-input writing-scene-input--id"
                              placeholder="1"
                            />
                          </label>
                          <label className="writing-scene-field writing-scene-field--boundary">
                            <span className="writing-scene-field__label">Type</span>
                            <input
                              value={scene.location}
                              list="writing-scene-boundary-options"
                              onFocus={() => setSelectedSceneId(scene.id)}
                              onChange={(event) =>
                                patchScene(selectedEpisode.id, scene.id, (current) => ({ ...current, location: event.target.value }))
                              }
                              className="writing-scene-input writing-scene-input--short"
                              placeholder="INT."
                            />
                          </label>
                          <label className="writing-scene-field writing-scene-field--location">
                            <span className="writing-scene-field__label">Location</span>
                            <input
                              value={scene.title}
                              onFocus={() => setSelectedSceneId(scene.id)}
                              onChange={(event) =>
                                patchScene(selectedEpisode.id, scene.id, (current) => ({ ...current, title: event.target.value }))
                              }
                              className="writing-scene-input"
                              placeholder="APARTMENT"
                            />
                          </label>
                          <label className="writing-scene-field writing-scene-field--time">
                            <span className="writing-scene-field__label">Time</span>
                            <input
                              value={scene.timeOfDay}
                              list="writing-scene-time-options"
                              onFocus={() => setSelectedSceneId(scene.id)}
                              onChange={(event) =>
                                patchScene(selectedEpisode.id, scene.id, (current) => ({ ...current, timeOfDay: event.target.value }))
                              }
                              className="writing-scene-input writing-scene-input--short"
                              placeholder="DAY"
                            />
                          </label>
                          <label className="writing-scene-field writing-scene-field--cast">
                            <span className="writing-scene-field__label">Cast</span>
                            <input
                              value={scene.castLine}
                              onFocus={() => setSelectedSceneId(scene.id)}
                              onChange={(event) =>
                                patchScene(selectedEpisode.id, scene.id, (current) => ({ ...current, castLine: event.target.value }))
                              }
                              className="writing-scene-input writing-scene-input--cast"
                              placeholder="CAST"
                            />
                          </label>
                        </div>

                        <div className="writing-paper-body relative flex-1">
                          {isActiveScene ? (
                            <>
                              <div
                                ref={highlightRef}
                                aria-hidden="true"
                                className="writing-editor-highlight pointer-events-none absolute left-0 right-0 top-0 z-0 overflow-hidden whitespace-pre-wrap px-10 pb-10 pt-8 font-sans text-[17px] leading-9"
                              >
                                {highlightedDraftBody}
                              </div>
                              <textarea
                                ref={editorRef}
                                value={selectedScene.body}
                                onFocus={() => setIsEditorFocused(true)}
                                onBlur={() => setIsEditorFocused(false)}
                                onChange={(event) =>
                                  patchScene(selectedEpisode.id, selectedScene.id, (current) => ({ ...current, body: event.target.value }))
                                }
                                onScroll={syncEditorScroll}
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
                                placeholder={"INT. APARTMENT - NIGHT\n\nRain presses against the window. A typewriter sits beneath a dim practical lamp.\n\nMARA\nI thought the rewrite would save us.\n\n(beat)\n\nJONAH\nThen write the version that hurts.\n\n\n"}
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
                            </>
                          ) : (
                            <button
                              type="button"
                              className="writing-paper-preview"
                              onClick={() => setSelectedSceneId(scene.id)}
                            >
                              <span className="writing-editor-highlight whitespace-pre-wrap px-10 pb-10 pt-8 font-sans text-[17px] leading-9">
                                {renderSceneHighlight(scene)}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="writing-format-dock">
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
                        const nextDraft = buildDraftFromDocument(selectedEpisode.title || "剧本文档", "");
                        setDraft(nextDraft);
                        setSelectedEpisodeId(nextDraft[0]?.id || 1);
                        setSelectedSceneId(nextDraft[0]?.scenes[0]?.id || "1");
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
                    {writingGuides.map((guide, index) => (
                      <div key={guide} className={`writing-guide-row ${index === activeGuideIndex % writingGuides.length ? "is-active" : ""}`}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <p>{guide}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="writing-side-section">
                  <div className="writing-side-label">Document</div>
                  <div className="writing-episode-list">
                    {draft.map((episode) => (
                      <button
                        key={episode.id}
                        type="button"
                        onClick={() => {
                          setSelectedEpisodeId(episode.id);
                          setSelectedSceneId(episode.scenes[0]?.id || `${episode.id}-1`);
                        }}
                        className={`writing-episode-item ${episode.id === selectedEpisode.id ? "is-active" : ""}`}
                      >
                        <span>{episode.title || "剧本文档"}</span>
                        <strong>{episode.scenes.length}</strong>
                      </button>
                    ))}
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
                    场景 {selectedSceneIndex + 1}/{selectedEpisode.scenes.length} · {scriptCharacterCount} 字
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
