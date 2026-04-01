import type { ProjectData, ProjectRoleIdentity } from "../../types";
import { resolveBuiltinSkill } from "../runtime/skills";
import { listBuiltinSkills } from "../runtime/skills";
import type { QalamAgentBridge } from "../bridge/qalamBridge";
import { buildNodeFlowSearchText, toNodeFlowLinkRecord, toNodeFlowNodeRecord } from "../../node-workspace/nodeflow/model";

export const SEARCH_PROJECT_RESOURCE_SCOPES = [
  "skills",
  "script",
  "storyboard",
  "understanding",
  "characters",
  "scenes",
  "guides",
  "workflow",
] as const;

const searchProjectResourceParameters = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Search query in Chinese or any exact term to locate project resources.",
    },
    resource_scopes: {
      type: "array",
      items: {
        type: "string",
        enum: [...SEARCH_PROJECT_RESOURCE_SCOPES],
      },
      description: "Optional scopes to search. Defaults to all supported scopes, including storyboard rows.",
    },
    episode_id: {
      type: "integer",
      description: "Optional episode number to narrow script search.",
    },
    max_matches: {
      type: "integer",
      description: "Optional maximum number of matches to return.",
    },
    max_chars: {
      type: "integer",
      description: "Optional maximum snippet size budget.",
    },
  },
  additionalProperties: false,
  required: ["query"],
} as const;

type Scope = (typeof SEARCH_PROJECT_RESOURCE_SCOPES)[number];

const toPositiveInteger = (value: unknown) => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
};

const toLower = (value: string) => value.toLocaleLowerCase();

const buildSnippet = (text: string, query: string, radius = 120) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const lowerText = toLower(normalized);
  const lowerQuery = toLower(query.trim());
  const idx = lowerText.indexOf(lowerQuery);
  if (idx < 0) return normalized.length > radius * 2 ? `${normalized.slice(0, radius * 2)}...` : normalized;
  const start = Math.max(0, idx - radius);
  const end = Math.min(normalized.length, idx + lowerQuery.length + radius);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalized.length ? "..." : "";
  return `${prefix}${normalized.slice(start, end)}${suffix}`;
};

const includesQuery = (value: string, query: string) => toLower(value).includes(toLower(query));

const parseArgs = (input: unknown) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("search_project_resource 需要对象参数。");
  }
  const raw = input as Record<string, unknown>;
  const query = typeof raw.query === "string" ? raw.query.trim() : "";
  if (!query) throw new Error("search_project_resource 需要 query。");

  const scopes = Array.isArray(raw.resource_scopes)
    ? raw.resource_scopes.map((item) => String(item))
    : Array.isArray(raw.resourceScopes)
      ? (raw.resourceScopes as unknown[]).map((item) => String(item))
      : [...SEARCH_PROJECT_RESOURCE_SCOPES];

  const normalizedScopes = scopes.filter((scope): scope is Scope =>
    (SEARCH_PROJECT_RESOURCE_SCOPES as readonly string[]).includes(scope)
  );

  return {
    query,
    scopes: normalizedScopes.length
      ? normalizedScopes
      : ([...SEARCH_PROJECT_RESOURCE_SCOPES] as Scope[]),
    episodeId: toPositiveInteger(raw.episode_id ?? raw.episodeId),
    maxMatches: Math.max(1, Math.min(20, toPositiveInteger(raw.max_matches ?? raw.maxMatches) || 8)),
    maxChars: Math.max(120, Math.min(1200, toPositiveInteger(raw.max_chars ?? raw.maxChars) || 320)),
  };
};

const pushCharacterMatches = (matches: any[], roles: ProjectRoleIdentity[], query: string, maxMatches: number, radius: number) => {
  for (const role of roles.filter((role) => role.kind === "person")) {
    if (matches.length >= maxMatches) break;
    const haystack = [role.name, role.summary, role.description, role.episodeUsage, ...(role.tags || [])]
      .filter(Boolean)
      .join(" ");
    if (haystack && includesQuery(haystack, query)) {
      matches.push({
        scope: "character",
        itemId: role.id,
        characterName: role.name,
        snippet: buildSnippet(haystack, query, radius),
      });
    }
  }
};

const pushSceneMatches = (matches: any[], roles: ProjectRoleIdentity[], query: string, maxMatches: number, radius: number) => {
  for (const role of roles.filter((role) => role.kind === "scene")) {
    if (matches.length >= maxMatches) break;
    const haystack = [role.name, role.description, role.visualTags, role.episodeUsage]
      .filter(Boolean)
      .join(" ");
    if (haystack && includesQuery(haystack, query)) {
      matches.push({
        scope: "scene_profile",
        itemId: role.id,
        locationName: role.name,
        snippet: buildSnippet(haystack, query, radius),
      });
    }
  }
};

const pushStoryboardMatches = (matches: any[], data: ProjectData, args: ReturnType<typeof parseArgs>, radius: number) => {
  const targetEpisodes = args.episodeId
    ? (data.episodes || []).filter((episode) => episode.id === args.episodeId)
    : data.episodes || [];
  for (const episode of targetEpisodes) {
    if (matches.length >= args.maxMatches) break;
    for (const shot of episode.shots || []) {
      if (matches.length >= args.maxMatches) break;
      const haystack = [
        shot.id,
        shot.duration,
        shot.shotType,
        shot.focalLength,
        shot.movement,
        shot.composition,
        shot.blocking,
        shot.dialogue,
        shot.sound,
        shot.lightingVfx,
        shot.editingNotes,
        shot.notes,
        shot.soraPrompt,
        shot.storyboardPrompt,
      ]
        .filter(Boolean)
        .join(" ");
      if (haystack && includesQuery(haystack, args.query)) {
        matches.push({
          scope: "episode_storyboard",
          episodeId: episode.id,
          episodeTitle: episode.title,
          shotId: shot.id,
          snippet: buildSnippet(haystack, args.query, radius),
        });
      }
    }
  }
};

const pushSkillMatches = async (matches: any[], query: string, maxMatches: number, radius: number) => {
  const manifests = listBuiltinSkills();
  for (const manifest of manifests) {
    if (matches.length >= maxMatches) break;
    const resolved = await resolveBuiltinSkill(manifest.id);
    const haystack = [
      manifest.title,
      manifest.description,
      ...(manifest.tags || []),
      resolved?.guidanceMarkdown || "",
    ]
      .filter(Boolean)
      .join(" ");
    if (haystack && includesQuery(haystack, query)) {
      matches.push({
        scope: "skill_package",
        itemId: manifest.id,
        title: manifest.title,
        snippet: buildSnippet(haystack, query, radius),
      });
    }
  }
};

const pushWorkflowMatches = (matches: any[], bridge: QalamAgentBridge, args: ReturnType<typeof parseArgs>, radius: number) => {
  const workflow = bridge.getNodeFlowSnapshot();
  for (const node of workflow.nodes) {
    if (matches.length >= args.maxMatches) break;
    const nodeRecord = toNodeFlowNodeRecord(node);
    const haystack = buildNodeFlowSearchText(node);
    if (haystack && includesQuery(haystack, args.query)) {
      matches.push({
        scope: "workflow_node",
        nodeId: nodeRecord.id,
        nodeRef: nodeRecord.ref,
        nodeType: nodeRecord.kind,
        nodeKind: nodeRecord.kind,
        title: nodeRecord.title || nodeRecord.id,
        snippet: buildSnippet(haystack, args.query, radius),
      });
    }
  }
  for (const edge of workflow.links) {
    if (matches.length >= args.maxMatches) break;
    const link = toNodeFlowLinkRecord(edge);
    const haystack = [
      link.id,
      link.fromNodeId,
      link.toNodeId,
      link.fromPort,
      link.toPort,
      link.paused ? "pause paused 暂停" : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (haystack && includesQuery(haystack, args.query)) {
      matches.push({
        scope: "workflow_connection",
        linkId: link.id,
        snippet: buildSnippet(haystack, args.query, radius),
      });
    }
  }
};

const searchProject = async (data: ProjectData, bridge: QalamAgentBridge, args: ReturnType<typeof parseArgs>) => {
  const matches: any[] = [];
  const radius = Math.max(80, Math.min(240, Math.floor(args.maxChars / 2)));
  const targetEpisodes = args.episodeId
    ? (data.episodes || []).filter((episode) => episode.id === args.episodeId)
    : data.episodes || [];

  if (args.scopes.includes("skills")) {
    await pushSkillMatches(matches, args.query, args.maxMatches, radius);
  }

  if (args.scopes.includes("script")) {
    for (const episode of targetEpisodes) {
      if (matches.length >= args.maxMatches) break;
      const episodeContent = episode.content || "";
      if (episodeContent && includesQuery(episodeContent, args.query)) {
        matches.push({
          scope: "episode_script",
          episodeId: episode.id,
          episodeTitle: episode.title,
          snippet: buildSnippet(episodeContent, args.query, radius),
        });
      }
      for (const scene of episode.scenes || []) {
        if (matches.length >= args.maxMatches) break;
        const haystack = [scene.title, scene.content, scene.location, scene.timeOfDay].filter(Boolean).join(" ");
        if (haystack && includesQuery(haystack, args.query)) {
          matches.push({
            scope: "scene_script",
            episodeId: episode.id,
            episodeTitle: episode.title,
            sceneId: scene.id,
            sceneTitle: scene.title,
            snippet: buildSnippet(haystack, args.query, radius),
          });
        }
      }
    }
  }

  if (matches.length < args.maxMatches && args.scopes.includes("storyboard")) {
    pushStoryboardMatches(matches, data, args, radius);
  }

  if (matches.length < args.maxMatches && args.scopes.includes("understanding")) {
    const projectSummary = data.context?.projectSummary || "";
    if (projectSummary && includesQuery(projectSummary, args.query)) {
      matches.push({
        scope: "project_summary",
        snippet: buildSnippet(projectSummary, args.query, radius),
      });
    }
    for (const summary of data.context?.episodeSummaries || []) {
      if (matches.length >= args.maxMatches) break;
      if (summary.summary && includesQuery(summary.summary, args.query)) {
        matches.push({
          scope: "episode_summary",
          episodeId: summary.episodeId,
          snippet: buildSnippet(summary.summary, args.query, radius),
        });
      }
    }
  }

  if (matches.length < args.maxMatches && args.scopes.includes("characters")) {
    pushCharacterMatches(matches, data.context?.roles || [], args.query, args.maxMatches, radius);
  }

  if (matches.length < args.maxMatches && args.scopes.includes("scenes")) {
    pushSceneMatches(matches, data.context?.roles || [], args.query, args.maxMatches, radius);
  }

  if (matches.length < args.maxMatches && args.scopes.includes("guides")) {
    const guides = [
      { itemId: "globalStyleGuide", title: "Style Guide", text: data.globalStyleGuide || "" },
      { itemId: "shotGuide", title: "Shot Guide", text: data.shotGuide || "" },
      { itemId: "soraGuide", title: "Sora Guide", text: data.soraGuide || "" },
      { itemId: "storyboardGuide", title: "Storyboard Guide", text: data.storyboardGuide || "" },
      { itemId: "dramaGuide", title: "Drama Guide", text: data.dramaGuide || "" },
    ];
    for (const guide of guides) {
      if (matches.length >= args.maxMatches) break;
      const haystack = [guide.title, guide.text].filter(Boolean).join(" ");
      if (haystack && includesQuery(haystack, args.query)) {
        matches.push({
          scope: "guide_document",
          itemId: guide.itemId,
          guideTitle: guide.title,
          snippet: buildSnippet(haystack, args.query, radius),
        });
      }
    }
  }

  if (matches.length < args.maxMatches && args.scopes.includes("workflow")) {
    pushWorkflowMatches(matches, bridge, args, radius);
  }

  return matches;
};

export const searchProjectResourceToolDef = {
  name: "search_project_resource",
  description:
    "Search project resources when the exact locator is unknown. Supports skills, scripts, storyboards, understanding assets, guides, and workflow scopes.",
  parameters: searchProjectResourceParameters,
  execute: async (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const data = bridge.getProjectData();
    const matches = await searchProject(data, bridge, args);
    return {
      resource_type: "search_project_resource",
      query: args.query,
      scopes: args.scopes,
      total: matches.length,
      data: {
        matches,
      },
      warnings: matches.length ? [] : ["no_matches"],
    };
  },
  summarize: (output: any) => `项目搜索完成，命中 ${output?.total ?? 0} 条`,
};
