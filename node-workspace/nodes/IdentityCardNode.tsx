import React, { useCallback, useMemo, useState } from "react";
import {
  AtSign,
  ChevronDown,
  ChevronUp,
  Fingerprint,
  Layers,
  MapPinned,
  Music4,
  Plus,
  Upload,
  UserRound,
  Waves,
} from "lucide-react";
import { BaseNode } from "./BaseNode";
import { IdentityCardNodeData } from "../types";
import { useWorkflowStore } from "../store/workflowStore";
import { buildProjectIdentities, resolveLegacyIdentity, type ProjectIdentity } from "../../utils/identityCards";
import { applyRolePortraits, buildPortraitMention, sanitizeIdentityToken } from "../../utils/projectRoles";

type Props = {
  id: string;
  data: IdentityCardNodeData;
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("无法读取文件内容"));
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });

const toneClasses: Record<ProjectIdentity["tone"], { surface: string; border: string; text: string }> = {
  emerald: {
    surface: "bg-emerald-500/12",
    border: "border-emerald-400/28",
    text: "text-emerald-200",
  },
  sky: {
    surface: "bg-sky-500/12",
    border: "border-sky-400/28",
    text: "text-sky-200",
  },
};

export const IdentityCardNode: React.FC<Props & { selected?: boolean }> = ({ id, data, selected }) => {
  const { updateNodeData, labContext, mutateProjectRole } = useWorkflowStore();
  const [isUploadingPortrait, setIsUploadingPortrait] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const identities = useMemo(
    () => buildProjectIdentities(labContext.context, labContext.designAssets || []),
    [labContext.context, labContext.designAssets]
  );

  const activeIdentity = useMemo(
    () =>
      resolveLegacyIdentity(identities, {
        identityId: data.identityId,
      }),
    [data.identityId, identities]
  );

  const commitIdentitySelection = useCallback(
    (identity: ProjectIdentity | undefined | null) => {
      if (!identity) return;
      updateNodeData(id, {
        identityId: identity.id,
      });
    },
    [id, updateNodeData]
  );

  const applyRoleUpdate = useCallback(
    (updater: (identity: ProjectIdentity) => ProjectIdentity) => {
      if (!activeIdentity) return;
      mutateProjectRole(activeIdentity.id, (role) => updater(role as ProjectIdentity));
    },
    [activeIdentity, mutateProjectRole]
  );

  const handlePrimaryPortraitUpload = useCallback(
    async (file?: File | null) => {
      if (!activeIdentity || !file) return;
      setIsUploadingPortrait(true);
      try {
        const imageUrl = await readFileAsDataUrl(file);
        applyRoleUpdate((role) => {
          const portraits = [...(role.portraits || [])];
          const primaryIndex = portraits.findIndex((portrait) => portrait.isPrimary);
          const fallbackNormalIndex = portraits.findIndex((portrait) => portrait.name === "normal");
          const targetIndex = primaryIndex >= 0 ? primaryIndex : fallbackNormalIndex;

          if (targetIndex >= 0) {
            portraits[targetIndex] = {
              ...portraits[targetIndex],
              imageUrl,
              isPrimary: true,
            };
          } else {
            if (portraits.length >= 20) return role;
            portraits.unshift({
              id: `portrait-${Date.now()}`,
              name: "normal",
              mention: buildPortraitMention(role.mention, "normal"),
              imageUrl,
              createdAt: Date.now(),
              isPrimary: true,
            });
          }

          return applyRolePortraits(role, portraits);
        });
      } finally {
        setIsUploadingPortrait(false);
      }
    },
    [activeIdentity, applyRoleUpdate]
  );

  const handleVoiceUpload = useCallback(
    async (file?: File | null) => {
      if (!activeIdentity || !file) return;
      setIsUploadingVoice(true);
      try {
        const audioUrl = await readFileAsDataUrl(file);
        applyRoleUpdate((role) => ({
          ...role,
          voiceReferenceAudioUrl: audioUrl,
        }));
      } finally {
        setIsUploadingVoice(false);
      }
    },
    [activeIdentity, applyRoleUpdate]
  );

  const handlePortraitSlotUpload = useCallback(
    async (portraitName: string, file?: File | null) => {
      if (!activeIdentity || !file) return;
      const slotName = sanitizeIdentityToken(portraitName, "look");
      setIsUploadingPortrait(true);
      try {
        const imageUrl = await readFileAsDataUrl(file);
        applyRoleUpdate((role) => {
          const portraits = [...(role.portraits || [])];
          const portraitIndex = portraits.findIndex((portrait) => portrait.name === slotName);

          if (portraitIndex >= 0) {
            portraits[portraitIndex] = {
              ...portraits[portraitIndex],
              imageUrl,
            };
          } else {
            if (portraits.length >= 20) {
              window.alert("每个角色最多只能绑定 20 张定妆照。");
              return role;
            }
            portraits.push({
              id: `portrait-${Date.now()}`,
              name: slotName,
              mention: buildPortraitMention(role.mention, slotName),
              imageUrl,
              createdAt: Date.now(),
              isPrimary: portraits.length === 0,
            });
          }

          return applyRolePortraits(role, portraits);
        });
      } finally {
        setIsUploadingPortrait(false);
      }
    },
    [activeIdentity, applyRoleUpdate]
  );

  const handleCreatePortraitSlot = useCallback(() => {
    if (!activeIdentity) return;
    const nextName = window.prompt("输入这张定妆照的槽位名，例如：受伤形态、雨夜版、后院全景");
    if (!nextName) return;
    const slotName = sanitizeIdentityToken(nextName, "look");

    applyRoleUpdate((role) => {
      if ((role.portraits || []).some((portrait) => portrait.name === slotName)) return role;
      if ((role.portraits || []).length >= 20) {
        window.alert("每个角色最多只能绑定 20 张定妆照。");
        return role;
      }

      return applyRolePortraits(role, [
        ...(role.portraits || []),
        {
          id: `portrait-${Date.now()}`,
          name: slotName,
          mention: buildPortraitMention(role.mention, slotName),
          imageUrl: "",
          createdAt: Date.now(),
          isPrimary: (role.portraits || []).length === 0,
        },
      ]);
    });
  }, [activeIdentity, applyRoleUpdate]);

  if (!activeIdentity) {
    return (
      <BaseNode title={data.title || "身份卡片节点"} outputs={["text"]} selected={selected}>
        <div className="flex min-h-[220px] items-center justify-center rounded-[24px] border border-dashed border-[var(--node-border)] text-[12px] text-[var(--node-text-secondary)]">
          当前项目还没有可展示的身份证。
        </div>
      </BaseNode>
    );
  }

  const tone = toneClasses[activeIdentity.tone];
  const identityKindLabel = activeIdentity.kind === "person" ? "人物身份" : "场景身份";
  const primaryPortrait =
    activeIdentity.portraits?.find((portrait) => portrait.isPrimary) || activeIdentity.portraits?.[0];
  const avatarUrl = primaryPortrait?.imageUrl || activeIdentity.avatarUrl;
  const portraits = activeIdentity.portraits || [];
  const summaryText =
    activeIdentity.summary?.trim() ||
    activeIdentity.description?.trim() ||
    (activeIdentity.kind === "person" ? "未填写人物摘要。" : "未填写场景摘要。");
  const compactFacts = [
    { label: "证件类型", value: identityKindLabel },
    { label: "主唤起", value: `@${activeIdentity.mention}` },
    { label: "主形态", value: primaryPortrait?.name || "normal" },
    { label: "定妆照", value: `${portraits.length} 张` },
  ];
  const detailLines = activeIdentity.detailLines.slice(0, 6);
  const visiblePortraits = portraits.slice(0, isExpanded ? 4 : 2);
  const hiddenPortraitCount = Math.max(portraits.length - visiblePortraits.length, 0);

  return (
    <BaseNode title={data.title || "身份卡片节点"} outputs={["text"]} selected={selected}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] text-[var(--node-accent)]">
              <Layers size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--node-text-secondary)]">
                Identity Card
              </div>
              <select
                value={activeIdentity.id}
                onChange={(event) => commitIdentitySelection(identities.find((item) => item.id === event.target.value))}
                className="mt-1 w-full rounded-[12px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-3 py-2 text-[11px] font-medium text-[var(--node-text-primary)] outline-none transition focus:border-[var(--node-accent)]"
              >
                {identities.map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--node-text-secondary)] transition hover:border-[var(--node-border-strong)] hover:text-[var(--node-text-primary)]"
          >
            {isExpanded ? "收起" : "展开"}
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        <section className="relative overflow-hidden rounded-[30px] border border-[var(--node-border)] bg-[var(--node-surface)] shadow-[0_20px_48px_rgba(0,0,0,0.22)]">
          <div className={`absolute inset-x-0 top-0 h-14 ${tone.surface}`} />
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full border border-white/10 bg-white/5" />
          <div className="absolute bottom-0 right-0 h-24 w-24 rounded-tl-[28px] border-l border-t border-white/5 bg-white/5" />

          <div className="relative px-4 pb-4 pt-5">
            <div className="flex items-start gap-4">
              <div className="relative h-[136px] w-[102px] shrink-0 overflow-hidden rounded-[24px] border border-[var(--node-border)] bg-[var(--node-surface-strong)]">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={activeIdentity.name} className="h-full w-full object-cover" />
                ) : activeIdentity.kind === "person" ? (
                  <div className="flex h-full w-full items-center justify-center text-[var(--node-accent)]">
                    <UserRound size={36} />
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[var(--node-accent)]">
                    <MapPinned size={36} />
                  </div>
                )}
                <div className="absolute left-2 top-2 rounded-full border border-black/20 bg-black/55 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-white">
                  Photo
                </div>
                <label className="absolute bottom-2 right-2 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-black/20 bg-black/70 text-white shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
                  <Upload size={12} />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      void handlePrimaryPortraitUpload(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--node-text-secondary)]">
                      Identity Registration
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="truncate text-[22px] font-semibold tracking-[-0.03em] text-[var(--node-text-primary)]">
                        {activeIdentity.name}
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${tone.border} ${tone.surface} ${tone.text}`}>
                        {identityKindLabel}
                      </span>
                    </div>
                    <div className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--node-text-secondary)]">
                      <AtSign size={11} />
                      <span className="truncate">@{activeIdentity.mention}</span>
                    </div>
                  </div>

                  <div className="shrink-0 rounded-[18px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-3 py-2 text-right">
                    <div className="text-[9px] uppercase tracking-[0.16em] text-[var(--node-text-secondary)]">
                      Card ID
                    </div>
                    <div className="mt-1 max-w-[120px] truncate text-[11px] font-medium text-[var(--node-text-primary)]">
                      {activeIdentity.id}
                    </div>
                  </div>
                </div>

                <div className="mt-3 line-clamp-2 text-[12px] leading-5 text-[var(--node-text-secondary)]">
                  {summaryText}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {compactFacts.map((fact) => (
                    <div
                      key={fact.label}
                      className="rounded-[16px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-3 py-2"
                    >
                      <div className="text-[9px] uppercase tracking-[0.16em] text-[var(--node-text-secondary)]">
                        {fact.label}
                      </div>
                      <div className="mt-1 truncate text-[11px] font-medium text-[var(--node-text-primary)]">
                        {fact.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex flex-wrap items-center justify-between gap-2 border-t border-[var(--node-border)] px-4 py-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--node-text-secondary)]">
              <Fingerprint size={11} />
              {activeIdentity.voiceReferenceAudioUrl ? "已绑定音色参考" : "未绑定音色参考"}
            </div>
            <div className="text-[10px] text-[var(--node-text-secondary)]">
              {isExpanded ? "显示节点细节与快捷操作" : "默认只展示证件正面"}
            </div>
          </div>
        </section>

        {isExpanded ? (
          <div className="space-y-3">
            <div className="rounded-[22px] border border-[var(--node-border)] bg-[var(--node-surface)] px-4 py-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--node-text-secondary)]">
                <Fingerprint size={12} />
                证件字段
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {detailLines.map((line) => (
                  <div
                    key={line}
                    className="rounded-[16px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-3 py-2 text-[11px] leading-5 text-[var(--node-text-primary)]"
                  >
                    {line}
                  </div>
                ))}
              </div>
              {activeIdentity.description ? (
                <div className="mt-3 rounded-[16px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-3 py-3 text-[11px] leading-5 text-[var(--node-text-secondary)]">
                  {activeIdentity.description}
                </div>
              ) : null}
            </div>

            {activeIdentity.kind === "person" ? (
              <div className="rounded-[22px] border border-[var(--node-border)] bg-[var(--node-surface)] px-4 py-4">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--node-text-secondary)]">
                  <Waves size={12} />
                  音色参考
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-3 py-2 text-[11px] font-medium text-[var(--node-text-primary)] transition hover:border-[var(--node-border-strong)]">
                    <Music4 size={12} />
                    {isUploadingVoice ? "上传中..." : activeIdentity.voiceReferenceAudioUrl ? "替换音色音频" : "上传音色音频"}
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(event) => {
                        void handleVoiceUpload(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {activeIdentity.voiceReferenceAudioUrl ? (
                    <audio controls src={activeIdentity.voiceReferenceAudioUrl} className="h-9 max-w-[280px]" />
                  ) : (
                    <div className="text-[11px] text-[var(--node-text-secondary)]">尚未绑定角色音色参考。</div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="rounded-[22px] border border-[var(--node-border)] bg-[var(--node-surface)] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--node-text-secondary)]">
                    身份引用
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--node-text-secondary)]">
                    节点里只保留少量定妆照预览，完整管理请在角色库中进行。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCreatePortraitSlot}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--node-text-primary)] transition hover:border-[var(--node-border-strong)]"
                >
                  <Plus size={11} />
                  新增槽位
                </button>
              </div>

              <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--node-text-primary)]">
                <AtSign size={12} />
                <span className="truncate">@{activeIdentity.mention}</span>
              </div>

              {visiblePortraits.length ? (
                <div className="mt-4 space-y-2">
                  {visiblePortraits.map((portrait) => (
                    <div
                      key={portrait.id}
                      className="flex items-center gap-3 rounded-[18px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-3 py-3"
                    >
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-[var(--node-border)] bg-[var(--node-surface)]">
                        {portrait.imageUrl ? (
                          <img src={portrait.imageUrl} alt={portrait.name} className="h-full w-full object-cover" />
                        ) : activeIdentity.kind === "person" ? (
                          <UserRound size={18} />
                        ) : (
                          <MapPinned size={18} />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-[12px] font-semibold text-[var(--node-text-primary)]">
                            {portrait.name}
                          </div>
                          {portrait.isPrimary ? (
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${tone.border} ${tone.surface} ${tone.text}`}>
                              Primary
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 truncate text-[10px] uppercase tracking-[0.14em] text-[var(--node-text-secondary)]">
                          @{portrait.mention}
                        </div>
                      </div>

                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--node-border)] bg-[var(--node-surface)] px-2.5 py-1.5 text-[10px] font-medium text-[var(--node-text-primary)] transition hover:border-[var(--node-border-strong)]">
                        <Upload size={11} />
                        {isUploadingPortrait ? "上传中..." : portrait.imageUrl ? "替换" : "上传"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => {
                            void handlePortraitSlotUpload(portrait.name, event.target.files?.[0]);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[18px] border border-dashed border-[var(--node-border)] px-3 py-4 text-[11px] text-[var(--node-text-secondary)]">
                  还没有可引用的定妆照槽位。
                </div>
              )}

              <div className="mt-3 text-[10px] leading-5 text-[var(--node-text-secondary)]">
                {hiddenPortraitCount > 0
                  ? `其余 ${hiddenPortraitCount} 张定妆照已省略，请在角色库中查看完整列表。`
                  : `主唤起使用 @${activeIdentity.mention}，某张定妆照使用 @${activeIdentity.mention}_槽位名。`}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </BaseNode>
  );
};
