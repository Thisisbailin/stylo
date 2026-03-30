import type { ProjectContext, Shot, TokenUsage, Character, Location, CharacterForm, LocationZone, TextServiceConfig, TextProvider } from "../types";
import { ensureStableId, ensureTypedStableId } from "../utils/id";
import { OPENROUTER_RESPONSES_BASE_URL, QWEN_DEFAULT_MODEL, QWEN_RESPONSES_BASE_URL } from "../constants";
import { createQwenResponse } from "./qwenResponsesService";
import { SHOT_FIELD_LABELS, SHOT_REQUIRED_STRING_KEYS, buildShotOverview, getShotMinimumCountFromGuide, sanitizeShotList } from "../utils/shotSchema";
import { projectRolesToCharacters, projectRolesToLocations } from "../utils/projectRoles";

// --- HELPERS ---

type Schema = {
  type?: string;
  description?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
  enum?: string[];
  additionalProperties?: boolean;
} & Record<string, any>;

const Type = {
  STRING: "string",
  NUMBER: "number",
  INTEGER: "integer",
  BOOLEAN: "boolean",
  ARRAY: "array",
  OBJECT: "object",
} as const;

const resolveProviderApiKey = (provider: TextProvider, configuredKey?: string): string => {
  const key = (configuredKey || "").trim();
  if (key) return key;

  const env = typeof import.meta !== "undefined" ? import.meta.env : undefined;
  const processEnv = typeof process !== "undefined" ? process.env : undefined;

  const candidates =
    provider === "openrouter"
      ? [
          env?.OPENROUTER_API_KEY,
          env?.VITE_OPENROUTER_API_KEY,
          processEnv?.OPENROUTER_API_KEY,
          processEnv?.VITE_OPENROUTER_API_KEY,
        ]
      : [
          env?.QWEN_API_KEY,
          env?.VITE_QWEN_API_KEY,
          env?.DASHSCOPE_API_KEY,
          env?.VITE_DASHSCOPE_API_KEY,
          processEnv?.QWEN_API_KEY,
          processEnv?.VITE_QWEN_API_KEY,
          processEnv?.DASHSCOPE_API_KEY,
          processEnv?.VITE_DASHSCOPE_API_KEY,
        ];

  const resolved = candidates.find((value) => typeof value === "string" && value.trim())?.trim();
  if (!resolved) {
    throw new Error(
      provider === "openrouter"
        ? "OpenRouter API key missing. 请配置 OPENROUTER_API_KEY/VITE_OPENROUTER_API_KEY。"
        : "Qwen API key missing. 请配置 QWEN_API_KEY/VITE_QWEN_API_KEY 或 DASHSCOPE_API_KEY。"
    );
  }
  return resolved;
};

const googleSchemaToJsonSchema = (schema: Schema): any => {
  const convertType = (t: string | undefined): string => {
    if (!t) return 'string';
    switch (t) {
      case Type.STRING: return 'string';
      case Type.NUMBER: return 'number';
      case Type.INTEGER: return 'integer';
      case Type.BOOLEAN: return 'boolean';
      case Type.ARRAY: return 'array';
      case Type.OBJECT: return 'object';
      default: return 'string';
    }
  };

  const res: any = { type: convertType(schema.type) };
  if (schema.description) res.description = schema.description;

  if (schema.type === Type.ARRAY && schema.items) {
    res.items = googleSchemaToJsonSchema(schema.items);
  }

  if (schema.type === Type.OBJECT && schema.properties) {
    res.properties = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      res.properties[key] = googleSchemaToJsonSchema(prop);
    }
    if (schema.required) {
      res.required = schema.required;
    }
    res.additionalProperties = false; // Strict JSON
  }

  return res;
};

const describeSchema = (schema: Schema, depth = 0): string[] => {
  const indent = "  ".repeat(depth);
  const lines: string[] = [];
  const schemaType = schema.type || "string";
  if (schemaType === Type.OBJECT && schema.properties) {
    lines.push(`${indent}{`);
    const required = new Set(schema.required || []);
    for (const [key, prop] of Object.entries(schema.properties)) {
      const propType = prop.type || "string";
      const requiredMark = required.has(key) ? "required" : "optional";
      if (propType === Type.OBJECT || propType === Type.ARRAY) {
        lines.push(`${indent}  "${key}" (${propType}, ${requiredMark})`);
        lines.push(...describeSchema(prop, depth + 2));
      } else {
        const description = prop.description ? ` - ${prop.description}` : "";
        lines.push(`${indent}  "${key}": ${propType} (${requiredMark})${description}`);
      }
    }
    lines.push(`${indent}}`);
    return lines;
  }
  if (schemaType === Type.ARRAY && schema.items) {
    lines.push(`${indent}[`);
    lines.push(...describeSchema(schema.items, depth + 1));
    lines.push(`${indent}]`);
    return lines;
  }
  lines.push(`${indent}${schemaType}`);
  return lines;
};

const buildStructuredOutputContract = (schema: Schema) => {
  const schemaDescription = describeSchema(schema).join("\n");
  return `

[STRUCTURED OUTPUT CONTRACT]
You must return exactly one valid JSON value that conforms to the required schema.
- Do not output prose before or after the JSON.
- Do not output markdown.
- Do not output code fences.
- Do not output tables.
- Do not output explanations, notes, or headings.
- Do not rename keys.
- Do not omit required keys.
- If a field is unavailable, use an empty string, empty array, false, or null only when the schema permits it.

Expected JSON shape:
${schemaDescription}
`;
};

const extractResponsesText = (data: any): string => {
  const outputText = typeof data?.output_text === "string" ? data.output_text : "";
  if (outputText) return outputText;

  const output = Array.isArray(data?.output) ? data.output : [];
  const fromItems = output
    .flatMap((item: any) => {
      if (typeof item?.text === "string") return [item.text];
      if (typeof item?.output_text === "string") return [item.output_text];
      if (typeof item?.content === "string") return [item.content];
      if (Array.isArray(item?.content)) {
        return item.content
          .map((part: any) => {
            if (typeof part === "string") return part;
            if (typeof part?.text === "string") return part.text;
            if (typeof part?.content === "string") return part.content;
            if (part?.type === "output_text" && typeof part?.text === "string") return part.text;
            return "";
          })
          .filter(Boolean);
      }
      return [];
    })
    .filter(Boolean)
    .join("");
  if (fromItems) return fromItems;

  const choiceContent = data?.choices?.[0]?.message?.content;
  if (typeof choiceContent === "string") return choiceContent;
  if (Array.isArray(choiceContent)) {
    return choiceContent
      .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("");
  }
  return "";
};

const mapUsage = (usage: any): TokenUsage => {
  const promptTokens = usage?.prompt_tokens ?? usage?.input_tokens ?? 0;
  const responseTokens = usage?.completion_tokens ?? usage?.output_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? promptTokens + responseTokens;
  return { promptTokens, responseTokens, totalTokens };
};

const stripCodeFence = (value: string) => {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  return fenced?.[1]?.trim() || trimmed;
};

const extractBalancedJsonCandidate = (text: string) => {
  const source = text.trim();
  const startIndexes = [
    source.indexOf("{"),
    source.indexOf("["),
  ].filter((index) => index >= 0).sort((a, b) => a - b);
  for (const start of startIndexes) {
    const opener = source[start];
    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < source.length; i += 1) {
      const char = source[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }
      if (char === "\"") {
        inString = true;
        continue;
      }
      if (char === opener) depth += 1;
      if (char === closer) {
        depth -= 1;
        if (depth === 0) {
          return source.slice(start, i + 1).trim();
        }
      }
    }
  }
  return "";
};

const buildJsonCandidates = (text: string) => {
  const trimmed = (text || "").trim();
  const stripped = stripCodeFence(trimmed);
  const balanced = extractBalancedJsonCandidate(stripped);
  const candidates = [
    trimmed,
    stripped,
    balanced,
  ].filter((candidate, index, array) => candidate && array.indexOf(candidate) === index);
  return candidates;
};

const parseStructuredJson = <T>(text: string, raw: any, label: string): T => {
  const candidates = buildJsonCandidates(text);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {}
  }
  const preview = candidates[0]?.slice(0, 400) || String(text || "").slice(0, 400);
  try {
    console.warn(`[ResponsesTextService] Failed to parse structured JSON for ${label}`, {
      text,
      candidates,
      raw,
    });
  } catch {}
  throw new Error(`JSON Parse error: 响应未返回合法 JSON。首段内容：${preview}`);
};

const resolveResponsesBaseUrl = (provider: TextProvider, configuredBaseUrl?: string) => {
  const fallback = provider === "openrouter" ? OPENROUTER_RESPONSES_BASE_URL : QWEN_RESPONSES_BASE_URL;
  return (configuredBaseUrl || fallback).trim().replace(/\/+$/, "");
};

const createOpenRouterResponse = async (
  config: TextServiceConfig,
  prompt: string,
  schema: Schema,
  systemInstruction?: string
): Promise<{ text: string; usage: TokenUsage; raw?: any }> => {
  const apiKey = resolveProviderApiKey("openrouter", config.apiKey);
  const jsonSchema = googleSchemaToJsonSchema(schema);
  const endpoint = `${resolveResponsesBaseUrl("openrouter", config.baseUrl)}/responses`;
  const input: any[] = [];
  if (systemInstruction?.trim()) {
    input.push({
      role: "system",
      content: [{ type: "input_text", text: systemInstruction.trim() }],
    });
  }
  input.push({
    role: "user",
    content: [{ type: "input_text", text: prompt }],
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "Qalam",
    },
    body: JSON.stringify({
      model: config.model || "openai/gpt-4.1-mini",
      input,
      text: {
        format: {
          type: "json_schema",
          name: "qalam_output",
          schema: jsonSchema,
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter Responses Error ${response.status}: ${errText}`);
  }

  const raw = await response.json();
  return {
    text: extractResponsesText(raw),
    usage: mapUsage(raw?.usage),
    raw,
  };
};

const generateText = async (
  config: TextServiceConfig,
  prompt: string,
  schema: Schema,
  systemInstruction?: string
): Promise<{ text: string; usage: TokenUsage; raw?: any }> => {
  const structuredPrompt = `${prompt.trim()}\n${buildStructuredOutputContract(schema)}`;
  const structuredSystemInstruction = `${systemInstruction || "Role: Structured Output Assistant."}
You are operating in strict structured-output mode. Return only valid JSON that conforms to the provided schema.`;
  if (config.provider === "openrouter") {
    return createOpenRouterResponse(config, structuredPrompt, schema, structuredSystemInstruction);
  }
  if (config.provider === "qwen") {
    const jsonSchema = googleSchemaToJsonSchema(schema);
    const raw = await createQwenResponse(prompt, {
      apiKey: resolveProviderApiKey("qwen", config.apiKey),
      baseUrl: resolveResponsesBaseUrl("qwen", config.baseUrl),
    }, {
      model: config.model || QWEN_DEFAULT_MODEL,
      inputItems: [
        ...(structuredSystemInstruction.trim()
          ? [{ role: "system", content: [{ type: "input_text", text: structuredSystemInstruction.trim() }] }]
          : []),
        {
          role: "user",
          content: [{ type: "input_text", text: structuredPrompt }],
        },
      ],
      textFormat: {
        type: "json_schema",
        name: "qalam_output",
        schema: jsonSchema,
        strict: true,
      },
    });
    return {
      text: raw.text || "{}",
      usage: raw.usage || { promptTokens: 0, responseTokens: 0, totalTokens: 0 },
      raw: raw.raw,
    };
  }
  throw new Error(`Unknown provider: ${config.provider}`);
};

// Helper to sum usage from batches
export const addUsage = (u1: TokenUsage, u2: TokenUsage): TokenUsage => ({
  promptTokens: u1.promptTokens + u2.promptTokens,
  responseTokens: u1.responseTokens + u2.responseTokens,
  totalTokens: u1.totalTokens + u2.totalTokens
});

const slugifyIdentityKey = (value: string, fallback: string) => {
  const normalized = (value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
};

const normalizeGeneratedCharacterForms = (forms: any[] | undefined, characterId: string) =>
  (forms ?? []).map((f: any, index: number) => ({
    ...f,
    id: ensureStableId(f?.id, "form"),
    characterId,
    key:
      typeof f?.key === "string" && f.key.trim()
        ? f.key.trim()
        : slugifyIdentityKey(f?.formName || "", index === 0 ? "default" : `form-${index + 1}`),
    isDefault: typeof f?.isDefault === "boolean" ? f.isDefault : index === 0,
  }));

// Helper to format character list for prompts
const formatCharContext = (context: ProjectContext): string => {
  const characters = (context as any).characters || projectRolesToCharacters((context as any).roles || []);
  return characters.map((c: any) =>
    `- ${c.name} (${c.role}): ${c.bio}. Forms: ${c.forms.map(f => f.formName).join(', ')}`
  ).join('\n');
};

// Fetch Models for OpenRouter
export const fetchTextModels = async (baseUrl: string, apiKey: string): Promise<string[]> => {
  let apiBase = baseUrl.trim().replace(/\/+$/, '');
  apiBase = apiBase.replace(/\/responses$/, "");
  if (!apiBase.endsWith("/v1")) {
    if (!apiBase.includes("/v1/")) apiBase = `${apiBase}/v1`;
  }

  try {
    const response = await fetch(`${apiBase}/models`, {
      method: 'GET',
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "Qalam",
      }
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.data?.map((m: any) => m.id) || [];
  } catch (e) {
    console.error("Fetch Text Models Error", e);
    return [];
  }
};

// --- FEATURE: EASTER EGG (DEMO SCRIPT) ---
export const generateDemoScript = async (
  config: TextServiceConfig,
  dramaGuide?: string
): Promise<{ script: string; styleGuide: string; usage: TokenUsage }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      script: { type: Type.STRING, description: "完整的剧本内容 (Plain Text)，必须严格换行" },
      styleGuide: { type: Type.STRING, description: "与该剧本完美匹配的视觉风格概览 (Visual Style Guide)" }
    },
    required: ["script", "styleGuide"]
  };

  const systemInstruction = "Role: Award-winning comedy screenwriter & Art Director. Task: Write a short, hilarious animal script AND its visual style. STRICT FORMATTING REQUIRED.";
  const prompt = `
        写一个关于动物的超短篇爆笑剧本（时长约1分钟），并附带一个独特的视觉风格定义。
        如果提供了创作指南，必须严格遵循其中的戏剧性和专业度要求：
        ${dramaGuide ? dramaGuide.substring(0, 2200) : '（无额外指南，按上面规则写）'}
        
        【CRITICAL FORMATTING RULES - 格式重中之重】
        剧本结构必须严格遵守“**换行**”规则。标题、场景号、正文绝对不能连在同一行！
        
        正确示例：
        第一集
        1-1 森林空地
        一只兔子坐在树桩上。
        
        错误示例（绝对禁止）：
        第一集 1-1 森林空地 一只兔子坐在树桩上...
        
        【任务一：剧本 (Script)】
        1. 剧本第一行必须是：第一集（或者 第1集）
        2. 每一场戏的标题必须单独占一行，格式：1-X [场景名] （例如：1-1 森林空地）
        3. 场景标题下方必须换行，再写具体的动作描述或对话。
        4. 内容：主角是动物，梗要新颖，反转要好笑。中文。
        5. 只能有1集，包含2-3个场景。
        
        【任务二：视觉风格 (Visual Style Guide)】
        为这个故事设计一个极具辨识度的视觉风格。
        不要只写“写实”，要具体。比如：“定格动画风格，类似《了不起的狐狸爸爸》”，“8K超写实BBC纪录片质感，但动物表情夸张”，“赛博朋克霓虹风格的流浪猫故事”等。
        
        请描述：
        1. 整体基调 (Atmosphere)
        2. 色彩倾向 (Color Palette)
        3. 摄影风格 (Camera Language)
        
        【输出示例结构】：
        {
          "script": "第1集\n\n1-1 森林空地\n\n阳光洒在...",
          "styleGuide": "## 视觉风格定义\n**核心基调**：粘土定格动画（Claymation）..."
        }
    `;

  const { text, usage, raw } = await generateText(config, prompt, schema, systemInstruction);
  const result = parseStructuredJson<{ script: string; styleGuide: string }>(text, raw, "generateDemoScript");
  return {
    script: result.script,
    styleGuide: result.styleGuide,
    usage
  };
};

// --- PHASE 1: DEEP UNDERSTANDING SERVICES ---

// 1.1 Project Summary (Global Arc)
export const generateProjectSummary = async (
  config: TextServiceConfig,
  fullScript: string,
  styleGuide?: string
): Promise<{ projectSummary: string; usage: TokenUsage }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      projectSummary: { type: Type.STRING, description: "Detailed story arc and core conflict (Chinese)" }
    },
    required: ["projectSummary"]
  };

  const systemInstruction = "Role: Senior Script Doctor & Creative Director. Task: Analyze the screenplay.";
  const prompt = `
    Materials:
    ${styleGuide ? `[Style/Tone Guide]:\n${styleGuide}\n` : ''}
    [Script]:
    ${fullScript.slice(0, 100000)}... (truncated if too long)

    Requirements:
    1. **Project Summary**: A comprehensive overview of the entire story arc, themes, and emotional tone.
    2. Focus on the "Big Picture" - the central conflict and resolution.
    3. Language: Chinese.
    4. Return a JSON object with exactly one key: "projectSummary".
    5. Do not return plain prose outside the JSON object.
  `;

  const { text, usage, raw } = await generateText(config, prompt, schema, systemInstruction);
  const parsed = parseStructuredJson<{ projectSummary: string }>(text, raw, "generateProjectSummary");
  return {
    projectSummary: parsed.projectSummary,
    usage
  };
};

export const generateFreeformText = async (
  config: TextServiceConfig,
  prompt: string,
  systemInstruction = "Role: Creative Assistant.",
  options?: { onStream?: (delta: string) => void }
): Promise<{ outputText: string; usage: TokenUsage }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      outputText: { type: Type.STRING, description: "Generated text response in Chinese" }
    },
    required: ["outputText"]
  };

  const { text, usage, raw } = await generateText(config, prompt, schema, systemInstruction);
  const candidate = (() => {
    const trimmed = (text || "").trim();
    if (!trimmed) return "{}";
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) return trimmed.slice(start, end + 1);
    return trimmed;
  })();
  const parsed = parseStructuredJson<{ outputText?: string }>(candidate || "{}", raw, "generateFreeformText");
  return {
    outputText: parsed.outputText || "",
    usage
  };
};

// 1.2 Single Episode Summary
export const generateEpisodeSummary = async (
  config: TextServiceConfig,
  episodeTitle: string,
  episodeContent: string,
  context: ProjectContext,
  currentEpisodeId: number
): Promise<{ summary: string; usage: TokenUsage }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING, description: "Detailed plot summary for this specific episode" }
    },
    required: ["summary"]
  };

  const recentSummaries = context.episodeSummaries
    ? context.episodeSummaries
      .filter((s) => s.episodeId < currentEpisodeId)
      .sort((a, b) => b.episodeId - a.episodeId)
      .slice(0, 10)
    : [];
  const recentSummaryText = recentSummaries.length
    ? recentSummaries.map((s) => `- Ep ${s.episodeId}: ${s.summary}`).join('\n')
    : '无';

  const systemInstruction = "Role: Script Supervisor.";
  const prompt = `
    Context: 
    - Global Project Summary: ${context.projectSummary}
    - Recent Episode Summaries (latest first, up to 10):
${recentSummaryText}

    Task: Summarize the plot for the specific episode: "${episodeTitle}".

    [Episode Content]:
    ${episodeContent.slice(0, 30000)}

    Requirements:
    1. Focus on key plot points, character development, and cliffhangers within this episode.
    2. Be concise but comprehensive (approx 150-300 words).
    3. Language: Chinese.
    4. Return a JSON object with exactly one key: "summary".
    5. Do not return plain prose outside the JSON object.
  `;

  const { text, usage, raw } = await generateText(config, prompt, schema, systemInstruction);
  const parsed = parseStructuredJson<{ summary: string }>(text, raw, "generateEpisodeSummary");
  return {
    summary: parsed.summary,
    usage
  };
};

// 1.3 Character Identification
export const identifyCharacters = async (
  config: TextServiceConfig,
  script: string,
  projectSummary: string
): Promise<{ characters: Character[]; usage: TokenUsage }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      characters: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            role: { type: Type.STRING, description: "e.g. Protagonist, Villain, Supporting" },
            isMain: { type: Type.BOOLEAN, description: "True for core characters requiring deep analysis" },
            bio: { type: Type.STRING, description: "Brief initial overview" },
            assetPriority: { type: Type.STRING, enum: ["high", "medium", "low"] },
            episodeUsage: { type: Type.STRING, description: "Episodes/scenes where this character appears" },
            archetype: { type: Type.STRING, description: "简要人设/类型标签" },
            forms: {
              type: Type.ARRAY,
              description: "Rough forms that likely need independent assets",
              items: {
                type: Type.OBJECT,
                properties: {
                  formName: { type: Type.STRING },
                  episodeRange: { type: Type.STRING },
                  identityOrState: { type: Type.STRING, description: "Age, disguise, rank, status" }
                },
                required: ["formName", "episodeRange"]
              }
            }
          },
          required: ["name", "role", "isMain", "bio", "assetPriority", "episodeUsage"]
        }
      }
    },
    required: ["characters"]
  };

  const systemInstruction = "Role: Casting Director & Asset Producer.";
  const prompt = `
    Context (Project Summary): ${projectSummary}
    Task: Identify all characters from the script, and produce an initial AIGC资产/定模清单草稿。

    对每个角色，输出：
    - 角色分级: assetPriority = high/medium/low（优先定模）
    - 出现范围: episodeUsage（用集数/桥段简写，例如 "Ep1-4, Ep7 祭典"）
    - archetype: 人设/职业/类型标签
    - forms: 需要独立定模的形态（年龄/身份/状态差异），先给初步占位，后续深描补全。
    - isMain: 仅标记核心 3-6 人为 true。

    [Script Snippet]:
    ${script.slice(0, 50000)}...

    用中文 JSON 输出。`;

  const { text, usage, raw } = await generateText(config, prompt, schema, systemInstruction);
  const rawChars = parseStructuredJson<{ characters: any[] }>(text, raw, "identifyCharacters").characters;

  const chars: Character[] = rawChars.map((c: any) => {
    const characterId = ensureTypedStableId(c?.id, "char");
    const forms = normalizeGeneratedCharacterForms(c?.forms, characterId);
    return {
      ...c,
      id: characterId,
      slug: slugifyIdentityKey(c?.name || "", characterId),
      aliases: c?.name
        ? [{ id: ensureStableId(undefined, "alias"), value: c.name, kind: "primary", normalized: String(c.name).toLowerCase() }]
        : [],
      binding: {
        canonicalMention: c?.name || characterId,
        defaultFormId: forms[0]?.id,
        defaultVoiceScope: "character",
        mentionPolicy: "character-first",
      },
      status: "draft",
      version: 1,
      forms,
    };
  });

  return { characters: chars, usage };
};

// 1.3.1 Character Briefs (for minor / cameo roles)
export const generateCharacterBriefs = async (
  config: TextServiceConfig,
  characterNames: string[],
  script: string,
  projectSummary: string
): Promise<{ characters: Character[]; usage: TokenUsage }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      characters: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            role: { type: Type.STRING, description: "一句话身份/功能" },
            bio: { type: Type.STRING, description: "1-2 句简短概述，用中文" },
            archetype: { type: Type.STRING, description: "类型标签/职业标签" },
            assetPriority: { type: Type.STRING },
            episodeUsage: { type: Type.STRING, description: "出现集数标记" },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["name", "bio"]
        }
      }
    },
    required: ["characters"]
  };

  const systemInstruction = "Role: Casting Director. 给次要/路人角色生成极简角色卡。";
  const prompt = `
    这些角色仅出现 1 次，视为路人/次要：${characterNames.join("，")}
    任务：基于项目摘要/脚本文本，给每人生成 1-2 句角色概述（bio），可补充身份 role、archetype 标签，episodeUsage（若可推断），并给 assetPriority=low。
    请保持名字一致，不要改写。

    项目摘要：
    ${projectSummary}

    脚本片段：
    ${script.slice(0, 40000)}

    用中文 JSON 输出，遵循 schema。
  `;

  const { text, usage, raw } = await generateText(config, prompt, schema, systemInstruction);
  const parsed = parseStructuredJson<{ characters?: any[] }>(text, raw, "generateCharacterBriefs");
  const rawCharacters = parsed.characters || [];
  const characters: Character[] = rawCharacters.map((c: any) => {
    const characterId = ensureTypedStableId(c?.id, "char");
    return {
      id: characterId,
      slug: slugifyIdentityKey(c?.name || "", characterId),
      name: c.name,
      role: c.role || "",
      isMain: false,
      bio: c.bio || "",
      forms: [],
      aliases: c?.name
        ? [{ id: ensureStableId(undefined, "alias"), value: c.name, kind: "primary", normalized: String(c.name).toLowerCase() }]
        : [],
      binding: {
        canonicalMention: c?.name || characterId,
        defaultVoiceScope: "character",
        mentionPolicy: "character-first",
      },
      status: "draft",
      version: 1,
      assetPriority: c.assetPriority || "low",
      archetype: c.archetype,
      episodeUsage: c.episodeUsage,
      tags: c.tags
    };
  });

  return { characters, usage };
};

// 1.3.2 Character Roster Briefs (parser-seeded, non-identification)
export const generateCharacterRosterBriefs = async (
  config: TextServiceConfig,
  seeds: Array<{
    name: string;
    role?: string;
    episodeUsage?: string;
    appearanceCount?: number;
    forms?: Array<{ formName: string; episodeRange: string }>;
  }>,
  script: string,
  projectSummary: string,
  styleGuide?: string
): Promise<{ characters: Character[]; usage: TokenUsage }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      characters: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            isCore: { type: Type.BOOLEAN, description: "是否为核心角色（剧情主线/关键弧光/持续推动叙事）" },
            role: { type: Type.STRING, description: "角色的身份定位/叙事功能（抽象描述）" },
            bio: { type: Type.STRING, description: "角色抽象描述：身份、性格、动机、关系（中文 2-4 句）" },
            archetype: { type: Type.STRING },
            assetPriority: { type: Type.STRING, enum: ["high", "medium", "low"] },
            episodeUsage: { type: Type.STRING },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            forms: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  formName: { type: Type.STRING },
                  episodeRange: { type: Type.STRING },
                  description: { type: Type.STRING, description: "该形态在剧情中的状态/气质（抽象+过渡）" },
                  visualTags: { type: Type.STRING, description: "该形态的视觉关键词（具象）" },
                  identityOrState: { type: Type.STRING }
                },
                required: ["formName", "episodeRange", "description", "visualTags"]
              }
            }
          },
          required: ["name", "isCore", "bio"]
        }
      }
    },
    required: ["characters"]
  };

  const systemInstruction = "Role: Showrunner + Character Director. 你不会再做角色识别，只做角色与形态描述。";
  const prompt = `
    重要前提：
    - 下面这份【角色清单】已经由代码解析器产出，是权威输入。
    - 你不得新增角色、不得删除角色、不得改名。
    - 这份清单已过滤掉出现次数=1的路人角色；清单中的角色都是“出现次数>1”的候选角色。

    任务：
    1) 基于“剧本原文的深入阅读”，判断哪些角色是核心角色，并用 isCore=true 标记。
       - 核心角色的判定依据是剧情主线地位、关键弧光、持续推动叙事的能力，而不是单纯出现次数。
       - appearanceCount 可以作为信号，但不能作为唯一标准。
       - 核心角色应当是一个相对克制的小集合。
    2) 为每个角色写“角色描述（抽象层）”：身份定位、性格气质、核心动机与关系张力。
    3) 为每个角色的每个形态写“形态描述（具象层）”：视觉特征关键词与状态说明。

    角色清单（含形态占位）：
    ${JSON.stringify(seeds)}

    项目摘要：
    ${projectSummary}

    风格指导：
    ${styleGuide || "Standard Cinematic"}

    剧本原文（节选）：
    ${script.slice(0, 70000)}

    输出要求：
    - 使用中文 JSON。
    - 必须返回 isCore 字段。
    - 角色描述（bio）偏抽象；形态描述（forms[].visualTags）偏具象。
    - 若某角色只有一个默认形态（形如 “角色名-默认”），请保留并补全描述，不要删掉。
  `;

  const { text, usage, raw } = await generateText(config, prompt, schema, systemInstruction);
  const parsed = parseStructuredJson<{ characters?: any[] }>(text, raw, "generateCharacterRosterBriefs");
  const rawCharacters = parsed.characters || [];
  const characters: Character[] = rawCharacters.map((c: any) => {
    const characterId = ensureTypedStableId(c?.id, "char");
    const forms = normalizeGeneratedCharacterForms(c?.forms, characterId);
    return {
      id: characterId,
      slug: slugifyIdentityKey(c?.name || "", characterId),
      name: c.name,
      role: c.role || "",
      isMain: !!c.isCore,
      isCore: !!c.isCore,
      bio: c.bio || "",
      forms,
      aliases: c?.name
        ? [{ id: ensureStableId(undefined, "alias"), value: c.name, kind: "primary", normalized: String(c.name).toLowerCase() }]
        : [],
      binding: {
        canonicalMention: c?.name || characterId,
        defaultFormId: forms[0]?.id,
        defaultVoiceScope: "character",
        mentionPolicy: "character-first",
      },
      status: "draft",
      version: 1,
      assetPriority: c.assetPriority || "medium",
      archetype: c.archetype,
      episodeUsage: c.episodeUsage,
      tags: c.tags
    };
  });

  return { characters, usage };
};

// 1.4 Character Deep Dive
export const analyzeCharacterDepth = async (
  config: TextServiceConfig,
  character: {
    name: string;
    role?: string;
    episodeUsage?: string;
    forms?: CharacterForm[];
    bio?: string;
    archetype?: string;
    tags?: string[];
  },
  script: string,
  projectSummary: string,
  styleGuide?: string
): Promise<{ forms: CharacterForm[]; bio?: string; archetype?: string; episodeUsage?: string; tags?: string[]; usage: TokenUsage }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      bio: { type: Type.STRING, description: "核心角色概述，2-3 句中文" },
      archetype: { type: Type.STRING, description: "身份/标签" },
      episodeUsage: { type: Type.STRING, description: "出现集数/桥段" },
      tags: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      },
      forms: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            formName: { type: Type.STRING, description: "e.g. 'Childhood', 'Awakened State', '角色名-默认'" },
            episodeRange: { type: Type.STRING, description: "e.g. 'Ep 1-4' or 'Whole Series'" },
            description: { type: Type.STRING, description: "Personality and state of mind in this form" },
            visualTags: { type: Type.STRING, description: "Comma-separated visual keywords" },
            identityOrState: { type: Type.STRING, description: "Age / identity / disguise / rank /状态" },
            hair: { type: Type.STRING },
            face: { type: Type.STRING },
            body: { type: Type.STRING },
            costume: { type: Type.STRING },
            accessories: { type: Type.STRING },
            props: { type: Type.STRING },
            materialPalette: { type: Type.STRING },
            poses: { type: Type.STRING },
            expressions: { type: Type.STRING },
            lightingOrPalette: { type: Type.STRING },
            turnaroundNeeded: { type: Type.BOOLEAN },
            deliverables: { type: Type.STRING, description: "e.g. 三视图/表情集/全身+半身" },
            designRationale: { type: Type.STRING, description: "Why this design fits the story & style guide" },
            styleRef: { type: Type.STRING },
            genPrompts: { type: Type.STRING }
          },
          required: ["formName", "episodeRange", "description", "visualTags"]
        }
      }
    },
    required: ["forms"]
  };

  const systemInstruction = "Role: Character Designer & Asset Supervisor.";
  const existingForms = (character.forms || []).map((f) => ({
    formName: f.formName,
    episodeRange: f.episodeRange,
    identityOrState: f.identityOrState,
    description: f.description,
    visualTags: f.visualTags
  }));
  const prompt = `
    目标角色: ${character.name}
    角色定位（抽象层）: ${character.role || "未提供"}
    角色既有描述: ${character.bio || "未提供"}
    角色标签: ${(character.tags || []).join(" / ") || "未提供"}
    既有形态清单（来自解析器/现有数据，禁止删改名，可补充/扩展）:
    ${JSON.stringify(existingForms)}
    项目摘要: ${projectSummary}
    风格指导: ${styleGuide || "Standard Cinematic"}

    任务: 深描该角色，生成：
      - 核心角色概述（bio，2-3 句中文）
      - archetype/标签
      - episodeUsage（出现集数）
      - 角色定模美术资产清单，覆盖该角色所有形态/阶段（年龄/身份/状态）。
    每个形态需要提供：
      - identityOrState: 年龄/身份/状态
      - appearance 分层: hair, face, body, costume, accessories, props, materialPalette, lightingOrPalette
      - poses / expressions: 代表性的姿态与表情包
      - turnaroundNeeded (bool) & deliverables: 需要的交付（如三视图/全身+半身/表情集）
      - designRationale: 说明为何这样设计（剧情节点、身份变化、风格指南依据）
      - genPrompts: 便于 AIGC 生成的提示（中文）

    注意：
    - 你不得删除或改名既有形态；可以在其基础上补全字段，或新增确有必要的形态。
    - 如果角色外观变化很少，至少产出 1 个 form（形如 “角色名-默认”）。
    - episodeRange 请明确形态出现的集数/桥段。

    [Script Context]:
    ${script.slice(0, 80000)}...

    用中文 JSON 输出。`;

  const { text, usage, raw } = await generateText(config, prompt, schema, systemInstruction);
  const parsed = parseStructuredJson<any>(text, raw, "analyzeCharacterDepth");
  return {
    forms: normalizeGeneratedCharacterForms(parsed.forms, ensureTypedStableId(character?.name, "char")),
    bio: parsed.bio,
    archetype: parsed.archetype,
    episodeUsage: parsed.episodeUsage,
    tags: parsed.tags,
    usage
  };
};

// 1.5 Location Identification
export const identifyLocations = async (
  config: TextServiceConfig,
  script: string,
  projectSummary: string
): Promise<{ locations: Location[]; usage: TokenUsage }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      locations: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Name of the set/location" },
            type: { type: Type.STRING, enum: ["core", "secondary"], description: "Core = Recurring main set" },
            description: { type: Type.STRING, description: "Brief basic description" },
            assetPriority: { type: Type.STRING, enum: ["high", "medium", "low"] },
            episodeUsage: { type: Type.STRING, description: "Episodes/bridges where used" },
            zones: {
              type: Type.ARRAY,
              description: "Key sub-areas that may need separate assets",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  kind: { type: Type.STRING, enum: ["interior", "exterior", "transition", "unspecified"] },
                  episodeRange: { type: Type.STRING }
                },
                required: ["name", "episodeRange"]
              }
            }
          },
          required: ["name", "type", "description", "assetPriority", "episodeUsage"]
        }
      }
    },
    required: ["locations"]
  };

  const systemInstruction = "Role: Production Designer / Location Manager.";
  const prompt = `
    项目摘要: ${projectSummary}
    任务: 罗列所有场景/场地，并为定模生成初步资产清单框架。

    对每个场景输出：
    - type: core/secondary
    - assetPriority: high/medium/low（优先度）
    - episodeUsage: 覆盖集数/桥段（如 "Ep1-2 庭院"）
    - description: 基本描述
    - zones: 需要独立资产的子区域（内景/外景/过渡/未定），列出名称+episodeRange。

    [Script Snippet]:
    ${script.slice(0, 50000)}...

    用中文 JSON 输出。`;

  const { text, usage, raw } = await generateText(config, prompt, schema, systemInstruction);
  const rawLocs = parseStructuredJson<{ locations: any[] }>(text, raw, "identifyLocations").locations;
  const locations: Location[] = rawLocs.map((l: any) => ({
    ...l,
    id: l.name,
    visuals: '',
    zones: (l.zones ?? []).map((z: any) => ({ ...z, id: ensureStableId(z?.id, "zone") }))
  }));

  return { locations, usage };
};

// 1.5.1 Location Roster Briefs (parser-seeded, non-identification)
export const generateLocationRosterBriefs = async (
  config: TextServiceConfig,
  seeds: Array<{
    name: string;
    episodeUsage?: string;
    appearanceCount?: number;
    zones?: Array<{ name: string; episodeRange: string }>;
  }>,
  script: string,
  projectSummary: string,
  styleGuide?: string
): Promise<{ locations: Location[]; usage: TokenUsage }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      locations: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            type: { type: Type.STRING, enum: ["core", "secondary"] },
            description: { type: Type.STRING, description: "场景在世界观/叙事中的抽象定位描述" },
            assetPriority: { type: Type.STRING, enum: ["high", "medium", "low"] },
            episodeUsage: { type: Type.STRING },
            zones: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  kind: { type: Type.STRING, enum: ["interior", "exterior", "transition", "unspecified"] },
                  episodeRange: { type: Type.STRING }
                },
                required: ["name", "episodeRange"]
              }
            }
          },
          required: ["name", "description"]
        }
      }
    },
    required: ["locations"]
  };

  const systemInstruction = "Role: Production Designer / World Builder. 你不会再做场景识别，只做场景与分区描述。";
  const prompt = `
    重要前提：
    - 下面这份【场景清单】已经由代码解析器产出，是权威输入。
    - 你不得新增场景、不得删除场景、不得改名。
    - 这份清单已过滤掉出现次数=1的路人场景；清单中的场景都是“出现次数>1”的候选场景。
    - zones 是解析得到的分区/子区域清单，不得改名或删除，可补充 kind/episodeRange。

    任务：
    1) 基于“剧本原文的深入阅读”，判断哪些场景是核心场景，并通过 type=core 标记。
       - 核心场景的判定依据是剧情主线地位、关键事件承载、反复出现的叙事支点，而不是单纯出现次数。
       - appearanceCount 可以作为信号，但不能作为唯一标准。
       - 核心场景应当是一个相对克制的小集合。
    2) 为每个场景写“场景描述（抽象层）”：它在世界观/叙事中的功能定位与情绪基调。
    3) 保留并完善分区清单（zones），但不要改名或删掉。

    场景清单（含分区占位）：
    ${JSON.stringify(seeds)}

    项目摘要：
    ${projectSummary}

    风格指导：
    ${styleGuide || "Standard"}

    剧本原文（节选）：
    ${script.slice(0, 70000)}

    输出要求：
    - 使用中文 JSON。
    - description 偏抽象；zones 只是结构化清单与轻度补全。
    - 若只有默认分区（形如 “场景名-默认”），请保留并补全，不要删掉。
  `;

  const { text, usage, raw } = await generateText(config, prompt, schema, systemInstruction);
  const parsed = parseStructuredJson<{ locations?: any[] }>(text, raw, "generateLocationRosterBriefs");
  const rawLocs = parsed.locations || [];
  const locations: Location[] = rawLocs.map((l: any) => ({
    id: l.name,
    name: l.name,
    type: l.type || "secondary",
    description: l.description || "",
    visuals: "",
    assetPriority: l.assetPriority,
    episodeUsage: l.episodeUsage,
    zones: (l.zones ?? []).map((z: any) => ({
      ...z,
      id: ensureStableId(z?.id, "zone")
    }))
  }));

  return { locations, usage };
};

// 1.6 Location Deep Dive
export const analyzeLocationDepth = async (
  config: TextServiceConfig,
  location: {
    name: string;
    description?: string;
    episodeUsage?: string;
    zones?: LocationZone[];
  },
  script: string,
  styleGuide?: string
): Promise<{ visuals: string; zones?: LocationZone[]; usage: TokenUsage }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      visuals: { type: Type.STRING, description: "Detailed atmospheric, lighting, and texture description" },
      zones: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            kind: { type: Type.STRING, enum: ["interior", "exterior", "transition", "unspecified"] },
            episodeRange: { type: Type.STRING },
            layoutNotes: { type: Type.STRING, description: "空间布局/动线/分区" },
            keyProps: { type: Type.STRING, description: "Set dressing / hero props" },
            lightingWeather: { type: Type.STRING, description: "时间/天气/光线" },
            materialPalette: { type: Type.STRING },
            designRationale: { type: Type.STRING },
            deliverables: { type: Type.STRING, description: "顶视/侧视/关键区域/材质板/道具包" },
            genPrompts: { type: Type.STRING }
          },
          required: ["name", "episodeRange", "layoutNotes", "keyProps", "lightingWeather", "materialPalette"]
        }
      }
    },
    required: ["visuals"]
  };

  const systemInstruction = "Role: Art Director / Concept Artist.";
  const existingZones = (location.zones || []).map((z) => ({
    name: z.name,
    kind: z.kind,
    episodeRange: z.episodeRange
  }));
  const prompt = `
    目标场景: ${location.name}
    场景定位（抽象层）: ${location.description || "未提供"}
    场景出现范围: ${location.episodeUsage || "未提供"}
    既有分区清单（来自解析器/现有数据，禁止删改名，可补充/扩展）:
    ${JSON.stringify(existingZones)}
    风格指导: ${styleGuide || "Standard"}

    任务: 生成场景定模美术资产清单（含子区域/内外景）。
    输出内容：
      - visuals: 整体氛围描述（光线/色调/材质/气味/声音）
      - zones[]: 每个子区域包含
          * name, kind (interior/exterior/transition/unspecified), episodeRange
          * layoutNotes: 空间布局/动线/分区
          * keyProps: 关键道具/布景
          * lightingWeather: 时间/天气/光线
          * materialPalette
          * deliverables: 顶视/侧视/关键区域透视/材质板/道具包 等需求
          * designRationale: 设计理由（剧情/情绪/风格依据）
          * genPrompts: AIGC 生成提示（中文）

    [Script Context]:
    ${script.slice(0, 60000)}...
    
    用中文 JSON 输出。`;

  const { text, usage, raw } = await generateText(config, prompt, schema, systemInstruction);
  const parsed = parseStructuredJson<any>(text, raw, "analyzeLocationDepth");
  return {
    visuals: parsed.visuals,
    zones: (parsed.zones || []).map((z: any) => ({ ...z, id: ensureStableId(z?.id, "zone") })),
    usage
  };
};

// 2. Generate Episode Shot List
export const generateEpisodeShots = async (
  config: TextServiceConfig,
  episodeTitle: string,
  episodeContent: string,
  previousEpisodes: { id: number; title: string; summary: string }[],
  context: ProjectContext,
  guide: string,
  episodeIndex: number,
  styleGuide?: string
): Promise<{ shots: Shot[]; usage: TokenUsage }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      shots: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: "镜号，严格格式: 场景号-镜号 (如 1-1-01)" },
            duration: { type: Type.STRING, description: "预估时长，例如 3s" },
            shotType: { type: Type.STRING, description: "景别，例如 MCU / CU / WS / OTS" },
            focalLength: { type: Type.STRING, description: "焦段，如 24–28mm / 50mm / 85–100mm Macro" },
            movement: { type: Type.STRING, description: "运镜，例如 Dolly In / Pan L→R / Static" },
            composition: { type: Type.STRING, description: "机位/构图：角度/方位；FG/MG/BG；主体位置" },
            blocking: { type: Type.STRING, description: "调度/表演：起始状态→关键动作→落点" },
            dialogue: { type: Type.STRING, description: "台词或OS，无台词留空" },
            sound: { type: Type.STRING, description: "声音设计：AMB/SFX/MUSIC 等" },
            lightingVfx: { type: Type.STRING, description: "光色/VFX：Key/Fill/Rim/色温/特效" },
            editingNotes: { type: Type.STRING, description: "剪辑：1-3 个标签，用分号分隔" },
            notes: { type: Type.STRING, description: "备注（氛围/情绪）" },
            soraPrompt: { type: Type.STRING, description: "留空字符串" },
            storyboardPrompt: { type: Type.STRING, description: "留空字符串" },
          },
          required: [
            "id",
            "duration",
            "shotType",
            "focalLength",
            "movement",
            "composition",
            "blocking",
            "dialogue",
            "sound",
            "lightingVfx",
            "editingNotes",
            "notes",
            "soraPrompt",
            "storyboardPrompt"
          ],
        },
      },
    },
    required: ["shots"],
  };

  const charContextStr = formatCharContext(context);
  const locContextStr = projectRolesToLocations((context as any).roles || [])
    .filter((l) => l.type === 'core')
    .map((l) => `- ${l.name}: ${l.visuals}`)
    .join('\n');

  const previousContextStr = previousEpisodes.length > 0
    ? previousEpisodes.map(ep => `Episode ${ep.id} (${ep.title}): ${ep.summary}`).join('\n')
    : '无（本集为起始章节）';

  const systemInstruction = `角色设定：你是一位好莱坞顶级的分镜师（Storyboard Artist）和摄影指导（DP）。
  核心职责：将剧本文字转化为可直接执行的分镜表（Production-ready）。
  最重要的规则：拒绝平庸。每一镜都要包含具体的【摄影运镜】、【光影氛围】和【构图细节】。`;

  const prompt = `
    任务：
    依据项目整体背景、前序章节剧情，严格遵循【分镜制作指导文档】，将当前待处理章节《${episodeTitle}》的剧本正文转换为一份大师级的分镜脚本。
    
    【项目全局背景】：
    - 项目简介：${context.projectSummary}
    - 角色设定及视觉特征：
    ${charContextStr}
    - 核心场景及视觉氛围：
    ${locContextStr}
    
    【前序章节剧情回顾 (最近5集)】：
    ${previousContextStr}

    【分镜制作指导文档 (必须严格执行)】：
    ${guide}

    ${styleGuide ? `
    【项目特定美术风格定义】：
    ${styleGuide}
    ` : ''}
    
    【当前待处理剧本正文 - ${episodeTitle}】：
    ${episodeContent}
    
    【输出要求 (CRITICAL)】：
    1. **语言**：除专有名词（如 Dutch Angle, Rim Light）外，全流程使用**中文**。
    2. **格式**：分镜号格式必须为：**场景号-本场镜号**。例如：第12集第2场的第1个镜头，ID应为 **"12-2-01"**。
    3. **不要输出表格**。必须返回一个 JSON 对象，顶层为 "shots" 数组。
    4. 每个 shot 对象必须严格包含以下字段，字段顺序与分镜表表头一致：
       - ${SHOT_REQUIRED_STRING_KEYS.join(", ")}
    5. **每个字段都要可执行**：避免散文化，尽量用专业术语 + 动作动词开头；多条信息用中文分号 “；” 分隔。
    6. **soraPrompt/storyboardPrompt**：字段请务必保持为空字符串。
    7. 以下字段绝对不能留空：${[
      SHOT_FIELD_LABELS.id,
      SHOT_FIELD_LABELS.duration,
      SHOT_FIELD_LABELS.shotType,
      SHOT_FIELD_LABELS.focalLength,
      SHOT_FIELD_LABELS.movement,
      SHOT_FIELD_LABELS.composition,
      SHOT_FIELD_LABELS.blocking,
      SHOT_FIELD_LABELS.lightingVfx,
      SHOT_FIELD_LABELS.editingNotes,
      SHOT_FIELD_LABELS.notes,
    ].join("、")}。
  `;

  const { text, usage, raw } = await generateText(config, prompt, schema, systemInstruction);
  const parsed = parseStructuredJson<{ shots?: Shot[] }>(text, raw, "generateEpisodeShots");
  const { shots, issues } = sanitizeShotList(Array.isArray(parsed?.shots) ? parsed.shots : [], {
    mode: "llm",
    requireStructuredId: true,
    allowGeneratedIds: false,
    minCount: getShotMinimumCountFromGuide(guide),
  });
  if (issues.length > 0) {
    const summary = issues
      .slice(0, 5)
      .map((issue) => (issue.shotId ? `${issue.shotId}: ${issue.message}` : issue.message))
      .join(" | ");
    throw new Error(`Phase 2 分镜结构不合法，已拒绝写入。${summary}`);
  }
  return {
    shots,
    usage
  };
};

// 3. Generate Sora Prompts
export const generateSoraPrompts = async (
  config: TextServiceConfig,
  shots: Shot[],
  context: ProjectContext,
  soraGuide: string,
  styleGuide?: string
): Promise<{ partialShots: { id: string; soraPrompt: string }[]; usage: TokenUsage }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      prompts: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            soraPrompt: { type: Type.STRING, description: "Sora视频生成提示词(中文)" },
          },
          required: ["id", "soraPrompt"],
        },
      }
    }
  };

  const charContextStr = formatCharContext(context);
  const locContextStr = projectRolesToLocations((context as any).roles || [])
    .filter((l) => l.type === 'core')
    .map((l) => `- ${l.name}: ${l.visuals}`)
    .join('\n');

  const batchContext = shots.map(s => ({
    id: s.id,
    shotType: s.shotType,
    focalLength: s.focalLength,
    movement: s.movement,
    composition: s.composition,
    blocking: s.blocking,
    dialogue: s.dialogue,
    sound: s.sound,
    lightingVfx: s.lightingVfx,
    editingNotes: s.editingNotes,
    notes: s.notes,
    overview: buildShotOverview(s),
  }));

  const systemInstruction = "角色设定：你是一位精通Sora文生图模型的提示词专家。";
  const prompt = `
    任务：
    请依据【Sora提示词撰写规范】，为以下 **${shots.length}** 个分镜撰写高质量的视频生成提示词。
    
    【项目上下文】：
    - 项目简介：${context.projectSummary}
    - 角色设定：${charContextStr}
    - 核心场景设定：${locContextStr}
    
    【Sora提示词撰写规范】：
    ${soraGuide}

    ${styleGuide ? `【项目特定美术风格定义】：${styleGuide}` : ''}
    
    【当前批次分镜数据】：
    ${JSON.stringify(batchContext)}
    
    【输出要求 (CRITICAL)】：
    1. 语言：中文。
    2. 格式：返回一个 JSON 对象，包含 "prompts" 数组。
    3. Sora Prompt内容：包含主体、动作、环境、光影、摄影风格。
    4. 不要输出 JSON 之外的任何说明文字。
  `;

  const { text, usage, raw } = await generateText(config, prompt, schema, systemInstruction);
  const resultObj = parseStructuredJson<{ prompts: { id: string; soraPrompt: string }[] } | { id: string; soraPrompt: string }[]>(
    text,
    raw,
    "generateSoraPrompts"
  ) as { prompts: { id: string; soraPrompt: string }[] };

  if (!resultObj.prompts && Array.isArray(resultObj)) {
    return { partialShots: resultObj, usage };
  }

  return {
    partialShots: resultObj.prompts,
    usage
  };
};

// 4. Generate Storyboard Prompts (for multimodal models like GPT-4o)
export const generateStoryboardPrompts = async (
  config: TextServiceConfig,
  shots: Shot[],
  context: ProjectContext,
  storyboardGuide?: string,
  styleGuide?: string
): Promise<{ partialShots: { id: string; storyboardPrompt: string }[]; usage: TokenUsage }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      prompts: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            storyboardPrompt: {
              type: Type.STRING,
              description: "用于多模态模型（如 GPT-4o）生成手绘分镜草图的中文提示词",
            },
          },
          required: ["id", "storyboardPrompt"],
        },
      },
    },
  };

  const charContextStr = formatCharContext(context);
  const locContextStr = projectRolesToLocations((context as any).roles || [])
    .filter((l) => l.type === "core")
    .map((l) => `- ${l.name}: ${l.visuals}`)
    .join("\n");

  const batchContext = shots.map((s) => ({
    id: s.id,
    shotType: s.shotType,
    focalLength: s.focalLength,
    movement: s.movement,
    composition: s.composition,
    blocking: s.blocking,
    sound: s.sound,
    lightingVfx: s.lightingVfx,
    editingNotes: s.editingNotes,
    notes: s.notes,
    overview: buildShotOverview(s),
    dialogue: s.dialogue,
  }));

  const systemInstruction =
    "角色设定：你是一位擅长为多模态模型（如 GPT-4o）撰写分镜板提示词的导演型分镜师。";

  const prompt = `
    任务：
    请为以下 **${shots.length}** 个分镜撰写「分镜板（storyboard）草图提示词」。
    这些提示词将交给 GPT-4o 这类更偏“理解+创作”的多模态模型来生图，
    目标是得到 **清晰的手绘分镜草图（线稿/漫画感）**，而不是写给传统扩散模型的堆砌关键词。

    【项目上下文】：
    - 项目简介：${context.projectSummary}
    - 角色设定：${charContextStr}
    - 核心场景设定：${locContextStr}
    ${styleGuide ? `- 项目特定美术风格：${styleGuide}` : ""}

    ${storyboardGuide ? `【Storyboard 提示词规范】：\n${storyboardGuide}` : ""}

    【当前批次分镜数据】：
    ${JSON.stringify(batchContext)}

    【输出要求（非常重要）】：
    1. 语言：中文。
    2. 格式：返回一个 JSON 对象，包含 "prompts" 数组。
    3. 每条 storyboardPrompt 应：
       - 明确镜头主体、关键动作与叙事意图（这一镜头要表达什么）。
       - 给出构图与镜头语言（景别/机位/前中后景关系/视线引导）。
       - 强调“分镜草图”的表达方式：手绘、线稿、素描、结构清晰、便于导演/摄影/动画理解。
       - 避免参数化/模型私有语法（如 --ar、权重符号等）。
       - 允许模型在理解剧情的前提下进行合理的视觉创作，但不得偏离剧情事实。
    4. 不要输出 JSON 之外的任何说明文字。
  `;

  const { text, usage, raw } = await generateText(config, prompt, schema, systemInstruction);
  const resultObj = parseStructuredJson<{ prompts: { id: string; storyboardPrompt: string }[] } | { id: string; storyboardPrompt: string }[]>(
    text,
    raw,
    "generateStoryboardPrompts"
  ) as { prompts: { id: string; storyboardPrompt: string }[] };

  if (!resultObj.prompts && Array.isArray(resultObj)) {
    return { partialShots: resultObj, usage };
  }

  return {
    partialShots: resultObj.prompts,
    usage,
  };
};
