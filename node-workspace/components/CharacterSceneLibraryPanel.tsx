import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign,
  AudioLines,
  ImagePlus,
  Loader2,
  MapPin,
  Music4,
  Play,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import type { ProjectData, ProjectRoleIdentity, ProjectRolePortrait } from "../../types";
import { createCustomVoice } from "../../services/qwenAudioService";
import { getCharacterMentionAliases } from "../../utils/characterIdentity";
import {
  applyRolePortraits,
  buildPortraitMention,
  buildRoleMention,
  getPrimaryPortrait,
  MAX_ROLE_PORTRAITS,
  sanitizeIdentityToken,
} from "../../utils/projectRoles";

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  initialSelectionType?: "character" | "scene";
};

type Selection =
  | { type: "character"; key: string }
  | { type: "scene"; key: string };

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

const sortRoles = (roles: ProjectRoleIdentity[]) =>
  roles.slice().sort((left, right) => {
    const leftPriority = left.isMain || left.isCore ? 0 : 1;
    const rightPriority = right.isMain || right.isCore ? 0 : 1;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return (left.name || left.displayName).localeCompare(right.name || right.displayName, "zh-Hans-CN");
  });

const sortPortraits = (portraits: ProjectRolePortrait[]) =>
  portraits.slice().sort((left, right) => {
    if (!!left.isPrimary !== !!right.isPrimary) return left.isPrimary ? -1 : 1;
    return (left.createdAt || 0) - (right.createdAt || 0);
  });

export const CharacterSceneLibraryPanel: React.FC<Props> = ({
  projectData,
  setProjectData,
  initialSelectionType = "character",
}) => {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isDesigningVoice, setIsDesigningVoice] = useState(false);
  const [voicePromptDraft, setVoicePromptDraft] = useState("");
  const previewAudioRef = useRef<HTMLAudioElement>(null);

  const characters = useMemo(
    () => sortRoles((projectData.context.roles || []).filter((role) => role.kind === "person")),
    [projectData.context.roles]
  );
  const scenes = useMemo(
    () => sortRoles((projectData.context.roles || []).filter((role) => role.kind === "scene")),
    [projectData.context.roles]
  );

  useEffect(() => {
    if (initialSelectionType === "character") {
      if (!characters.length) {
        if (selection?.type === "character") setSelection(null);
        return;
      }
      if (selection?.type !== "character" || !characters.some((role) => role.id === selection.key)) {
        setSelection({ type: "character", key: characters[0].id });
      }
      return;
    }

    if (!scenes.length) {
      if (selection?.type === "scene") setSelection(null);
      return;
    }
    if (selection?.type !== "scene" || !scenes.some((role) => role.id === selection.key)) {
      setSelection({ type: "scene", key: scenes[0].id });
    }
  }, [characters, initialSelectionType, scenes, selection]);

  const selectedRole =
    selection?.type === "character"
      ? characters.find((role) => role.id === selection.key)
      : selection?.type === "scene"
        ? scenes.find((role) => role.id === selection.key)
        : undefined;

  useEffect(() => {
    if (selectedRole?.kind === "person") {
      setVoicePromptDraft(selectedRole.voicePrompt || "");
    }
  }, [selectedRole]);

  const mutateRole = (roleId: string, updater: (role: ProjectRoleIdentity) => ProjectRoleIdentity) => {
    setProjectData((prev) => ({
      ...prev,
      context: {
        ...prev.context,
        roles: (prev.context.roles || []).map((role) => (role.id === roleId ? updater(role) : role)),
      },
    }));
  };

  const upsertPortrait = async (role: ProjectRoleIdentity, portraitName: string, file?: File | null, makePrimary = false) => {
    if (!file) return;
    const imageUrl = await readFileAsDataUrl(file);
    const slotName = sanitizeIdentityToken(portraitName, "look");
    mutateRole(role.id, (current) => {
      const portraits = sortPortraits([...(current.portraits || [])]).map((portrait) => ({
        ...portrait,
        isPrimary: makePrimary ? false : portrait.isPrimary,
      }));
      const portraitIndex = portraits.findIndex((portrait) => portrait.name === slotName);
      const createdAt = Date.now();
      if (portraitIndex >= 0) {
        portraits[portraitIndex] = {
          ...portraits[portraitIndex],
          imageUrl,
          isPrimary: makePrimary || portraits[portraitIndex].isPrimary,
        };
      } else {
        if (portraits.length >= MAX_ROLE_PORTRAITS) {
          window.alert(`每个${current.kind === "person" ? "角色" : "场景"}最多只能绑定 ${MAX_ROLE_PORTRAITS} 张定妆照。`);
          return current;
        }
        portraits.push({
          id: `portrait-${createdAt}`,
          name: slotName,
          mention: buildPortraitMention(current.mention, slotName),
          imageUrl,
          createdAt,
          isPrimary: makePrimary || portraits.length === 0,
        });
      }
      return applyRolePortraits(
        {
          ...current,
          mention: current.mention || buildRoleMention(current.name),
        },
        portraits
      );
    });
  };

  const createPortraitSlot = (role: ProjectRoleIdentity) => {
    const nextName = window.prompt("输入这张定妆照的槽位名，例如：受伤形态、雨夜版、后院全景");
    if (!nextName) return;
    const slotName = sanitizeIdentityToken(nextName, "look");
    mutateRole(role.id, (current) => {
      const portraits = [...(current.portraits || [])];
      if (portraits.some((portrait) => portrait.name === slotName)) return current;
      if (portraits.length >= MAX_ROLE_PORTRAITS) {
        window.alert(`每个${current.kind === "person" ? "角色" : "场景"}最多只能绑定 ${MAX_ROLE_PORTRAITS} 张定妆照。`);
        return current;
      }
      return applyRolePortraits(current, [
        ...portraits,
        {
          id: `portrait-${Date.now()}`,
          name: slotName,
          mention: buildPortraitMention(current.mention, slotName),
          imageUrl: "",
          createdAt: Date.now(),
          isPrimary: portraits.length === 0,
        },
      ]);
    });
  };

  const removePortrait = (role: ProjectRoleIdentity, portraitId: string) => {
    mutateRole(role.id, (current) => {
      const nextPortraits = (current.portraits || []).filter((portrait) => portrait.id !== portraitId);
      return applyRolePortraits(current, nextPortraits);
    });
  };

  const setPrimaryPortrait = (role: ProjectRoleIdentity, portraitId: string) => {
    mutateRole(role.id, (current) => {
      const portraits = (current.portraits || []).map((portrait) => ({
        ...portrait,
        isPrimary: portrait.id === portraitId,
      }));
      return applyRolePortraits(current, portraits);
    });
  };

  const handleVoiceReferenceUpload = async (role: ProjectRoleIdentity, file?: File | null) => {
    if (!file) return;
    const audioUrl = await readFileAsDataUrl(file);
    mutateRole(role.id, (current) => ({
      ...current,
      voiceReferenceAudioUrl: audioUrl,
    }));
  };

  const handleVoiceDesign = async (role: ProjectRoleIdentity) => {
    const prompt = voicePromptDraft.trim() || role.voicePrompt || "";
    if (!prompt) return;
    setIsDesigningVoice(true);
    try {
      const result = await createCustomVoice({
        voicePrompt: prompt,
        preferredName: role.name,
        previewText: `大家好，我是${role.name}。很高兴见到各位。`,
      });
      mutateRole(role.id, (current) => ({
        ...current,
        voiceId: result.voiceId,
        voicePrompt: prompt,
        previewAudioUrl: result.previewAudioUrl,
      }));
    } catch (err) {
      alert("Voice Design Failed: " + (err as Error).message);
    } finally {
      setIsDesigningVoice(false);
    }
  };

  const isCharacterMode = initialSelectionType === "character";
  const roleList = isCharacterMode ? characters : scenes;
  const roleCount = roleList.length;
  const chipClass = (active: boolean, mode: "character" | "scene") =>
    `inline-flex min-w-fit items-center gap-2 rounded-full border px-3 py-2 text-left transition whitespace-nowrap ${
      active
        ? mode === "character"
          ? "border-emerald-400/60 bg-emerald-500/12 text-[var(--app-text-primary)]"
          : "border-cyan-400/60 bg-cyan-500/12 text-[var(--app-text-primary)]"
        : "border-[var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)]"
    }`;

  const portraits = sortPortraits(selectedRole?.portraits || []);
  const primaryPortrait = getPrimaryPortrait(selectedRole);

  return (
    <div className="space-y-4 text-[var(--app-text-primary)]">
      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[12px] font-semibold">
              {isCharacterMode ? (
                <Users size={16} className="text-emerald-300" />
              ) : (
                <MapPin size={16} className="text-cyan-300" />
              )}
              {isCharacterMode ? "身份角色库" : "身份场景库"}
            </div>
            <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
              {isCharacterMode ? `${roleCount} 个角色身份` : `${roleCount} 个场景身份`}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="flex gap-2 min-w-fit">
            {roleList.map((role) => {
              const isActive = selection?.key === role.id;
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelection({ type: isCharacterMode ? "character" : "scene", key: role.id })}
                  className={chipClass(isActive, isCharacterMode ? "character" : "scene")}
                >
                  <span className="font-medium">{role.name || "Untitled Identity"}</span>
                  <span className="text-[10px] opacity-70">{(role.portraits || []).length} 张</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4 md:p-5 space-y-4">
          {selectedRole ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-[var(--app-border)] bg-black/20">
                    {primaryPortrait?.imageUrl || selectedRole.avatarUrl ? (
                      <img
                        src={primaryPortrait?.imageUrl || selectedRole.avatarUrl}
                        alt={selectedRole.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[var(--app-text-secondary)]">
                        {selectedRole.kind === "person" ? <Users size={20} /> : <MapPin size={20} />}
                      </div>
                    )}
                    <label className="absolute bottom-1 right-1 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-[var(--app-border)] bg-black/70 text-white">
                      <Upload size={12} />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          void upsertPortrait(selectedRole, primaryPortrait?.name || "normal", event.target.files?.[0], true);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <div>
                    <div className="text-lg font-semibold">{selectedRole.name || "Untitled Identity"}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[var(--app-text-secondary)]">
                      @{selectedRole.mention}
                    </div>
                    <div className="mt-2 text-[12px] text-[var(--app-text-secondary)]">
                      {selectedRole.summary || (selectedRole.kind === "person" ? "人物身份" : "场景身份")}
                    </div>
                  </div>
                </div>
                <div className="text-right text-[11px] text-[var(--app-text-secondary)]">
                  <div>{selectedRole.kind === "person" ? "角色" : "场景"} ID {selectedRole.id}</div>
                  <div>定妆照 {portraits.length}</div>
                  {selectedRole.episodeUsage ? <div>区间 {selectedRole.episodeUsage}</div> : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3 text-[12px] text-[var(--app-text-secondary)]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Identity Passport</div>
                  <div className="mt-2 space-y-1.5">
                    <div>主唤起 @{selectedRole.mention}</div>
                    <div>{selectedRole.kind === "person" ? "身份类型 人物" : "身份类型 场景"}</div>
                    {selectedRole.status ? <div>状态 {selectedRole.status}</div> : null}
                    {selectedRole.voiceReferenceAudioUrl ? <div>角色音色 已绑定参考音频</div> : null}
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3 text-[12px] text-[var(--app-text-secondary)]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Mention Aliases</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(selectedRole.kind === "person" ? getCharacterMentionAliases(selectedRole) : [
                      selectedRole.name,
                      `@${selectedRole.mention}`,
                      ...((selectedRole.portraits || []).map((portrait) => `@${portrait.mention}`)),
                    ])
                      .filter(Boolean)
                      .map((alias) => (
                        <span
                          key={alias}
                          className="rounded-full border border-[var(--app-border)] bg-black/10 px-2.5 py-1 text-[10px] text-[var(--app-text-primary)]"
                        >
                          {alias.startsWith("@") ? alias : `@${alias}`}
                        </span>
                      ))}
                  </div>
                </div>
              </div>

              {selectedRole.description ? (
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3 text-[12px] text-[var(--app-text-secondary)]">
                  {selectedRole.description}
                </div>
              ) : null}

              {selectedRole.kind === "person" ? (
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[13px] font-semibold">
                      <AudioLines size={16} className="text-violet-300" />
                      角色音色
                    </div>
                    {selectedRole.voiceId ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">
                        {selectedRole.voiceId}
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--app-border)] px-3 py-2 text-[11px] font-medium text-[var(--app-text-primary)] transition hover:border-[var(--app-border-strong)]">
                      <Music4 size={12} />
                      {selectedRole.voiceReferenceAudioUrl ? "替换音色参考音频" : "上传音色参考音频"}
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(event) => {
                          void handleVoiceReferenceUpload(selectedRole, event.target.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>

                    {selectedRole.voiceReferenceAudioUrl ? (
                      <audio controls src={selectedRole.voiceReferenceAudioUrl} className="h-9 max-w-[320px]" />
                    ) : (
                      <div className="text-[11px] text-[var(--app-text-secondary)]">尚未绑定角色音色参考。</div>
                    )}

                    <textarea
                      value={voicePromptDraft}
                      onChange={(event) => setVoicePromptDraft(event.target.value)}
                      placeholder="用自然语言描述角色音色，例如：沉稳低沉、带一点沙哑、克制但有压迫感。"
                      className="min-h-[88px] w-full rounded-xl border border-[var(--app-border)] bg-black/20 p-3 text-[12px] focus:border-violet-400 focus:outline-none"
                    />

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={isDesigningVoice || !voicePromptDraft.trim()}
                        onClick={() => handleVoiceDesign(selectedRole)}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl h-10 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-[12px] font-medium transition"
                      >
                        {isDesigningVoice ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Sparkles size={16} className="text-violet-200" />
                        )}
                        {selectedRole.voiceId ? "重新设计角色音色" : "生成角色音色"}
                      </button>

                      {selectedRole.previewAudioUrl ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (previewAudioRef.current) {
                              previewAudioRef.current.src = selectedRole.previewAudioUrl!;
                              void previewAudioRef.current.play();
                            }
                          }}
                          className="flex items-center justify-center h-10 w-10 rounded-xl border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 transition"
                          title="Play Preview"
                        >
                          <Play size={18} />
                        </button>
                      ) : null}
                    </div>
                    <audio ref={previewAudioRef} hidden />
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between">
                <div className="text-[12px] font-semibold">定妆照槽位</div>
                <div className="flex items-center gap-3 text-[11px] text-[var(--app-text-secondary)]">
                  <span>{portraits.length}/{MAX_ROLE_PORTRAITS}</span>
                  <button
                    type="button"
                    onClick={() => createPortraitSlot(selectedRole)}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--app-border)] px-2.5 py-1 text-[10px] text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] hover:border-[var(--app-border-strong)] transition"
                  >
                    <ImagePlus size={12} />
                    新增槽位
                  </button>
                </div>
              </div>

              {portraits.length ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {portraits.map((portrait) => (
                    <div
                      key={portrait.id}
                      className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="h-16 w-16 overflow-hidden rounded-2xl border border-[var(--app-border)] bg-black/20">
                            {portrait.imageUrl ? (
                              <img src={portrait.imageUrl} alt={portrait.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[var(--app-text-secondary)]">
                                {selectedRole.kind === "person" ? <Users size={16} /> : <MapPin size={16} />}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="text-[13px] font-semibold">{portrait.name}</div>
                              {portrait.isPrimary ? (
                                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-emerald-200">
                                  Primary
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-secondary)]">
                              <AtSign size={11} />
                              @{portrait.mention}
                            </div>
                            {portrait.summary ? (
                              <div className="mt-2 text-[11px] text-[var(--app-text-secondary)]">{portrait.summary}</div>
                            ) : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removePortrait(selectedRole, portrait.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--app-border)] text-[var(--app-text-secondary)] transition hover:border-red-400/50 hover:text-red-200"
                          title="删除槽位"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[var(--app-border)] px-2.5 py-1 text-[10px] text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] hover:border-[var(--app-border-strong)] transition">
                          <Upload size={11} />
                          {portrait.imageUrl ? "替换图片" : "上传图片"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                              void upsertPortrait(selectedRole, portrait.name, event.target.files?.[0]);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                        {!portrait.isPrimary ? (
                          <button
                            type="button"
                            onClick={() => setPrimaryPortrait(selectedRole, portrait.id)}
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--app-border)] px-2.5 py-1 text-[10px] text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)] hover:border-[var(--app-border-strong)] transition"
                          >
                            设为主图
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[12px] text-[var(--app-text-secondary)]">
                  这个{selectedRole.kind === "person" ? "角色" : "场景"}还没有定妆照槽位。
                </div>
              )}

              <div className="text-[11px] leading-6 text-[var(--app-text-secondary)]">
                主唤起使用 @{selectedRole.mention}。某张定妆照使用 @{selectedRole.mention}_槽位名，例如 @{selectedRole.mention}_受伤形态。
              </div>
            </>
          ) : (
            <div className="text-[12px] text-[var(--app-text-secondary)]">
              {isCharacterMode ? "请选择一个角色身份。" : "请选择一个场景身份。"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
