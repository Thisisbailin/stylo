import React, { useCallback, useMemo, useState } from "react";
import {
  AtSign,
  ChevronDown,
  ChevronUp,
  Fingerprint,
  Layers,
  MapPinned,
  Music4,
  Upload,
  UserRound,
  Waves,
} from "lucide-react";
import { BaseNode } from "./BaseNode";
import { IdentityCardNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { buildProjectIdentities, resolveLegacyIdentity, type ProjectIdentity } from "../../utils/identityCards";
import { applyRolePortraits } from "../../utils/projectRoles";
import { resolveIdentityCardNodeTitle } from "../nodeflow/titles";
import type { ProjectRoleIdentity } from "../../types";

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

const buildIdentitySerial = (identityId: string) => {
  const compact = identityId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return compact.slice(-10) || "PENDING";
};

export const IdentityCardNode: React.FC<Props & { selected?: boolean }> = ({ id, data, selected }) => {
  const { updateNodeData, nodeFlowContext, mutateProjectRole } = useNodeFlowStore();
  const nodeTitle = useMemo(() => resolveIdentityCardNodeTitle(data, nodeFlowContext), [data, nodeFlowContext]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUploadingPortrait, setIsUploadingPortrait] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);

  const identities = useMemo(
    () => buildProjectIdentities(nodeFlowContext.roles || [], nodeFlowContext.designAssets || []),
    [nodeFlowContext.roles, nodeFlowContext.designAssets]
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
    (updater: (identity: ProjectRoleIdentity) => ProjectRoleIdentity) => {
      if (!activeIdentity) return;
      mutateProjectRole(activeIdentity.id, updater);
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

  if (!activeIdentity) {
    return (
      <BaseNode title={nodeTitle} outputs={["text"]} selected={selected}>
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
  const detailLines = activeIdentity.detailLines.filter(Boolean);
  const compactLines = detailLines.slice(0, 3);
  const previewPortraits = portraits.slice(0, 3);
  const hiddenPortraitCount = Math.max(portraits.length - previewPortraits.length, 0);
  const hasVoice = !!activeIdentity.voiceReferenceAudioUrl;

  return (
    <BaseNode title={nodeTitle} outputs={["text"]} selected={selected}>
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--node-border)] pb-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] text-[var(--node-accent)]">
              <Layers size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--node-text-secondary)]">Identity Card</div>
              <div className="mt-1 flex min-w-0 items-center gap-3">
                <select
                  value={activeIdentity.id}
                  onChange={(event) => commitIdentitySelection(identities.find((item) => item.id === event.target.value))}
                  className="min-w-0 flex-1 rounded-[10px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--node-text-primary)] outline-none transition focus:border-[var(--node-accent)]"
                >
                  {identities.map((identity) => (
                    <option key={identity.id} value={identity.id}>
                      {identity.name}
                    </option>
                  ))}
                </select>
                <div className={`h-8 w-8 shrink-0 rounded-full border ${tone.border} ${tone.surface}`} title={activeIdentity.kind === "person" ? "人物身份" : "场景身份"} />
              </div>
            </div>
          </div>
        </div>

        <section className="relative overflow-hidden rounded-[28px] border border-[var(--node-border)] bg-[var(--node-surface)] shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_48%)]" />
          <div className={`pointer-events-none absolute inset-x-0 top-0 h-20 ${tone.surface}`} />

          <div className="relative border-b border-[var(--node-border)] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--node-text-secondary)]">
                  身份证 / Identity Passport
                </div>
                <div className="mt-1 text-[11px] text-[var(--node-text-secondary)]">
                  NO. {buildIdentitySerial(activeIdentity.id)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExpanded((current) => !current)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-[var(--node-text-secondary)] transition hover:border-[var(--node-border-strong)] hover:text-[var(--node-text-primary)]"
              >
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {isExpanded ? "收起" : "展开"}
              </button>
            </div>
          </div>

          <div className="relative px-4 py-4">
            <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-4">
              <div className="relative">
                <div className="flex h-32 w-28 items-center justify-center overflow-hidden rounded-[24px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] text-[var(--node-accent)] shadow-[0_14px_30px_rgba(0,0,0,0.18)]">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={activeIdentity.name} className="h-full w-full object-cover" />
                  ) : activeIdentity.kind === "person" ? (
                    <UserRound size={34} />
                  ) : (
                    <MapPinned size={34} />
                  )}
                </div>
                <label className="absolute -bottom-2 right-0 inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border border-[var(--node-border)] bg-[rgba(15,18,16,0.96)] px-2.5 text-[10px] font-medium text-white shadow-[0_8px_18px_rgba(0,0,0,0.24)]">
                  <Upload size={11} />
                  {isUploadingPortrait ? "上传中" : "换头像"}
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

              <div className="min-w-0 space-y-3">
                <div className="space-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <div className="truncate text-[22px] font-semibold tracking-[-0.03em] text-[var(--node-text-primary)]">
                      {activeIdentity.name}
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] ${tone.border} ${tone.surface} ${tone.text}`}>
                      {activeIdentity.kind === "person" ? "PERSON" : "SCENE"}
                    </span>
                    {activeIdentity.status ? (
                      <span className="rounded-full border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--node-text-secondary)]">
                        {activeIdentity.status}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[var(--node-text-secondary)]">
                    <AtSign size={12} />
                    <span className="truncate">{activeIdentity.mention}</span>
                  </div>
                  <div className="line-clamp-2 text-[12px] leading-6 text-[var(--node-text-secondary)]">
                    {activeIdentity.summary || activeIdentity.description || "这张身份卡片暂时还没有补充描述。"}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-[16px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-3 py-2">
                    <div className="text-[9px] uppercase tracking-[0.16em] text-[var(--node-text-secondary)]">主形态</div>
                    <div className="mt-1 truncate font-medium text-[var(--node-text-primary)]">{primaryPortrait?.name || "normal"}</div>
                  </div>
                  <div className="rounded-[16px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-3 py-2">
                    <div className="text-[9px] uppercase tracking-[0.16em] text-[var(--node-text-secondary)]">定妆照</div>
                    <div className="mt-1 font-medium text-[var(--node-text-primary)]">{portraits.length} 张</div>
                  </div>
                  <div className="rounded-[16px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-3 py-2">
                    <div className="text-[9px] uppercase tracking-[0.16em] text-[var(--node-text-secondary)]">音色</div>
                    <div className="mt-1 font-medium text-[var(--node-text-primary)]">{hasVoice ? "已绑定" : "未绑定"}</div>
                  </div>
                  <div className="rounded-[16px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-3 py-2">
                    <div className="text-[9px] uppercase tracking-[0.16em] text-[var(--node-text-secondary)]">区间</div>
                    <div className="mt-1 truncate font-medium text-[var(--node-text-primary)]">{activeIdentity.episodeUsage || "未标注"}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[20px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-4 py-3">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--node-text-secondary)]">
                <Fingerprint size={12} />
                证件摘要
              </div>
              <div className="mt-3 space-y-1.5 text-[12px] leading-6 text-[var(--node-text-primary)]">
                {compactLines.length ? compactLines.map((line) => <div key={line}>{line}</div>) : <div>暂无身份摘要信息。</div>}
              </div>
            </div>

            {isExpanded ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-[20px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--node-text-secondary)]">
                    扩展信息
                  </div>
                  <div className="mt-3 space-y-2 text-[12px] leading-6 text-[var(--node-text-primary)]">
                    {detailLines.length ? detailLines.map((line) => <div key={line}>{line}</div>) : <div>暂无扩展信息。</div>}
                  </div>
                  {activeIdentity.description ? (
                    <div className="mt-3 border-t border-[var(--node-border)] pt-3 text-[12px] leading-6 text-[var(--node-text-secondary)]">
                      {activeIdentity.description}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="rounded-[20px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--node-text-secondary)]">
                        定妆照预览
                      </div>
                      <div className="text-[10px] text-[var(--node-text-secondary)]">@{activeIdentity.mention}</div>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {previewPortraits.length ? (
                        previewPortraits.map((portrait) => (
                          <div
                            key={portrait.id}
                            className="flex items-center gap-3 rounded-[16px] border border-[var(--node-border)] bg-[var(--node-surface)] px-3 py-2.5"
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
                                <div className="truncate text-[12px] font-semibold text-[var(--node-text-primary)]">{portrait.name}</div>
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
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[16px] border border-dashed border-[var(--node-border)] px-3 py-3 text-[11px] text-[var(--node-text-secondary)]">
                          还没有定妆照。
                        </div>
                      )}
                    </div>
                    {hiddenPortraitCount > 0 ? (
                      <div className="mt-3 text-[11px] text-[var(--node-text-secondary)]">还有 {hiddenPortraitCount} 张定妆照未展开显示。</div>
                    ) : null}
                  </div>

                  <div className="rounded-[20px] border border-[var(--node-border)] bg-[var(--node-surface-strong)] px-4 py-3">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--node-text-secondary)]">
                      <Waves size={12} />
                      音色信息
                    </div>
                    <div className="mt-3 space-y-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--node-border)] px-3 py-2 text-[11px] font-medium text-[var(--node-text-primary)] transition hover:border-[var(--node-border-strong)]">
                        <Music4 size={12} />
                        {isUploadingVoice ? "上传中..." : hasVoice ? "替换音色" : "上传音色"}
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
                      {hasVoice ? (
                        <audio controls src={activeIdentity.voiceReferenceAudioUrl} className="h-9 w-full min-w-0" />
                      ) : (
                        <div className="text-[11px] leading-5 text-[var(--node-text-secondary)]">还没有绑定音色参考音频。</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </BaseNode>
  );
};
