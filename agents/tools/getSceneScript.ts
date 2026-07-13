import type { StyloAgentBridge } from "../bridge/styloBridge";

export const LEGACY_GET_SCENE_SCRIPT_DISABLED = true;

const getSceneScriptParameters = {
  type: "object",
  properties: {
    scene_id: {
      type: "string",
      description: "Scene id like 1-3.",
    },
    episode_id: {
      type: "integer",
      description: "Episode number, 1-based. Required when using scene_index.",
    },
    scene_index: {
      type: "integer",
      description: "Scene index within the episode, 1-based. Use together with episode_id.",
    },
    max_chars: {
      type: "integer",
      description: "Optional maximum characters to return for the scene content.",
    },
  },
  required: [],
} as const;

const toPositiveInteger = (value: unknown) => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
};

const normalizeSceneId = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const parseArgs = (input: unknown) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("get_scene_script 需要对象参数。");
  }
  const raw = input as Record<string, unknown>;
  const sceneId = normalizeSceneId(raw.scene_id ?? raw.sceneId);
  const episodeId = toPositiveInteger(raw.episode_id ?? raw.episodeId);
  const sceneIndex = toPositiveInteger(raw.scene_index ?? raw.sceneIndex);
  const maxChars = toPositiveInteger(raw.max_chars ?? raw.maxChars);

  if (!sceneId && !(episodeId && sceneIndex)) {
    throw new Error("get_scene_script 需要 scene_id，或同时提供 episode_id 和 scene_index。");
  }

  return {
    sceneId,
    episodeId,
    sceneIndex,
    maxChars,
  };
};

export const getSceneScriptToolDef = {
  name: "get_scene_script",
  description: "LEGACY DISABLED. Use list_project_resources/read_project_resource over script document nodes instead.",
  parameters: getSceneScriptParameters,
  execute: (_input: unknown, _bridge: StyloAgentBridge) => {
    throw new Error(
      "get_scene_script is a disabled legacy scene tool. Use read_project_resource with layer=script and entity=node for Flow document nodes."
    );
  },
  summarize: (output: any) => {
    if (!output?.found) return "未找到目标场景";
    return `已读取场景 ${output?.scene_id}`;
  },
};
