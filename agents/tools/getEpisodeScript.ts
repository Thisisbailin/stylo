import { getEpisodeScript } from "../../node-workspace/components/qalam/toolActions";
import type { QalamAgentBridge } from "../bridge/qalamBridge";

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
  description: "Read the full script text of a specific episode by episode id.",
  parameters: getEpisodeScriptParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const result = getEpisodeScript(bridge.getProjectData(), {
      episodeId: args.episodeId,
      maxChars: args.maxChars,
      includeSceneList: false,
      includeEpisodeSummary: false,
      includeCharacters: false,
    }).result;

    const episodeData = result?.data?.episode;
    if (!episodeData) {
      return {
        found: false,
        episode_id: args.episodeId,
        warnings: Array.isArray(result?.warnings) ? result.warnings : [],
      };
    }

    return {
      found: true,
      episode_id: episodeData.id,
      episode_label: episodeData.title,
      content: episodeData.content || "",
    };
  },
  summarize: (output: any) => {
    if (!output?.found) {
      return `未找到第 ${output?.episode_id ?? "?"} 集`;
    }
    return `已读取 ${output?.episode_label || `第 ${output?.episode_id} 集`} 正文`;
  },
};
