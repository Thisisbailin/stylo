import type { NodeFlowNodeData, NodeFlowNodeDefaults, NodeType } from "../types";

const NODE_DEFAULT_FIELDS: Partial<Record<NodeType, readonly string[]>> = {
  imageGen: ["aspectRatio", "model", "quality", "maxImages", "seed", "size"],
  nanoBananaImageGen: ["aspectRatio", "model", "size"],
  wanImageGen: ["aspectRatio", "model", "enableInterleave", "outputCount", "seed", "watermark"],
  soraVideoGen: ["aspectRatio", "duration", "model", "quality"],
  wanReferenceVideoGen: ["aspectRatio", "duration", "model", "quality", "resolution", "shotType", "watermark", "audioEnabled", "seed"],
  viduVideoGen: ["mode", "useCharacters", "autoSubjects", "aspectRatio", "resolution", "duration", "audioEnabled", "bgm", "offPeak", "watermark", "model", "seed"],
  seedanceVideoGen: ["model", "mode", "resolution", "ratio", "duration", "generateAudio", "watermark"],
};

const stableStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
};

export const sanitizeNodeDefaultData = (
  type: NodeType,
  data: Partial<NodeFlowNodeData> | null | undefined
): Partial<NodeFlowNodeData> | null => {
  if (!data || typeof data !== "object") return null;
  const fields = NODE_DEFAULT_FIELDS[type];
  if (!fields?.length) return null;
  const next: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field in data)) continue;
    const value = (data as Record<string, unknown>)[field];
    if (value === undefined) continue;
    next[field] = value;
  }
  return Object.keys(next).length > 0 ? (next as Partial<NodeFlowNodeData>) : null;
};

export const normalizeNodeFlowNodeDefaults = (
  defaults: unknown
): NodeFlowNodeDefaults => {
  if (!defaults || typeof defaults !== "object") return {};
  const next: NodeFlowNodeDefaults = {};
  for (const [rawType, rawData] of Object.entries(defaults as Record<string, unknown>)) {
    const type = rawType as NodeType;
    const sanitized = sanitizeNodeDefaultData(type, rawData as Partial<NodeFlowNodeData>);
    if (sanitized) {
      next[type] = sanitized;
    }
  }
  return next;
};

export const upsertNodeDefault = (
  defaults: NodeFlowNodeDefaults,
  type: NodeType,
  data: Partial<NodeFlowNodeData> | null | undefined
): NodeFlowNodeDefaults => {
  const sanitized = sanitizeNodeDefaultData(type, data);
  const current = defaults[type] ?? null;
  if (stableStringify(current) === stableStringify(sanitized)) return defaults;

  if (!sanitized) {
    if (!(type in defaults)) return defaults;
    const next = { ...defaults };
    delete next[type];
    return next;
  }

  return {
    ...defaults,
    [type]: sanitized,
  };
};
