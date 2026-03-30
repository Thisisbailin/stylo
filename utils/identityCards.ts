import type { DesignAssetItem, ProjectContext, ProjectRoleIdentity, ProjectRoleTone } from "../types";

export type ProjectIdentityTone = ProjectRoleTone;

export type ProjectIdentity = ProjectRoleIdentity & {
  subtitle?: string;
  detailLines: string[];
  primaryPortraitUrl?: string;
};

const findAssetUrl = (assets: DesignAssetItem[], refId: string) =>
  assets.find((asset) => asset.category === "identity" && asset.refId === refId)?.url;

export const buildProjectIdentities = (context: ProjectContext, designAssets: DesignAssetItem[]) =>
  (context.roles || [])
    .map((role) => ({
      ...role,
      primaryPortraitUrl:
        role.portraits?.find((portrait) => portrait.isPrimary)?.imageUrl ||
        role.portraits?.[0]?.imageUrl ||
        role.avatarUrl ||
        findAssetUrl(designAssets || [], role.id),
      avatarUrl:
        role.avatarUrl ||
        role.portraits?.find((portrait) => portrait.isPrimary)?.imageUrl ||
        role.portraits?.[0]?.imageUrl ||
        findAssetUrl(designAssets || [], role.id),
      subtitle: role.episodeUsage,
      detailLines: [
        `身份证：@${role.mention}`,
        `身份ID：${role.id}`,
        role.kind === "person" ? "身份类型：人物" : "身份类型：场景",
        `角色名：${role.name}`,
        role.title ? `标题：${role.title}` : "",
        role.summary ? `摘要：${role.summary}` : "",
        role.episodeUsage ? `适用区间：${role.episodeUsage}` : "",
        role.portraits?.length ? `定妆照：${role.portraits.length} 张` : "",
        role.voiceReferenceAudioUrl ? "角色音色：已绑定参考音频" : "",
        role.status ? `状态：${role.status}` : "",
      ].filter(Boolean),
    }))
    .sort((a, b) => (a.name || a.displayName).localeCompare(b.name || b.displayName, "zh-Hans-CN"));

export const resolveLegacyIdentity = (
  identities: ProjectIdentity[],
  input?: { identityId?: string; entityType?: "character" | "scene"; entityId?: string; selectedVariantId?: string }
) => {
  if (!identities.length) return null;
  if (input?.identityId) {
    const exact = identities.find((item) => item.id === input.identityId);
    if (exact) return exact;
  }
  if (input?.entityId) {
    return identities.find((item) => item.familyId === input.entityId || item.id === input.selectedVariantId) || identities[0];
  }
  return identities[0] || null;
};
