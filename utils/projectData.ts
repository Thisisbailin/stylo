import {
  DesignAssetItem,
  Episode,
  ProjectContext,
  ProjectData,
  ProjectRoleIdentity,
  ProjectRolePortrait,
  Shot,
} from "../types";
import { ensureStableId, ensureTypedStableId } from "./id";
import { INITIAL_PROJECT_DATA } from "../constants";
import { sanitizeShot } from "./shotSchema";
import {
  buildPortraitMention,
  buildRoleMention,
  MAX_ROLE_PORTRAITS,
  sanitizeIdentityToken,
  slugifyIdentityKey,
} from "./projectRoles";

const stripConflictMarkers = (value: string) => {
  const cleaned = value
    .replace(/^[ \t]*<<<REMOTE VERSION>>>[ \t]*\n?/gm, "")
    .replace(/^[ \t]*<<<LOCAL VERSION>>>[ \t]*\n?/gm, "");
  return cleaned.replace(/\n{3,}/g, "\n\n");
};

const sanitizeValue = (value: unknown): unknown => {
  if (typeof value === "string") return stripConflictMarkers(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry)])
    );
  }
  return value;
};

const toSafeString = (value: unknown, fallback = "") => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
};

const toOptionalString = (value: unknown) => (typeof value === "string" ? value : undefined);

const buildMention = (name: string) => buildRoleMention(name);

export const normalizeVideoParams = (params?: Shot["videoParams"]) => {
  if (!params) return undefined;
  const { inputImage, ...rest } = params;
  return rest;
};

const normalizeShot = (shot: any): Shot => {
  const { shot: normalized } = sanitizeShot(shot, {
    mode: "project",
    requireStructuredId: false,
    allowGeneratedIds: true,
  });
  return {
    ...normalized,
    finalVideoPrompt: toOptionalString(shot?.finalVideoPrompt),
    videoStatus: toOptionalString(shot?.videoStatus) as Shot["videoStatus"],
    videoParams: normalizeVideoParams(shot?.videoParams),
    videoUrl: toOptionalString(shot?.videoUrl),
    videoId: toOptionalString(shot?.videoId),
    videoErrorMsg: toOptionalString(shot?.videoErrorMsg),
  };
};

const normalizeEpisode = (episode: any): Episode => {
  if (!episode || typeof episode !== "object") return episode as Episode;
  const shots = Array.isArray(episode.shots) ? episode.shots.map(normalizeShot) : [];
  return {
    ...episode,
    title: toSafeString(episode.title),
    content: toSafeString(episode.content),
    summary: toOptionalString(episode.summary),
    shots,
  };
};

const normalizeAliases = (values: unknown[], seed: string[]) => {
  const seen = new Set<string>();
  const items = [...seed, ...values.map((item) => toSafeString(item).trim()).filter(Boolean)];
  return items
    .map((value) => value.trim())
    .filter((value) => {
      if (!value) return false;
      const normalized = value.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .map((value) => ({
      id: ensureStableId(undefined, "alias"),
      value,
      normalized: value.toLowerCase(),
    }));
};

const normalizePortrait = (
  portrait: any,
  roleMention: string,
  fallbackName: string,
  fallbackImageUrl?: string,
  allowEmptyImage = false
): ProjectRolePortrait | null => {
  const imageUrl = toOptionalString(portrait?.imageUrl || portrait?.url || fallbackImageUrl);
  if (!imageUrl && !allowEmptyImage) return null;
  const name = sanitizeIdentityToken(
    toSafeString(portrait?.name || portrait?.label || portrait?.title || fallbackName),
    fallbackName
  );
  return {
    id: ensureStableId(portrait?.id, "portrait"),
    name,
    mention: buildPortraitMention(roleMention, name),
    imageUrl: imageUrl || "",
    createdAt: typeof portrait?.createdAt === "number" ? portrait.createdAt : Date.now(),
    summary: toOptionalString(portrait?.summary || portrait?.description),
    isPrimary: !!portrait?.isPrimary || name === "normal",
  };
};

const normalizePortraits = (role: any, mention: string): ProjectRolePortrait[] => {
  const rawPortraits = Array.isArray(role?.portraits)
    ? role.portraits
    : Array.isArray(role?.photos)
      ? role.photos
      : Array.isArray(role?.images)
        ? role.images
        : [];

  const portraits = rawPortraits
    .map((portrait: any, index: number) => normalizePortrait(portrait, mention, index === 0 ? "normal" : `look${index + 1}`, undefined, true))
    .filter((portrait): portrait is ProjectRolePortrait => !!portrait);

  if (portraits.length > 0) {
    return portraits.slice(0, MAX_ROLE_PORTRAITS).map((portrait, index) => ({
      ...portrait,
      isPrimary: portrait.isPrimary || index === 0 || portrait.name === "normal",
    }));
  }

  const fallbackPortrait = normalizePortrait(
    {
      id: undefined,
      name: "normal",
      imageUrl: role?.avatarUrl,
      createdAt: Date.now(),
      isPrimary: true,
    },
    mention,
    "normal",
    toOptionalString(role?.avatarUrl)
  );

  return fallbackPortrait ? [fallbackPortrait] : [];
};

const normalizeRoleIdentity = (role: any): ProjectRoleIdentity => {
  const rawMention = toSafeString(role?.mention).replace(/^@/, "");
  const mentionRoot = rawMention.includes("_") ? rawMention.split("_")[0] : rawMention;
  const name = toSafeString(role?.name || role?.displayName || mentionRoot || "身份");
  const mention = mentionRoot || buildMention(name);
  const kind = role?.kind === "scene" ? "scene" : "person";
  const tone = role?.tone === "sky" ? "sky" : "emerald";
  const portraits = normalizePortraits(role, mention);
  const aliases = normalizeAliases(Array.isArray(role?.aliases) ? role.aliases.map((item: any) => item?.value ?? item) : [], [
    name,
    `@${mention}`,
  ]);

  return {
    id: ensureTypedStableId(role?.id, "role"),
    name,
    displayName: toSafeString(role?.displayName || name),
    mention,
    slug: toOptionalString(role?.slug) || slugifyIdentityKey(mention, name),
    kind,
    tone,
    isMain: typeof role?.isMain === "boolean" ? role.isMain : undefined,
    isCore: typeof role?.isCore === "boolean" ? role.isCore : undefined,
    title: toOptionalString(role?.title) || name,
    summary: toSafeString(role?.summary || role?.role || role?.type || `${kind === "person" ? "人物" : "场景"}身份`),
    description: toSafeString(role?.description || role?.bio || role?.visuals),
    visualTags: toOptionalString(role?.visualTags),
    episodeUsage: toOptionalString(role?.episodeUsage),
    tags: Array.isArray(role?.tags) ? role.tags.map((item: any) => toSafeString(item)).filter(Boolean) : undefined,
    status:
      role?.status === "draft" ||
      role?.status === "verified" ||
      role?.status === "locked" ||
      role?.status === "archived"
        ? role.status
        : "draft",
    aliases,
    binding: {
      mention,
      aliases: aliases.map((item) => item.value),
    },
    voiceId: toOptionalString(role?.voiceId),
    voicePrompt: toOptionalString(role?.voicePrompt),
    previewAudioUrl: toOptionalString(role?.previewAudioUrl),
    voiceReferenceAudioUrl: toOptionalString(role?.voiceReferenceAudioUrl || role?.voiceSampleUrl || role?.voiceAudioUrl),
    designPrompt: toOptionalString(role?.designPrompt || role?.genPrompts),
    designNotes: toOptionalString(role?.designNotes || role?.designRationale),
    lightingPalette: toOptionalString(role?.lightingPalette || role?.lightingOrPalette || role?.lightingWeather),
    props: toOptionalString(role?.props || role?.keyProps),
    assetPriority:
      role?.assetPriority === "high" || role?.assetPriority === "medium" || role?.assetPriority === "low"
        ? role.assetPriority
        : undefined,
    avatarUrl: toOptionalString(role?.avatarUrl) || portraits.find((portrait) => portrait.isPrimary)?.imageUrl,
    portraits,
  };
};

const collapseExplicitRoles = (roles: ProjectRoleIdentity[]): ProjectRoleIdentity[] => {
  const grouped = new Map<string, ProjectRoleIdentity[]>();
  roles.forEach((role) => {
    const key = role.mention.split("_")[0] || role.name || role.id;
    const bucket = grouped.get(key) || [];
    bucket.push(role);
    grouped.set(key, bucket);
  });

  return Array.from(grouped.values()).map((items) => {
    const primary = items[0];
    const name = primary.name || primary.displayName || primary.mention;
    const mention = buildMention(name);
    const portraits = items
      .flatMap((role, index) => {
        if (role.portraits?.length) {
          return role.portraits.map((portrait) =>
            normalizePortrait(portrait, mention, portrait.name || (index === 0 ? "normal" : `look${index + 1}`))
          );
        }
        const rawMention = role.mention || "";
        const mentionParts = rawMention.split("_");
        const mentionSlot = mentionParts.length > 1 ? mentionParts.slice(1).join("_") : "";
        const legacyName = sanitizeIdentityToken(
          mentionSlot ||
            (role.title && role.title !== name ? role.title : index === 0 ? "normal" : `look${index + 1}`),
          index === 0 ? "normal" : `look${index + 1}`
        );
        return [
          normalizePortrait(
            {
              id: undefined,
              name: legacyName,
              imageUrl: role.avatarUrl,
              createdAt: Date.now(),
              summary: role.description,
              isPrimary: index === 0 || legacyName === "normal",
            },
            mention,
            legacyName
          ),
        ];
      })
      .filter((portrait): portrait is ProjectRolePortrait => !!portrait)
      .slice(0, MAX_ROLE_PORTRAITS);

    const aliasValues = items.flatMap((role) => (role.aliases || []).map((alias) => alias.value));
    return normalizeRoleIdentity({
      ...primary,
      name,
      displayName: name,
      mention,
      aliases: [name, `@${mention}`, ...aliasValues],
      portraits,
      avatarUrl: portraits.find((portrait) => portrait.isPrimary)?.imageUrl || primary.avatarUrl,
      voiceReferenceAudioUrl: primary.voiceReferenceAudioUrl || primary.previewAudioUrl,
    });
  });
};

const normalizeContext = (context: any): ProjectContext => {
  const explicitRoles = Array.isArray(context?.roles) ? collapseExplicitRoles(context.roles.map(normalizeRoleIdentity)) : [];
  return {
    projectSummary: toSafeString(context?.projectSummary),
    episodeSummaries: Array.isArray(context?.episodeSummaries) ? context.episodeSummaries : [],
    roles: explicitRoles,
  };
};

const remapDesignAssets = (assets: DesignAssetItem[], context: ProjectContext): DesignAssetItem[] => {
  if (!Array.isArray(assets) || assets.length === 0) return [];

  const mentionMap = new Map<string, { refId: string; label: string }>();
  context.roles.forEach((role) => {
    const label = role.displayName || `@${role.mention}`;
    mentionMap.set(role.id, { refId: role.id, label });
    mentionMap.set(role.mention, { refId: role.id, label });
    mentionMap.set(`@${role.mention}`, { refId: role.id, label });
    mentionMap.set(role.displayName, { refId: role.id, label });
    (role.portraits || []).forEach((portrait) => {
      const portraitRefId = `portrait:${portrait.id}`;
      const portraitLabel = `${role.name} · ${portrait.name}`;
      mentionMap.set(portrait.id, { refId: portraitRefId, label: portraitLabel });
      mentionMap.set(portrait.mention, { refId: portraitRefId, label: portraitLabel });
      mentionMap.set(`@${portrait.mention}`, { refId: portraitRefId, label: portraitLabel });
      mentionMap.set(`${role.id}|${portrait.id}`, { refId: portraitRefId, label: portraitLabel });
    });
  });

  return assets
    .map((asset) => {
      const mapped = mentionMap.get(asset.refId) || mentionMap.get(asset.label || "");
      return {
        ...asset,
        category: "identity" as const,
        refId: mapped?.refId || asset.refId,
        label: mapped?.label || asset.label,
      };
    })
    .filter((asset) => !!asset.refId);
};

export const normalizeProjectData = (data: any): ProjectData => {
  const context = normalizeContext(data?.context || {});
  const base: ProjectData = {
    ...INITIAL_PROJECT_DATA,
    ...data,
    context,
    designAssets: Array.isArray(data?.designAssets) ? data.designAssets : [],
    phase1Usage: { ...INITIAL_PROJECT_DATA.phase1Usage, ...(data?.phase1Usage || {}) },
    phase4Usage: data?.phase4Usage || INITIAL_PROJECT_DATA.phase4Usage,
    phase5Usage: data?.phase5Usage || INITIAL_PROJECT_DATA.phase5Usage,
    stats: { ...INITIAL_PROJECT_DATA.stats, ...(data?.stats || {}) },
  };

  base.episodes = Array.isArray(data?.episodes) ? data.episodes.map(normalizeEpisode) : [];
  base.designAssets = remapDesignAssets(base.designAssets as DesignAssetItem[], context);
  base.shotGuide = data?.shotGuide || INITIAL_PROJECT_DATA.shotGuide;
  base.soraGuide = data?.soraGuide || INITIAL_PROJECT_DATA.soraGuide;
  base.storyboardGuide = data?.storyboardGuide || INITIAL_PROJECT_DATA.storyboardGuide;
  base.dramaGuide = data?.dramaGuide || INITIAL_PROJECT_DATA.dramaGuide;
  base.globalStyleGuide = data?.globalStyleGuide || INITIAL_PROJECT_DATA.globalStyleGuide;
  base.rawScript = typeof data?.rawScript === "string" ? data.rawScript : "";
  base.fileName = typeof data?.fileName === "string" ? data.fileName : "";
  return sanitizeValue(base) as ProjectData;
};
