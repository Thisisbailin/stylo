import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Character, Episode, ProjectData } from "../../types";
import { parseScriptToEpisodes } from "../../utils/parser";
import { projectRolesToCharacters } from "../../utils/projectRoles";
import { QalamAgent } from "./QalamAgent";

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  onClose?: () => void;
  getAuthToken?: (options?: { skipCache?: boolean }) => Promise<string | null>;
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

export const WritingPanel: React.FC<Props> = ({ projectData, setProjectData, onClose, getAuthToken }) => {
  const [draft, setDraft] = useState<WritingEpisode[]>(() =>
    buildDraftFromEpisodes(projectData.episodes, projectData.rawScript)
  );
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<number>(() => draft[0]?.id || 1);
  const [selectedSceneId, setSelectedSceneId] = useState<string>(() => draft[0]?.scenes[0]?.id || "1-1");
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

  const fullScript = useMemo(() => exportDraft(draft), [draft]);
  const parserPreview = useMemo(() => parseScriptToEpisodes(fullScript), [fullScript]);
  const selectedScenePreview = useMemo(() => buildScenePreview(selectedScene), [selectedScene]);

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
          if (/^@/.test(line) && !/[:：]/.test(line) && !/\/\s*(os|vo)/i.test(line)) {
            issues.push(`${sceneKey || `${episode.id}-${index + 1}`} line ${lineIndex + 1} starts with @ but has no dialogue payload.`);
          }
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
    (line: string, lineIndex: number) => {
      if (!line) return <span className="writing-line-empty"> </span>;

      const mentionRegex = /@([\w\u4e00-\u9fa5-]+)/g;
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      mentionRegex.lastIndex = 0;
      while ((match = mentionRegex.exec(line))) {
        const [full, name] = match;
        const start = match.index;
        const end = start + full.length;
        if (start > lastIndex) {
          parts.push(line.slice(lastIndex, start));
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

      if (lastIndex < line.length) {
        parts.push(line.slice(lastIndex));
      }

      return <>{parts}</>;
    },
    [characterMap]
  );

  const highlightedDraftBody = useMemo(
    () =>
      joinNodes(
        selectedScene.body.split(/\r?\n/).map((line, index) => (
          <React.Fragment key={`line-${index}`}>{renderWritingLine(line, index)}</React.Fragment>
        ))
      ),
    [renderWritingLine, selectedScene.body]
  );

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

      if (event.key === "Enter" || event.key === "Tab") {
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

    if (event.key === "Enter" && !event.shiftKey && event.currentTarget.selectionStart === event.currentTarget.selectionEnd) {
      const selectionStart = event.currentTarget.selectionStart || 0;
      const textBefore = event.currentTarget.value.slice(0, selectionStart);
      if (textBefore.endsWith("\n\n")) {
        event.preventDefault();
        activateAgentLine(event.currentTarget);
      }
    }
  };

  const applyToProject = useCallback(() => {
    const generatedScript = exportDraft(draft);
    const parsedEpisodes = parseScriptToEpisodes(generatedScript);
    setProjectData((prev) => ({
      ...prev,
      rawScript: generatedScript,
      episodes: mergeEpisodes(prev.episodes, parsedEpisodes),
      context: {
        ...prev.context,
        episodeSummaries: (prev.context.episodeSummaries || []).filter((item) =>
          parsedEpisodes.some((episode) => episode.id === item.episodeId)
        ),
      },
    }));
  }, [draft, setProjectData]);

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

  const selectedEpisodeLineCount = selectedEpisode.scenes.reduce(
    (sum, scene) => sum + Math.max(1, scene.body.split(/\r?\n/).length),
    0
  );
  const selectedEpisodeIndex = Math.max(0, draft.findIndex((episode) => episode.id === selectedEpisode.id));
  const selectedSceneIndex = Math.max(0, selectedEpisode.scenes.findIndex((scene) => scene.id === selectedScene.id));
  const nextEpisode = selectedEpisodeIndex < draft.length - 1 ? draft[selectedEpisodeIndex + 1] : null;
  const isCompactLayout = viewportSize.width < 1180;
  const sidePeekWidth = isCompactLayout ? 26 : 34;
  const visibleRailGap = isCompactLayout ? 6 : 8;
  const qalamPanelWidth = isCompactLayout
    ? Math.max(320, viewportSize.width - 32)
    : Math.min(440, Math.max(360, Math.floor(viewportSize.width * 0.3)));
  const availableStageWidth = viewportSize.width - (isWritingQalamOpen && !isCompactLayout ? qalamPanelWidth + 104 : 72);
  const targetPaperHeight = clamp(
    viewportSize.height - (isCompactLayout ? (isWritingQalamOpen ? 420 : 360) : 320),
    520,
    820
  );
  const screenplayPaperWidth = Math.min(
    clamp(
      isCompactLayout ? availableStageWidth - 32 : availableStageWidth * 0.58,
      isCompactLayout ? 330 : 520,
      isCompactLayout ? 520 : 760
    ),
    Math.round(targetPaperHeight * (8.5 / 11))
  );
  const screenplayPaperHeight = Math.round(screenplayPaperWidth * (11 / 8.5));
  const screenplayPageLines = 55;
  const screenplayLineCount = useMemo(
    () => Math.max(1, selectedScene.body.split(/\r?\n/).length),
    [selectedScene.body]
  );
  const initialPaperOffset = screenplayPaperHeight * 0.5;
  const revealLineStep = initialPaperOffset / screenplayPageLines;
  const overflowLineStep = (screenplayPaperHeight * 0.48) / screenplayPageLines;
  const revealLineIndex = Math.min(Math.max(screenplayLineCount - 1, 0), screenplayPageLines);
  const overflowLineIndex = Math.max(screenplayLineCount - screenplayPageLines, 0);
  const paperRevealProgress = clamp(revealLineIndex / screenplayPageLines, 0, 1);
  const paperOverflowProgress = clamp(overflowLineIndex / screenplayPageLines, 0, 1);
  const revealScaleStep = 0.18 / screenplayPageLines;
  const overflowScaleStep = 0.12 / screenplayPageLines;
  const paperScale = overflowLineIndex > 0
    ? 1 + Math.min(0.12, overflowLineIndex * overflowScaleStep)
    : 1 + (screenplayPageLines - revealLineIndex) * revealScaleStep;
  const paperTranslateY = overflowLineIndex > 0
    ? -(overflowLineIndex * overflowLineStep)
    : initialPaperOffset - revealLineIndex * revealLineStep;
  const guideOpacity = clamp(1 - (screenplayLineCount - 1) / 14, 0, 1);
  const pageMoodLabel =
    screenplayLineCount <= 4
      ? "Opening lines"
      : screenplayLineCount < screenplayPageLines - 6
        ? "Building the page"
        : screenplayLineCount <= screenplayPageLines + 6
          ? "This page feels full"
          : "Natural page rollover";
  const writingGuides = useMemo(
    () => [
      { title: "Open on action", text: "Start with a clean action line or slugline. The page rises one line at a time." },
      { title: "Triple return for Qalam", text: "Three blank returns switches the current line into an agent message instead of screenplay text." },
      { title: "About 55 lines per page", text: "When the full sheet is revealed, you are roughly at a standard screenplay page rhythm." },
      { title: "Keep writing past the page", text: "After one page, each new line continues feeding the sheet upward like a typewriter carriage." },
    ],
    []
  );
  const activeGuide = writingGuides[activeGuideIndex % writingGuides.length];
  const navigateScene = (delta: number) => {
    const nextIndex = selectedSceneIndex + delta;
    if (nextIndex < 0 || nextIndex >= selectedEpisode.scenes.length) return;
    setSelectedSceneId(selectedEpisode.scenes[nextIndex].id);
  };
  const paperShiftStyle = isWritingQalamOpen
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
        <div className="writing-floating-controls pointer-events-auto absolute right-4 top-4 z-30 flex items-center gap-2 md:right-6 md:top-6">
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
            className="writing-floating-chip"
          >
            {isWritingQalamOpen ? "Hide Qalam" : "Open Qalam"}
          </button>
          <button type="button" onClick={handleClose} className="writing-floating-chip">
            Close
          </button>
        </div>

        <main className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 py-6 md:px-6 md:py-8">
          <div
            className="writing-stage flex h-full w-full items-center justify-center transition-[padding] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={paperShiftStyle}
          >
            <div className="writing-composer-stage pointer-events-auto">
              <div
                className="writing-guide-copy"
                style={{
                  opacity: guideOpacity,
                  transform: `translateY(${paperTranslateY * 0.18}px)`,
                }}
              >
                <div className="writing-guide-copy__eyebrow">{pageMoodLabel}</div>
                <div className="writing-guide-copy__text">{activeGuide.text}</div>
              </div>

              <div className="writing-paper-layout" style={{ gap: `${visibleRailGap}px` }}>
                <article
                  ref={(node) => {
                    episodeRefs.current[selectedEpisode.id] = node;
                  }}
                  className="writing-paper writing-paper--hero relative shrink-0"
                  style={{ width: `${screenplayPaperWidth}px`, height: `${screenplayPaperHeight}px` }}
                >
                  <div
                    className="writing-typewriter-sheet"
                    style={{
                      width: `${screenplayPaperWidth}px`,
                      height: `${screenplayPaperHeight}px`,
                      transform: `translate3d(0, ${paperTranslateY}px, 0) scale(${paperScale})`,
                    }}
                  >
                    <div className="writing-paper-head">
                      <div className="writing-paper-head__row">
                        <div className="writing-paper-head__meta">
                          <button type="button" onClick={() => navigateScene(-1)} className="writing-text-button" disabled={selectedSceneIndex === 0}>
                            ←
                          </button>
                          <span>{selectedEpisode.id.toString().padStart(2, "0")}</span>
                          <span>{selectedSceneIndex + 1}/{selectedEpisode.scenes.length}</span>
                          <button
                            type="button"
                            onClick={() => navigateScene(1)}
                            className="writing-text-button"
                            disabled={selectedSceneIndex === selectedEpisode.scenes.length - 1}
                          >
                            →
                          </button>
                          <button type="button" onClick={addScene} className="writing-text-button">
                            +
                          </button>
                        </div>
                        <div className="writing-paper-head__count">{selectedEpisodeLineCount} lines</div>
                      </div>
                      <input
                        value={selectedEpisode.title}
                        onChange={(event) =>
                          patchEpisode(selectedEpisode.id, (current) => ({ ...current, title: event.target.value }))
                        }
                        className="writing-paper-head__title"
                        placeholder={`Episode ${selectedEpisode.id}`}
                      />
                      <div className="writing-paper-head__slugline">
                        <input
                          value={selectedScene.id}
                          onChange={(event) =>
                            patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, id: event.target.value }))
                          }
                          className="writing-paper-head__slug-input writing-paper-head__slug-input--short"
                          placeholder={`${selectedEpisode.id}-1`}
                        />
                        <span className="writing-paper-head__dot">/</span>
                        <input
                          value={selectedScene.location}
                          onChange={(event) =>
                            patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, location: event.target.value }))
                          }
                          className="writing-paper-head__slug-input writing-paper-head__slug-input--tiny"
                          placeholder="INT."
                        />
                        <span className="writing-paper-head__dot">.</span>
                        <input
                          value={selectedScene.title}
                          onChange={(event) =>
                            patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, title: event.target.value }))
                          }
                          className="writing-paper-head__slug-input"
                          placeholder="APARTMENT"
                        />
                        <span className="writing-paper-head__dot">-</span>
                        <input
                          value={selectedScene.timeOfDay}
                          onChange={(event) =>
                            patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, timeOfDay: event.target.value }))
                          }
                          className="writing-paper-head__slug-input writing-paper-head__slug-input--tiny"
                          placeholder="NIGHT"
                        />
                      </div>
                      <div className="writing-paper-head__tear" aria-hidden="true" />
                    </div>

                    <div className="writing-paper-body relative flex-1">
                      <div
                        ref={highlightRef}
                        aria-hidden="true"
                        className="writing-editor-highlight pointer-events-none absolute inset-0 z-0 overflow-auto whitespace-pre-wrap px-8 pb-8 pt-6 font-sans text-[16px] leading-9"
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
                        className="writing-editor relative z-10 h-full w-full border-none bg-transparent px-8 pb-8 pt-6 font-sans text-[16px] leading-9 outline-none"
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
                        <div className="mention-picker animate-in fade-in slide-in-from-top-1 absolute left-8 top-6 z-30 w-[320px]">
                          <div className="mention-picker-header">
                            <div className="mention-picker-title">Character Mentions</div>
                            <div className="text-[10px] text-[var(--app-text-muted)]">↑↓ select, Enter / Tab insert, Esc dismiss</div>
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
                </article>

                {nextEpisode ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEpisodeId(nextEpisode.id);
                      setSelectedSceneId(nextEpisode.scenes[0]?.id || `${nextEpisode.id}-1`);
                    }}
                    className="writing-paper writing-paper--peek relative shrink-0"
                    style={{ width: `${sidePeekWidth}px`, height: `${screenplayPaperHeight}px` }}
                    title={nextEpisode.title}
                  >
                    <div className="writing-paper-peek__ghost" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={addEpisode}
                    className="writing-paper writing-paper--peek writing-paper--add relative shrink-0"
                    style={{ width: `${sidePeekWidth}px`, height: `${screenplayPaperHeight}px` }}
                    title="New Episode"
                  >
                    <div className="writing-paper-peek__ghost" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
