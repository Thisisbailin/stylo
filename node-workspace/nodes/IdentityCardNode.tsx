import React, { useCallback, useMemo, useState } from "react";
import { AtSign, Fingerprint, Layers, MapPinned, Music4, Plus, Upload, UserRound, Waves } from "lucide-react";
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
              mention: `${role.mention}_normal`,
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
  const primaryPortrait =
    activeIdentity.portraits?.find((portrait) => portrait.isPrimary) || activeIdentity.portraits?.[0];
  const avatarUrl = primaryPortrait?.imageUrl || activeIdentity.avatarUrl;
  const portraits = activeIdentity.portraits || [];

  return (
    <BaseNode title={data.title || "身份卡片节点"} outputs={["text"]} selected={selected}>
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--node-border)] pb-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] text-[var(--node-accent)]">
              <Layers size={18} />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--node-text-secondary)]">
                  Identity Passport
                </div>
              </div>
              <select
                value={activeIdentity.id}
                onChange={(event) => commitIdentitySelection(identities.find((item) => item.id === event.target.value))}
                className="min-w-[180px] max-w-[240px] rounded-[10px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--node-text-primary)] outline-none transition focus:border-[var(--node-accent)]"
              >
                {identities.map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={`h-8 w-8 rounded-full border ${tone.border} ${tone.surface}`} title={activeIdentity.kind === "person" ? "人物身份" : "场景身份"} />
        </div>

        <div className="mt-3">
          <section className="flex min-h-0 flex-col rounded-[24px] border border-[var(--node-border)] bg-[var(--node-surface)]/70">
            <div className="border-b border-[var(--node-border)] px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] text-[var(--node-accent)]">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={activeIdentity.name} className="h-full w-full rounded-[22px] object-cover" />
                  ) : activeIdentity.kind === "person" ? (
                    <UserRound size={24} />
                  ) : (
                    <MapPinned size={24} />
                  )}
                  <label className="absolute -bottom-1 -right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-[var(--node-border)] bg-[rgba(15,18,16,0.92)] text-white shadow-[0_8px_18px_rgba(0,0,0,0.24)]">
                    <Upload size={11} />
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
                  <div className="flex items-center gap-2">
                    <div className="truncate text-[18px] font-semibold tracking-[-0.02em] text-[var(--node-text-primary)]">
                      {activeIdentity.name}
                    </div>
                    <div className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${tone.border} ${tone.surface} ${tone.text}`}>
                      {primaryPortrait?.name || "normal"}
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[var(--node-text-secondary)]">
                    @{activeIdentity.mention}
                  </div>
                  <div className="mt-2 text-[12px] text-[var(--node-text-secondary)]">
                    {activeIdentity.summary} · {(activeIdentity.portraits || []).length} 张定妆照
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[18px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-4 py-3">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--node-text-secondary)]">
                  <Fingerprint size={12} />
                  身份证信息
                </div>
                <div className="mt-3 space-y-2 text-[12px] leading-6 text-[var(--node-text-primary)]">
                  {activeIdentity.detailLines.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              </div>

              <div className="mt-3 rounded-[18px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-4 py-3 text-[12px] leading-6 text-[var(--node-text-primary)]">
                {activeIdentity.description || "这个角色还没有补充描述。"}
              </div>

              <div className="mt-3 rounded-[18px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-4 py-3">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--node-text-secondary)]">
                  <Waves size={12} />
                  角色音色
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--node-border)] px-3 py-2 text-[11px] font-medium text-[var(--node-text-primary)] transition hover:border-[var(--node-border-strong)]">
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
            </div>

            <div className="px-4 py-4">
              <div className="rounded-[20px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--node-text-secondary)]">
                    身份唤起
                  </div>
                  <button
                    type="button"
                    onClick={handleCreatePortraitSlot}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--node-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--node-text-primary)] transition hover:border-[var(--node-border-strong)]"
                  >
                    <Plus size={11} />
                    添加定妆照
                  </button>
                </div>

                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--node-border)] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--node-text-primary)]">
                  <AtSign size={12} />
                  @{activeIdentity.mention}
                </div>

                <div className="mt-4 grid gap-2">
                  {portraits.map((portrait) => (
                    <div
                      key={portrait.id}
                      className="flex items-center gap-3 rounded-[16px] border border-[var(--node-border)] bg-[var(--node-surface)] px-3 py-3"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-[var(--node-border)] bg-[var(--node-surface-strong)]">
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
                        <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--node-text-secondary)]">
                          @{portrait.mention}
                        </div>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--node-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--node-text-primary)] transition hover:border-[var(--node-border-strong)]">
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

                <div className="mt-3 text-[10px] leading-5 text-[var(--node-text-secondary)]">
                  每个角色最多可管理 20 张定妆照。主唤起使用 @{activeIdentity.mention}，某张定妆照则使用 @{activeIdentity.mention}_槽位名。
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </BaseNode>
  );
};
