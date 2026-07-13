export const SCREENPLAY_LINE_KINDS = [
  "action",
  "scene_heading",
  "character",
  "dual_dialogue",
  "dialogue",
  "parenthetical",
  "lyric",
  "transition",
  "centered",
  "note",
  "boneyard",
  "section",
  "synopsis",
  "page_break",
] as const;

export type ScreenplayLineKind = (typeof SCREENPLAY_LINE_KINDS)[number];

export type ScreenplayLine = {
  index: number;
  start: number;
  end: number;
  raw: string;
  content: string;
  kind: ScreenplayLineKind;
};

export type SceneHeading = {
  boundary: string;
  location: string;
  time: string;
};

export type ScreenplayScene = SceneHeading & {
  id: string;
  ordinal: number;
  lineIndex: number;
  start: number;
  characterNames: string[];
  synopsis: string;
};

export type ScreenplayDiagnostic = {
  id: string;
  severity: "warning" | "info";
  lineIndex: number;
  message: string;
};

export type ScreenplayAnalysis = {
  lines: ScreenplayLine[];
  scenes: ScreenplayScene[];
  characterNames: string[];
  locations: string[];
  diagnostics: ScreenplayDiagnostic[];
  stats: {
    lines: number;
    scenes: number;
    characters: number;
    locations: number;
    words: number;
    glyphs: number;
    estimatedPages: number;
    estimatedMinutes: number;
    dialoguePercent: number;
  };
};

export const SCREENPLAY_FORMAT_LABELS: Record<ScreenplayLineKind, string> = {
  action: "动作",
  scene_heading: "场景",
  character: "角色",
  dual_dialogue: "双人对白",
  dialogue: "对白",
  parenthetical: "括注",
  lyric: "歌词",
  transition: "转场",
  centered: "居中",
  note: "备注",
  boneyard: "隐藏",
  section: "章节",
  synopsis: "梗概",
  page_break: "分页",
};

export const SCREENPLAY_FORMAT_SHORTCUTS: Partial<Record<ScreenplayLineKind, string>> = {
  action: "⌘1",
  scene_heading: "⌘2",
  character: "⌘3",
  dialogue: "⌘4",
  parenthetical: "⌘5",
  transition: "⌘6",
};

export const SCENE_BOUNDARIES = ["INT.", "EXT.", "INT./EXT.", "I/E"] as const;
export const SCENE_TIMES = ["DAY", "NIGHT", "DAWN", "DUSK", "MORNING", "AFTERNOON", "EVENING", "LATER"] as const;
export const TRANSITIONS = ["CUT TO", "DISSOLVE TO", "FADE OUT", "FADE IN", "SMASH CUT TO"] as const;

export const PLACEHOLDER_LOCATION = "LOCATION";
export const PLACEHOLDER_CHARACTER = "CHARACTER";

const CHINESE_MARKERS: Record<ScreenplayLineKind, string> = {
  action: "△",
  scene_heading: "【场景】",
  character: "【角色】",
  dual_dialogue: "【双人对白】",
  dialogue: "【对白】",
  parenthetical: "【括注】",
  lyric: "【歌词】",
  transition: "【转场】",
  centered: "【居中】",
  note: "【注释】",
  boneyard: "【隐藏】",
  section: "【章节】",
  synopsis: "【梗概】",
  page_break: "【分页】",
};

const BOUNDARY_ALIASES: Record<string, string> = {
  内景: "INT.",
  外景: "EXT.",
  内外景: "INT./EXT.",
  "内/外": "I/E",
};

const TIME_ALIASES: Record<string, string> = {
  日: "DAY",
  夜: "NIGHT",
  黎明: "DAWN",
  黄昏: "DUSK",
  上午: "MORNING",
  下午: "AFTERNOON",
  傍晚: "EVENING",
  稍后: "LATER",
};

const normalizeBoundary = (value: string) => {
  const clean = value.trim();
  if (BOUNDARY_ALIASES[clean]) return BOUNDARY_ALIASES[clean];
  const normalized = clean.toUpperCase().replace(/^INT\/EXT\.?$/, "INT./EXT.");
  return SCENE_BOUNDARIES.find((item) => item === normalized) || "INT.";
};

const normalizeTime = (value: string) => {
  const clean = value.trim();
  if (TIME_ALIASES[clean]) return TIME_ALIASES[clean];
  const normalized = clean.toUpperCase();
  return SCENE_TIMES.find((item) => item === normalized) || "DAY";
};

export const splitScreenplayLines = (body: string) => body.replace(/\r\n?/g, "\n").split("\n");

export const getLineBoundsAt = (text: string, cursor: number) => {
  const safeCursor = Math.min(text.length, Math.max(0, cursor));
  const start = text.lastIndexOf("\n", Math.max(0, safeCursor - 1)) + 1;
  const nextBreak = text.indexOf("\n", safeCursor);
  const end = nextBreak === -1 ? text.length : nextBreak;
  return {
    start,
    end,
    index: text.slice(0, start).split("\n").length - 1,
    raw: text.slice(start, end),
  };
};

export const stripFountainMarkup = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return "";
  const chineseMarker = (Object.entries(CHINESE_MARKERS) as Array<[ScreenplayLineKind, string]>).find(
    ([, marker]) => trimmed.startsWith(marker)
  );
  if (chineseMarker) return trimmed.slice(chineseMarker[1].length).trim();
  if (/^={3,}$/.test(trimmed)) return "";
  if (/^\[\[.*\]\]$/.test(trimmed)) return trimmed.slice(2, -2).trim();
  if (/^\/\*/.test(trimmed)) return trimmed.replace(/^\/\*\s*/, "").replace(/\s*\*\/$/, "").trim();
  if (/^>.*<$/.test(trimmed)) return trimmed.replace(/^>\s*/, "").replace(/\s*<$/, "").trim();
  if (/^>/.test(trimmed)) return trimmed.replace(/^>\s*/, "").replace(/[：:]$/, "").trim();
  if (/^#+\s*/.test(trimmed)) return trimmed.replace(/^#+\s*/, "").trim();
  if (/^=\s*/.test(trimmed)) return trimmed.replace(/^=\s*/, "").trim();
  if (/^@/.test(trimmed)) return trimmed.replace(/^@+/, "").replace(/\s*\^\s*$/, "").trim();
  if (/^[!~.]/.test(trimmed)) return trimmed.slice(1).trim();
  if (/^\(.*\)$/.test(trimmed)) return trimmed.slice(1, -1).trim();
  return line.replace(/\s*\^\s*$/, "").trimEnd();
};

const isDualDialogueLine = (line: string) => {
  const trimmed = line.trim();
  return trimmed.startsWith(CHINESE_MARKERS.dual_dialogue) || /^@?.*[A-Za-z\u4e00-\u9fa5].*\^\s*$/.test(trimmed);
};

const isSceneHeading = (line: string) => /^(INT|EXT|EST|INT\.\/EXT|INT\/EXT|I\/E)(\.|\s)/i.test(line.trim());

const isTransition = (line: string) => {
  const trimmed = line.trim();
  return trimmed === trimmed.toUpperCase() && /TO:$/.test(trimmed);
};

const isLikelyCharacterCue = (line: string, previousLine = "", nextLine = "") => {
  const trimmed = line.trim();
  return Boolean(
    trimmed &&
      /[A-Z\u4e00-\u9fa5]/.test(trimmed) &&
      trimmed === trimmed.toUpperCase() &&
      !/^\d+$/.test(trimmed) &&
      !previousLine.trim() &&
      nextLine.trim()
  );
};

export const detectScreenplayLineKind = (
  line: string,
  previousNonEmptyLine = "",
  previousKind: ScreenplayLineKind | null = null,
  inBoneyard = false
): ScreenplayLineKind => {
  const trimmed = line.trim();
  const chineseKind = (Object.entries(CHINESE_MARKERS) as Array<[ScreenplayLineKind, string]>).find(
    ([, marker]) => trimmed.startsWith(marker)
  )?.[0];
  if (chineseKind) return chineseKind;
  if (inBoneyard || trimmed.includes("/*") || trimmed.includes("*/")) return "boneyard";
  if (!trimmed) return "action";
  if (/^={3,}$/.test(trimmed)) return "page_break";
  if (/^#+\s*/.test(trimmed)) return "section";
  if (/^=\s*/.test(trimmed)) return "synopsis";
  if (/^\[\[.*\]\]$/.test(trimmed)) return "note";
  if (/^~/.test(trimmed)) return "lyric";
  if (/^!/.test(trimmed)) return "action";
  if (/^>.*<$/.test(trimmed)) return "centered";
  if (/^>/.test(trimmed) || isTransition(trimmed)) return "transition";
  if (/^\(.*\)$/.test(trimmed)) return "parenthetical";
  if (isDualDialogueLine(trimmed)) return "dual_dialogue";
  if (/^@/.test(trimmed)) return "character";
  if (/^\./.test(trimmed) || isSceneHeading(trimmed)) return "scene_heading";
  if (previousKind === "character" || previousKind === "dual_dialogue" || previousKind === "parenthetical" || previousKind === "dialogue") {
    return "dialogue";
  }
  if (/^@/.test(previousNonEmptyLine.trim()) || isDualDialogueLine(previousNonEmptyLine)) return "dialogue";
  return "action";
};

export const analyzeFountainLines = (body: string): ScreenplayLine[] => {
  const rawLines = splitScreenplayLines(body);
  let inBoneyard = false;
  let previousKind: ScreenplayLineKind | null = null;
  let offset = 0;
  return rawLines.map((raw, index) => {
    let previousNonEmptyLine = "";
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (rawLines[cursor]?.trim()) {
        previousNonEmptyLine = rawLines[cursor];
        break;
      }
    }
    const startsBoneyard = raw.includes("/*");
    const endsBoneyard = raw.includes("*/");
    let kind = detectScreenplayLineKind(raw, previousNonEmptyLine, previousKind, inBoneyard || startsBoneyard);
    if (kind === "action" && isLikelyCharacterCue(raw, rawLines[index - 1] || "", rawLines[index + 1] || "")) {
      kind = isDualDialogueLine(raw) ? "dual_dialogue" : "character";
    }
    if (startsBoneyard && !endsBoneyard) inBoneyard = true;
    if (endsBoneyard) inBoneyard = false;
    previousKind = raw.trim() ? kind : null;
    const start = offset;
    const end = start + raw.length;
    offset = end + 1;
    return { index, start, end, raw, content: stripFountainMarkup(raw), kind };
  });
};

export const parseSceneHeading = (value: string): SceneHeading => {
  const clean = stripFountainMarkup(value).replace(/\s+/g, " ").trim();
  const chineseChunks = clean.split(/[｜|]/).map((item) => item.trim());
  if (chineseChunks.length >= 2) {
    return {
      boundary: normalizeBoundary(chineseChunks[0] || "INT."),
      location: chineseChunks.slice(1, -1).join("｜") || PLACEHOLDER_LOCATION,
      time: normalizeTime(chineseChunks.at(-1) || "DAY"),
    };
  }
  const boundaryMatch = clean.match(/^(INT\.\/EXT\.?|INT\/EXT\.?|INT\.|EXT\.|EST\.|I\/E)(?:\s+|$)/i);
  const boundary = normalizeBoundary(boundaryMatch?.[1] || "INT.");
  const remainder = boundaryMatch ? clean.slice(boundaryMatch[0].length).trim() : clean;
  const chunks = remainder.split(/\s+-\s+/).map((item) => item.trim()).filter(Boolean);
  const possibleTime = chunks.at(-1) || "";
  const hasTime = SCENE_TIMES.some((item) => item === possibleTime.toUpperCase());
  return {
    boundary,
    location: (hasTime ? chunks.slice(0, -1).join(" - ") : remainder) || PLACEHOLDER_LOCATION,
    time: hasTime ? normalizeTime(possibleTime) : "DAY",
  };
};

export const serializeSceneHeading = ({ boundary, location, time }: SceneHeading) =>
  `.${normalizeBoundary(boundary)} ${(location.trim() || PLACEHOLDER_LOCATION).toUpperCase()} - ${normalizeTime(time)}`;

export const serializeScreenplayLine = (content: string, kind: ScreenplayLineKind) => {
  const clean = content.trim();
  switch (kind) {
    case "scene_heading":
      return serializeSceneHeading(parseSceneHeading(clean));
    case "character":
      return `@${(clean || PLACEHOLDER_CHARACTER).replace(/\s*\^\s*$/, "").toUpperCase()}`;
    case "dual_dialogue":
      return `@${(clean || PLACEHOLDER_CHARACTER).replace(/\s*\^\s*$/, "").toUpperCase()} ^`;
    case "dialogue":
      return clean;
    case "parenthetical":
      return `(${clean || "beat"})`;
    case "lyric":
      return `~${clean}`;
    case "transition":
      return `> ${(clean || "CUT TO").replace(/[：:]$/, "").toUpperCase()}:`;
    case "centered":
      return `> ${clean} <`;
    case "note":
      return `[[${clean}]]`;
    case "boneyard":
      return `/* ${clean} */`;
    case "section":
      return `# ${clean}`;
    case "synopsis":
      return `= ${clean}`;
    case "page_break":
      return "===";
    case "action":
    default:
      return clean ? `!${clean}` : "";
  }
};

export const replaceScreenplayLine = (body: string, lineIndex: number, raw: string) => {
  const lines = splitScreenplayLines(body);
  if (lineIndex < 0 || lineIndex >= lines.length) return body;
  lines[lineIndex] = raw;
  return lines.join("\n");
};

export const insertScreenplayLine = (body: string, afterLineIndex: number, raw = "") => {
  const lines = splitScreenplayLines(body);
  lines.splice(Math.min(lines.length, Math.max(0, afterLineIndex + 1)), 0, raw);
  return lines.join("\n");
};

export const removeScreenplayLine = (body: string, lineIndex: number) => {
  const lines = splitScreenplayLines(body);
  if (lines.length <= 1) return "";
  if (lineIndex < 0 || lineIndex >= lines.length) return body;
  lines.splice(lineIndex, 1);
  return lines.join("\n");
};

export const getNextScreenplayLineKind = (kind: ScreenplayLineKind): ScreenplayLineKind => {
  if (kind === "character" || kind === "dual_dialogue" || kind === "parenthetical") return "dialogue";
  if (kind === "lyric") return "lyric";
  return "action";
};

const stableSceneId = (lineIndex: number, heading: SceneHeading) =>
  `${lineIndex}-${heading.boundary}-${heading.location}-${heading.time}`.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-");

export const analyzeScreenplay = (body: string, knownCharacterNames: string[] = []): ScreenplayAnalysis => {
  const lines = analyzeFountainLines(body);
  const characterNames = Array.from(
    new Set(lines.filter((line) => line.kind === "character" || line.kind === "dual_dialogue").map((line) => line.content.trim()).filter(Boolean))
  );
  const knownCharacters = new Set(knownCharacterNames.map((name) => name.trim()).filter(Boolean));
  const diagnostics: ScreenplayDiagnostic[] = [];
  characterNames.forEach((name) => {
    if (knownCharacters.size && !knownCharacters.has(name)) {
      const line = lines.find((item) => item.content.trim() === name && (item.kind === "character" || item.kind === "dual_dialogue"));
      if (line) diagnostics.push({ id: `unbound-${line.index}-${name}`, severity: "warning", lineIndex: line.index, message: `“${name}”尚未绑定到角色库` });
    }
  });

  const sceneLines = lines.filter((line) => line.kind === "scene_heading");
  const scenes = sceneLines.map((line, ordinal) => {
    const heading = parseSceneHeading(line.raw);
    const nextSceneStart = sceneLines[ordinal + 1]?.index ?? lines.length;
    const sceneBody = lines.slice(line.index + 1, nextSceneStart);
    const sceneCharacters = Array.from(
      new Set(sceneBody.filter((item) => item.kind === "character" || item.kind === "dual_dialogue").map((item) => item.content).filter(Boolean))
    );
    const synopsis = sceneBody.find((item) => item.kind === "synopsis")?.content ||
      sceneBody.find((item) => item.kind === "action" && item.content.trim())?.content || "尚未写入场景内容";
    return {
      ...heading,
      id: stableSceneId(line.index, heading),
      ordinal: ordinal + 1,
      lineIndex: line.index,
      start: line.start,
      characterNames: sceneCharacters,
      synopsis: synopsis.slice(0, 90),
    };
  });

  lines.forEach((line) => {
    if (line.kind === "scene_heading") {
      const heading = parseSceneHeading(line.raw);
      if (!heading.location || heading.location === PLACEHOLDER_LOCATION) {
        diagnostics.push({ id: `scene-location-${line.index}`, severity: "warning", lineIndex: line.index, message: "场景缺少明确地点" });
      }
    }
    if (line.kind === "dialogue") {
      const previous = lines[line.index - 1];
      if (!previous || !["character", "dual_dialogue", "parenthetical", "dialogue"].includes(previous.kind)) {
        diagnostics.push({ id: `orphan-dialogue-${line.index}`, severity: "warning", lineIndex: line.index, message: "对白缺少角色提示" });
      }
    }
  });

  const locations = Array.from(new Set(scenes.map((scene) => scene.location).filter((location) => location !== PLACEHOLDER_LOCATION)));
  const visibleLines = lines.filter((line) => line.raw.trim() && !["note", "boneyard", "section", "synopsis"].includes(line.kind));
  const dialogueGlyphs = lines
    .filter((line) => line.kind === "dialogue")
    .reduce((total, line) => total + Array.from(line.content.replace(/\s/g, "")).length, 0);
  const glyphs = visibleLines.reduce((total, line) => total + Array.from(line.content.replace(/\s/g, "")).length, 0);
  const words = visibleLines.reduce((total, line) => total + (line.content.match(/[\p{L}\p{N}]+/gu)?.length || 0), 0);
  const estimatedPages = Math.max(1, Math.ceil(visibleLines.length / 52));

  return {
    lines,
    scenes,
    characterNames,
    locations,
    diagnostics,
    stats: {
      lines: lines.length,
      scenes: scenes.length,
      characters: characterNames.length,
      locations: locations.length,
      words,
      glyphs,
      estimatedPages,
      estimatedMinutes: estimatedPages,
      dialoguePercent: glyphs ? Math.round((dialogueGlyphs / glyphs) * 100) : 0,
    },
  };
};

export const normalizeFountainDocument = (body: string) =>
  analyzeFountainLines(body)
    .map((line) => {
      if (!line.raw.trim()) return "";
      if (line.kind === "scene_heading") return serializeSceneHeading(parseSceneHeading(line.raw));
      return serializeScreenplayLine(line.content, line.kind);
    })
    .join("\n");

export const createScreenplayPreview = (body: string, maxLength = 180) =>
  analyzeFountainLines(body)
    .filter((line) => !["note", "boneyard", "section", "synopsis", "page_break"].includes(line.kind))
    .map((line) => line.content)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
