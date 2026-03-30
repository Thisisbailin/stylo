import type { DesignAssetItem, ProjectRoleIdentity, ProjectRolePortrait } from "../types";

export const MAX_ROLE_PORTRAITS = 20;

export const sanitizeIdentityToken = (value: string, fallback = "normal") => {
  const normalized = value
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
};

export const slugifyIdentityKey = (value: string, fallback: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
};

export const buildRoleMention = (name: string) => sanitizeIdentityToken(name, "identity");

export const buildPortraitMention = (roleMention: string, portraitName: string) =>
  `${roleMention}_${sanitizeIdentityToken(portraitName, "normal")}`;

export const getPrimaryPortrait = (role?: ProjectRoleIdentity | null) =>
  (role?.portraits || []).find((portrait) => portrait.isPrimary) || role?.portraits?.[0];

export const getRoleAvatarUrl = (role?: ProjectRoleIdentity | null) =>
  getPrimaryPortrait(role)?.imageUrl || role?.avatarUrl;

const sortPortraits = (portraits: ProjectRolePortrait[]) =>
  portraits
    .slice()
    .sort((left, right) => {
      if (!!left.isPrimary !== !!right.isPrimary) return left.isPrimary ? -1 : 1;
      return (left.createdAt || 0) - (right.createdAt || 0);
    })
    .slice(0, MAX_ROLE_PORTRAITS);

export const normalizeRolePortraits = (role: ProjectRoleIdentity, portraits: ProjectRolePortrait[]) => {
  const seen = new Set<string>();
  const ordered = sortPortraits(
    portraits.filter((portrait) => {
      const key = sanitizeIdentityToken(portrait.name || "", "normal").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  );
  return ordered.map((portrait, index) => {
    const name = sanitizeIdentityToken(portrait.name || (index === 0 ? "normal" : `look${index + 1}`), index === 0 ? "normal" : `look${index + 1}`);
    return {
      ...portrait,
      name,
      mention: buildPortraitMention(role.mention, name),
      isPrimary: portrait.isPrimary || index === 0 || name === "normal",
    };
  });
};

const buildLegacyForm = (role: ProjectRoleIdentity, portrait: ProjectRolePortrait, index: number) => ({
  id: portrait.id,
  key: portrait.name,
  formName: portrait.name || (index === 0 ? "默认" : `形态${index + 1}`),
  episodeRange: role.episodeUsage || "",
  description: portrait.summary || role.description || "",
  visualTags: portrait.summary || role.visualTags || "",
  identityOrState: portrait.summary || undefined,
  imageUrl: portrait.imageUrl,
  isDefault: portrait.isPrimary || index === 0,
});

const buildLegacyZone = (role: ProjectRoleIdentity, portrait: ProjectRolePortrait, index: number) => ({
  id: portrait.id,
  name: portrait.name || (index === 0 ? "默认" : `机位${index + 1}`),
  kind: "unspecified",
  episodeRange: role.episodeUsage || "",
  layoutNotes: portrait.summary || role.description || "",
  keyProps: role.props || "",
  lightingWeather: role.lightingPalette || "",
  materialPalette: role.visualTags || "",
  imageUrl: portrait.imageUrl,
  isDefault: portrait.isPrimary || index === 0,
});

export const projectRolesToCharacters = (roles: ProjectRoleIdentity[]) =>
  roles
    .filter((role) => role.kind === "person")
    .map((role) => {
      const portraits = normalizeRolePortraits(role, role.portraits || []);
      return {
        id: role.id,
        name: role.name,
        slug: role.slug,
        role: role.summary,
        isMain: !!role.isMain,
        isCore: role.isCore,
        bio: role.description,
        forms: portraits.map((portrait, index) => buildLegacyForm(role, portrait, index)),
        aliases: role.aliases,
        status: role.status,
        binding: {
          canonicalMention: role.mention,
          defaultFormId: portraits.find((portrait) => portrait.isPrimary)?.id || portraits[0]?.id,
          defaultVoiceScope: "character",
          mentionPolicy: "character-first",
        },
        version: 1,
        assetPriority: role.assetPriority,
        archetype: role.title,
        episodeUsage: role.episodeUsage,
        tags: role.tags,
        appearanceCount: undefined,
        voiceId: role.voiceId,
        voicePrompt: role.voicePrompt,
        previewAudioUrl: role.previewAudioUrl,
        voiceReferenceAudioUrl: role.voiceReferenceAudioUrl,
      };
    });

export const projectRolesToLocations = (roles: ProjectRoleIdentity[]) =>
  roles
    .filter((role) => role.kind === "scene")
    .map((role) => {
      const portraits = normalizeRolePortraits(role, role.portraits || []);
      return {
        id: role.id,
        name: role.name,
        type: role.isCore ? "core" : "secondary",
        description: role.description,
        visuals: role.visualTags,
        zones: portraits.map((portrait, index) => buildLegacyZone(role, portrait, index)),
        appearanceCount: undefined,
        assetPriority: role.assetPriority,
        episodeUsage: role.episodeUsage,
      };
    });

export const buildIdentityAssetLabel = (role: ProjectRoleIdentity, portrait?: ProjectRolePortrait | null) =>
  portrait ? `${role.name} · ${portrait.name}` : `@${role.mention}`;

export const buildIdentityAssetRefId = (role: ProjectRoleIdentity, portrait?: ProjectRolePortrait | null) =>
  portrait ? `portrait:${portrait.id}` : role.id;

export const resolveRoleAsset = (assets: DesignAssetItem[], role: ProjectRoleIdentity, portrait?: ProjectRolePortrait | null) => {
  const refId = buildIdentityAssetRefId(role, portrait);
  return assets.find((asset) => asset.category === "identity" && asset.refId === refId)?.url;
};
