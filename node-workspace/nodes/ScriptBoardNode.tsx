import React, { useCallback, useMemo } from "react";
import { BookOpen } from "lucide-react";
import { BaseNode } from "./BaseNode";
import { ScriptBoardNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { Character } from "../../types";
import { resolveScriptBoardNodeTitle } from "../nodeflow/titles";

type Props = {
  id: string;
  data: ScriptBoardNodeData;
};

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

export const ScriptBoardNode: React.FC<Props & { selected?: boolean }> = ({ id, data, selected }) => {
  const { updateNodeData, nodeFlowContext } = useNodeFlowStore();
  const nodeTitle = useMemo(() => resolveScriptBoardNodeTitle(data, nodeFlowContext), [data, nodeFlowContext]);
  const episodes = nodeFlowContext.episodes || [];
  const characters = useMemo(
    () => (nodeFlowContext.context?.characters || []).filter((character) => !!character?.name?.trim()),
    [nodeFlowContext.context?.characters]
  );
  const characterMap = useMemo(() => {
    const map = new Map<string, Character>();
    characters.forEach((character) => {
      if (character.name?.trim()) {
        map.set(character.name.trim(), character);
      }
    });
    return map;
  }, [characters]);
  const characterMatcher = useMemo(() => buildCharacterMatcher(characters), [characters]);

  const episode = useMemo(() => {
    return episodes.find((item) => item.id === data.episodeId) ?? episodes[0] ?? null;
  }, [data.episodeId, episodes]);

  const sceneBlocks = useMemo(() => {
    if (!episode) return [];
    if (episode.scenes?.length) return episode.scenes;
    return [
      {
        id: `episode-${episode.id}`,
        title: episode.title || `第 ${episode.id} 集`,
        content: episode.content || "",
      },
    ];
  }, [episode]);

  const renderBoundScriptText = useCallback(
    (text: string) => {
      if (!text) return "当前场景还没有正文内容。";
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
          parts.push(
            <React.Fragment key={`text-${lastIndex}`}>{text.slice(lastIndex, start)}</React.Fragment>
          );
        }

        const character = characterMap.get(matchedName);
        const tooltip = buildCharacterDetail(character);
        parts.push(
          <span
            key={`${matchedName}-${start}`}
            className="text-mention"
            data-kind="character"
            data-status={character ? "match" : "missing"}
            data-tooltip={tooltip || undefined}
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

  return (
    <BaseNode title={nodeTitle} outputs={["text"]} selected={selected}>
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--node-border)] pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] text-[var(--node-accent)]">
              <BookOpen size={18} />
            </div>
            <div className="flex min-w-0 items-center gap-3">
              {episode ? (
                <select
                  value={episode.id}
                  onChange={(event) =>
                    updateNodeData(id, {
                      episodeId: Number(event.target.value),
                      sceneId: undefined,
                    })
                  }
                  className="rounded-full border border-[var(--node-border)] bg-[var(--node-surface)] px-3 py-1.5 text-[11px] font-medium text-[var(--node-text-secondary)] outline-none transition hover:border-[var(--node-border-strong)]"
                >
                  {episodes.map((item) => (
                    <option key={item.id} value={item.id}>
                      第 {item.id} 集
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>
        </div>

        {episode ? (
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-[24px] border border-[var(--node-border)] bg-[var(--node-surface)]/70 px-5 py-3">
            {sceneBlocks.map((scene, index) => (
              <section
                key={scene.id}
                className={`py-5 ${index > 0 ? "border-t border-[var(--node-border)]" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--node-text-secondary)]">
                  <span>Scene {index + 1}</span>
                  <span>{scene.id}</span>
                </div>
                <h3 className="mt-2 text-[17px] font-semibold tracking-[-0.02em] text-[var(--node-text-primary)]">
                  {scene.title || "未命名场景"}
                </h3>
                <div className="mt-3 border-t border-[var(--node-border)] pt-4">
                  <div className="whitespace-pre-wrap break-words font-sans text-[12px] leading-7 text-[var(--node-text-primary)]">
                    {renderBoundScriptText(scene.content || "")}
                  </div>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex flex-1 items-center justify-center rounded-[24px] border border-dashed border-[var(--node-border)] text-[12px] text-[var(--node-text-secondary)]">
            当前项目还没有可展示的剧本内容。
          </div>
        )}
      </div>
    </BaseNode>
  );
};
