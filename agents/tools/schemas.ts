import { z } from "zod";

const sanitizeOpenAICompatibleJsonSchema = (schema: unknown): unknown => {
  if (Array.isArray(schema)) {
    return schema.map(sanitizeOpenAICompatibleJsonSchema);
  }
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (
      key === "$schema" ||
      key === "default" ||
      key === "examples" ||
      key === "title" ||
      key === "deprecated" ||
      key === "readOnly" ||
      key === "writeOnly"
    ) {
      continue;
    }
    // Zod emits JS safe-integer bounds for `int()`. They are not needed for tool calling
    // and some OpenAI-compatible providers reject verbose numeric constraints.
    if (key === "minimum" || key === "maximum") {
      continue;
    }
    next[key] = sanitizeOpenAICompatibleJsonSchema(value);
  }
  return next;
};

const toOpenAICompatibleParameters = <T extends z.ZodTypeAny>(schema: T) =>
  sanitizeOpenAICompatibleJsonSchema(z.toJSONSchema(schema)) as Record<string, unknown>;

export const readProjectDataSchema = z.object({
  episodeId: z.number().int().optional(),
  episodeTitle: z.string().optional(),
  sceneId: z.string().optional(),
  sceneIndex: z.number().int().optional(),
  characterId: z.string().optional(),
  characterName: z.string().optional(),
  locationId: z.string().optional(),
  locationName: z.string().optional(),
  query: z.string().optional(),
  queryScopes: z.array(z.enum(["script", "knowledge", "characters", "locations"])).optional(),
  include: z.array(
    z.enum([
      "episodeContent",
      "sceneContent",
      "sceneList",
      "episodeCharacters",
      "matches",
      "projectSummary",
      "episodeSummary",
      "episodeSummaries",
      "characters",
      "character",
      "locations",
      "location",
      "rawScript",
    ])
  ).optional(),
  maxChars: z.number().int().optional(),
  maxMatches: z.number().int().optional(),
  maxItems: z.number().int().optional(),
});

export const searchScriptDataSchema = z.object({
  query: z.string(),
  episodeId: z.number().int().optional(),
  episodeTitle: z.string().optional(),
  maxMatches: z.number().int().optional(),
  maxSnippetChars: z.number().int().optional(),
});

export const getEpisodeScriptSchema = z.object({
  episodeId: z.number().int().optional(),
  episodeTitle: z.string().optional(),
  maxChars: z.number().int().optional(),
  maxScenes: z.number().int().optional(),
  includeSceneList: z.boolean().optional(),
  includeEpisodeSummary: z.boolean().optional(),
  includeCharacters: z.boolean().optional(),
});

export const getSceneScriptSchema = z.object({
  episodeId: z.number().int().optional(),
  episodeTitle: z.string().optional(),
  sceneId: z.string().optional(),
  sceneIndex: z.number().int().optional(),
  maxChars: z.number().int().optional(),
  includeEpisodeSummary: z.boolean().optional(),
  includeCharacters: z.boolean().optional(),
  includeSceneMetadata: z.boolean().optional(),
});

export const upsertCharacterSchema = z.object({
  character: z.object({
    id: z.string().optional(),
    slug: z.string().optional(),
    name: z.string(),
    role: z.string().optional(),
    isMain: z.boolean().optional(),
    bio: z.string().optional(),
    assetPriority: z.enum(["high", "medium", "low"]).optional(),
    episodeUsage: z.string().optional(),
    archetype: z.string().optional(),
    tags: z.array(z.string()).optional(),
    aliases: z.array(
      z.union([
        z.string(),
        z.object({
          id: z.string().optional(),
          value: z.string(),
          kind: z.enum(["primary", "alias", "title", "short", "legacy"]).optional(),
          normalized: z.string().optional(),
        }),
      ])
    ).optional(),
    status: z.enum(["draft", "verified", "locked", "archived"]).optional(),
    version: z.number().int().optional(),
    binding: z.object({
      canonicalMention: z.string().optional(),
      defaultFormId: z.string().optional(),
      defaultVoiceScope: z.enum(["character", "form"]).optional(),
      mentionPolicy: z.enum(["character-first", "form-first"]).optional(),
    }).optional(),
    forms: z.array(
      z.object({
        id: z.string().optional(),
        formName: z.string(),
        characterId: z.string().optional(),
        key: z.string().optional(),
        type: z.enum(["default", "age", "costume", "identity", "state", "disguise", "battle", "special"]).optional(),
        isDefault: z.boolean().optional(),
        aliases: z.array(z.string()).optional(),
        episodeRange: z.string(),
        description: z.string().optional(),
        visualTags: z.string().optional(),
        identityOrState: z.string().optional(),
        hair: z.string().optional(),
        face: z.string().optional(),
        body: z.string().optional(),
        costume: z.string().optional(),
        accessories: z.string().optional(),
        props: z.string().optional(),
        materialPalette: z.string().optional(),
        poses: z.string().optional(),
        expressions: z.string().optional(),
        lightingOrPalette: z.string().optional(),
        turnaroundNeeded: z.boolean().optional(),
        deliverables: z.string().optional(),
        designRationale: z.string().optional(),
        styleRef: z.string().optional(),
        genPrompts: z.string().optional(),
        voiceId: z.string().optional(),
        voicePrompt: z.string().optional(),
        previewAudioUrl: z.string().optional(),
      })
    ).optional(),
  }),
  mergeStrategy: z.enum(["patch", "replace"]).optional(),
  formsMode: z.enum(["merge", "replace"]).optional(),
  formsToDelete: z.array(z.string()).optional(),
  evidence: z.array(z.string()).optional(),
});

export const upsertLocationSchema = z.object({
  location: z.object({
    id: z.string().optional(),
    name: z.string(),
    type: z.enum(["core", "secondary"]).optional(),
    description: z.string().optional(),
    visuals: z.string().optional(),
    assetPriority: z.enum(["high", "medium", "low"]).optional(),
    episodeUsage: z.string().optional(),
    zones: z.array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        kind: z.enum(["interior", "exterior", "transition", "unspecified"]).optional(),
        episodeRange: z.string(),
        layoutNotes: z.string().optional(),
        keyProps: z.string().optional(),
        lightingWeather: z.string().optional(),
        materialPalette: z.string().optional(),
        designRationale: z.string().optional(),
        deliverables: z.string().optional(),
        genPrompts: z.string().optional(),
      })
    ).optional(),
  }),
  mergeStrategy: z.enum(["patch", "replace"]).optional(),
  zonesMode: z.enum(["merge", "replace"]).optional(),
  zonesToDelete: z.array(z.string()).optional(),
  evidence: z.array(z.string()).optional(),
});

export const createTextNodeSchema = z.object({
  title: z.string().optional(),
  text: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  parentId: z.string().optional(),
});

export const createNodeWorkflowSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  parentId: z.string().optional(),
  layout: z.enum(["horizontal", "vertical", "fanout"]).optional(),
  originX: z.number().optional(),
  originY: z.number().optional(),
  nodes: z
    .array(
      z.object({
        key: z.string(),
        type: z.enum([
          "text",
          "shot",
          "annotation",
          "imageGen",
          "wanImageGen",
          "soraVideoGen",
          "wanReferenceVideoGen",
          "viduVideoGen",
          "seedanceVideoGen",
        ]),
        title: z.string().optional(),
        text: z.string().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        data: z.record(z.string(), z.any()).optional(),
      })
    )
    .min(1),
  links: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        fromHandle: z.enum(["image", "text", "audio"]).optional(),
        toHandle: z.enum(["image", "text", "audio"]).optional(),
        paused: z.boolean().optional(),
      })
    )
    .optional(),
});

export const readProjectDataParameters = toOpenAICompatibleParameters(readProjectDataSchema);
export const searchScriptDataParameters = toOpenAICompatibleParameters(searchScriptDataSchema);
export const getEpisodeScriptParameters = toOpenAICompatibleParameters(getEpisodeScriptSchema);
export const getSceneScriptParameters = toOpenAICompatibleParameters(getSceneScriptSchema);
export const upsertCharacterParameters = toOpenAICompatibleParameters(upsertCharacterSchema);
export const upsertLocationParameters = toOpenAICompatibleParameters(upsertLocationSchema);
export const createTextNodeParameters = toOpenAICompatibleParameters(createTextNodeSchema);
export const createNodeWorkflowParameters = toOpenAICompatibleParameters(createNodeWorkflowSchema);
