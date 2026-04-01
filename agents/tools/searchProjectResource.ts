import { listBuiltinSkills, resolveBuiltinSkill } from "../runtime/skills";
import type { QalamAgentBridge } from "../bridge/qalamBridge";
import {
  buildGraphNodesFromWorkflow,
  buildProjectGraphLinks,
  buildProjectedSourceNodes,
  buildProjectGraphMaps,
  buildProjectGraphSearchText,
} from "../../node-workspace/nodeflow/projectGraph";

export const SEARCH_PROJECT_RESOURCE_SCOPES = [
  "skills",
  "source",
  "graph",
  "links",
  "maps",
] as const;

const searchProjectResourceParameters = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Search query in Chinese or any exact term to locate graph resources.",
    },
    resource_scopes: {
      type: "array",
      items: {
        type: "string",
        enum: [...SEARCH_PROJECT_RESOURCE_SCOPES],
      },
      description: "Optional scopes to search. Defaults to all supported scopes.",
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
    scopes: normalizedScopes.length ? normalizedScopes : ([...SEARCH_PROJECT_RESOURCE_SCOPES] as Scope[]),
    maxMatches: Math.max(1, Math.min(30, toPositiveInteger(raw.max_matches ?? raw.maxMatches) || 8)),
    maxChars: Math.max(120, Math.min(1200, toPositiveInteger(raw.max_chars ?? raw.maxChars) || 320)),
  };
};

const pushSkillMatches = async (matches: any[], query: string, maxMatches: number, radius: number) => {
  const manifests = listBuiltinSkills();
  for (const manifest of manifests) {
    if (matches.length >= maxMatches) break;
    const resolved = await resolveBuiltinSkill(manifest.id);
    const haystack = [manifest.title, manifest.description, ...(manifest.tags || []), resolved?.guidanceMarkdown || ""]
      .filter(Boolean)
      .join(" ");
    if (haystack && includesQuery(haystack, query)) {
      matches.push({
        scope: "skill_package",
        item_id: manifest.id,
        title: manifest.title,
        snippet: buildSnippet(haystack, query, radius),
      });
    }
  }
};

export const searchProjectResourceToolDef = {
  name: "search_project_resource",
  description:
    "Search projected source nodes, graph nodes, graph links, maps, and skill packages when the exact locator is unknown.",
  parameters: searchProjectResourceParameters,
  execute: async (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const projectData = bridge.getProjectData();
    const workflow = bridge.getNodeFlowSnapshot();
    const matches: any[] = [];
    const radius = Math.max(80, Math.min(240, Math.floor(args.maxChars / 2)));

    if (args.scopes.includes("skills")) {
      await pushSkillMatches(matches, args.query, args.maxMatches, radius);
    }

    if (args.scopes.includes("source")) {
      for (const node of buildProjectedSourceNodes(projectData)) {
        if (matches.length >= args.maxMatches) break;
        const haystack = buildProjectGraphSearchText(node);
        if (haystack && includesQuery(haystack, args.query)) {
          matches.push({
            scope: "source_node",
            ref: node.ref,
            title: node.title,
            node_type: node.type,
            snippet: buildSnippet(haystack, args.query, radius),
          });
        }
      }
    }

    if (args.scopes.includes("graph")) {
      for (const node of buildGraphNodesFromWorkflow(workflow)) {
        if (matches.length >= args.maxMatches) break;
        const haystack = buildProjectGraphSearchText(node);
        if (haystack && includesQuery(haystack, args.query)) {
          matches.push({
            scope: "graph_node",
            node_id: node.nodeId,
            node_ref: node.ref,
            plane: node.plane,
            node_type: node.type,
            title: node.title,
            snippet: buildSnippet(haystack, args.query, radius),
          });
        }
      }
    }

    if (args.scopes.includes("links")) {
      for (const link of workflow.links) {
        if (matches.length >= args.maxMatches) break;
        const haystack = [
          link.id,
          link.source,
          link.target,
          link.sourceHandle,
          link.targetHandle,
          link.data?.hasPause ? "pause paused 暂停" : "",
        ]
          .filter(Boolean)
          .join(" ");
        if (haystack && includesQuery(haystack, args.query)) {
          matches.push({
            scope: "execution_link",
            link_id: link.id,
            snippet: buildSnippet(haystack, args.query, radius),
          });
        }
      }
      for (const link of buildProjectGraphLinks(workflow)) {
        if (matches.length >= args.maxMatches) break;
        const haystack = [link.id, link.sourceRef, link.targetRef].filter(Boolean).join(" ");
        if (haystack && includesQuery(haystack, args.query)) {
          matches.push({
            scope: "graph_link",
            link_id: link.id,
            snippet: buildSnippet(haystack, args.query, radius),
          });
        }
      }
    }

    if (args.scopes.includes("maps")) {
      for (const map of buildProjectGraphMaps(workflow)) {
        if (matches.length >= args.maxMatches) break;
        const haystack = [map.mapId, map.name, map.view || ""].filter(Boolean).join(" ");
        if (haystack && includesQuery(haystack, args.query)) {
          matches.push({
            scope: "map",
            map_id: map.mapId,
            name: map.name,
            snippet: buildSnippet(haystack, args.query, radius),
          });
        }
      }
    }

    return {
      resource_type: "search_project_resource",
      query: args.query,
      total_matches: matches.length,
      matches,
    };
  },
  summarize: (output: any) => `搜索到 ${output?.matches?.length || 0} 条资源匹配`,
};
