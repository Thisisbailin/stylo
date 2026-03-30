import type { Episode, ProjectRoleIdentity, Shot } from "../../types";
import { sanitizeShotList, SHOT_TABLE_COLUMNS } from "../../utils/shotSchema";
import { ensureStableId, ensureTypedStableId } from "../../utils/id";
import type { QalamAgentBridge } from "../bridge/qalamBridge";
import { buildRoleMention } from "../../utils/projectRoles";

export const EDIT_PROJECT_RESOURCE_TYPES = [
  "project_summary",
  "episode_summary",
  "character_profile",
  "scene_profile",
  "episode_storyboard",
] as const;

const storyboardRowSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    duration: { type: "string" },
    shotType: { type: "string" },
    focalLength: { type: "string" },
    movement: { type: "string" },
    composition: { type: "string" },
    blocking: { type: "string" },
    dialogue: { type: "string" },
    sound: { type: "string" },
    lightingVfx: { type: "string" },
    editingNotes: { type: "string" },
    notes: { type: "string" },
    soraPrompt: { type: "string" },
    storyboardPrompt: { type: "string" },
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
    "storyboardPrompt",
  ],
} as const;

const editUnderstandingResourceParameters = {
  type: "object",
  properties: {
    resource_type: {
      type: "string",
      enum: [...EDIT_PROJECT_RESOURCE_TYPES],
      description: "Project resource type to write.",
    },
    episode_id: {
      type: "integer",
      description: "Episode number, 1-based. Required for episode_summary.",
    },
    name: {
      type: "string",
      description: "Character or scene name. Required for character_profile and scene_profile.",
    },
    summary: {
      type: "string",
      description: "Summary text for project_summary or episode_summary.",
    },
    role: {
      type: "string",
      description: "Character role label.",
    },
    bio: {
      type: "string",
      description: "Character bio or analysis paragraph.",
    },
    is_main: {
      type: "boolean",
      description: "Whether the character is a main character.",
    },
    type: {
      type: "string",
      enum: ["core", "secondary"],
      description: "Scene profile type.",
    },
    description: {
      type: "string",
      description: "Scene description or analysis paragraph.",
    },
    visuals: {
      type: "string",
      description: "Scene visual notes.",
    },
    shots: {
      type: "array",
      description:
        "Complete shot rows for episode_storyboard. Use the canonical columns: id, duration, shotType, focalLength, movement, composition, blocking, dialogue, sound, lightingVfx, editingNotes, notes, soraPrompt, storyboardPrompt. Prefer reusing episode_storyboard.rows from read_project_resource directly.",
      minItems: 1,
      items: storyboardRowSchema,
    },
    rows: {
      type: "array",
      description:
        "Alias of shots for episode_storyboard writes. This matches the rows field returned by read_project_resource(resource_type=episode_storyboard).",
      minItems: 1,
      items: storyboardRowSchema,
    },
  },
  additionalProperties: false,
  required: ["resource_type"],
  oneOf: [
    {
      properties: {
        resource_type: { const: "project_summary" },
      },
      required: ["resource_type", "summary"],
    },
    {
      properties: {
        resource_type: { const: "episode_summary" },
      },
      required: ["resource_type", "episode_id", "summary"],
    },
    {
      properties: {
        resource_type: { const: "character_profile" },
      },
      required: ["resource_type", "name"],
      anyOf: [{ required: ["role"] }, { required: ["bio"] }, { required: ["is_main"] }],
    },
    {
      properties: {
        resource_type: { const: "scene_profile" },
      },
      required: ["resource_type", "name"],
      anyOf: [{ required: ["type"] }, { required: ["description"] }, { required: ["visuals"] }],
    },
    {
      properties: {
        resource_type: { const: "episode_storyboard" },
      },
      required: ["resource_type", "episode_id"],
      anyOf: [{ required: ["rows"] }, { required: ["shots"] }],
    },
  ],
} as const;

type ResourceType = (typeof EDIT_PROJECT_RESOURCE_TYPES)[number];

type ParsedArgs =
  | { resourceType: "project_summary"; summary: string }
  | { resourceType: "episode_summary"; episodeId: number; summary: string }
  | { resourceType: "character_profile"; name: string; role?: string; bio?: string; isMain?: boolean }
  | { resourceType: "scene_profile"; name: string; sceneType?: "core" | "secondary"; description?: string; visuals?: string }
  | { resourceType: "episode_storyboard"; episodeId: number; shots: Shot[] };

const toPositiveInteger = (value: unknown) => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
};

const toTrimmedString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const toOptionalString = (value: unknown) => {
  const trimmed = toTrimmedString(value);
  return trimmed || undefined;
};

const toArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const extractStoryboardRows = (raw: Record<string, unknown>) => {
  const directRows = toArray(raw.shots ?? raw.rows);
  if (directRows.length > 0) return directRows;
  const sceneBlocks = toArray(raw.scene_blocks ?? raw.sceneBlocks);
  if (sceneBlocks.length === 0) return [];
  return sceneBlocks.flatMap((block) => {
    if (!block || typeof block !== "object") return [];
    return toArray((block as Record<string, unknown>).shots ?? (block as Record<string, unknown>).rows);
  });
};

const deriveEpisodeStatus = (shots: Shot[]): Episode["status"] => {
  if (!shots.length) return "pending";
  if (shots.every((shot) => shot.storyboardPrompt.trim().length > 0)) return "review_storyboard";
  if (shots.every((shot) => shot.soraPrompt.trim().length > 0)) return "review_sora";
  return "confirmed_shots";
};

const formatIssues = (issues: string[]) => issues.slice(0, 6).join("；");

const normalizeMatchValue = (value?: string) => value?.trim().toLowerCase().replace(/^@/, "") || "";
const slugifyToken = (value: string, fallback: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;

const matchesRole = (role: ProjectRoleIdentity, name: string) => {
  const needle = normalizeMatchValue(name);
  return [
    role.name,
    role.displayName,
    role.mention,
    role.title,
    ...(role.aliases || []).map((alias) => alias.value),
  ]
    .map((value) => normalizeMatchValue(value))
    .some((value) => value === needle);
};

const createRoleIdentity = (
  kind: "person" | "scene",
  name: string,
  patch: Partial<ProjectRoleIdentity>
): ProjectRoleIdentity => {
  const trimmedName = name.trim();
  const mention = buildRoleMention(trimmedName);
  return {
    id: ensureTypedStableId(undefined, "role"),
    name: trimmedName,
    displayName: trimmedName,
    mention,
    slug: slugifyToken(trimmedName, kind === "person" ? "character" : "scene"),
    kind,
    tone: kind === "scene" ? "sky" : "emerald",
    title: trimmedName,
    summary: patch.summary || (kind === "scene" ? "场景身份" : "人物身份"),
    description: patch.description || "",
    status: "draft",
    aliases: [
      {
        id: ensureStableId(undefined, "alias"),
        value: trimmedName,
        normalized: trimmedName.toLowerCase(),
      },
      {
        id: ensureStableId(undefined, "alias"),
        value: `@${mention}`,
        normalized: mention,
      },
    ],
    binding: {
      mention,
      aliases: [trimmedName, `@${mention}`],
    },
    portraits: [],
    ...patch,
  };
};

const parseArgs = (input: unknown): ParsedArgs => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("edit_project_resource 需要对象参数。");
  }
  const raw = input as Record<string, unknown>;
  const resourceType = toTrimmedString(raw.resource_type ?? raw.resourceType) as ResourceType;
  if (!(EDIT_PROJECT_RESOURCE_TYPES as readonly string[]).includes(resourceType)) {
    throw new Error("edit_project_resource 需要合法的 resource_type。");
  }

  if (resourceType === "project_summary") {
    const summary = toTrimmedString(raw.summary);
    if (!summary) throw new Error("project_summary 需要 summary。");
    return { resourceType, summary };
  }

  if (resourceType === "episode_summary") {
    const episodeId = toPositiveInteger(raw.episode_id ?? raw.episodeId);
    const summary = toTrimmedString(raw.summary);
    if (!episodeId) throw new Error("episode_summary 需要 episode_id。");
    if (!summary) throw new Error("episode_summary 需要 summary。");
    return { resourceType, episodeId, summary };
  }

  if (resourceType === "character_profile") {
    const name = toTrimmedString(raw.name);
    if (!name) throw new Error("character_profile 需要 name。");
    const role = toOptionalString(raw.role);
    const bio = toOptionalString(raw.bio);
    const isMain = typeof raw.is_main === "boolean" ? raw.is_main : typeof raw.isMain === "boolean" ? raw.isMain : undefined;
    if (!role && !bio && typeof isMain === "undefined") {
      throw new Error("character_profile 至少需要 role、bio、is_main 之一。");
    }
    return { resourceType, name, role, bio, isMain };
  }

  if (resourceType === "episode_storyboard") {
    const episodeId = toPositiveInteger(raw.episode_id ?? raw.episodeId);
    const shots = extractStoryboardRows(raw);
    if (!episodeId) throw new Error("episode_storyboard 需要 episode_id。");
    if (!shots.length) {
      throw new Error("episode_storyboard 需要至少 1 条 rows/shots 数据。请直接传入 read_project_resource 返回的 rows。");
    }
    return { resourceType, episodeId, shots: shots as Shot[] };
  }

  const name = toTrimmedString(raw.name);
  if (!name) throw new Error("scene_profile 需要 name。");
  const sceneType = raw.type === "core" || raw.type === "secondary" ? raw.type : undefined;
  const description = toOptionalString(raw.description);
  const visuals = toOptionalString(raw.visuals);
  if (!sceneType && !description && !visuals) {
    throw new Error("scene_profile 至少需要 type、description、visuals 之一。");
  }
  return { resourceType, name, sceneType, description, visuals };
};

const upsertPersonRole = (roles: ProjectRoleIdentity[], args: Extract<ParsedArgs, { resourceType: "character_profile" }>) => {
  const primary = roles.find((role) => role.kind === "person" && matchesRole(role, args.name));
  const created = !primary;

  const nextRoles = created
    ? [
        ...roles,
        createRoleIdentity("person", args.name, {
          summary: args.role || "人物身份",
          description: args.bio || "",
          isMain: args.isMain ?? false,
        }),
      ]
    : roles.map((role) => {
        if (role.id !== primary!.id) return role;
        const nextRole: ProjectRoleIdentity = {
          ...role,
          name: args.name || role.name,
          displayName: args.name || role.displayName,
          mention: buildRoleMention(args.name || role.name),
          title: args.name || role.title,
          summary: args.role ?? role.summary,
          isMain: args.isMain ?? role.isMain,
        };
        if (role.id === primary!.id && typeof args.bio === "string") {
          nextRole.description = args.bio;
        }
        return nextRole;
      });

  const item = created
    ? nextRoles[nextRoles.length - 1]
    : nextRoles.find((role) => role.id === primary!.id)!;

  return {
    updated: nextRoles.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN")),
    created,
    item,
  };
};

const upsertSceneRole = (roles: ProjectRoleIdentity[], args: Extract<ParsedArgs, { resourceType: "scene_profile" }>) => {
  const primary = roles.find((role) => role.kind === "scene" && matchesRole(role, args.name));
  const created = !primary;

  const nextRoles = created
    ? [
        ...roles,
        createRoleIdentity("scene", args.name, {
          summary: args.sceneType === "core" ? "核心场景身份" : "场景身份",
          description: args.description || "",
          visualTags: args.visuals,
          isCore: args.sceneType === "core",
        }),
      ]
    : roles.map((role) => {
        if (role.id !== primary!.id) return role;
        const nextRole: ProjectRoleIdentity = {
          ...role,
          name: args.name || role.name,
          displayName: args.name || role.displayName,
          mention: buildRoleMention(args.name || role.name),
          title: args.name || role.title,
          isCore: args.sceneType ? args.sceneType === "core" : role.isCore,
        };
        if (role.id === primary!.id) {
          if (typeof args.description === "string") nextRole.description = args.description;
          if (typeof args.visuals === "string") nextRole.visualTags = args.visuals;
          if (args.sceneType) nextRole.summary = args.sceneType === "core" ? "核心场景身份" : "场景身份";
        }
        return nextRole;
      });

  const item = created
    ? nextRoles[nextRoles.length - 1]
    : nextRoles.find((role) => role.id === primary!.id)!;

  return {
    updated: nextRoles.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN")),
    created,
    item,
  };
};

export const editUnderstandingResourceToolDef = {
  name: "edit_project_resource",
  description:
    "Edit project resources in the knowledge base. Supports project_summary, episode_summary, character_profile, scene_profile, and episode_storyboard.",
  parameters: editUnderstandingResourceParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);

    if (args.resourceType === "project_summary") {
      bridge.updateProjectData((prev) => ({
        ...prev,
        context: {
          ...prev.context,
          projectSummary: args.summary,
        },
      }));
      return {
        updated: true,
        resource_type: args.resourceType,
        field: "context.projectSummary",
        chars: args.summary.length,
        summary: args.summary,
      };
    }

    if (args.resourceType === "episode_summary") {
      const projectData = bridge.getProjectData();
      const episode = (projectData.episodes || []).find((item) => item.id === args.episodeId);
      if (!episode) {
        throw new Error(`edit_project_resource 未找到第 ${args.episodeId} 集。`);
      }
      bridge.updateProjectData((prev) => {
        const updatedEpisodes = (prev.episodes || []).map((item) =>
          item.id === args.episodeId ? { ...item, summary: args.summary } : item
        );
        const restSummaries = (prev.context?.episodeSummaries || []).filter((item) => item.episodeId !== args.episodeId);
        return {
          ...prev,
          episodes: updatedEpisodes,
          context: {
            ...prev.context,
            episodeSummaries: [...restSummaries, { episodeId: args.episodeId, summary: args.summary }].sort(
              (a, b) => a.episodeId - b.episodeId
            ),
          },
        };
      });
      return {
        updated: true,
        resource_type: args.resourceType,
        episode_id: args.episodeId,
        field: "context.episodeSummaries",
        chars: args.summary.length,
        summary: args.summary,
      };
    }

    if (args.resourceType === "character_profile") {
      const projectData = bridge.getProjectData();
      const result = upsertPersonRole(projectData.context?.roles || [], args);
      bridge.updateProjectData((prev) => ({
        ...prev,
        context: {
          ...prev.context,
          roles: result.updated,
        },
      }));
      return {
        updated: true,
        resource_type: args.resourceType,
        field: "context.roles",
        created: result.created,
        item_id: result.item.id,
        name: result.item.name,
        role: result.item.summary,
      };
    }

    if (args.resourceType === "episode_storyboard") {
      const projectData = bridge.getProjectData();
      const episode = (projectData.episodes || []).find((item) => item.id === args.episodeId);
      if (!episode) {
        throw new Error(`edit_project_resource 未找到第 ${args.episodeId} 集。`);
      }

      const { shots, issues } = sanitizeShotList(args.shots, {
        mode: "project",
        requireStructuredId: true,
        allowGeneratedIds: false,
      });

      const sceneIds = new Set((episode.scenes || []).map((scene) => scene.id));
      const bindingIssues = shots.flatMap((shot, index) => {
        const sceneId = shot.id.split("-").slice(0, -1).join("-");
        if (!sceneId || sceneIds.has(sceneId)) return [];
        return [`第 ${index + 1} 条镜号 ${shot.id} 没有匹配到本集 scene id`];
      });

      if (issues.length || bindingIssues.length) {
        const messages = [...issues.map((issue) => issue.message), ...bindingIssues];
        throw new Error(`edit_project_resource 校验失败：${formatIssues(messages)}`);
      }

      const nextStatus = deriveEpisodeStatus(shots);
      bridge.updateProjectData((prev) => ({
        ...prev,
        episodes: (prev.episodes || []).map((item) =>
          item.id === args.episodeId
            ? {
                ...item,
                shots,
                status: nextStatus,
                errorMsg: undefined,
              }
            : item
        ),
      }));

      return {
        updated: true,
        resource_type: args.resourceType,
        episode_id: episode.id,
        episode_label: episode.title || `第${episode.id}集`,
        field: "episodes[].shots",
        shot_count: shots.length,
        status: nextStatus,
        columns: SHOT_TABLE_COLUMNS.map((column) => ({ key: column.key, label: column.label })),
      };
    }

    const projectData = bridge.getProjectData();
    const result = upsertSceneRole(projectData.context?.roles || [], args);
    bridge.updateProjectData((prev) => ({
      ...prev,
      context: {
        ...prev.context,
        roles: result.updated,
      },
    }));
    return {
      updated: true,
      resource_type: args.resourceType,
      field: "context.roles",
      created: result.created,
      item_id: result.item.id,
      name: result.item.name,
      type: result.item.isCore ? "core" : "secondary",
    };
  },
  summarize: (output: any) => {
    switch (output?.resource_type) {
      case "project_summary":
        return `已写入项目摘要（${output?.chars || 0} 字）`;
      case "episode_summary":
        return `已写入第 ${output?.episode_id ?? "?"} 集摘要（${output?.chars || 0} 字）`;
      case "character_profile":
        return `${output?.created ? "已创建" : "已更新"}角色档案 ${output?.name || ""}`.trim();
      case "episode_storyboard":
        return `已写入 ${output?.episode_label || `第 ${output?.episode_id ?? "?"} 集`} 分镜表（${output?.shot_count ?? 0} 条）`;
      case "scene_profile":
        return `${output?.created ? "已创建" : "已更新"}场景档案 ${output?.name || ""}`.trim();
      default:
        return "已编辑项目资产";
    }
  },
};
