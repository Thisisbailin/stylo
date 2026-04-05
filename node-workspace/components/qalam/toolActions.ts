import type { Episode, ProjectData, Scene } from "../../../types";
import { createStableId, ensureStableId, ensureTypedStableId } from "../../../utils/id";

type Character = {
  id: string;
  name: string;
  slug?: string;
  role?: string;
  isMain?: boolean;
  isCore?: boolean;
  bio?: string;
  forms?: any[];
  aliases?: Array<{ id?: string; value: string; kind?: string; normalized?: string }>;
  status?: string;
  binding?: Record<string, any>;
  version?: number;
  assetPriority?: string;
  archetype?: string;
  episodeUsage?: string;
  tags?: string[];
  appearanceCount?: number;
  voiceId?: string;
  voicePrompt?: string;
  previewAudioUrl?: string;
};

type Location = {
  id: string;
  name: string;
  type: "core" | "secondary";
  description?: string;
  visuals?: string;
  zones?: any[];
  appearanceCount?: number;
  assetPriority?: string;
  episodeUsage?: string;
};

type UpsertResult = { next: ProjectData; result: any };
type ReadResult = { result: any };

const hasKey = (obj: any, key: string) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const toTrimmedString = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const toOptionalString = (value: unknown) => {
  const trimmed = toTrimmedString(value);
  return trimmed || undefined;
};
const slugifyIdentityKey = (value: string, fallback: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
};
const uniqStrings = (values: Array<string | undefined | null>) => {
  const seen = new Set<string>();
  return values
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => {
      if (!item) return false;
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};
const normalizeCharacterAliases = (inputAliases: any[] | undefined, name: string, existingAliases: Character["aliases"] = []) => {
  const source = Array.isArray(inputAliases) ? inputAliases : existingAliases || [];
  const seen = new Set<string>();
  const aliases = source
    .map((entry: any, index) => {
      const value = typeof entry === "string" ? entry.trim() : toTrimmedString(entry?.value);
      if (!value) return null;
      const normalized = value.toLowerCase();
      if (seen.has(normalized)) return null;
      seen.add(normalized);
      return {
        id: ensureStableId(typeof entry === "object" ? entry?.id : undefined, "alias"),
        value,
        kind:
          entry?.kind === "primary" || entry?.kind === "alias" || entry?.kind === "title" || entry?.kind === "short" || entry?.kind === "legacy"
            ? entry.kind
            : index === 0
              ? "alias"
              : "alias",
        normalized,
      };
    })
    .filter(Boolean) as NonNullable<Character["aliases"]>;

  const primaryValue = name.trim();
  if (primaryValue) {
    const normalized = primaryValue.toLowerCase();
    const existingPrimary = aliases.find((item) => item.normalized === normalized);
    if (existingPrimary) {
      existingPrimary.kind = "primary";
      existingPrimary.value = primaryValue;
      existingPrimary.normalized = normalized;
    } else {
      aliases.unshift({
        id: ensureStableId(undefined, "alias"),
        value: primaryValue,
        kind: "primary",
        normalized,
      });
    }
  }
  return aliases;
};
const finalizeCharacterForms = (forms: any[], characterId: string) => {
  let defaultAssigned = false;
  const normalized = forms.map((form, index) => {
    const next = {
      ...form,
      id: ensureStableId(form?.id, "form"),
      characterId,
      key: toOptionalString(form?.key) || slugifyIdentityKey(toTrimmedString(form?.formName), index === 0 ? "default" : `form-${index + 1}`),
      aliases: uniqStrings(Array.isArray(form?.aliases) ? form.aliases : []),
      formName: toTrimmedString(form?.formName) || "默认",
      episodeRange: toTrimmedString(form?.episodeRange),
      description: toTrimmedString(form?.description),
      visualTags: toTrimmedString(form?.visualTags),
    };
    const shouldBeDefault = form?.isDefault === true && !defaultAssigned;
    if (shouldBeDefault) defaultAssigned = true;
    return {
      ...next,
      isDefault: shouldBeDefault,
    };
  });
  if (!defaultAssigned && normalized[0]) normalized[0].isDefault = true;
  return normalized;
};

const mergeCharacterForms = (
  existingForms: any[],
  incomingForms: any[] | undefined,
  mode: "merge" | "replace",
  formsToDelete: string[],
  characterId: string
) => {
  if (!Array.isArray(existingForms)) existingForms = [];
  const deleteSet = new Set(formsToDelete || []);
  if (!Array.isArray(incomingForms)) {
    return finalizeCharacterForms(existingForms.filter((form) => !deleteSet.has(form.id)), characterId);
  }
  const normalizedIncoming = incomingForms.map((form) => ({ ...form }));

  if (mode === "replace") {
    const next = normalizedIncoming.map((form) => ({
      id: ensureStableId(form?.id, "form"),
      characterId,
      key: toOptionalString(form?.key),
      type: form?.type,
      isDefault: form?.isDefault === true,
      aliases: uniqStrings(Array.isArray(form?.aliases) ? form.aliases : []),
      formName: form.formName || "默认",
      episodeRange: form.episodeRange || "",
      description: form.description || "",
      visualTags: form.visualTags || "",
      identityOrState: form.identityOrState,
      hair: form.hair,
      face: form.face,
      body: form.body,
      costume: form.costume,
      accessories: form.accessories,
      props: form.props,
      materialPalette: form.materialPalette,
      poses: form.poses,
      expressions: form.expressions,
      lightingOrPalette: form.lightingOrPalette,
      turnaroundNeeded: form.turnaroundNeeded,
      deliverables: form.deliverables,
      designRationale: form.designRationale,
      styleRef: form.styleRef,
      genPrompts: form.genPrompts,
      voiceId: form.voiceId,
      voicePrompt: form.voicePrompt,
      previewAudioUrl: form.previewAudioUrl,
    }));
    return finalizeCharacterForms(next.filter((form) => !deleteSet.has(form.id)), characterId);
  }

  const nextForms = existingForms.map((form) => ({ ...form }));
  const indexById = new Map(nextForms.map((form, idx) => [form.id, idx]));
  const indexByName = new Map(
    nextForms.map((form, idx) => [toTrimmedString(form.formName || "默认").toLowerCase(), idx])
  );
  const additions: any[] = [];

  normalizedIncoming.forEach((incoming) => {
    const incomingId = toOptionalString(incoming?.id);
    const incomingNameKey = toTrimmedString(incoming?.formName || "默认").toLowerCase();
    const idx = (incomingId ? indexById.get(incomingId) : undefined) ?? indexByName.get(incomingNameKey);
    if (idx !== undefined) {
      const current = nextForms[idx];
      const updated = { ...current };
      updated.id = current.id || ensureStableId(incomingId, "form");
      updated.characterId = characterId;
      if (hasKey(incoming, "key")) updated.key = incoming.key;
      if (hasKey(incoming, "type")) updated.type = incoming.type;
      if (hasKey(incoming, "isDefault")) updated.isDefault = incoming.isDefault === true;
      if (hasKey(incoming, "aliases")) updated.aliases = uniqStrings(Array.isArray(incoming.aliases) ? incoming.aliases : []);
      if (hasKey(incoming, "formName")) updated.formName = incoming.formName;
      if (hasKey(incoming, "episodeRange")) updated.episodeRange = incoming.episodeRange;
      if (hasKey(incoming, "description")) updated.description = incoming.description;
      if (hasKey(incoming, "visualTags")) updated.visualTags = incoming.visualTags;
      if (hasKey(incoming, "identityOrState")) updated.identityOrState = incoming.identityOrState;
      if (hasKey(incoming, "hair")) updated.hair = incoming.hair;
      if (hasKey(incoming, "face")) updated.face = incoming.face;
      if (hasKey(incoming, "body")) updated.body = incoming.body;
      if (hasKey(incoming, "costume")) updated.costume = incoming.costume;
      if (hasKey(incoming, "accessories")) updated.accessories = incoming.accessories;
      if (hasKey(incoming, "props")) updated.props = incoming.props;
      if (hasKey(incoming, "materialPalette")) updated.materialPalette = incoming.materialPalette;
      if (hasKey(incoming, "poses")) updated.poses = incoming.poses;
      if (hasKey(incoming, "expressions")) updated.expressions = incoming.expressions;
      if (hasKey(incoming, "lightingOrPalette")) updated.lightingOrPalette = incoming.lightingOrPalette;
      if (hasKey(incoming, "turnaroundNeeded")) updated.turnaroundNeeded = incoming.turnaroundNeeded;
      if (hasKey(incoming, "deliverables")) updated.deliverables = incoming.deliverables;
      if (hasKey(incoming, "designRationale")) updated.designRationale = incoming.designRationale;
      if (hasKey(incoming, "styleRef")) updated.styleRef = incoming.styleRef;
      if (hasKey(incoming, "genPrompts")) updated.genPrompts = incoming.genPrompts;
      if (hasKey(incoming, "voiceId")) updated.voiceId = incoming.voiceId;
      if (hasKey(incoming, "voicePrompt")) updated.voicePrompt = incoming.voicePrompt;
      if (hasKey(incoming, "previewAudioUrl")) updated.previewAudioUrl = incoming.previewAudioUrl;
      nextForms[idx] = updated;
      return;
    }
    additions.push({
      id: ensureStableId(incomingId, "form"),
      characterId,
      key: toOptionalString(incoming?.key),
      type: incoming?.type,
      isDefault: incoming?.isDefault === true,
      aliases: uniqStrings(Array.isArray(incoming?.aliases) ? incoming.aliases : []),
      formName: incoming.formName || "默认",
      episodeRange: incoming.episodeRange || "",
      description: incoming.description || "",
      visualTags: incoming.visualTags || "",
      identityOrState: incoming.identityOrState,
      hair: incoming.hair,
      face: incoming.face,
      body: incoming.body,
      costume: incoming.costume,
      accessories: incoming.accessories,
      props: incoming.props,
      materialPalette: incoming.materialPalette,
      poses: incoming.poses,
      expressions: incoming.expressions,
      lightingOrPalette: incoming.lightingOrPalette,
      turnaroundNeeded: incoming.turnaroundNeeded,
      deliverables: incoming.deliverables,
      designRationale: incoming.designRationale,
      styleRef: incoming.styleRef,
      genPrompts: incoming.genPrompts,
      voiceId: incoming.voiceId,
      voicePrompt: incoming.voicePrompt,
      previewAudioUrl: incoming.previewAudioUrl,
    });
  });

  return finalizeCharacterForms([...nextForms, ...additions].filter((form) => !deleteSet.has(form.id)), characterId);
};

const mergeLocationZones = (
  existingZones: any[],
  incomingZones: any[] | undefined,
  mode: "merge" | "replace",
  zonesToDelete: string[]
) => {
  if (!Array.isArray(existingZones)) existingZones = [];
  const deleteSet = new Set(zonesToDelete || []);
  if (!Array.isArray(incomingZones)) {
    return existingZones.filter((zone) => !deleteSet.has(zone.id));
  }

  const normalizedIncoming = incomingZones.map((zone) => ({
    ...zone,
    id: ensureStableId(zone?.id, "zone"),
  }));

  if (mode === "replace") {
    const next = normalizedIncoming.map((zone) => ({
      id: zone.id,
      name: zone.name || "默认",
      kind: zone.kind || "unspecified",
      episodeRange: zone.episodeRange || "",
      layoutNotes: zone.layoutNotes || "",
      keyProps: zone.keyProps || "",
      lightingWeather: zone.lightingWeather || "",
      materialPalette: zone.materialPalette || "",
      designRationale: zone.designRationale,
      deliverables: zone.deliverables,
      genPrompts: zone.genPrompts,
    }));
    return next.filter((zone) => !deleteSet.has(zone.id));
  }

  const nextZones = existingZones.map((zone) => ({ ...zone }));
  const indexById = new Map(nextZones.map((zone, idx) => [zone.id, idx]));
  const additions: any[] = [];

  normalizedIncoming.forEach((incoming) => {
    const idx = indexById.get(incoming.id);
    if (idx !== undefined) {
      const current = nextZones[idx];
      const updated = { ...current };
      if (hasKey(incoming, "name")) updated.name = incoming.name;
      if (hasKey(incoming, "kind")) updated.kind = incoming.kind;
      if (hasKey(incoming, "episodeRange")) updated.episodeRange = incoming.episodeRange;
      if (hasKey(incoming, "layoutNotes")) updated.layoutNotes = incoming.layoutNotes;
      if (hasKey(incoming, "keyProps")) updated.keyProps = incoming.keyProps;
      if (hasKey(incoming, "lightingWeather")) updated.lightingWeather = incoming.lightingWeather;
      if (hasKey(incoming, "materialPalette")) updated.materialPalette = incoming.materialPalette;
      if (hasKey(incoming, "designRationale")) updated.designRationale = incoming.designRationale;
      if (hasKey(incoming, "deliverables")) updated.deliverables = incoming.deliverables;
      if (hasKey(incoming, "genPrompts")) updated.genPrompts = incoming.genPrompts;
      nextZones[idx] = updated;
      return;
    }
    additions.push({
      id: incoming.id,
      name: incoming.name || "默认",
      kind: incoming.kind || "unspecified",
      episodeRange: incoming.episodeRange || "",
      layoutNotes: incoming.layoutNotes || "",
      keyProps: incoming.keyProps || "",
      lightingWeather: incoming.lightingWeather || "",
      materialPalette: incoming.materialPalette || "",
      designRationale: incoming.designRationale,
      deliverables: incoming.deliverables,
      genPrompts: incoming.genPrompts,
    });
  });

  return [...nextZones, ...additions].filter((zone) => !deleteSet.has(zone.id));
};

const updateDesignAssetsForCharacter = (assets: any[], character: any, formsToDelete: string[]) => {
  const prefix = `${character.id}|`;
  const deleteSet = new Set(formsToDelete || []);
  const formNameById = new Map((character.forms || []).map((form: any) => [form.id, form.formName]));
  return (assets || [])
    .filter((asset) => {
      if (asset.category !== "form" || !asset.refId?.startsWith(prefix)) return true;
      const formId = asset.refId.slice(prefix.length);
      return !deleteSet.has(formId);
    })
    .map((asset) => {
      if (asset.category !== "form" || !asset.refId?.startsWith(prefix)) return asset;
      const formId = asset.refId.slice(prefix.length);
      const formName = formNameById.get(formId);
      if (!formName) return asset;
      return { ...asset, label: `${character.name} · ${formName}` };
    });
};

const updateDesignAssetsForLocation = (assets: any[], location: any, zonesToDelete: string[]) => {
  const prefix = `${location.id}|`;
  const deleteSet = new Set(zonesToDelete || []);
  const zoneNameById = new Map((location.zones || []).map((zone: any) => [zone.id, zone.name]));
  return (assets || [])
    .filter((asset) => {
      if (asset.category !== "zone" || !asset.refId?.startsWith(prefix)) return true;
      const zoneId = asset.refId.slice(prefix.length);
      return !deleteSet.has(zoneId);
    })
    .map((asset) => {
      if (asset.category !== "zone" || !asset.refId?.startsWith(prefix)) return asset;
      const zoneId = asset.refId.slice(prefix.length);
      const zoneName = zoneNameById.get(zoneId);
      if (!zoneName) return asset;
      return { ...asset, label: `${location.name} · ${zoneName}` };
    });
};

export const upsertCharacter = (prev: ProjectData, args: any): UpsertResult => {
  const input = args?.character || {};
  const mergeStrategy = args?.mergeStrategy === "replace" ? "replace" : "patch";
  const formsMode = args?.formsMode === "replace" ? "replace" : "merge";
  const formsToDelete = Array.isArray(args?.formsToDelete) ? args.formsToDelete : [];
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const chars = [...((((prev.context as any)?.characters) || []) as Character[])];
  let matchIndex = -1;
  if (input.id) {
    matchIndex = chars.findIndex((c) => c.id === input.id);
  }
  if (matchIndex < 0 && name) {
    matchIndex = chars.findIndex((c) => c.name === name);
  }
  const existing = matchIndex >= 0 ? chars[matchIndex] : null;
  if (!existing && !name) {
    throw new Error("缺少角色名称，无法创建角色。");
  }
  const id = ensureTypedStableId(input.id || existing?.id, "char");

  let next: Character = existing
    ? { ...existing }
    : {
        id,
        name: name || "",
        slug: slugifyIdentityKey(name || id, id),
        role: "",
        isMain: false,
        bio: "",
        forms: [],
        aliases: [],
        status: "draft",
        binding: {
          canonicalMention: name || "",
          defaultVoiceScope: "character",
          mentionPolicy: "character-first",
        },
        version: 1,
      };

  if (mergeStrategy === "replace") {
    next = {
      id,
      name: name || existing?.name || "",
      slug: existing?.slug || slugifyIdentityKey(name || existing?.name || id, id),
      role: "",
      isMain: false,
      bio: "",
      forms: Array.isArray(existing?.forms) ? existing?.forms : [],
      aliases: existing?.aliases,
      status: existing?.status,
      binding: existing?.binding,
      version: existing?.version,
      assetPriority: existing?.assetPriority,
      archetype: existing?.archetype,
      episodeUsage: existing?.episodeUsage,
      tags: existing?.tags,
      appearanceCount: existing?.appearanceCount,
    };
  }

  if (hasKey(input, "name")) next.name = input.name;
  if (hasKey(input, "role")) next.role = input.role;
  if (hasKey(input, "isMain")) next.isMain = input.isMain;
  if (hasKey(input, "bio")) next.bio = input.bio;
  if (hasKey(input, "assetPriority")) next.assetPriority = input.assetPriority;
  if (hasKey(input, "archetype")) next.archetype = input.archetype;
  if (hasKey(input, "episodeUsage")) next.episodeUsage = input.episodeUsage;
  if (hasKey(input, "tags")) next.tags = input.tags;
  if (hasKey(input, "slug")) next.slug = input.slug;
  if (hasKey(input, "status")) next.status = input.status;
  if (hasKey(input, "version")) next.version = input.version;

  const hasIncomingForms = Array.isArray(input.forms);
  if (hasIncomingForms || formsToDelete.length > 0) {
    next.forms = mergeCharacterForms(
      next.forms || [],
      hasIncomingForms ? input.forms : undefined,
      formsMode,
      formsToDelete,
      id
    );
  }
  if (!Array.isArray(next.forms)) next.forms = [];
  next.forms = finalizeCharacterForms(next.forms, id);

  next.id = id;
  next.slug = toOptionalString(next.slug) || slugifyIdentityKey(next.name || id, id);
  next.aliases = normalizeCharacterAliases(Array.isArray(input.aliases) ? input.aliases : undefined, next.name || "", next.aliases);
  const bindingInput = input.binding && typeof input.binding === "object" ? input.binding : {};
  const explicitDefaultFormId = toOptionalString(bindingInput.defaultFormId);
  const availableDefaultFormId =
    (explicitDefaultFormId && next.forms.find((form) => form.id === explicitDefaultFormId)?.id) ||
    next.forms.find((form) => form.isDefault)?.id ||
    next.forms[0]?.id;
  next.binding = {
    canonicalMention:
      toOptionalString(bindingInput.canonicalMention) ||
      next.aliases?.find((item) => item.kind === "primary")?.value ||
      next.name,
    defaultFormId: availableDefaultFormId,
    defaultVoiceScope:
      bindingInput.defaultVoiceScope === "form" || bindingInput.defaultVoiceScope === "character"
        ? bindingInput.defaultVoiceScope
        : next.binding?.defaultVoiceScope || "character",
    mentionPolicy:
      bindingInput.mentionPolicy === "form-first" || bindingInput.mentionPolicy === "character-first"
        ? bindingInput.mentionPolicy
        : next.binding?.mentionPolicy || "character-first",
  };
  next.status =
    next.status === "draft" || next.status === "verified" || next.status === "locked" || next.status === "archived"
      ? next.status
      : "draft";
  next.version =
    typeof input.version === "number" && Number.isFinite(input.version)
      ? input.version
      : Math.max(1, (typeof existing?.version === "number" ? existing.version : 0) + 1);

  const designAssets = updateDesignAssetsForCharacter(prev.designAssets || [], next, formsToDelete);
  const updatedChars = [...chars];
  if (existing && matchIndex >= 0) {
    updatedChars[matchIndex] = next;
  } else {
    updatedChars.push(next);
  }

  return {
    next: {
      ...prev,
      context: { ...prev.context, characters: updatedChars } as any,
      designAssets,
    },
    result: {
      kind: "character",
      action: existing ? "updated" : "created",
      id: next.id,
      name: next.name,
      canonicalMention: next.binding?.canonicalMention,
      defaultFormId: next.binding?.defaultFormId,
      formsCount: (next.forms || []).length,
    },
  };
};

const toNumber = (value: any): number | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  if (!raw) return undefined;
  const match = raw.match(/\d+/);
  if (!match) return undefined;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const clipText = (text: string, maxChars: number) => {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
};

const toLower = (value: string) => value.toLowerCase();

const buildSnippet = (text: string, query: string, radius = 120) => {
  if (!text || !query) return clipText(text, radius * 2);
  const lowerText = toLower(text);
  const lowerQuery = toLower(query);
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return clipText(text, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
};

export const searchScriptData = (data: ProjectData, args: any): ReadResult => {
  const episodes = data.episodes || [];
  const query = typeof args?.query === "string" ? args.query.trim() : "";
  const episodeId = toNumber(args?.episodeId ?? args?.episode ?? args?.episodeNumber);
  const episodeTitle = typeof args?.episodeTitle === "string" ? args.episodeTitle.trim() : "";
  const maxMatches = Math.max(1, Math.min(50, toNumber(args?.maxMatches) || 8));
  const maxSnippetChars = Math.max(80, Math.min(600, toNumber(args?.maxSnippetChars) || 200));
  const snippetRadius = Math.floor(maxSnippetChars / 2);

  let episode = episodeId ? episodes.find((ep) => ep.id === episodeId) : undefined;
  if (!episode && episodeTitle) {
    episode = pickEpisodeByTitle(episodes, episodeTitle);
  }

  const result: any = {
    request: {
      query: query || null,
      episodeId: episodeId ?? null,
      episodeTitle: episodeTitle || null,
    },
    resolved: {
      episode: episode ? { id: episode.id, title: episode.title } : null,
    },
    data: {
      matches: [] as any[],
    },
    warnings: [] as string[],
  };

  if (!query) {
    result.warnings.push("missing_query");
    return { result };
  }

  const lowerQuery = toLower(query);
  const targetEpisodes = episode ? [episode] : episodes;
  const matches: any[] = [];

  for (const ep of targetEpisodes) {
    if (matches.length >= maxMatches) break;
    const epContent = ep.content || "";
    if (epContent && toLower(epContent).includes(lowerQuery)) {
      matches.push({
        scope: "episode",
        episodeId: ep.id,
        episodeTitle: ep.title,
        snippet: buildSnippet(epContent, query, snippetRadius),
      });
      if (matches.length >= maxMatches) break;
    }
    for (const sc of ep.scenes || []) {
      if (matches.length >= maxMatches) break;
      const scContent = sc.content || "";
      const scTitle = sc.title || "";
      if (
        (scContent && toLower(scContent).includes(lowerQuery)) ||
        (scTitle && toLower(scTitle).includes(lowerQuery))
      ) {
        matches.push({
          scope: "scene",
          episodeId: ep.id,
          episodeTitle: ep.title,
          sceneId: sc.id,
          sceneTitle: sc.title,
          snippet: buildSnippet(scContent || scTitle, query, snippetRadius),
        });
      }
    }
  }

  if (!episode && (episodeId || episodeTitle)) {
    result.warnings.push("episode_not_found");
  }
  if (!matches.length) {
    result.warnings.push("no_matches");
  }
  result.data.matches = matches;
  return { result };
};

const normalizeSceneId = (value: any, episodeId?: number) => {
  if (value === null || value === undefined) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  if (raw.includes("-")) return raw;
  if (episodeId) return `${episodeId}-${raw}`;
  return raw;
};

const pickEpisodeByTitle = (episodes: any[], title: string) => {
  if (!title) return undefined;
  const normalized = title.trim().toLowerCase();
  if (!normalized) return undefined;
  return episodes.find((ep) => (ep.title || "").toLowerCase().includes(normalized));
};

const resolveEpisodeSelection = (episodes: Episode[], args: any) => {
  const episodeId = toNumber(args?.episodeId ?? args?.episode ?? args?.episodeNumber);
  const episodeTitle = typeof args?.episodeTitle === "string" ? args.episodeTitle.trim() : "";
  let episode = episodeId ? episodes.find((ep) => ep.id === episodeId) : undefined;
  if (!episode && episodeTitle) {
    episode = pickEpisodeByTitle(episodes, episodeTitle);
  }
  return {
    episodeId,
    episodeTitle,
    episode,
  };
};

const resolveSceneSelection = (episodes: Episode[], args: any, selectedEpisode?: Episode) => {
  const requestedEpisodeId = toNumber(args?.episodeId ?? args?.episode ?? args?.episodeNumber);
  const sceneIndex = toNumber(args?.sceneIndex ?? args?.sceneNumber);
  const sceneId = normalizeSceneId(args?.sceneId ?? args?.scene, selectedEpisode?.id ?? requestedEpisodeId);
  let episode = selectedEpisode;
  let scene: Scene | undefined;

  if (episode) {
    if (sceneId) {
      scene = (episode.scenes || []).find((sc) => sc.id === sceneId);
    }
    if (!scene && sceneIndex) {
      const idx = sceneIndex - 1;
      if (idx >= 0 && idx < (episode.scenes || []).length) {
        scene = episode.scenes[idx];
      }
    }
  } else if (sceneId) {
    for (const ep of episodes) {
      const found = (ep.scenes || []).find((sc) => sc.id === sceneId);
      if (found) {
        episode = ep;
        scene = found;
        break;
      }
    }
  }

  return {
    episode,
    scene,
    sceneId,
    sceneIndex,
  };
};

const buildSceneListItem = (scene: Scene, index: number, previewChars: number) => ({
  index: index + 1,
  id: scene.id,
  title: scene.title,
  partition: scene.partition,
  timeOfDay: scene.timeOfDay,
  location: scene.location,
  contentPreview: clipText(scene.content || "", previewChars),
});

const findEpisodeSummary = (data: ProjectData, episodeId?: number) => {
  if (!episodeId) return "";
  return data.context?.episodeSummaries?.find((entry) => entry.episodeId === episodeId)?.summary || "";
};

export const getEpisodeScript = (data: ProjectData, args: any): ReadResult => {
  const episodes = data.episodes || [];
  const { episodeId, episodeTitle, episode } = resolveEpisodeSelection(episodes, args);
  const maxChars = Math.max(400, Math.min(12000, toNumber(args?.maxChars) || 4000));
  const maxScenes = Math.max(1, Math.min(200, toNumber(args?.maxScenes) || 50));
  const includeSceneList = args?.includeSceneList !== false;
  const includeEpisodeSummary = args?.includeEpisodeSummary !== false;
  const includeCharacters = args?.includeCharacters !== false;
  const previewChars = Math.max(80, Math.min(320, Math.floor(maxChars / 10)));

  const result: any = {
    request: {
      episodeId: episodeId ?? null,
      episodeTitle: episodeTitle || null,
    },
    resolved: {
      episode: episode ? { id: episode.id, title: episode.title } : null,
    },
    data: {},
    warnings: [] as string[],
  };

  if (!episodeId && !episodeTitle) {
    result.warnings.push("missing_episode_selector");
    return { result };
  }

  if (!episode) {
    result.warnings.push("episode_not_found");
    return { result };
  }

  result.data.episode = {
    id: episode.id,
    title: episode.title,
    content: clipText(episode.content || "", maxChars),
    sceneCount: (episode.scenes || []).length,
    shotCount: (episode.shots || []).length,
  };

  if (includeCharacters) {
    result.data.episodeCharacters = (episode.characters || []).slice(0, 50);
  }

  if (includeEpisodeSummary) {
    const summary = findEpisodeSummary(data, episode.id);
    if (summary) {
      result.data.episodeSummary = clipText(summary, Math.min(maxChars, 2400));
    }
  }

  if (includeSceneList) {
    const scenes = (episode.scenes || []).slice(0, maxScenes);
    result.data.sceneList = scenes.map((scene, index) => buildSceneListItem(scene, index, previewChars));
    if ((episode.scenes || []).length > maxScenes) {
      result.warnings.push("scene_list_truncated");
    }
  }

  return { result };
};

export const getSceneScript = (data: ProjectData, args: any): ReadResult => {
  const episodes = data.episodes || [];
  const episodeSelection = resolveEpisodeSelection(episodes, args);
  const { episode, scene, sceneId, sceneIndex } = resolveSceneSelection(episodes, args, episodeSelection.episode);
  const maxChars = Math.max(200, Math.min(8000, toNumber(args?.maxChars) || 2400));
  const includeEpisodeSummary = args?.includeEpisodeSummary !== false;
  const includeCharacters = args?.includeCharacters !== false;
  const includeSceneMetadata = args?.includeSceneMetadata !== false;

  const result: any = {
    request: {
      episodeId: episodeSelection.episodeId ?? null,
      episodeTitle: episodeSelection.episodeTitle || null,
      sceneId: sceneId ?? null,
      sceneIndex: sceneIndex ?? null,
    },
    resolved: {
      episode: episode ? { id: episode.id, title: episode.title } : null,
      scene: scene ? { id: scene.id, title: scene.title } : null,
    },
    data: {},
    warnings: [] as string[],
  };

  if (!sceneId && !sceneIndex) {
    result.warnings.push("missing_scene_selector");
    return { result };
  }

  if (sceneIndex && !sceneId && !episodeSelection.episodeId && !episodeSelection.episodeTitle) {
    result.warnings.push("missing_episode_selector");
    return { result };
  }

  if (!episode && (episodeSelection.episodeId || episodeSelection.episodeTitle)) {
    result.warnings.push("episode_not_found");
    return { result };
  }

  if (!scene || !episode) {
    result.warnings.push("scene_not_found");
    return { result };
  }

  result.data.episode = {
    id: episode.id,
    title: episode.title,
    sceneCount: (episode.scenes || []).length,
  };
  result.data.scene = {
    id: scene.id,
    title: scene.title,
    index: (episode.scenes || []).findIndex((item) => item.id === scene.id) + 1,
    content: clipText(scene.content || "", maxChars),
  };

  if (includeSceneMetadata) {
    result.data.scene.metadata = {
      partition: scene.partition,
      timeOfDay: scene.timeOfDay,
      location: scene.location,
      rawTitle: scene.metadata?.rawTitle,
      tokens: scene.metadata?.tokens,
    };
  }

  if (includeCharacters) {
    result.data.episodeCharacters = (episode.characters || []).slice(0, 50);
  }

  if (includeEpisodeSummary) {
    const summary = findEpisodeSummary(data, episode.id);
    if (summary) {
      result.data.episodeSummary = clipText(summary, Math.min(maxChars, 2000));
    }
  }

  return { result };
};

const summarizeCharacters = (characters: Character[], maxChars: number, maxItems: number) =>
  (characters || []).slice(0, maxItems).map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    isMain: c.isMain,
    bio: clipText(c.bio || "", Math.max(120, Math.min(maxChars, 400))),
    episodeUsage: c.episodeUsage,
    tags: c.tags,
  }));

const summarizeLocations = (locations: Location[], maxChars: number, maxItems: number) =>
  (locations || []).slice(0, maxItems).map((loc) => ({
    id: loc.id,
    name: loc.name,
    type: loc.type,
    description: clipText(loc.description || "", Math.max(120, Math.min(maxChars, 400))),
    visuals: clipText(loc.visuals || "", Math.max(120, Math.min(maxChars, 400))),
    episodeUsage: loc.episodeUsage,
  }));

const normalizeName = (value: string) => value.trim().toLowerCase();

const findByName = <T extends { name: string }>(items: T[], name: string): T | undefined => {
  const normalized = normalizeName(name);
  if (!normalized) return undefined;
  const exact = items.find((item) => normalizeName(item.name) === normalized);
  if (exact) return exact;
  const contains = items.find((item) => normalizeName(item.name).includes(normalized));
  if (contains) return contains;
  return items.find((item) => normalized.includes(normalizeName(item.name)));
};

const buildCharacterDetail = (character: Character, maxChars: number, maxItems: number) => ({
  id: character.id,
  name: character.name,
  role: character.role,
  isMain: character.isMain,
  bio: clipText(character.bio || "", maxChars),
  archetype: character.archetype,
  episodeUsage: character.episodeUsage,
  tags: character.tags,
  assetPriority: character.assetPriority,
  appearanceCount: character.appearanceCount,
  forms: (character.forms || []).slice(0, maxItems).map((form) => ({
    id: form.id,
    formName: form.formName,
    episodeRange: form.episodeRange,
    description: clipText(form.description || "", Math.max(120, Math.min(maxChars, 500))),
    visualTags: clipText(form.visualTags || "", Math.max(120, Math.min(maxChars, 500))),
    identityOrState: form.identityOrState,
    hair: clipText(form.hair || "", Math.max(120, Math.min(maxChars, 400))),
    face: clipText(form.face || "", Math.max(120, Math.min(maxChars, 400))),
    body: clipText(form.body || "", Math.max(120, Math.min(maxChars, 400))),
    costume: clipText(form.costume || "", Math.max(120, Math.min(maxChars, 400))),
    accessories: clipText(form.accessories || "", Math.max(120, Math.min(maxChars, 400))),
    props: clipText(form.props || "", Math.max(120, Math.min(maxChars, 400))),
    materialPalette: clipText(form.materialPalette || "", Math.max(120, Math.min(maxChars, 400))),
    poses: clipText(form.poses || "", Math.max(120, Math.min(maxChars, 400))),
    expressions: clipText(form.expressions || "", Math.max(120, Math.min(maxChars, 400))),
    lightingOrPalette: clipText(form.lightingOrPalette || "", Math.max(120, Math.min(maxChars, 400))),
    turnaroundNeeded: form.turnaroundNeeded,
    deliverables: form.deliverables,
    designRationale: form.designRationale,
    styleRef: form.styleRef,
    genPrompts: form.genPrompts,
    voiceId: form.voiceId,
    voicePrompt: form.voicePrompt,
  })),
});

const buildLocationDetail = (location: Location, maxChars: number, maxItems: number) => ({
  id: location.id,
  name: location.name,
  type: location.type,
  description: clipText(location.description || "", maxChars),
  visuals: clipText(location.visuals || "", maxChars),
  episodeUsage: location.episodeUsage,
  assetPriority: location.assetPriority,
  appearanceCount: location.appearanceCount,
  zones: (location.zones || []).slice(0, maxItems).map((zone) => ({
    id: zone.id,
    name: zone.name,
    kind: zone.kind,
    episodeRange: zone.episodeRange,
    layoutNotes: clipText(zone.layoutNotes || "", Math.max(120, Math.min(maxChars, 500))),
    keyProps: clipText(zone.keyProps || "", Math.max(120, Math.min(maxChars, 500))),
    lightingWeather: clipText(zone.lightingWeather || "", Math.max(120, Math.min(maxChars, 400))),
    materialPalette: clipText(zone.materialPalette || "", Math.max(120, Math.min(maxChars, 400))),
    designRationale: zone.designRationale,
    deliverables: zone.deliverables,
    genPrompts: zone.genPrompts,
  })),
});

export const readProjectData = (data: ProjectData, args: any): ReadResult => {
  const episodes = data.episodes || [];
  const query = typeof args?.query === "string" ? args.query.trim() : "";
  const episodeId = toNumber(args?.episodeId ?? args?.episode ?? args?.episodeNumber);
  const episodeTitle = typeof args?.episodeTitle === "string" ? args.episodeTitle.trim() : "";
  const sceneIndex = toNumber(args?.sceneIndex ?? args?.sceneNumber);
  const sceneId = normalizeSceneId(args?.sceneId ?? args?.scene, episodeId);
  const characterId = typeof args?.characterId === "string" ? args.characterId.trim() : "";
  const characterName = typeof args?.characterName === "string" ? args.characterName.trim() : "";
  const locationId = typeof args?.locationId === "string" ? args.locationId.trim() : "";
  const locationName = typeof args?.locationName === "string" ? args.locationName.trim() : "";
  const maxChars = Math.max(200, Math.min(4000, toNumber(args?.maxChars) || 1200));
  const maxMatches = Math.max(1, Math.min(20, toNumber(args?.maxMatches) || 5));
  const maxItems = Math.max(1, Math.min(50, toNumber(args?.maxItems) || 20));
  const includeList = Array.isArray(args?.include) ? args.include : [];
  const include = new Set(includeList.map((item: any) => String(item)));
  const queryScopes = new Set(
    (Array.isArray(args?.queryScopes) ? args.queryScopes : ["script", "characters", "locations", "knowledge"]).map(
      (item: any) => String(item)
    )
  );

  if (!include.size) {
    if (sceneId || sceneIndex) {
      include.add("sceneContent");
      include.add("episodeSummary");
      include.add("projectSummary");
    } else if (episodeId || episodeTitle) {
      include.add("episodeContent");
      include.add("sceneList");
      include.add("episodeSummary");
    } else if (characterId || characterName) {
      include.add("character");
    } else if (locationId || locationName) {
      include.add("location");
    } else if (query) {
      include.add("matches");
      include.add("projectSummary");
    } else {
      include.add("projectSummary");
    }
  }

  let episode = episodeId ? episodes.find((ep) => ep.id === episodeId) : undefined;
  if (!episode && episodeTitle) {
    episode = pickEpisodeByTitle(episodes, episodeTitle);
  }

  let scene = undefined;
  if (episode) {
    if (sceneId) {
      scene = (episode.scenes || []).find((sc) => sc.id === sceneId);
    }
    if (!scene && sceneIndex) {
      const idx = sceneIndex - 1;
      if (idx >= 0 && idx < (episode.scenes || []).length) {
        scene = episode.scenes[idx];
      }
    }
  } else if (sceneId) {
    for (const ep of episodes) {
      const found = (ep.scenes || []).find((sc) => sc.id === sceneId);
      if (found) {
        episode = ep;
        scene = found;
        break;
      }
    }
  }

  const characters = (((data.context as any)?.characters) || []) as Character[];
  const locations = (((data.context as any)?.locations) || []) as Location[];
  let character = undefined as Character | undefined;
  let location = undefined as Location | undefined;
  if (characterId) {
    character = characters.find((c) => c.id === characterId);
  }
  if (!character && characterName) {
    character = findByName(characters, characterName);
  }
  if (locationId) {
    location = locations.find((l) => l.id === locationId);
  }
  if (!location && locationName) {
    location = findByName(locations, locationName);
  }

  const result: any = {
    request: {
      episodeId: episodeId ?? null,
      episodeTitle: episodeTitle || null,
      sceneId: sceneId ?? null,
      sceneIndex: sceneIndex ?? null,
      characterId: characterId || null,
      characterName: characterName || null,
      locationId: locationId || null,
      locationName: locationName || null,
      query: query || null,
    },
    resolved: {
      episode: episode ? { id: episode.id, title: episode.title } : null,
      scene: scene ? { id: scene.id, title: scene.title } : null,
      character: character ? { id: character.id, name: character.name } : null,
      location: location ? { id: location.id, name: location.name } : null,
    },
    data: {},
    warnings: [] as string[],
  };

  if (include.has("episodeContent") && episode?.content) {
    result.data.episodeContent = clipText(episode.content, maxChars);
  }
  if (include.has("sceneContent") && scene?.content) {
    result.data.sceneContent = clipText(scene.content, maxChars);
  }
  if (include.has("sceneList") && episode) {
    result.data.sceneList = (episode.scenes || []).map((sc) => ({
      id: sc.id,
      title: sc.title,
      location: sc.location,
      timeOfDay: sc.timeOfDay,
    }));
  }
  if (include.has("episodeCharacters") && episode) {
    result.data.episodeCharacters = (episode.characters || []).slice(0, maxItems);
  }

  if (include.has("projectSummary") && data.context?.projectSummary) {
    result.data.projectSummary = clipText(data.context.projectSummary, maxChars);
  }
  if (include.has("episodeSummary") && episode && data.context?.episodeSummaries) {
    const summary = data.context.episodeSummaries.find((s) => s.episodeId === episode.id);
    if (summary?.summary) {
      result.data.episodeSummary = clipText(summary.summary, maxChars);
    }
  }
  if (include.has("episodeSummaries") && data.context?.episodeSummaries) {
    result.data.episodeSummaries = data.context.episodeSummaries.slice(0, maxItems).map((s) => ({
      episodeId: s.episodeId,
      summary: clipText(s.summary || "", maxChars),
    }));
  }

  if (include.has("characters") && characters.length) {
    result.data.characters = summarizeCharacters(characters, maxChars, maxItems);
  }
  if (include.has("locations") && locations.length) {
    result.data.locations = summarizeLocations(locations, maxChars, maxItems);
  }
  if (include.has("character") && character) {
    result.data.character = buildCharacterDetail(character, maxChars, maxItems);
  }
  if (include.has("location") && location) {
    result.data.location = buildLocationDetail(location, maxChars, maxItems);
  }
  if (include.has("rawScript") && data.rawScript) {
    result.data.rawScript = clipText(data.rawScript, maxChars);
  }

  if (include.has("matches") && query) {
    const matches: any[] = [];
    const lowerQuery = toLower(query);
    const snippetRadius = Math.max(80, Math.min(240, Math.floor(maxChars / 4)));

    if (queryScopes.has("script")) {
      for (const ep of episodes) {
        if (matches.length >= maxMatches) break;
        const epContent = ep.content || "";
        if (epContent && toLower(epContent).includes(lowerQuery)) {
          matches.push({
            scope: "episode",
            episodeId: ep.id,
            episodeTitle: ep.title,
            snippet: buildSnippet(epContent, query, snippetRadius),
          });
          if (matches.length >= maxMatches) break;
        }
        for (const sc of ep.scenes || []) {
          if (matches.length >= maxMatches) break;
          const scContent = sc.content || "";
          const scTitle = sc.title || "";
          if (
            (scContent && toLower(scContent).includes(lowerQuery)) ||
            (scTitle && toLower(scTitle).includes(lowerQuery))
          ) {
            matches.push({
              scope: "scene",
              episodeId: ep.id,
              episodeTitle: ep.title,
              sceneId: sc.id,
              sceneTitle: sc.title,
              snippet: buildSnippet(scContent || scTitle, query, snippetRadius),
            });
          }
        }
      }
    }

    if (matches.length < maxMatches && queryScopes.has("knowledge")) {
      const projectSummary = data.context?.projectSummary || "";
      if (projectSummary && toLower(projectSummary).includes(lowerQuery)) {
        matches.push({
          scope: "projectSummary",
          snippet: buildSnippet(projectSummary, query, snippetRadius),
        });
      }
      if (matches.length < maxMatches) {
        for (const summary of data.context?.episodeSummaries || []) {
          if (matches.length >= maxMatches) break;
          if (summary.summary && toLower(summary.summary).includes(lowerQuery)) {
            matches.push({
              scope: "episodeSummary",
              episodeId: summary.episodeId,
              snippet: buildSnippet(summary.summary, query, snippetRadius),
            });
          }
        }
      }
    }

    if (matches.length < maxMatches && queryScopes.has("characters")) {
      for (const c of characters) {
        if (matches.length >= maxMatches) break;
        const haystacks = [c.name, c.role, c.bio, c.episodeUsage, ...(c.tags || [])].filter(Boolean).join(" ");
        if (haystacks && toLower(haystacks).includes(lowerQuery)) {
          matches.push({
            scope: "character",
            characterId: c.id,
            characterName: c.name,
            snippet: buildSnippet(haystacks, query, snippetRadius),
          });
        }
      }
    }

    if (matches.length < maxMatches && queryScopes.has("locations")) {
      for (const loc of locations) {
        if (matches.length >= maxMatches) break;
        const haystacks = [loc.name, loc.description, loc.visuals, loc.episodeUsage].filter(Boolean).join(" ");
        if (haystacks && toLower(haystacks).includes(lowerQuery)) {
          matches.push({
            scope: "location",
            locationId: loc.id,
            locationName: loc.name,
            snippet: buildSnippet(haystacks, query, snippetRadius),
          });
        }
      }
    }
    result.data.matches = matches;
  }

  if (!character && (characterId || characterName)) {
    result.warnings.push("character_not_found");
  }
  if (!location && (locationId || locationName)) {
    result.warnings.push("location_not_found");
  }
  if (!episode && (episodeId || episodeTitle)) {
    result.warnings.push("episode_not_found");
  }
  if (episode && sceneId && !scene) {
    result.warnings.push("scene_not_found");
  }
  if (!query && !episode && !scene && !character && !location) {
    result.warnings.push("no_target_specified");
  }

  return { result };
};

export const readScriptData = readProjectData;

export const upsertLocation = (prev: ProjectData, args: any): UpsertResult => {
  const input = args?.location || {};
  const mergeStrategy = args?.mergeStrategy === "replace" ? "replace" : "patch";
  const zonesMode = args?.zonesMode === "replace" ? "replace" : "merge";
  const zonesToDelete = Array.isArray(args?.zonesToDelete) ? args.zonesToDelete : [];
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const locations = [...((((prev.context as any)?.locations) || []) as Location[])];
  let matchIndex = -1;
  if (input.id) {
    matchIndex = locations.findIndex((l) => l.id === input.id);
  }
  if (matchIndex < 0 && name) {
    matchIndex = locations.findIndex((l) => l.name === name);
  }
  const existing = matchIndex >= 0 ? locations[matchIndex] : null;
  if (!existing && !name) {
    throw new Error("缺少场景名称，无法创建场景。");
  }
  const id = input.id || existing?.id || createStableId("loc");

  let next: Location = existing
    ? { ...existing }
    : {
        id,
        name: name || "",
        type: "secondary",
        description: "",
        visuals: "",
        zones: [],
      };

  if (mergeStrategy === "replace") {
    next = {
      id,
      name: name || existing?.name || "",
      type: existing?.type || "secondary",
      description: "",
      visuals: "",
      zones: Array.isArray(existing?.zones) ? existing?.zones : [],
      assetPriority: existing?.assetPriority,
      episodeUsage: existing?.episodeUsage,
    };
  }

  if (hasKey(input, "name")) next.name = input.name;
  if (hasKey(input, "type") && (input.type === "core" || input.type === "secondary")) next.type = input.type;
  if (hasKey(input, "description")) next.description = input.description;
  if (hasKey(input, "visuals")) next.visuals = input.visuals;
  if (hasKey(input, "assetPriority")) next.assetPriority = input.assetPriority;
  if (hasKey(input, "episodeUsage")) next.episodeUsage = input.episodeUsage;

  const hasIncomingZones = Array.isArray(input.zones);
  if (hasIncomingZones || zonesToDelete.length > 0) {
    next.zones = mergeLocationZones(
      next.zones || [],
      hasIncomingZones ? input.zones : undefined,
      zonesMode,
      zonesToDelete
    );
  }

  const designAssets = updateDesignAssetsForLocation(prev.designAssets || [], next, zonesToDelete);
  const updatedLocs = [...locations];
  if (existing && matchIndex >= 0) {
    updatedLocs[matchIndex] = next;
  } else {
    updatedLocs.push(next);
  }

  return {
    next: {
      ...prev,
      context: { ...prev.context, locations: updatedLocs } as any,
      designAssets,
    },
    result: {
      kind: "location",
      action: existing ? "updated" : "created",
      id: next.id,
      name: next.name,
      zonesCount: (next.zones || []).length,
    },
  };
};
