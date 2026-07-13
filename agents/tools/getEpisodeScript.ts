import type { StyloAgentBridge } from "../bridge/styloBridge";

export const LEGACY_GET_EPISODE_SCRIPT_DISABLED = true;

const getEpisodeScriptParameters = {
  type: "object",
  properties: {
    episode_id: {
      type: "integer",
      description: "Episode number, 1-based.",
    },
    max_chars: {
      type: "integer",
      description: "Optional maximum characters to return for the episode content.",
    },
  },
  required: ["episode_id"],
} as const;

const toPositiveInteger = (value: unknown) => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
};

const parseArgs = (input: unknown) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("get_episode_script 需要对象参数。");
  }
  const raw = input as Record<string, unknown>;
  const episodeId = toPositiveInteger(raw.episode_id ?? raw.episodeId);
  const maxChars = toPositiveInteger(raw.max_chars ?? raw.maxChars);
  if (!episodeId) {
    throw new Error("get_episode_script 需要 episode_id。");
  }
  return {
    episodeId,
    maxChars,
  };
};

export const getEpisodeScriptToolDef = {
  name: "get_episode_script",
  description: "LEGACY DISABLED. Use list_project_resources/read_project_resource over script document nodes instead.",
  parameters: getEpisodeScriptParameters,
  execute: (_input: unknown, _bridge: StyloAgentBridge) => {
    throw new Error(
      "get_episode_script is a disabled legacy episode tool. Use read_project_resource with layer=script and entity=node for Flow document nodes."
    );
  },
  summarize: (output: any) => {
    if (!output?.found) {
      return `未找到第 ${output?.episode_id ?? "?"} 集`;
    }
    return `已读取 ${output?.episode_label || `第 ${output?.episode_id} 集`} 正文`;
  },
};
