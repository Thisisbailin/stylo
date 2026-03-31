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

const resolvePrimaryPortraitIndex = (portraits: ProjectRolePortrait[]) => {
  const explicitPrimaryIndex = portraits.findIndex((portrait) => portrait.isPrimary);
  if (explicitPrimaryIndex >= 0) return explicitPrimaryIndex;

  const normalPortraitIndex = portraits.findIndex(
    (portrait) => sanitizeIdentityToken(portrait.name || "", "").toLowerCase() === "normal"
  );
  if (normalPortraitIndex >= 0) return normalPortraitIndex;

  return portraits.length > 0 ? 0 : -1;
};

export const normalizeRolePortraits = (role: ProjectRoleIdentity, portraits: ProjectRolePortrait[]) => {
  const mention = role.mention || buildRoleMention(role.name);
  const seen = new Set<string>();
  const ordered = sortPortraits(
    portraits.filter((portrait) => {
      const key = sanitizeIdentityToken(portrait.name || "", "normal").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  );
  const primaryPortraitIndex = resolvePrimaryPortraitIndex(ordered);
  return ordered.map((portrait, index) => {
    const name = sanitizeIdentityToken(portrait.name || (index === 0 ? "normal" : `look${index + 1}`), index === 0 ? "normal" : `look${index + 1}`);
    return {
      ...portrait,
      name,
      mention: buildPortraitMention(mention, name),
      isPrimary: index === primaryPortraitIndex,
    };
  });
};

export const applyRolePortraits = (role: ProjectRoleIdentity, portraits: ProjectRolePortrait[]): ProjectRoleIdentity => {
  const mention = role.mention || buildRoleMention(role.name);
  const normalizedPortraits = normalizeRolePortraits({ ...role, mention }, portraits);
  const avatarUrl =
    normalizedPortraits.find((portrait) => portrait.isPrimary && portrait.imageUrl)?.imageUrl ||
    normalizedPortraits.find((portrait) => portrait.imageUrl)?.imageUrl ||
    undefined;

  return {
    ...role,
    mention,
    portraits: normalizedPortraits,
    avatarUrl,
  };
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

type AnalysisCharacterDraft = {
  id?: string;
  name: string;
  role?: string;
  isMain?: boolean;
  isCore?: boolean;
  bio?: string;
  forms?: any[];
  aliases?: Array<{ id?: string; value: string; normalized?: string }>;
  status?: ProjectRoleIdentity["status"];
  assetPriority?: ProjectRoleIdentity["assetPriority"];
  archetype?: string;
  episodeUsage?: string;
  tags?: string[];
  voiceId?: string;
  voicePrompt?: string;
  previewAudioUrl?: string;
  voiceReferenceAudioUrl?: string;
};

type AnalysisLocationDraft = {
  id?: string;
  name: string;
  type?: "core" | "secondary";
  description?: string;
  visuals?: string;
  zones?: any[];
  assetPriority?: ProjectRoleIdentity["assetPriority"];
  episodeUsage?: string;
};

const buildPortraitsFromAnalysisForms = (mention: string, forms: any[] | undefined) => {
  const source = Array.isArray(forms) && forms.length > 0 ? forms : [{ formName: "normal", isDefault: true }];
  return source
    .map((form, index) => {
      const rawName =
        form?.isDefault || index === 0 || form?.key === "default"
          ? "normal"
          : String(form?.key || form?.formName || `look${index + 1}`);
      const name = sanitizeIdentityToken(rawName, index === 0 ? "normal" : `look${index + 1}`);
      return {
        id: String(form?.id || `portrait-${mention}-${index + 1}`),
        name,
        mention: buildPortraitMention(mention, name),
        imageUrl: typeof form?.imageUrl === "string" ? form.imageUrl : "",
        createdAt: Date.now() + index,
        summary:
          typeof form?.description === "string" && form.description.trim()
            ? form.description.trim()
            : typeof form?.visualTags === "string"
              ? form.visualTags.trim()
              : undefined,
        isPrimary: !!form?.isDefault || index === 0 || name === "normal",
      } satisfies ProjectRolePortrait;
    })
    .slice(0, MAX_ROLE_PORTRAITS);
};

const buildPortraitsFromAnalysisZones = (mention: string, zones: any[] | undefined) => {
  const source = Array.isArray(zones) && zones.length > 0 ? zones : [{ name: "normal" }];
  return source
    .map((zone, index) => {
      const name = sanitizeIdentityToken(String(zone?.name || (index === 0 ? "normal" : `look${index + 1}`)), index === 0 ? "normal" : `look${index + 1}`);
      return {
        id: String(zone?.id || `portrait-${mention}-${index + 1}`),
        name,
        mention: buildPortraitMention(mention, name),
        imageUrl: typeof zone?.imageUrl === "string" ? zone.imageUrl : "",
        createdAt: Date.now() + index,
        summary:
          typeof zone?.layoutNotes === "string" && zone.layoutNotes.trim()
            ? zone.layoutNotes.trim()
            : typeof zone?.lightingWeather === "string"
              ? zone.lightingWeather.trim()
              : undefined,
        isPrimary: index === 0 || name === "normal",
      } satisfies ProjectRolePortrait;
    })
    .slice(0, MAX_ROLE_PORTRAITS);
};

export const buildPersonRolesFromAnalysis = (items: AnalysisCharacterDraft[]): ProjectRoleIdentity[] =>
  items
    .filter((item) => item?.name?.trim())
    .map((item) => {
      const name = item.name.trim();
      const mention = buildRoleMention(name);
      const portraits = buildPortraitsFromAnalysisForms(mention, item.forms);
      return {
        id: String(item.id || `role-${mention}`),
        name,
        displayName: name,
        mention,
        slug: slugifyIdentityKey(name, mention),
        kind: "person",
        tone: "emerald",
        isMain: !!item.isMain,
        isCore: item.isCore,
        title: item.archetype || name,
        summary: item.role || "人物身份",
        description: item.bio || "",
        episodeUsage: item.episodeUsage,
        tags: item.tags,
        status: item.status || "draft",
        aliases: item.aliases,
        binding: {
          mention,
          aliases: [name, `@${mention}`],
        },
        voiceId: item.voiceId,
        voicePrompt: item.voicePrompt,
        previewAudioUrl: item.previewAudioUrl,
        voiceReferenceAudioUrl: item.voiceReferenceAudioUrl,
        assetPriority: item.assetPriority,
        avatarUrl: portraits.find((portrait) => portrait.isPrimary)?.imageUrl,
        portraits,
      };
    });

export const buildSceneRolesFromAnalysis = (items: AnalysisLocationDraft[]): ProjectRoleIdentity[] =>
  items
    .filter((item) => item?.name?.trim())
    .map((item) => {
      const name = item.name.trim();
      const mention = buildRoleMention(name);
      const portraits = buildPortraitsFromAnalysisZones(mention, item.zones);
      return {
        id: String(item.id || `role-${mention}`),
        name,
        displayName: name,
        mention,
        slug: slugifyIdentityKey(name, mention),
        kind: "scene",
        tone: "sky",
        isCore: item.type === "core",
        title: name,
        summary: item.type === "core" ? "核心场景身份" : "场景身份",
        description: item.description || "",
        visualTags: item.visuals,
        episodeUsage: item.episodeUsage,
        status: "draft",
        binding: {
          mention,
          aliases: [name, `@${mention}`],
        },
        assetPriority: item.assetPriority,
        avatarUrl: portraits.find((portrait) => portrait.isPrimary)?.imageUrl,
        portraits,
      };
    });

export const replaceRolesByKind = (
  roles: ProjectRoleIdentity[],
  kind: ProjectRoleIdentity["kind"],
  nextRoles: ProjectRoleIdentity[]
) => [...(roles || []).filter((role) => role.kind !== kind), ...nextRoles];
