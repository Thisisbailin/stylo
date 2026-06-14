import type { TokenUsage, TextServiceConfig, TextProvider } from "../types";
import { OPENROUTER_RESPONSES_BASE_URL, QWEN_DEFAULT_MODEL, QWEN_RESPONSES_BASE_URL } from "../constants";
import { createQwenResponse } from "./qwenResponsesService";

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
