import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CheckCircle2, ChevronRight, Plus, Sparkles } from "lucide-react";
import type { Character, Episode, ProjectData } from "../../types";
import { parseScriptToEpisodes } from "../../utils/parser";
import { projectRolesToCharacters } from "../../utils/projectRoles";

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
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

const titleClass = "text-[11px] font-black uppercase tracking-[0.24em] text-[var(--app-text-secondary)]";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildCharacterDetail = (character?: Character) => {
  if (!character) return "";
  return [
    character.name ? `角色：${character.name}` : "",
    character.role ? `身份：${character.role}` : "",
    typeof character.appearanceCount === "number" ? `出现次数：${character.appearanceCount}` : "",
    character.episodeUsage ? `出现区间：${character.episodeUsage}` : "",
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
  title: `场景 ${sceneIndex}`,
  timeOfDay: "",
  location: "",
  castLine: "",
  body: "",
});

const createEmptyEpisode = (episodeId: number): WritingEpisode => ({
  id: episodeId,
  title: `第${episodeId}集`,
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
        if (/OS/i.test(qualifier)) return `@${speaker.trim()} /os ${body.trim()}`;
        if (/VO/i.test(qualifier)) return `@${speaker.trim()} /vo ${body.trim()}`;
        return trimmed;
      }

      const dialogueMatch = trimmed.match(/^([^：:]+?)\s*[:：]\s*(.+)$/);
      if (dialogueMatch) {
        const [, speaker, body] = dialogueMatch;
        return `@${speaker.trim()}：${body.trim()}`;
      }

      if (trimmed.startsWith("△")) {
        return `# ${trimmed.replace(/^△\s*/, "")}`;
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
    title: (episode.title || `第${episode.id || index + 1}集`).trim(),
    scenes:
      episode.scenes?.length
        ? episode.scenes.map((scene, sceneIndex) => ({
            id: scene.id || `${episode.id || index + 1}-${sceneIndex + 1}`,
            title: scene.title || `场景 ${sceneIndex + 1}`,
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
    episode.title.trim() || `第${episode.id}集`,
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

export const WritingPanel: React.FC<Props> = ({ projectData, setProjectData }) => {
  const [draft, setDraft] = useState<WritingEpisode[]>(() =>
    buildDraftFromEpisodes(projectData.episodes, projectData.rawScript)
  );
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<number>(() => draft[0]?.id || 1);
  const [selectedSceneId, setSelectedSceneId] = useState<string>(() => draft[0]?.scenes[0]?.id || "1-1");
  const [cursorPos, setCursorPos] = useState(0);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [dismissedMentionStart, setDismissedMentionStart] = useState<number | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

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
  const selectedScenePreview = useMemo(() => exportScene(selectedScene), [selectedScene]);

  const parserIssues = useMemo(() => {
    const issues: string[] = [];
    const sceneIdSet = new Set<string>();

    draft.forEach((episode) => {
      if (!/^第.+集$/.test((episode.title || "").trim())) {
        issues.push(`${episode.title || `第${episode.id}集`} 的集标题不符合“第X集”格式。`);
      }

      episode.scenes.forEach((scene, index) => {
        const sceneKey = scene.id.trim();
        if (!/^\d+-\d+$/.test(sceneKey)) {
          issues.push(`${episode.title} 的第 ${index + 1} 场缺少合法场号。`);
        }
        if (sceneIdSet.has(sceneKey)) {
          issues.push(`${sceneKey} 在全剧本中重复出现。`);
        }
        sceneIdSet.add(sceneKey);
        if (sceneKey && !sceneKey.startsWith(`${episode.id}-`)) {
          issues.push(`${sceneKey} 的场号前缀与 ${episode.title} 不一致。`);
        }
        if (!scene.title.trim()) issues.push(`${sceneKey || `${episode.id}-${index + 1}`} 缺少场景标题。`);
        if (!scene.timeOfDay.trim()) issues.push(`${sceneKey || `${episode.id}-${index + 1}`} 缺少时间标记。`);
        if (!scene.location.trim()) issues.push(`${sceneKey || `${episode.id}-${index + 1}`} 缺少内/外标记。`);

        parseCastNames(scene.castLine).forEach((name) => {
          if (!characterMap.has(name)) {
            issues.push(`${sceneKey || `${episode.id}-${index + 1}`} 的人物行中包含未绑定角色：${name}`);
          }
        });

        const lines = scene.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        if (!lines.length) {
          issues.push(`${sceneKey || `${episode.id}-${index + 1}`} 还没有正文内容。`);
        }
        lines.forEach((line, lineIndex) => {
          const mentions = (line.match(/@([\w\u4e00-\u9fa5-]+)/g) || []).map((item) => item.slice(1));
          mentions.forEach((name) => {
            if (!characterMap.has(name)) {
              issues.push(`${sceneKey || `${episode.id}-${index + 1}`} 第 ${lineIndex + 1} 行引用了未绑定角色 @${name}`);
            }
          });
          if (/^@/.test(line) && !/[:：]/.test(line) && !/\/\s*(os|vo)/i.test(line)) {
            issues.push(`${sceneKey || `${episode.id}-${index + 1}`} 第 ${lineIndex + 1} 行以 @ 角色开头，但缺少对白或 /os /vo 标记。`);
          }
        });
      });
    });

    return Array.from(new Set(issues));
  }, [characterMap, draft]);

  const renderBoundText = useCallback(
    (text: string) => {
      if (!text) return "（空内容）";
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
    return knownCharacters.filter((character) => {
      const name = character.name.toLowerCase();
      const role = (character.role || "").toLowerCase();
      return name.includes(query) || role.includes(query);
    }).slice(0, 8);
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

  const syncEditorScroll = () => {
    const editor = editorRef.current;
    const highlight = highlightRef.current;
    if (!editor || !highlight) return;
    highlight.scrollTop = editor.scrollTop;
    highlight.scrollLeft = editor.scrollLeft;
  };

  const renderWritingLine = useCallback(
    (line: string, lineIndex: number) => {
      if (!line) return <span className="writing-line-empty"> </span>;

      const mentionRegex = /@([\w\u4e00-\u9fa5-]+)/g;
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      const pushMentions = (text: string, keyPrefix: string) => {
        const inner: React.ReactNode[] = [];
        let localLastIndex = 0;
        mentionRegex.lastIndex = 0;
        let innerMatch: RegExpExecArray | null;
        while ((innerMatch = mentionRegex.exec(text))) {
          const full = innerMatch[0];
          const name = innerMatch[1];
          const start = innerMatch.index;
          const end = start + full.length;
          if (start > localLastIndex) {
            inner.push(text.slice(localLastIndex, start));
          }
          const character = characterMap.get(name);
          inner.push(
            <span
              key={`${keyPrefix}-${name}-${start}`}
              className="text-mention"
              data-kind="character"
              data-status={character ? "match" : "missing"}
              data-tooltip={buildCharacterDetail(character) || undefined}
            >
              @{name}
            </span>
          );
          localLastIndex = end;
        }
        if (localLastIndex < text.length) {
          inner.push(text.slice(localLastIndex));
        }
        return inner;
      };

      const actionMatch = line.match(/^\s*#\s*(.*)$/);
      if (actionMatch) {
        parts.push(
          <span key={`action-${lineIndex}`} className="writing-token writing-token-action">
            #{" "}
          </span>
        );
        parts.push(...pushMentions(actionMatch[1], `action-body-${lineIndex}`));
        return <>{parts}</>;
      }

      const osVoMatch = line.match(/^(\s*@[\w\u4e00-\u9fa5-]+)(\s+\/\s*(os|vo)\b)(.*)$/i);
      if (osVoMatch) {
        parts.push(...pushMentions(osVoMatch[1], `speaker-${lineIndex}`));
        parts.push(
          <span key={`mode-${lineIndex}`} className="writing-token writing-token-mode">
            {osVoMatch[2]}
          </span>
        );
        if (osVoMatch[4]) {
          parts.push(...pushMentions(osVoMatch[4], `tail-${lineIndex}`));
        }
        return <>{parts}</>;
      }

      const dialogueMatch = line.match(/^(\s*@[\w\u4e00-\u9fa5-]+\s*[：:])(.*)$/);
      if (dialogueMatch) {
        parts.push(...pushMentions(dialogueMatch[1], `dialogue-head-${lineIndex}`));
        if (dialogueMatch[2]) {
          parts.push(...pushMentions(dialogueMatch[2], `dialogue-tail-${lineIndex}`));
        }
        return <>{parts}</>;
      }

      return <>{pushMentions(line, `plain-${lineIndex}`)}</>;
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

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionState || !filteredCharacters.length) return;

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
    }
  };

  const applyToProject = () => {
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
  };

  const sceneCharacterCount = countCharactersInBody(selectedScene.body);

  return (
    <div className="space-y-5 text-[var(--app-text-primary)]">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="space-y-4">
          <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4">
            <div className={titleClass}>Writing</div>
            <div className="mt-2 text-[13px] leading-6 text-[var(--app-text-secondary)]">
              专注写作面板。直接输入正文，通过轻量标记控制格式，而不是频繁点选块类型。
            </div>
            <button
              type="button"
              onClick={addEpisode}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-[var(--app-border-strong)] bg-[linear-gradient(180deg,rgba(16,185,129,0.18),rgba(16,185,129,0.06))] px-4 text-[12px] font-semibold text-[var(--app-text-primary)] transition hover:-translate-y-px"
            >
              <Plus size={14} />
              新建一集
            </button>
          </div>

          <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-3">
            <div className="px-2 pb-2">
              <div className={titleClass}>Episodes</div>
              <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">{draft.length} 集</div>
            </div>
            <div className="space-y-2">
              {draft.map((episode) => {
                const activeEpisode = episode.id === selectedEpisode.id;
                return (
                  <div
                    key={episode.id}
                    className={`rounded-[22px] border px-3 py-3 transition ${
                      activeEpisode
                        ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)]"
                        : "border-[var(--app-border)] bg-[var(--app-panel-muted)]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEpisodeId(episode.id);
                        setSelectedSceneId(episode.scenes[0]?.id || `${episode.id}-1`);
                      }}
                      className="w-full text-left"
                    >
                      <div className="text-[13px] font-semibold tracking-[-0.02em]">{episode.title}</div>
                      <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">{episode.scenes.length} 场</div>
                    </button>
                    {activeEpisode ? (
                      <div className="mt-3 space-y-1.5 border-t border-[var(--app-border)] pt-3">
                        {episode.scenes.map((scene) => (
                          <button
                            key={scene.id}
                            type="button"
                            onClick={() => setSelectedSceneId(scene.id)}
                            className={`flex w-full items-center justify-between rounded-[16px] px-3 py-2 text-left text-[12px] transition ${
                              scene.id === selectedScene.id
                                ? "bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]"
                                : "text-[var(--app-text-secondary)] hover:bg-[var(--app-panel-soft)]"
                            }`}
                          >
                            <span className="truncate">{scene.id} {scene.title}</span>
                            <ChevronRight size={12} />
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={addScene}
                          className="mt-1 flex w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-[var(--app-border)] px-3 py-2 text-[11px] text-[var(--app-text-secondary)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)]"
                        >
                          <Plus size={12} />
                          新建场次
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="rounded-[30px] border border-[var(--app-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className={titleClass}>Scene</div>
                <div className="mt-2 text-[22px] font-semibold tracking-[-0.03em]">
                  {selectedScene.id} {selectedScene.title}
                </div>
                <div className="mt-1 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                  直接输入正文。轻量语法：
                  <span className="mx-2 font-semibold text-[var(--app-text-primary)]">@角色名：对白</span>
                  <span className="mx-2 font-semibold text-[var(--app-text-primary)]">@角色名 /os 内心</span>
                  <span className="mx-2 font-semibold text-[var(--app-text-primary)]">@角色名 /vo 画外音</span>
                  <span className="mx-2 font-semibold text-[var(--app-text-primary)]"># 动作描写</span>
                </div>
              </div>
              <button
                type="button"
                onClick={applyToProject}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--app-border-strong)] bg-[linear-gradient(180deg,rgba(16,185,129,0.2),rgba(16,185,129,0.08))] px-5 text-[12px] font-semibold transition hover:-translate-y-px"
              >
                <Sparkles size={14} />
                写回项目
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[180px_minmax(0,1fr)_120px_120px]">
              <label className="space-y-2">
                <div className={titleClass}>Episode</div>
                <input
                  value={selectedEpisode.title}
                  onChange={(event) =>
                    patchEpisode(selectedEpisode.id, (episode) => ({ ...episode, title: event.target.value }))
                  }
                  className="w-full rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-[13px] outline-none transition focus:border-[var(--app-border-strong)]"
                />
              </label>
              <label className="space-y-2">
                <div className={titleClass}>Scene</div>
                <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3">
                  <input
                    value={selectedScene.id}
                    onChange={(event) =>
                      patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, id: event.target.value }))
                    }
                    className="w-full rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-[13px] outline-none transition focus:border-[var(--app-border-strong)]"
                  />
                  <input
                    value={selectedScene.title}
                    onChange={(event) =>
                      patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, title: event.target.value }))
                    }
                    className="w-full rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-[13px] outline-none transition focus:border-[var(--app-border-strong)]"
                  />
                </div>
              </label>
              <label className="space-y-2">
                <div className={titleClass}>Time</div>
                <input
                  value={selectedScene.timeOfDay}
                  onChange={(event) =>
                    patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, timeOfDay: event.target.value }))
                  }
                  className="w-full rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-[13px] outline-none transition focus:border-[var(--app-border-strong)]"
                />
              </label>
              <label className="space-y-2">
                <div className={titleClass}>Space</div>
                <input
                  value={selectedScene.location}
                  onChange={(event) =>
                    patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, location: event.target.value }))
                  }
                  className="w-full rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-[13px] outline-none transition focus:border-[var(--app-border-strong)]"
                />
              </label>
            </div>

            <label className="mt-4 block space-y-2">
              <div className={titleClass}>Cast</div>
              <input
                value={selectedScene.castLine}
                onChange={(event) =>
                  patchScene(selectedEpisode.id, selectedScene.id, (scene) => ({ ...scene, castLine: event.target.value }))
                }
                placeholder="人物：可选，留空时也可以只靠正文中的 @角色名"
                className="w-full rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-[13px] outline-none transition focus:border-[var(--app-border-strong)]"
              />
            </label>
          </div>

          <div className="rounded-[30px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className={titleClass}>Draft</div>
                <div className="mt-1 text-[12px] text-[var(--app-text-secondary)]">
                  聚焦在一块正文编辑区里写。系统只在你输入 `@ /os /vo #` 时理解格式，不要求来回点选。
                </div>
              </div>
              <div className="rounded-full border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-1.5 text-[11px] text-[var(--app-text-secondary)]">
                本场识别角色 {sceneCharacterCount.length}
              </div>
            </div>

            <div className="relative mt-4">
              <div
                ref={highlightRef}
                aria-hidden="true"
                className="writing-editor-highlight pointer-events-none absolute inset-0 z-0 overflow-auto whitespace-pre-wrap rounded-[26px] border border-[var(--app-border)] px-5 py-5 font-sans text-[15px] leading-8"
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
                placeholder={"# 红烛高照，洛青舟坐在桌边。\n@洛青舟 /os 我竟堂堂博士穿成了庶子。\n@婚服女子：......\n# 外面的风声压了过来。"}
                className="writing-editor relative z-10 w-full rounded-[26px] border border-[var(--app-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] px-5 py-5 font-sans text-[15px] leading-8 outline-none transition focus:border-[var(--app-border-strong)]"
              />

              {mentionState && filteredCharacters.length > 0 ? (
                <div className="mention-picker animate-in fade-in slide-in-from-top-1 absolute left-5 top-5 z-30 w-[320px]">
                  <div className="mention-picker-header">
                    <div className="mention-picker-title">角色绑定</div>
                    <div className="text-[10px] text-[var(--app-text-muted)]">↑↓ 选择，Enter / Tab 插入，Esc 关闭</div>
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
        </section>

        <aside className="space-y-4">
          <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-[var(--app-border)] bg-[linear-gradient(180deg,rgba(250,204,21,0.18),rgba(250,204,21,0.06))] text-yellow-200">
                <BookOpen size={18} />
              </div>
              <div>
                <div className={titleClass}>Preview</div>
                <div className="mt-1 text-[12px] text-[var(--app-text-secondary)]">当前场导出的标准格式。</div>
              </div>
            </div>
            <div className="mt-4 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-[22px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-4 text-[12px] leading-7 text-[var(--app-text-primary)]">
              {renderBoundText(selectedScenePreview)}
            </div>
          </div>

          <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className={parserIssues.length ? "text-amber-300" : "text-emerald-300"} />
              <div className={titleClass}>Format Check</div>
            </div>
            <div className="mt-3 rounded-[22px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-4">
              {parserIssues.length ? (
                <div className="space-y-2 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                  {parserIssues.slice(0, 8).map((issue, index) => (
                    <div key={`${issue}-${index}`}>• {issue}</div>
                  ))}
                </div>
              ) : (
                <div className="text-[12px] leading-6 text-emerald-200">
                  当前写法可以稳定导出为现有解析器可识别的标准剧本格式。
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4">
            <div className={titleClass}>Parser Preview</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-[20px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">Episodes</div>
                <div className="mt-1 text-[18px] font-semibold">{parserPreview.length}</div>
              </div>
              <div className="rounded-[20px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">Scenes</div>
                <div className="mt-1 text-[18px] font-semibold">
                  {parserPreview.reduce((sum, episode) => sum + (episode.scenes?.length || 0), 0)}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
