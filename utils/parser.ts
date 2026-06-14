
import {
  Episode,
  Scene,
  ProjectData,
  ProjectContext,
  TokenUsage,
  Phase1Usage,
  Character,
  CharacterForm,
  Location,
  LocationZone,
  SceneMetadata,
} from "../types";
import { ensureStableId } from "./id";
import { normalizeProjectData } from "./projectData";

// Helper: Parse scenes from episode content
const normalizeDigits = (text: string) =>
  text.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFF10 + 0x30));

// Normalize mixed newline styles:
// - convert lone \r (old Mac) into \n
// - convert Unicode line/paragraph separators (e.g., \u2028 from some editors) into \n
// keep existing \r\n intact
const normalizeNewlines = (text: string) =>
  text
    .replace(/\r(?!\n)/g, "\n")
    .replace(/[\u2028\u2029]/g, "\n");

const sanitizeSceneToken = (value: string) => {
  return value
    .trim()
    .replace(/^[^A-Za-z0-9\u4e00-\u9fff]+|[^A-Za-z0-9\u4e00-\u9fff]+$/g, "")
    .trim();
};

const SCENE_TIME_MAP: Record<string, string> = {
  日: "日",
  夜: "夜",
  白天: "白天",
  夜晚: "夜晚",
  day: "day",
  night: "night",
  daytime: "day",
  nighttime: "night",
  dawn: "dawn",
  dusk: "dusk",
  morning: "morning",
  evening: "evening",
  am: "AM",
  pm: "PM",
};

const SCENE_LOCATION_MAP: Record<string, string> = {
  内: "内",
  外: "外",
  内景: "内景",
  外景: "外景",
  室内: "内",
  室外: "外",
  interior: "interior",
  exterior: "exterior",
  "interior-space": "interior",
  "exterior-space": "exterior",
};

const matchTimeToken = (token: string): string | undefined => {
  const raw = sanitizeSceneToken(token);
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  return SCENE_TIME_MAP[raw] || SCENE_TIME_MAP[lower];
};

const matchLocationToken = (token: string): string | undefined => {
  const raw = sanitizeSceneToken(token);
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  return SCENE_LOCATION_MAP[raw] || SCENE_LOCATION_MAP[lower];
};

type SceneHeader = {
  name: string;
  partition?: string;
  timeOfDay?: string;
  location?: string;
  metadata: SceneMetadata;
};

const parseSceneHeader = (rawTitle: string): SceneHeader => {
  const normalized = rawTitle
    .replace(/[\u3000]/g, " ")
    .replace(/[·•・]/g, " ")
    .replace(/[\s]+/g, " ")
    .trim();
  const originalTokens = normalized.split(/\s+/).filter(Boolean);
  const tokens = [...originalTokens];

  let location: string | undefined;
  if (tokens.length) {
    const candidate = tokens[tokens.length - 1];
    const matched = matchLocationToken(candidate);
    if (matched) {
      location = matched;
      tokens.pop();
    }
  }

  let timeOfDay: string | undefined;
  if (tokens.length) {
    const candidate = tokens[tokens.length - 1];
    const matched = matchTimeToken(candidate);
    if (matched) {
      timeOfDay = matched;
      tokens.pop();
    }
  }

  let partition: string | undefined;
  if (tokens.length > 1) {
    partition = tokens.pop();
  }

  const name = tokens.join(" ").trim() || partition || normalized;

  return {
    name,
    partition,
    timeOfDay,
    location,
    metadata: {
      rawTitle: rawTitle.trim(),
      tokens: originalTokens,
    },
  };
};

const parseScenes = (episodeContent: string): Scene[] => {
  const lines = episodeContent.split(/\r?\n/);
  const scenes: Scene[] = [];
  let currentScene: Scene | null = null;
  let buffer: string[] = [];

  // Regex for "12-1 场景名" 或 "１２－１场景名"（支持多位数，空格可选，半/全角横线，半/全角数字）
  // Captures: 1: EpisodeNum, 2: SceneNum, 3: Title (rest of line)
  const sceneHeaderRegex = /^\s*([0-9０-９]{1,4})\s*[-－–—]\s*([0-9０-９]{1,4})\s*(.+)$/;

  lines.forEach(line => {
    const match = line.match(sceneHeaderRegex);
    if (match) {
      // If we have a current scene, save it
      if (currentScene) {
        currentScene.content = buffer.join('\n').trim();
        scenes.push(currentScene);
      }
      
      buffer = [];
      const sceneId = `${normalizeDigits(match[1])}-${normalizeDigits(match[2])}`; // e.g. 16-1
      const sceneTitle = match[3].trim();
      const parsedTitle = parseSceneHeader(sceneTitle);
      
      currentScene = {
        id: sceneId,
        title: parsedTitle.name,
        partition: parsedTitle.partition,
        timeOfDay: parsedTitle.timeOfDay,
        location: parsedTitle.location,
        metadata: parsedTitle.metadata,
        content: ''
      };
      // Do not include the header line in content buffer to avoid duplication
    } else {
      if (currentScene) {
        buffer.push(line);
      }
    }
  });

  if (currentScene) {
    currentScene.content = buffer.join('\n').trim();
    scenes.push(currentScene);
  }

  return scenes;
};

// PREPROCESSING: Fix malformed scripts where AI forgets to insert newlines
const normalizeScriptText = (text: string): string => {
    let cleanText = text;
    
    // 1. Force newline before and after "Episode Headers" (e.g. 第1集 or 第一集)
    // Matches "第" + (Chinese numbers or digits) + "集"
    // Using simple replacement to detach it from preceding/succeeding text
    cleanText = cleanText.replace(/([^\n])(第\s*[0-90-9零一二三四五六七八九十百千两]+\s*集)/g, '$1\n\n$2');
    cleanText = cleanText.replace(/(第\s*[0-90-9零一二三四五六七八九十百千两]+\s*集)([^\n])/g, '$1\n\n$2');

    return cleanText;
};

export const parseScriptToEpisodes = (rawText: string): Episode[] => {
  // Normalize line endings first to tolerate mixed/newline styles
  const withNormalizedNewlines = normalizeNewlines(rawText);
  // Normalize Input First
  const normalizedText = normalizeScriptText(withNormalizedNewlines);

  // Split by newline, handling potential Windows CRLF
  const lines = normalizedText.split(/\r?\n/);
  const episodes: Episode[] = [];
  let currentEpisode: Episode | null = null;
  let buffer: string[] = [];
  let currentCast: Set<string> = new Set();

  // Robust Regex to match "第X集" at the start of a line
  // Supports both Arabic (1) and Chinese (一) numerals
  const episodeStartRegex = /^\s*第\s*[0-90-9\d零一二三四五六七八九十百千两]+\s*集/;
  const castLineRegex = /^\s*人物[:：]\s*(.+)$/;

  lines.forEach((line) => {
    // Check if line matches Episode Header AND isn't absurdly long (e.g. accidentally captured a whole paragraph)
    if (episodeStartRegex.test(line) && line.length < 50) {
      if (currentEpisode) {
        const fullContent = buffer.join('\n').trim();
        currentEpisode.content = fullContent;
        // Parse scenes within this episode
        currentEpisode.scenes = parseScenes(fullContent);
        currentEpisode.characters = Array.from(currentCast);
        episodes.push(currentEpisode);
      }

      buffer = [];
      currentCast = new Set();
      const title = line.trim();
      currentEpisode = {
        id: episodes.length + 1,
        title: title,
        content: '',
        scenes: [],
        characters: [],
        status: 'pending'
      };
      buffer.push(line); 
    } else {
      if (currentEpisode) {
        const castMatch = line.match(castLineRegex);
        if (castMatch && castMatch[1]) {
          const names = castMatch[1]
            .split(/[、，,／/|\s]+/)
            .map((n) => n.trim())
            .filter(Boolean);
          names.forEach((name) => currentCast.add(name));
        }
        buffer.push(line);
      }
    }
  });

  if (currentEpisode) {
    const fullContent = buffer.join('\n').trim();
    currentEpisode.content = fullContent;
    currentEpisode.scenes = parseScenes(fullContent);
    currentEpisode.characters = Array.from(currentCast);
    episodes.push(currentEpisode);
  }

  // Fallback: if no episode headers were found, treat entire script as a single episode
  if (episodes.length === 0 && normalizedText.trim().length > 0) {
    const fullContent = normalizedText.trim();
    const fallbackCast = (() => {
      const match = fullContent.match(castLineRegex);
      if (!match || !match[1]) return [];
      return match[1]
        .split(/[、，,／/|\s]+/)
        .map((n) => n.trim())
        .filter(Boolean);
    })();
    episodes.push({
      id: 1,
      title: "第1集",
      content: fullContent,
      scenes: parseScenes(fullContent),
      characters: fallbackCast,
      status: 'pending'
    });
  }

  return episodes;
};

type UnderstandingExport = {
  version: number;
  exportedAt: string;
  context: ProjectContext;
  episodes: Array<{ id: number; title: string; summary?: string }>;
  contextUsage?: TokenUsage;
  phase1Usage?: Phase1Usage;
};

type UnderstandingImport = {
  context: ProjectContext;
  contextUsage?: TokenUsage;
  phase1Usage?: Partial<Phase1Usage>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const toSafeString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const toOptionalString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

const toSafeNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num;
  }
  return undefined;
};

const normalizeEpisodeSummaries = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const raw = isRecord(entry) ? entry : {};
      const episodeId = toSafeNumber(raw.episodeId ?? raw.id);
      if (episodeId === undefined) return null;
      return {
        episodeId,
        summary: toSafeString(raw.summary)
      };
    })
    .filter((entry): entry is { episodeId: number; summary: string } => !!entry);
};

const normalizeEpisodesForSummaries = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const raw = isRecord(entry) ? entry : {};
      const id = toSafeNumber(raw.id ?? raw.episodeId);
      if (id === undefined) return null;
      return {
        id,
        title: toSafeString(raw.title),
        summary: toOptionalString(raw.summary)
      };
    })
    .filter((entry): entry is { id: number; title: string; summary?: string } => !!entry);
};

const normalizeTokenUsage = (value: unknown): TokenUsage | undefined => {
  if (!isRecord(value)) return undefined;
  const promptTokens = toSafeNumber(value.promptTokens);
  const responseTokens = toSafeNumber(value.responseTokens);
  const totalTokens = toSafeNumber(value.totalTokens);
  if (promptTokens === undefined && responseTokens === undefined && totalTokens === undefined) {
    return undefined;
  }
  return {
    promptTokens: promptTokens ?? 0,
    responseTokens: responseTokens ?? 0,
    totalTokens: totalTokens ?? 0
  };
};

const normalizePhase1Usage = (value: unknown): Partial<Phase1Usage> | undefined => {
  if (!isRecord(value)) return undefined;
  const entries: Array<[keyof Phase1Usage, TokenUsage | undefined]> = [
    ["projectSummary", normalizeTokenUsage(value.projectSummary)],
    ["episodeSummaries", normalizeTokenUsage(value.episodeSummaries)],
    ["charList", normalizeTokenUsage(value.charList)],
    ["charDeepDive", normalizeTokenUsage(value.charDeepDive)],
    ["locList", normalizeTokenUsage(value.locList)],
    ["locDeepDive", normalizeTokenUsage(value.locDeepDive)]
  ];
  const result: Partial<Phase1Usage> = {};
  entries.forEach(([key, usage]) => {
    if (usage) result[key] = usage;
  });
  return Object.keys(result).length ? result : undefined;
};

const normalizeCharacterForms = (value: unknown): CharacterForm[] => {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const raw = isRecord(entry) ? entry : {};
    return {
      id: ensureStableId(raw.id, "form"),
      formName: toSafeString(raw.formName, `Form ${index + 1}`),
      episodeRange: toSafeString(raw.episodeRange),
      description: toSafeString(raw.description),
      visualTags: toSafeString(raw.visualTags),
      identityOrState: toOptionalString(raw.identityOrState),
      hair: toOptionalString(raw.hair),
      face: toOptionalString(raw.face),
      body: toOptionalString(raw.body),
      costume: toOptionalString(raw.costume),
      accessories: toOptionalString(raw.accessories),
      props: toOptionalString(raw.props),
      materialPalette: toOptionalString(raw.materialPalette),
      poses: toOptionalString(raw.poses),
      expressions: toOptionalString(raw.expressions),
      lightingOrPalette: toOptionalString(raw.lightingOrPalette),
      turnaroundNeeded: typeof raw.turnaroundNeeded === "boolean" ? raw.turnaroundNeeded : undefined,
      deliverables: toOptionalString(raw.deliverables),
      designRationale: toOptionalString(raw.designRationale),
      styleRef: toOptionalString(raw.styleRef),
      genPrompts: toOptionalString(raw.genPrompts)
    };
  });
};

const normalizeCharacters = (value: unknown): Character[] => {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const raw = isRecord(entry) ? entry : {};
    const id = toSafeString(raw.id);
    const assetPriority =
      raw.assetPriority === "high" || raw.assetPriority === "medium" || raw.assetPriority === "low"
        ? raw.assetPriority
        : undefined;
    return {
      id: id || `character-${index + 1}`,
      name: toSafeString(raw.name),
      role: toSafeString(raw.role),
      isMain: typeof raw.isMain === "boolean" ? raw.isMain : false,
      bio: toSafeString(raw.bio),
      forms: normalizeCharacterForms(raw.forms),
      assetPriority,
      archetype: toOptionalString(raw.archetype),
      episodeUsage: toOptionalString(raw.episodeUsage)
    };
  });
};

const normalizeLocationZones = (value: unknown): LocationZone[] => {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const raw = isRecord(entry) ? entry : {};
    const kind =
      raw.kind === "interior" || raw.kind === "exterior" || raw.kind === "transition" || raw.kind === "unspecified"
        ? raw.kind
        : "unspecified";
    return {
      id: ensureStableId(raw.id, "zone"),
      name: toSafeString(raw.name),
      kind,
      episodeRange: toSafeString(raw.episodeRange),
      layoutNotes: toSafeString(raw.layoutNotes),
      keyProps: toSafeString(raw.keyProps),
      lightingWeather: toSafeString(raw.lightingWeather),
      materialPalette: toSafeString(raw.materialPalette),
      designRationale: toOptionalString(raw.designRationale),
      deliverables: toOptionalString(raw.deliverables),
      genPrompts: toOptionalString(raw.genPrompts)
    };
  });
};

const normalizeLocations = (value: unknown): Location[] => {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const raw = isRecord(entry) ? entry : {};
    const id = toSafeString(raw.id);
    const type = raw.type === "core" || raw.type === "secondary" ? raw.type : "secondary";
    const assetPriority =
      raw.assetPriority === "high" || raw.assetPriority === "medium" || raw.assetPriority === "low"
        ? raw.assetPriority
        : undefined;
    return {
      id: id || `location-${index + 1}`,
      name: toSafeString(raw.name),
      type,
      description: toSafeString(raw.description),
      visuals: toSafeString(raw.visuals),
      assetPriority,
      episodeUsage: toOptionalString(raw.episodeUsage),
      zones: normalizeLocationZones(raw.zones)
    };
  });
};

export const exportUnderstandingToJSON = (data: ProjectData) => {
  const payload: UnderstandingExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    context: data.context,
    episodes: data.episodes.map((ep) => ({
      id: ep.id,
      title: ep.title,
      summary: ep.summary
    })),
    contextUsage: data.contextUsage,
    phase1Usage: data.phase1Usage
  };

  const jsonContent = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `qalam_understanding_${Date.now()}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const parseUnderstandingJSON = (jsonText: string): UnderstandingImport => {
  let raw: unknown;
  try {
    const sanitizedText = jsonText.charCodeAt(0) === 0xfeff ? jsonText.slice(1) : jsonText;
    raw = JSON.parse(sanitizedText);
  } catch (err) {
    throw new Error("Invalid JSON file.");
  }

  if (!isRecord(raw)) {
    throw new Error("Invalid JSON format.");
  }

  const contextSource = isRecord(raw.context) ? raw.context : raw;
  const summariesFromContext = normalizeEpisodeSummaries(contextSource.episodeSummaries);
  const summariesFromRoot = normalizeEpisodeSummaries(raw.episodeSummaries);
  const episodesFromPayload = normalizeEpisodesForSummaries(raw.episodes);
  const derivedSummaries =
    summariesFromContext.length > 0
      ? summariesFromContext
      : summariesFromRoot.length > 0
        ? summariesFromRoot
        : episodesFromPayload
            .filter((ep) => ep.summary)
            .map((ep) => ({ episodeId: ep.id, summary: ep.summary || "" }));

  const context: ProjectContext = normalizeProjectData({
    context: {
      projectSummary: toSafeString(contextSource.projectSummary),
      episodeSummaries: derivedSummaries,
      roles: Array.isArray(contextSource.roles) ? contextSource.roles : [],
    },
  }).context;

  const hasContent =
    context.projectSummary ||
    context.episodeSummaries.length > 0 ||
    context.roles.length > 0;

  if (!hasContent) {
    throw new Error("No understanding data found in JSON.");
  }

  return {
    context,
    contextUsage: normalizeTokenUsage(raw.contextUsage),
    phase1Usage: normalizePhase1Usage(raw.phase1Usage)
  };
};
