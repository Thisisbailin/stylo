import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Bot, ChevronLeft, ChevronRight, Download, Focus, Minimize2, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import type { Character, Episode, ProjectData, Scene } from "../../types";
import { parseScriptToEpisodes } from "../../utils/parser";
import { projectRolesToCharacters } from "../../utils/projectRoles";

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  onClose?: () => void;
  getAuthToken?: (options?: { skipCache?: boolean }) => Promise<string | null>;
  initialEpisodeId?: number | null;
  isQalamOpen?: boolean;
  onOpenQalam?: () => void;
  onCloseQalam?: () => void;
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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildCharacterDetail = (character?: Character) => {
  if (!character) return "";
  return [
    character.name ? `Character: ${character.name}` : "",
    character.role ? `Role: ${character.role}` : "",
    typeof character.appearanceCount === "number" ? `Appearances: ${character.appearanceCount}` : "",
    character.episodeUsage ? `Episodes: ${character.episodeUsage}` : "",
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

const createEmptyEpisode = (episodeId: number): WritingEpisode => ({
  id: episodeId,
  title: `Episode ${episodeId}`,
  scenes: [createEmptyScene(episodeId, 1)],
});

const sceneContentToDraftBody = (content: string) => {
  if (!content.trim()) return "";
  return content
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";

      const qualifiedMatch = trimmed.match(/^([^：（:]+?)\s*（([^）]+)）\s*[:：]\s*(.+)$/);
      if (qualifiedMatch) {
        const [, speaker, qualifier, body] = qualifiedMatch;
        if (/OS/i.test(qualifier)) return `${speaker.trim().toUpperCase()} (O.S.)\n${body.trim()}`;
        if (/VO/i.test(qualifier)) return `${speaker.trim().toUpperCase()} (V.O.)\n${body.trim()}`;
        return trimmed;
      }

      const dialogueMatch = trimmed.match(/^([^：:]+?)\s*[:：]\s*(.+)$/);
      if (dialogueMatch) {
        const [, speaker, body] = dialogueMatch;
        return `${speaker.trim().toUpperCase()}\n${body.trim()}`;
      }

      if (trimmed.startsWith("△")) {
        return trimmed.replace(/^△\s*/, "");
      }

      return trimmed;
    })
    .join("\n");
};

const buildDraftFromEpisodes = (episodes: Episode[], rawScript: string): WritingEpisode[] => {
  if (!episodes.length && !rawScript.trim()) return [createEmptyEpisode(1)];
  if (!episodes.length && rawScript.trim()) {
    return buildDraftFromEpisodes(parseScriptToEpisodes(rawScript), "");
  }

  return episodes.map((episode, index) => ({
    id: episode.id || index + 1,
    title: (episode.title || `Episode ${episode.id || index + 1}`).trim(),
    scenes:
      episode.scenes?.length
        ? episode.scenes.map((scene, sceneIndex) => ({
            id: scene.id || `${episode.id || index + 1}-${sceneIndex + 1}`,
            title: scene.title || `SCENE ${sceneIndex + 1}`,
            timeOfDay: scene.timeOfDay || "",
            location: scene.location || "",
            castLine: (episode.characters || []).join("、"),
            body: sceneContentToDraftBody(scene.content || ""),
          }))
        : [createEmptyScene(episode.id || index + 1, 1)],
  }));
};

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

const exportDraft = (episodes: WritingEpisode[]) => episodes.map(exportEpisode).filter(Boolean).join("\n\n");

const collectFountainCharacterNames = (body: string) => {
  const names = analyzeFountainLines(body)
    .map(({ line, kind }) => {
      if (kind !== "character" && kind !== "dual_dialogue") return "";
      return stripFountainMarkup(line).replace(/\s*\^\s*$/, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
    })
    .filter(Boolean);
  return Array.from(new Set(names));
};

const draftSceneToProjectScene = (scene: WritingScene): Scene => ({
  id: scene.id,
  title: scene.title.trim() || "SCENE",
  content: scene.body.trim(),
  timeOfDay: scene.timeOfDay.trim() || undefined,
  location: scene.location.trim() || undefined,
  metadata: {
    rawTitle: [scene.location.trim(), scene.title.trim(), scene.timeOfDay.trim()].filter(Boolean).join(" "),
    tokens: [scene.location.trim(), scene.title.trim(), scene.timeOfDay.trim()].filter(Boolean),
  },
});

const draftToProjectEpisodes = (episodes: WritingEpisode[]): Episode[] =>
  episodes.map((episode) => {
    const scenes = episode.scenes.map(draftSceneToProjectScene);
    const cast = Array.from(
      new Set([
        ...episode.scenes.flatMap((scene) => parseCastNames(scene.castLine)),
        ...episode.scenes.flatMap((scene) => collectFountainCharacterNames(scene.body)),
      ])
    );

    return {
      id: episode.id,
      title: episode.title.trim() || `Episode ${episode.id}`,
      content: scenes
        .map((scene) => [`${scene.id} ${scene.title}`, scene.content].filter(Boolean).join("\n"))
        .join("\n\n"),
      scenes,
      characters: cast,
      shots: [],
      status: "pending",
    };
  });

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

const mergeEpisodes = (previous: Episode[], parsed: Episode[]) => {
  const previousMap = new Map(previous.map((episode) => [episode.id, episode]));
  return parsed.map((episode) => {
    const prev = previousMap.get(episode.id);
    return {
      ...episode,
      summary: prev?.summary,
      shots: prev?.shots || [],
      status: prev?.status || "pending",
      errorMsg: prev?.errorMsg,
      shotGenUsage: prev?.shotGenUsage,
      soraGenUsage: prev?.soraGenUsage,
      storyboardGenUsage: prev?.storyboardGenUsage,
    };
  });
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

const compactText = (value: string, limit = 160) => {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "No draft on this page yet.";
  return clean.length > limit ? `${clean.slice(0, limit)}...` : clean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const summarizeEpisode = (episode: WritingEpisode) =>
  compactText(episode.scenes.map((scene) => scene.body).find((body) => body.trim()) || "");

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
  page_break: "Page Break",
};

const FOUNTAIN_FORMAT_META: Record<FountainLineKind, { marker: string; sample: string }> = {
  action: { marker: "!", sample: "!Action line" },
  scene_heading: { marker: ".", sample: ".INT. ROOM - DAY" },
  character: { marker: "@", sample: "@CHARACTER" },
  dual_dialogue: { marker: "^", sample: "@CHARACTER ^" },
  dialogue: { marker: "\"", sample: "Dialogue line" },
  parenthetical: { marker: "()", sample: "(beat)" },
  lyric: { marker: "~", sample: "~Lyric line" },
  transition: { marker: ">", sample: "> CUT TO:" },
  centered: { marker: "><", sample: "> Centered <" },
  note: { marker: "[[]]", sample: "[[note]]" },
  boneyard: { marker: "/* */", sample: "/* omitted text */" },
  section: { marker: "#", sample: "# Section" },
  synopsis: { marker: "=", sample: "= synopsis" },
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

const stripFountainMarkup = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (/^={3,}$/.test(trimmed)) return "";
  if (/^\[\[.*\]\]$/.test(trimmed)) return trimmed.replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
  if (/^>.*<$/.test(trimmed)) return trimmed.replace(/^>\s*/, "").replace(/\s*<$/, "").trim();
  if (/^>/.test(trimmed)) return trimmed.replace(/^>\s*/, "").trim();
  if (/^#+\s*/.test(trimmed)) return trimmed.replace(/^#+\s*/, "").trim();
  if (/^=\s*/.test(trimmed)) return trimmed.replace(/^=\s*/, "").trim();
  if (/^@/.test(trimmed)) return trimmed.replace(/^@+/, "").trim();
  if (/^!/.test(trimmed)) return trimmed.replace(/^!+/, "").trim();
  if (/^~/.test(trimmed)) return trimmed.replace(/^~+/, "").trim();
  if (/^\..+/.test(trimmed)) return trimmed.replace(/^\.+/, "").trim();
  if (/^\(.+\)$/.test(trimmed)) return trimmed.replace(/^\(/, "").replace(/\)$/, "").trim();
  return line;
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
  const raw = stripFountainMarkup(line).trim();

  switch (targetKind) {
    case "scene_heading":
      return raw ? `.${raw.toUpperCase()}` : ".INT. SCENE - DAY";
    case "character":
      return raw ? `@${raw.toUpperCase()}` : "@CHARACTER";
    case "dual_dialogue": {
      const cleaned = raw.replace(/\s*\^\s*$/, "").trim();
      return cleaned ? `@${cleaned.toUpperCase()} ^` : "@CHARACTER ^";
    }
    case "dialogue":
      return raw;
    case "parenthetical":
      return `(${raw || "beat"})`;
    case "lyric":
      return `~${raw || "Lyric line"}`;
    case "transition":
      return `> ${raw ? (raw.toUpperCase().endsWith(":") ? raw.toUpperCase() : `${raw.toUpperCase()}:`) : "CUT TO:"}`;
    case "centered":
      return `> ${raw || "Centered text"} <`;
    case "note":
      return `[[${raw || "note"}]]`;
    case "boneyard":
      return raw ? `/* ${raw} */` : "/* omitted text */";
    case "section":
      return `# ${raw || "Section"}`;
    case "synopsis":
      return `= ${raw || "synopsis"}`;
    case "page_break":
      return "===";
    case "action":
    default:
      return raw ? `!${raw}` : "";
  }
};

const getFountainTemplateSelection = (formattedLine: string, targetKind: FountainLineKind) => {
  switch (targetKind) {
    case "scene_heading":
    case "character":
      return { start: 1, end: formattedLine.length };
    case "dual_dialogue":
      return { start: 1, end: Math.max(1, formattedLine.length - 2) };
    case "parenthetical":
      return { start: 1, end: Math.max(1, formattedLine.length - 1) };
    case "lyric":
      return { start: 1, end: formattedLine.length };
    case "transition": {
      const start = formattedLine.startsWith("> ") ? 2 : 0;
      const end = formattedLine.endsWith(":") ? formattedLine.length - 1 : formattedLine.length;
      return { start, end: Math.max(start, end) };
    }
    case "centered":
      return { start: 2, end: Math.max(2, formattedLine.length - 2) };
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

const displayFountainLine = (line: string, kind: FountainLineKind) => {
  if (kind === "page_break") return " ";
  if (kind === "character") return stripFountainMarkup(line).toUpperCase();
  if (kind === "dual_dialogue") return stripFountainMarkup(line).replace(/\s*\^\s*$/, "").toUpperCase();
  if (kind === "scene_heading") return stripFountainMarkup(line).toUpperCase();
  if (kind === "transition") return stripFountainMarkup(line).toUpperCase();
  return stripFountainMarkup(line);
};

const buildScenePreview = (scene: WritingScene) => {
  const sluglineParts = [
    scene.location.trim().toUpperCase(),
    scene.title.trim().toUpperCase(),
    scene.timeOfDay.trim().toUpperCase(),
  ].filter(Boolean);
  const slugline = sluglineParts.join(" - ");
  return [slugline || scene.title.trim() || "UNTITLED SCENE", "", scene.body.trim()]
    .filter(Boolean)
    .join("\n");
};

export const WritingPanel: React.FC<Props> = ({
  projectData,
  setProjectData,
  onClose,
  initialEpisodeId,
  isQalamOpen = false,
  onOpenQalam,
  onCloseQalam,
  onSubmitToQalam,
}) => {
  const [draft, setDraft] = useState<WritingEpisode[]>(() =>
    buildDraftFromEpisodes(projectData.episodes, projectData.rawScript)
  );
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<number>(() => initialEpisodeId || draft[0]?.id || 1);
  const [selectedSceneId, setSelectedSceneId] = useState<string>(() => {
    const initialEpisode = draft.find((episode) => episode.id === initialEpisodeId) || draft[0];
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
  const episodeRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const scenePaperRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingSceneSelectionRef = useRef<string | null>(null);
  const agentLineTimerRef = useRef<number | null>(null);

  const knownCharacters = useMemo(
    () => projectRolesToCharacters(projectData.context.roles || []).filter((character) => !!character?.name?.trim()) as Character[],
    [projectData.context.roles]
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
    setDraft((current) => (current.length ? current : buildDraftFromEpisodes(projectData.episodes, projectData.rawScript)));
  }, [projectData.episodes, projectData.rawScript]);

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
    if (!initialEpisodeId) return;
    const nextEpisode = draft.find((episode) => episode.id === initialEpisodeId);
    if (!nextEpisode) return;
    setSelectedEpisodeId(nextEpisode.id);
    setSelectedSceneId(nextEpisode.scenes[0]?.id || `${nextEpisode.id}-1`);
  }, [draft, initialEpisodeId]);

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
    const room = writingRoomRef.current;
    if (!room) {
      node.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
      return;
    }

    const roomRect = room.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const headerOffset = viewportSize.width < 760 ? 150 : 126;
    room.scrollTo({
      top: Math.max(0, room.scrollTop + nodeRect.top - roomRect.top - headerOffset),
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

  const addEpisode = () => {
    const nextId = draft.length ? Math.max(...draft.map((episode) => episode.id)) + 1 : 1;
    const nextEpisode = createEmptyEpisode(nextId);
    setDraft((prev) => [...prev, nextEpisode]);
    setSelectedEpisodeId(nextEpisode.id);
    setSelectedSceneId(nextEpisode.scenes[0].id);
  };

  const deleteEpisode = () => {
    if (draft.length <= 1) return;
    const currentIndex = Math.max(0, draft.findIndex((episode) => episode.id === selectedEpisode.id));
    const hasContent = selectedEpisode.scenes.some((scene) => scene.body.trim() || scene.title.trim() || scene.castLine.trim());
    if (hasContent && !window.confirm(`Delete ${selectedEpisode.title || `Episode ${selectedEpisode.id}`} and all of its scenes?`)) {
      return;
    }

    const nextDraft = draft.filter((episode) => episode.id !== selectedEpisode.id);
    const nextEpisode = nextDraft[Math.min(currentIndex, nextDraft.length - 1)] || nextDraft[0];
    setDraft(nextDraft);
    if (nextEpisode) {
      setSelectedEpisodeId(nextEpisode.id);
      setSelectedSceneId(nextEpisode.scenes[0]?.id || `${nextEpisode.id}-1`);
    }
    setAgentLine(null);
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
    if (hasContent && !window.confirm(`Delete scene ${sceneToDelete.id || sceneIndex + 1}?`)) {
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

  const fountainScript = useMemo(
    () => exportFountainDocument(draft, projectData.fileName?.replace(/\.[^/.]+$/, "") || "qalam-script"),
    [draft, projectData.fileName]
  );
  const selectedScenePreview = useMemo(() => buildScenePreview(selectedScene), [selectedScene]);
  const handleExportFountain = useCallback(() => {
    const title = projectData.fileName?.replace(/\.[^/.]+$/, "") || "qalam-script";
    const filename = `${title || "qalam-script"}.fountain`;
    downloadTextFile(filename, exportFountainDocument(draft, title), "text/plain;charset=utf-8");
  }, [draft, projectData.fileName]);

  const parserIssues = useMemo(() => {
    const issues: string[] = [];
    const sceneIdSet = new Set<string>();

    draft.forEach((episode) => {
      if (!/^(episode\s+\d+|第.+集)$/i.test((episode.title || "").trim())) {
        issues.push(`${episode.title || `Episode ${episode.id}`} should follow an episode-style title.`);
      }

      episode.scenes.forEach((scene, index) => {
        const sceneKey = scene.id.trim();
        if (!/^\d+-\d+$/.test(sceneKey)) {
          issues.push(`${episode.title} scene ${index + 1} needs a valid scene number.`);
        }
        if (sceneIdSet.has(sceneKey)) {
          issues.push(`${sceneKey} appears more than once in the draft.`);
        }
        sceneIdSet.add(sceneKey);
        if (sceneKey && !sceneKey.startsWith(`${episode.id}-`)) {
          issues.push(`${sceneKey} should stay under ${episode.title}.`);
        }
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
      const cursor = editor.selectionStart || 0;
      const bounds = getLineBoundsAt(text, cursor);
      const lines = text.split(/\r?\n/);
      const rawLine = stripFountainMarkup(bounds.line).trim();
      const formattedLine = formatFountainLine(bounds.line, nextKind);
      const cursorOffset = Math.max(0, cursor - bounds.lineStart);
      const templateSelection = getFountainTemplateSelection(formattedLine, nextKind);

      let nextText = `${text.slice(0, bounds.lineStart)}${formattedLine}${text.slice(bounds.lineEnd)}`;
      let nextCursor = bounds.lineStart + Math.min(formattedLine.length, cursorOffset);
      let nextSelectionStart = nextCursor;
      let nextSelectionEnd = nextCursor;

      if (!rawLine && formattedLine) {
        nextSelectionStart = bounds.lineStart + templateSelection.start;
        nextSelectionEnd = bounds.lineStart + templateSelection.end;
        nextCursor = nextSelectionEnd;
      }

      if (nextKind === "dialogue") {
        const previousLine = getPreviousNonEmptyLine(lines, bounds.lineIndex);
        if (!isCharacterLine(previousLine)) {
          const insert = `@CHARACTER\n${formattedLine}`;
          nextText = `${text.slice(0, bounds.lineStart)}${insert}${text.slice(bounds.lineEnd)}`;
          nextCursor = bounds.lineStart + "@CHARACTER\n".length + Math.min(formattedLine.length, cursorOffset);
          nextSelectionStart = nextCursor;
          nextSelectionEnd = nextCursor;
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
    const parsedEpisodes = draftToProjectEpisodes(draft);
    setProjectData((prev) => ({
      ...prev,
      rawScript: fountainScript,
      episodes: mergeEpisodes(prev.episodes, parsedEpisodes),
      context: {
        ...prev.context,
        episodeSummaries: (prev.context.episodeSummaries || []).filter((item) =>
          parsedEpisodes.some((episode) => episode.id === item.episodeId)
        ),
      },
    }));
  }, [draft, fountainScript, setProjectData]);

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

  const selectedEpisodeIndex = Math.max(0, draft.findIndex((episode) => episode.id === selectedEpisode.id));
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
      "Fountain is stored as plain screenplay text with explicit line marks.",
      "Line format changes only through Tab, Shift+Tab, or the format dock.",
      "Scene metadata edits stay on the page and export with the draft.",
    ],
    []
  );
  const scriptStats = [
    { label: "Scenes", value: totalSceneCount },
    { label: "Lines", value: screenplayLineCount },
    { label: "Characters", value: sceneMentionCount },
    { label: "Locations", value: locationCount },
    { label: "Issues", value: parserIssues.length },
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
      className={`writing-room fixed inset-0 z-[61] overflow-y-auto overflow-x-hidden text-[var(--app-text-primary)] ${isFocusMode ? "is-focus-mode" : ""} ${isEditorFocused ? "is-editor-focused" : ""}`}
    >
      <div className="writing-canvas-backdrop absolute inset-0" aria-hidden="true" />
      <div className="relative min-h-[100dvh]">
        <main className="pointer-events-none relative z-[1] flex min-h-[100dvh] justify-center px-4 py-5 md:px-6 md:py-7">
          <div
            className="writing-stage pointer-events-auto min-h-[calc(100dvh-40px)] w-full transition-[padding] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={stageStyle}
          >
            <div className={`writing-studio-grid ${isInfoPanelOpen ? "is-info-open" : ""}`}>
              <section className="writing-script-shell">
                <header className="writing-floating-header" aria-label="Script editor actions">
                  <div className="writing-header-actions">
                    <button
                      type="button"
                      onClick={handleExportFountain}
                      className="writing-icon-button writing-action-label"
                      title="Export Fountain"
                    >
                      <Download size={17} strokeWidth={1.8} />
                      <span>Export</span>
                    </button>
                    <span
                      className="writing-format-pill"
                      title={`Current Fountain format: ${currentFountainMeta.sample}`}
                    >
                      <span className="writing-format-pill__marker">{currentFountainMeta.marker}</span>
                      <span>{FOUNTAIN_FORMAT_LABELS[currentFountainKind]}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => navigateScene(-1)}
                      className="writing-icon-button writing-action-label"
                      disabled={selectedSceneIndex === 0}
                      title="Previous scene"
                    >
                      <ChevronLeft size={17} strokeWidth={1.8} />
                      <span>Prev</span>
                    </button>
                    <span className="writing-scene-count">{selectedSceneIndex + 1}/{selectedEpisode.scenes.length}</span>
                    <button
                      type="button"
                      onClick={() => navigateScene(1)}
                      className="writing-icon-button writing-action-label"
                      disabled={selectedSceneIndex === selectedEpisode.scenes.length - 1}
                      title="Next scene"
                    >
                      <ChevronRight size={17} strokeWidth={1.8} />
                      <span>Next</span>
                    </button>
                    <button type="button" onClick={addScene} className="writing-icon-button writing-action-label" title="New scene">
                      <Plus size={17} strokeWidth={1.8} />
                      <span>Scene</span>
                    </button>
                    <button
                      type="button"
                      onClick={deleteEpisode}
                      className="writing-icon-button writing-action-label writing-icon-button--danger"
                      disabled={draft.length <= 1}
                      title={draft.length <= 1 ? "Keep at least one episode" : "Delete episode"}
                    >
                      <Trash2 size={16} strokeWidth={1.8} />
                      <span>Delete</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (isQalamOpen) {
                          onCloseQalam?.();
                          setAgentLine(null);
                        } else {
                          openWritingQalam();
                        }
                      }}
                      className="writing-icon-button writing-action-label"
                      title={isQalamOpen ? "Hide Qalam" : "Open Qalam"}
                    >
                      <Bot size={17} strokeWidth={1.8} />
                      <span>Qalam</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsInfoPanelOpen((current) => !current)}
                      className="writing-icon-button writing-action-label writing-more-button"
                      title={isInfoPanelOpen ? "Hide info" : "Show info"}
                    >
                      <MoreHorizontal size={18} strokeWidth={1.8} />
                      <span>Info</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsFocusMode((current) => !current)}
                      className={`writing-icon-button writing-action-label ${isFocusMode ? "is-active" : ""}`}
                      title={isFocusMode ? "Focus mode on" : "Focus mode off"}
                    >
                      <Focus size={17} strokeWidth={1.8} />
                      <span>Focus</span>
                    </button>
                    <button type="button" onClick={handleClose} className="writing-icon-button writing-action-label" title="退出全屏编辑">
                      <Minimize2 size={17} strokeWidth={1.8} />
                      <span>Exit</span>
                    </button>
                  </div>
                </header>

                <div className="writing-paper-stack">
                  <div className="writing-paper-title-row">
                    <input
                      value={selectedEpisode.title}
                      onChange={(event) =>
                        patchEpisode(selectedEpisode.id, (current) => ({ ...current, title: event.target.value }))
                      }
                      className="writing-card-title-input"
                      placeholder={`Episode ${selectedEpisode.id}`}
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
                          <input
                            value={scene.id}
                            onFocus={() => setSelectedSceneId(scene.id)}
                            onChange={(event) => handleSceneIdChange(scene.id, event.target.value)}
                            className="writing-scene-input writing-scene-input--id"
                            placeholder={`${selectedEpisode.id}-1`}
                          />
                          <input
                            value={scene.location}
                            onFocus={() => setSelectedSceneId(scene.id)}
                            onChange={(event) =>
                              patchScene(selectedEpisode.id, scene.id, (current) => ({ ...current, location: event.target.value }))
                            }
                            className="writing-scene-input writing-scene-input--short"
                            placeholder="INT."
                          />
                          <input
                            value={scene.title}
                            onFocus={() => setSelectedSceneId(scene.id)}
                            onChange={(event) =>
                              patchScene(selectedEpisode.id, scene.id, (current) => ({ ...current, title: event.target.value }))
                            }
                            className="writing-scene-input"
                            placeholder="APARTMENT"
                          />
                          <input
                            value={scene.timeOfDay}
                            onFocus={() => setSelectedSceneId(scene.id)}
                            onChange={(event) =>
                              patchScene(selectedEpisode.id, scene.id, (current) => ({ ...current, timeOfDay: event.target.value }))
                            }
                            className="writing-scene-input writing-scene-input--short"
                            placeholder="DAY"
                          />
                          <input
                            value={scene.castLine}
                            onFocus={() => setSelectedSceneId(scene.id)}
                            onChange={(event) =>
                              patchScene(selectedEpisode.id, scene.id, (current) => ({ ...current, castLine: event.target.value }))
                            }
                            className="writing-scene-input writing-scene-input--cast"
                            placeholder="CAST"
                          />
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => deleteScene(scene.id)}
                            className="writing-scene-delete"
                            disabled={selectedEpisode.scenes.length <= 1}
                            title={selectedEpisode.scenes.length <= 1 ? "Keep at least one scene" : "Delete scene"}
                          >
                            <Trash2 size={14} strokeWidth={1.9} />
                          </button>
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
                                    placeholder="Keep typing here to talk to Qalam. Press Enter to send, Esc to return to the script."
                                    className="writing-agent-line__input"
                                  />
                                </div>
                              ) : null}

                              {mentionState && filteredCharacters.length > 0 ? (
                                <div className="mention-picker animate-in fade-in slide-in-from-top-1 absolute left-10 top-8 z-30 w-[320px]">
                                  <div className="mention-picker-header">
                                    <div className="mention-picker-title">Character Mentions</div>
                                    <div className="text-[10px] text-[var(--app-text-muted)]">↑↓ select, Enter insert, Esc dismiss</div>
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
                                        <span className="text-[10px] text-[var(--node-text-secondary)]">{character.role || "Character"}</span>
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
                <header className="writing-info-header">
                  <div>
                    <div className="writing-card-kicker">Writing</div>
                    <div className="writing-info-title">Info</div>
                  </div>
                  <div className="writing-header-actions">
                    <button type="button" onClick={() => setIsInfoPanelOpen(false)} className="writing-icon-button" title="Hide info">
                      <X size={17} strokeWidth={1.8} />
                    </button>
                  </div>
                </header>

                <div className="writing-side-section">
                  <div className="writing-side-label">Format</div>
                  <div className="writing-guide-list">
                    {writingGuides.map((guide, index) => (
                      <div key={guide} className={`writing-guide-row ${index === activeGuideIndex % writingGuides.length ? "is-active" : ""}`}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <p>{guide}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="writing-side-section">
                  <div className="writing-side-label">Episodes</div>
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
                        <span>{episode.title || `Episode ${episode.id}`}</span>
                        <strong>{episode.scenes.length}</strong>
                      </button>
                    ))}
                    <button type="button" onClick={addEpisode} className="writing-episode-item writing-episode-item--add">
                      <span>New episode</span>
                      <Plus size={15} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>

                <div className="writing-side-section">
                  <div className="writing-side-label">Script data</div>
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
                  <span>{scriptCharacterCount} chars in current scene</span>
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
