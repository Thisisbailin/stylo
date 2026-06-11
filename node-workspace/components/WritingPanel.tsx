import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Bot, ChevronLeft, ChevronRight, Download, Minimize2, MoreHorizontal, Plus, X } from "lucide-react";
import type { Character, Episode, ProjectData, Scene } from "../../types";
import { parseScriptToEpisodes } from "../../utils/parser";
import { projectRolesToCharacters } from "../../utils/projectRoles";
import { QalamAgent } from "./QalamAgent";

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  onClose?: () => void;
  getAuthToken?: (options?: { skipCache?: boolean }) => Promise<string | null>;
  initialEpisodeId?: number | null;
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
  const names = body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("@")) return "";
      return stripFountainMarkup(trimmed).replace(/\s*\([^)]*\)\s*$/, "").trim();
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
  | "dialogue"
  | "parenthetical"
  | "transition"
  | "centered"
  | "note"
  | "section"
  | "synopsis"
  | "page_break";

const FOUNTAIN_FORMAT_ORDER: FountainLineKind[] = [
  "action",
  "scene_heading",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "centered",
  "note",
  "section",
  "synopsis",
  "page_break",
];

const FOUNTAIN_FORMAT_LABELS: Record<FountainLineKind, string> = {
  action: "Action",
  scene_heading: "Scene",
  character: "Character",
  dialogue: "Dialogue",
  parenthetical: "Paren",
  transition: "Transition",
  centered: "Centered",
  note: "Note",
  section: "Section",
  synopsis: "Synopsis",
  page_break: "Page Break",
};

const FOUNTAIN_QUICK_FORMATS: FountainLineKind[] = [
  "action",
  "scene_heading",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "centered",
  "note",
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
  if (/^\..+/.test(trimmed)) return trimmed.replace(/^\.+/, "").trim();
  if (/^\(.+\)$/.test(trimmed)) return trimmed.replace(/^\(/, "").replace(/\)$/, "").trim();
  return line;
};

const isCharacterLine = (line: string) => /^@/.test(line.trim());

const getPreviousNonEmptyLine = (lines: string[], lineIndex: number) => {
  for (let i = lineIndex - 1; i >= 0; i -= 1) {
    if (lines[i]?.trim()) return lines[i];
  }
  return "";
};

const getFountainLineKind = (line: string, previousNonEmptyLine = ""): FountainLineKind => {
  const trimmed = line.trim();
  if (!trimmed) return "action";
  if (/^={3,}$/.test(trimmed)) return "page_break";
  if (/^#+\s*/.test(trimmed)) return "section";
  if (/^=\s*/.test(trimmed)) return "synopsis";
  if (/^\[\[.*\]\]$/.test(trimmed)) return "note";
  if (/^>.*<$/.test(trimmed)) return "centered";
  if (/^>/.test(trimmed)) return "transition";
  if (/^\(.+\)$/.test(trimmed)) return "parenthetical";
  if (/^@/.test(trimmed)) return "character";
  if (/^\./.test(trimmed)) return "scene_heading";
  if (/^!/.test(trimmed)) return "action";
  if (isCharacterLine(previousNonEmptyLine)) return "dialogue";
  return "action";
};

const formatFountainLine = (line: string, targetKind: FountainLineKind) => {
  const raw = stripFountainMarkup(line).trim();
  const fallback = raw || (targetKind === "page_break" ? "" : targetKind === "character" ? "CHARACTER" : "Text");

  switch (targetKind) {
    case "scene_heading":
      return `.${fallback.toUpperCase()}`;
    case "character":
      return `@${fallback.toUpperCase()}`;
    case "dialogue":
      return fallback === "Text" ? "Dialogue line" : fallback;
    case "parenthetical":
      return `(${fallback === "Text" ? "beat" : fallback})`;
    case "transition":
      return `> ${fallback === "Text" ? "CUT TO:" : fallback.toUpperCase().endsWith(":") ? fallback.toUpperCase() : `${fallback.toUpperCase()}:`}`;
    case "centered":
      return `> ${fallback} <`;
    case "note":
      return `[[${fallback === "Text" ? "note" : fallback}]]`;
    case "section":
      return `# ${fallback === "Text" ? "Act One" : fallback}`;
    case "synopsis":
      return `= ${fallback === "Text" ? "summary" : fallback}`;
    case "page_break":
      return "===";
    case "action":
    default:
      return raw ? `!${raw}` : "";
  }
};

const getNextFountainLineKind = (currentKind: FountainLineKind): FountainLineKind => {
  switch (currentKind) {
    case "scene_heading":
      return "action";
    case "character":
    case "parenthetical":
      return "dialogue";
    case "transition":
    case "centered":
    case "note":
    case "section":
    case "synopsis":
    case "page_break":
      return "action";
    case "dialogue":
    case "action":
    default:
      return "action";
  }
};

const createEmptyFountainLine = (kind: FountainLineKind) => {
  switch (kind) {
    case "scene_heading":
      return ".INT. SCENE - DAY";
    case "character":
      return "@CHARACTER";
    case "dialogue":
      return "";
    case "parenthetical":
      return "(beat)";
    case "transition":
      return "> CUT TO:";
    case "centered":
      return "> TEXT <";
    case "note":
      return "[[note]]";
    case "section":
      return "# Section";
    case "synopsis":
      return "= summary";
    case "page_break":
      return "===";
    case "action":
    default:
      return "";
  }
};

const displayFountainLine = (line: string, kind: FountainLineKind) => {
  if (kind === "page_break") return " ";
  if (kind === "character") return stripFountainMarkup(line).toUpperCase();
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

export const WritingPanel: React.FC<Props> = ({ projectData, setProjectData, onClose, getAuthToken, initialEpisodeId }) => {
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
  const [isWritingQalamOpen, setIsWritingQalamOpen] = useState(false);
  const [writingQalamResetToken, setWritingQalamResetToken] = useState(0);
  const [writingQalamSubmitRequest, setWritingQalamSubmitRequest] = useState<{ id: number; text: string } | null>(null);
  const [agentLine, setAgentLine] = useState<AgentLineState | null>(null);
  const [activeGuideIndex, setActiveGuideIndex] = useState(0);
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const agentComposerRef = useRef<HTMLTextAreaElement>(null);
  const episodeRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const submitRequestIdRef = useRef(0);
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

  const addScene = () => {
    const nextSceneIndex = selectedEpisode.scenes.length + 1;
    const nextScene = createEmptyScene(selectedEpisode.id, nextSceneIndex);
    patchEpisode(selectedEpisode.id, (episode) => ({
      ...episode,
      scenes: [...episode.scenes, nextScene],
    }));
    setSelectedSceneId(nextScene.id);
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
    const lineIndex = editor.value.slice(0, anchor).split("\n").length - 1;
    return Math.max(20, Math.min(editor.clientHeight - 88, paddingTop + lineIndex * lineHeight - editor.scrollTop));
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

  const renderWritingLine = useCallback(
    (line: string, lineIndex: number, kind: FountainLineKind) => {
      if (!line) return <span className="writing-line-empty"> </span>;

      const mentionRegex = /@([\w\u4e00-\u9fa5-]+)/g;
      const parts: React.ReactNode[] = [];
      const displayLine = displayFountainLine(line, kind);
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      mentionRegex.lastIndex = 0;
      while ((match = mentionRegex.exec(displayLine))) {
        const [full, name] = match;
        const start = match.index;
        const end = start + full.length;
        if (start > lastIndex) {
          parts.push(displayLine.slice(lastIndex, start));
        }
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
        lastIndex = end;
      }

      if (lastIndex < displayLine.length) {
        parts.push(displayLine.slice(lastIndex));
      }

      return <span className={`writing-fountain-line writing-fountain-line--${kind}`}>{parts}</span>;
    },
    [characterMap]
  );

  const highlightedDraftBody = useMemo(() => {
    const lines = selectedScene.body.split(/\r?\n/);
    return joinNodes(
      lines.map((line, index) => {
        const previous = getPreviousNonEmptyLine(lines, index);
        const kind = getFountainLineKind(line, previous);
        return <React.Fragment key={`line-${index}`}>{renderWritingLine(line, index, kind)}</React.Fragment>;
      })
    );
  }, [renderWritingLine, selectedScene.body]);

  const openWritingQalam = useCallback((freshConversation: boolean) => {
    setIsWritingQalamOpen(true);
    if (freshConversation) {
      setWritingQalamResetToken((current) => current + 1);
    }
  }, []);

  const closeAgentLine = useCallback(() => {
    setAgentLine(null);
    requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const activateAgentLine = useCallback(
    (editor: HTMLTextAreaElement) => {
      openWritingQalam(!isWritingQalamOpen);
      const anchor = editor.selectionStart || 0;
      setAgentLine({
        anchor,
        top: computeAgentLineTop(editor, anchor),
        text: "",
        phase: "active",
      });
    },
    [computeAgentLineTop, isWritingQalamOpen, openWritingQalam]
  );

  const currentFountainKind = useMemo(() => {
    const bounds = getLineBoundsAt(selectedScene.body, cursorPos);
    const lines = selectedScene.body.split(/\r?\n/);
    return getFountainLineKind(bounds.line, getPreviousNonEmptyLine(lines, bounds.lineIndex));
  }, [cursorPos, selectedScene.body]);

  const applyFountainLineFormat = useCallback(
    (editor: HTMLTextAreaElement, nextKind: FountainLineKind) => {
      const text = editor.value;
      const cursor = editor.selectionStart || 0;
      const bounds = getLineBoundsAt(text, cursor);
      const lines = text.split(/\r?\n/);
      const formattedLine = formatFountainLine(bounds.line, nextKind);
      const cursorOffset = Math.max(0, cursor - bounds.lineStart);

      let nextText = `${text.slice(0, bounds.lineStart)}${formattedLine}${text.slice(bounds.lineEnd)}`;
      let nextCursor = bounds.lineStart + Math.min(formattedLine.length, cursorOffset);

      if (nextKind === "dialogue") {
        const previousLine = getPreviousNonEmptyLine(lines, bounds.lineIndex);
        if (!isCharacterLine(previousLine)) {
          const insert = `@CHARACTER\n${formattedLine}`;
          nextText = `${text.slice(0, bounds.lineStart)}${insert}${text.slice(bounds.lineEnd)}`;
          nextCursor = bounds.lineStart + "@CHARACTER\n".length + Math.min(formattedLine.length, cursorOffset);
        }
      }

      patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, body: nextText }));
      requestAnimationFrame(() => {
        editor.focus();
        editor.selectionStart = nextCursor;
        editor.selectionEnd = nextCursor;
        setCursorPos(nextCursor);
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

  const insertStructuredFountainBreak = useCallback(
    (editor: HTMLTextAreaElement) => {
      const text = editor.value;
      const cursor = editor.selectionStart || 0;
      const bounds = getLineBoundsAt(text, cursor);
      const lines = text.split(/\r?\n/);
      const currentKind = getFountainLineKind(bounds.line, getPreviousNonEmptyLine(lines, bounds.lineIndex));
      const nextKind = getNextFountainLineKind(currentKind);
      const nextLine = createEmptyFountainLine(nextKind);
      const insertion = `\n${nextLine}`;
      const selectionEnd = editor.selectionEnd || cursor;
      const nextText = `${text.slice(0, cursor)}${insertion}${text.slice(selectionEnd)}`;
      const nextCursor = cursor + insertion.length;

      patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, body: nextText }));
      requestAnimationFrame(() => {
        editor.focus();
        editor.selectionStart = nextCursor;
        editor.selectionEnd = nextCursor;
        setCursorPos(nextCursor);
        syncEditorScroll();
      });
    },
    [selectedEpisode.id, selectedScene.id]
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
      event.preventDefault();
      insertStructuredFountainBreak(event.currentTarget);
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
    submitRequestIdRef.current += 1;
    setWritingQalamSubmitRequest({ id: submitRequestIdRef.current, text });
    setAgentLine((current) => (current ? { ...current, phase: "sent" } : current));
    if (agentLineTimerRef.current) {
      window.clearTimeout(agentLineTimerRef.current);
    }
    agentLineTimerRef.current = window.setTimeout(() => {
      setAgentLine(null);
      requestAnimationFrame(() => editorRef.current?.focus());
    }, 260);
  }, [agentLine, closeAgentLine]);

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
      "Fountain draft: scene heading, action, character cue, dialogue.",
      "Triple return opens a Qalam dialogue line inside the page.",
      "Scene metadata edits directly on the page.",
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
  const stageStyle = isWritingQalamOpen
    ? isCompactLayout
      ? { paddingTop: `${Math.max(316, Math.floor(viewportSize.height * 0.36))}px` }
      : { paddingLeft: `${qalamPanelWidth + 44}px` }
    : undefined;
  const handleClose = () => {
    applyToProject();
    onClose?.();
  };

  return (
    <div className="writing-room fixed inset-0 z-[61] overflow-hidden text-[var(--app-text-primary)]">
      <div className="writing-canvas-backdrop absolute inset-0" aria-hidden="true" />
      {isWritingQalamOpen ? (
        <QalamAgent
          projectData={projectData}
          setProjectData={setProjectData}
          getAuthToken={getAuthToken}
          agentFirstMode
          showUsageBadge={false}
          conversationStorageKey="qalam_writing_conversations_v1"
          conversationResetToken={writingQalamResetToken}
          submitRequest={writingQalamSubmitRequest}
          panelStyleOverride={{
            top: isCompactLayout ? 94 : 104,
            left: isCompactLayout ? 16 : 24,
            width: qalamPanelWidth,
            maxWidth: `calc(100vw - ${isCompactLayout ? 32 : 48}px)`,
            zIndex: 72,
          }}
        />
      ) : null}

      <div className="relative min-h-[100dvh]">
        <main className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 py-5 md:px-6 md:py-7">
          <div
            className="writing-stage pointer-events-auto h-full w-full transition-[padding] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={stageStyle}
          >
            <div className={`writing-studio-grid ${isInfoPanelOpen ? "is-info-open" : ""}`}>
              <section className="writing-card writing-script-card">
                <header className="writing-card-header">
                  <div>
                    <div className="writing-card-kicker">Script</div>
                    <input
                      value={selectedEpisode.title}
                      onChange={(event) =>
                        patchEpisode(selectedEpisode.id, (current) => ({ ...current, title: event.target.value }))
                      }
                      className="writing-card-title-input"
                      placeholder={`Episode ${selectedEpisode.id}`}
                    />
                  </div>
                  <div className="writing-header-actions">
                    <button
                      type="button"
                      onClick={handleExportFountain}
                      className="writing-icon-button"
                      title="Export Fountain"
                    >
                      <Download size={17} strokeWidth={1.8} />
                    </button>
                    <span className="writing-format-pill" title="Tab cycles line format, Shift+Tab cycles backward">
                      {FOUNTAIN_FORMAT_LABELS[currentFountainKind]}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigateScene(-1)}
                      className="writing-icon-button"
                      disabled={selectedSceneIndex === 0}
                      title="Previous scene"
                    >
                      <ChevronLeft size={17} strokeWidth={1.8} />
                    </button>
                    <span className="writing-scene-count">{selectedSceneIndex + 1}/{selectedEpisode.scenes.length}</span>
                    <button
                      type="button"
                      onClick={() => navigateScene(1)}
                      className="writing-icon-button"
                      disabled={selectedSceneIndex === selectedEpisode.scenes.length - 1}
                      title="Next scene"
                    >
                      <ChevronRight size={17} strokeWidth={1.8} />
                    </button>
                    <button type="button" onClick={addScene} className="writing-icon-button" title="New scene">
                      <Plus size={17} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (isWritingQalamOpen) {
                          setIsWritingQalamOpen(false);
                          setAgentLine(null);
                        } else {
                          openWritingQalam(true);
                        }
                      }}
                      className="writing-icon-button"
                      title={isWritingQalamOpen ? "Hide Qalam" : "Open Qalam"}
                    >
                      <Bot size={17} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsInfoPanelOpen((current) => !current)}
                      className="writing-icon-button writing-more-button"
                      title={isInfoPanelOpen ? "Hide info" : "Show info"}
                    >
                      <MoreHorizontal size={18} strokeWidth={1.8} />
                    </button>
                    <button type="button" onClick={handleClose} className="writing-icon-button" title="退出全屏编辑">
                      <Minimize2 size={17} strokeWidth={1.8} />
                    </button>
                  </div>
                </header>

                <div className="writing-script-paper">
                  <div className="writing-scene-strip">
                    <input
                      value={selectedScene.id}
                      onChange={(event) =>
                        patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, id: event.target.value }))
                      }
                      className="writing-scene-input writing-scene-input--id"
                      placeholder={`${selectedEpisode.id}-1`}
                    />
                    <input
                      value={selectedScene.location}
                      onChange={(event) =>
                        patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, location: event.target.value }))
                      }
                      className="writing-scene-input writing-scene-input--short"
                      placeholder="INT."
                    />
                    <input
                      value={selectedScene.title}
                      onChange={(event) =>
                        patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, title: event.target.value }))
                      }
                      className="writing-scene-input"
                      placeholder="APARTMENT"
                    />
                    <input
                      value={selectedScene.timeOfDay}
                      onChange={(event) =>
                        patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, timeOfDay: event.target.value }))
                      }
                      className="writing-scene-input writing-scene-input--short"
                      placeholder="DAY"
                    />
                    <input
                      value={selectedScene.castLine}
                      onChange={(event) =>
                        patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, castLine: event.target.value }))
                      }
                      className="writing-scene-input writing-scene-input--cast"
                      placeholder="CAST"
                    />
                  </div>
                  <div className="writing-format-bar">
                    {FOUNTAIN_QUICK_FORMATS.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          const editor = editorRef.current;
                          if (!editor) return;
                          applyFountainLineFormat(editor, kind);
                        }}
                        className={`writing-format-button ${currentFountainKind === kind ? "is-active" : ""}`}
                      >
                        {FOUNTAIN_FORMAT_LABELS[kind]}
                      </button>
                    ))}
                  </div>
                  <div className="writing-paper-body relative flex-1">
                      <div
                        ref={highlightRef}
                        aria-hidden="true"
                        className="writing-editor-highlight pointer-events-none absolute inset-0 z-0 overflow-auto whitespace-pre-wrap px-10 pb-10 pt-8 font-sans text-[17px] leading-9"
                      >
                        {highlightedDraftBody}
                      </div>
                      <textarea
                        ref={editorRef}
                        value={selectedScene.body}
                        onChange={(event) =>
                          patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, body: event.target.value }))
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
                        className="writing-editor relative z-10 h-full w-full border-none bg-transparent px-10 pb-10 pt-8 font-sans text-[17px] leading-9 outline-none"
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
