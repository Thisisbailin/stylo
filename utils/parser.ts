
import {
  Episode,
  Shot,
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
import { SHOT_CSV_COLUMNS, sanitizeShot } from "./shotSchema";
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
        shots: [],
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
      shots: [],
      status: 'pending'
    });
  }

  return episodes;
};

// --- EXPORT FUNCTIONS ---

// 1. CSV EXPORT (Robust, Best Compatibility)
export const exportToCSV = (episodes: Episode[]) => {
  const headers = SHOT_CSV_COLUMNS.map((column) => column.header);
  
  // Add Byte Order Mark (BOM) so Excel recognizes formatting as UTF-8 automatically
  let csvContent = '\ufeff' + headers.map(h => `"${h}"`).join(',') + '\n';

  episodes.forEach(ep => {
    ep.shots.forEach(shot => {
      const row = [
        ep.title,
        shot.id,
        shot.duration,
        shot.shotType,
        shot.focalLength || '',
        shot.movement,
        shot.composition || '',
        shot.blocking || '',
        shot.dialogue,
        shot.sound || '',
        shot.lightingVfx || '',
        shot.editingNotes || '',
        shot.notes || '',
        shot.soraPrompt,
        shot.storyboardPrompt
      ];
      
      // Escape logic: 
      // 1. Convert to string
      // 2. Replace double quotes " with two double quotes ""
      // 3. Wrap entire field in double quotes
      const rowStr = row.map(field => {
        const safeField = (field || '').toString().replace(/"/g, '""');
        return `"${safeField}"`;
      }).join(',');
      
      csvContent += rowStr + '\n';
    });
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `qalam_export_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// 2. XLS EXPORT (HTML Table method, preserves visual layout like text wrapping)
export const exportToXLS = (episodes: Episode[]) => {
  // We use an HTML table strategy to fake an Excel file.
  // This allows us to use CSS for bold headers, column widths, and text wrapping.
  // Excel opens this natively (though it might warn about extension mismatch, which is safe to ignore).
  
  let table = `<html xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11pt; }
  table { border-collapse: collapse; width: 100%; }
  th { 
      background-color: #4f46e5; 
      color: white; 
      font-weight: bold; 
      padding: 10px; 
      border: 1px solid #000; 
      text-align: left;
  }
  td { 
      padding: 8px; 
      border: 1px solid #ccc; 
      vertical-align: top; 
      white-space: pre-wrap; /* Critical for wrapping long text */
  }
  /* Column widths */
  .col-id { width: 80px; }
  .col-dur { width: 60px; }
  .col-type { width: 90px; }
  .col-lens { width: 110px; }
  .col-move { width: 80px; }
  .col-comp { width: 260px; }
  .col-block { width: 260px; }
  .col-dial { width: 200px; }
  .col-sound { width: 220px; }
  .col-light { width: 240px; }
  .col-edit { width: 180px; }
  .col-notes { width: 220px; }
  .col-sora { width: 450px; background-color: #f0fdf4; } /* Slight green tint for prompt */
  .col-storyboard { width: 450px; background-color: #fef9c3; } /* Light yellow tint for storyboard */
</style>
</head>
<body>
<table>
  <tr>
    <th>剧集</th>
    <th class="col-id">镜号</th>
    <th class="col-dur">时长</th>
    <th class="col-type">景别</th>
    <th class="col-lens">焦段</th>
    <th class="col-move">运镜</th>
    <th class="col-comp">机位/构图</th>
    <th class="col-block">调度/表演</th>
    <th class="col-dial">台词/OS</th>
    <th class="col-sound">声音</th>
    <th class="col-light">光色/VFX</th>
    <th class="col-edit">剪辑</th>
    <th class="col-notes">备注（氛围/情绪）</th>
    <th class="col-sora">Sora Prompt</th>
    <th class="col-storyboard">Storyboard Prompt</th>
  </tr>`;

  episodes.forEach(ep => {
    ep.shots.forEach(shot => {
      table += `<tr>
        <td>${ep.title}</td>
        <td>${shot.id}</td>
        <td>${shot.duration}</td>
        <td>${shot.shotType}</td>
        <td>${shot.focalLength || ''}</td>
        <td>${shot.movement}</td>
        <td>${shot.composition || ''}</td>
        <td>${shot.blocking || ''}</td>
        <td>${shot.dialogue}</td>
        <td>${shot.sound || ''}</td>
        <td>${shot.lightingVfx || ''}</td>
        <td>${shot.editingNotes || ''}</td>
        <td>${shot.notes || ''}</td>
        <td>${shot.soraPrompt}</td>
        <td>${shot.storyboardPrompt}</td>
      </tr>`;
    });
  });

  table += `</table></body></html>`;

  const blob = new Blob([table], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `shooting_script_formatted_${Date.now()}.xls`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Helper to parse CSV line respecting quotes
const parseCSVLine = (text: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
};

export const parseCSVToShots = (csvText: string): Map<string, Shot[]> => {
  const lines = csvText.split(/\r?\n/);
  const shotMap = new Map<string, Shot[]>();
  
  // Remove BOM if present
  if (lines[0].charCodeAt(0) === 0xFEFF) {
    lines[0] = lines[0].substring(1);
  }

  // Identify headers to ensure correct column mapping
  const headers = parseCSVLine(lines[0]);
  const normalizeHeader = (value: string) => (value || "").trim().toLowerCase();
  const findHeaderIndex = (candidates: string[]) => {
    const normalized = headers.map(normalizeHeader);
    for (const candidate of candidates) {
      const idx = normalized.indexOf(normalizeHeader(candidate));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const epIdx = findHeaderIndex([...SHOT_CSV_COLUMNS[0].aliases]);
  const idIdx = findHeaderIndex([...SHOT_CSV_COLUMNS[1].aliases]);
  const durIdx = findHeaderIndex([...SHOT_CSV_COLUMNS[2].aliases]);
  const typeIdx = findHeaderIndex([...SHOT_CSV_COLUMNS[3].aliases]);
  const lensIdx = findHeaderIndex([...SHOT_CSV_COLUMNS[4].aliases]);
  const moveIdx = findHeaderIndex([...SHOT_CSV_COLUMNS[5].aliases]);
  const compIdx = findHeaderIndex([...SHOT_CSV_COLUMNS[6].aliases]);
  const blockIdx = findHeaderIndex([...SHOT_CSV_COLUMNS[7].aliases]);
  const dialIdx = findHeaderIndex([...SHOT_CSV_COLUMNS[8].aliases]);
  const soundIdx = findHeaderIndex([...SHOT_CSV_COLUMNS[9].aliases]);
  const lightIdx = findHeaderIndex([...SHOT_CSV_COLUMNS[10].aliases]);
  const editIdx = findHeaderIndex([...SHOT_CSV_COLUMNS[11].aliases]);
  const notesIdx = findHeaderIndex([...SHOT_CSV_COLUMNS[12].aliases]);
  const soraIdx = findHeaderIndex([...SHOT_CSV_COLUMNS[13].aliases]);
  const storyboardIdx = findHeaderIndex([...SHOT_CSV_COLUMNS[14].aliases]);

  if (epIdx === -1 || idIdx === -1) {
    throw new Error("Invalid CSV Format: Missing 'Episode' or 'Shot ID' headers.");
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const cols = parseCSVLine(line);
    while (cols.length < headers.length) cols.push('');

    const episodeTitle = cols[epIdx];
    const { shot } = sanitizeShot({
      id: cols[idIdx],
      duration: cols[durIdx] || '',
      shotType: cols[typeIdx] || '',
      focalLength: lensIdx >= 0 ? (cols[lensIdx] || '') : '',
      movement: cols[moveIdx] || '',
      composition: compIdx >= 0 ? (cols[compIdx] || '') : '',
      blocking: blockIdx >= 0 ? (cols[blockIdx] || '') : '',
      dialogue: cols[dialIdx] || '',
      sound: soundIdx >= 0 ? (cols[soundIdx] || '') : '',
      lightingVfx: lightIdx >= 0 ? (cols[lightIdx] || '') : '',
      editingNotes: editIdx >= 0 ? (cols[editIdx] || '') : '',
      notes: notesIdx >= 0 ? (cols[notesIdx] || '') : '',
      soraPrompt: soraIdx >= 0 ? (cols[soraIdx] || '') : '',
      storyboardPrompt: storyboardIdx >= 0 ? (cols[storyboardIdx] || '') : ''
    }, { mode: "csv", requireStructuredId: false, allowGeneratedIds: true });

    if (!shotMap.has(episodeTitle)) {
      shotMap.set(episodeTitle, []);
    }
    shotMap.get(episodeTitle)?.push(shot);
  }

  return shotMap;
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
      characters: normalizeCharacters(contextSource.characters ?? raw.characters),
      locations: normalizeLocations(contextSource.locations ?? raw.locations),
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
