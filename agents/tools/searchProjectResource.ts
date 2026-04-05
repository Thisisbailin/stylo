import { listBuiltinSkills, resolveBuiltinSkill } from "../runtime/skills";
import type { QalamAgentBridge } from "../bridge/qalamBridge";
import { searchKnowledgeResources } from "../../node-workspace/knowledge/resources";
import {
  buildGraphNodesFromWorkflow,
  buildProjectGraphIdentitySearchText,
  buildProjectGraphLinks,
  buildProjectedSourceNodes,
  buildProjectGraphMaps,
  buildProjectGraphSearchText,
} from "../../node-workspace/nodeflow/projectGraph";

export const SEARCH_PROJECT_RESOURCE_SCOPES = [
  "skills",
  "knowledge_identity",
  "knowledge_content",
  "knowledge_anchors",
  "knowledge_links",
  "source",
  "nodeflow_identity",
  "nodeflow_detail",
  "nodeflow",
  "nodeflow_approvals",
  "nodeflow_links",
  "nodeflow_maps",
] as const;

const SEARCH_PROJECT_RESOURCE_SCOPE_ALIASES: Record<string, Scope> = {
  graph_identity: "nodeflow_identity",
  graph_detail: "nodeflow_detail",
  graph: "nodeflow",
  approvals: "nodeflow_approvals",
  links: "nodeflow_links",
  maps: "nodeflow_maps",
};

const searchProjectResourceParameters = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Search query in Chinese or any exact term to locate Source, Knowledge, or NodeFlow resources.",
    },
    resource_scopes: {
      type: "array",
      items: {
        type: "string",
        enum: [...SEARCH_PROJECT_RESOURCE_SCOPES],
      },
      description: "Optional scopes to search. nodeflow_identity searches first-layer NodeFlow node identity; nodeflow_detail searches deeper NodeFlow node details. Defaults to all supported scopes.",
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
      : ([
          "skills",
          "knowledge_identity",
          "source",
          "nodeflow_identity",
          "nodeflow_approvals",
          "nodeflow_links",
          "nodeflow_maps",
        ] as Scope[]);
      

  const normalizedScopes = scopes
    .map((scope) =>
      (SEARCH_PROJECT_RESOURCE_SCOPES as readonly string[]).includes(scope)
        ? scope
        : SEARCH_PROJECT_RESOURCE_SCOPE_ALIASES[scope]
    )
    .filter((scope): scope is Scope => Boolean(scope));

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
    "Search across the three project-reading layers when the exact locator is unknown: Source resources, Knowledge long-term memory resources, and NodeFlow resources, plus skill packages.",
  parameters: searchProjectResourceParameters,
  execute: async (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const projectData = bridge.getProjectData();
    const workflow = bridge.getNodeFlowSnapshot();
    const knowledge = bridge.getKnowledgeSnapshot();
    const matches: any[] = [];
    const radius = Math.max(80, Math.min(240, Math.floor(args.maxChars / 2)));

    if (args.scopes.includes("skills")) {
      await pushSkillMatches(matches, args.query, args.maxMatches, radius);
    }

    const knowledgeScopes = [
      args.scopes.includes("knowledge_identity") ? "identity" : null,
      args.scopes.includes("knowledge_content") ? "content" : null,
      args.scopes.includes("knowledge_anchors") ? "anchors" : null,
      args.scopes.includes("knowledge_links") ? "links" : null,
    ].filter(Boolean) as Array<"identity" | "content" | "anchors" | "links">;
    if (knowledgeScopes.length) {
      for (const item of searchKnowledgeResources(knowledge, {
        query: args.query,
        scopes: knowledgeScopes,
      }).items) {
        if (matches.length >= args.maxMatches) break;
        matches.push({
          scope: "knowledge_node_identity",
          node_id: item.node.id,
          node_ref: item.node.ref,
          title: item.node.title,
          node_kind: item.node.kind,
          matched_scopes: item.matchedScopes,
          snippet: item.matchedScopes.join(" · "),
        });
      }
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

    if (args.scopes.includes("nodeflow_identity")) {
      for (const node of buildGraphNodesFromWorkflow(workflow)) {
        if (matches.length >= args.maxMatches) break;
        const haystack = buildProjectGraphIdentitySearchText(node);
        if (haystack && includesQuery(haystack, args.query)) {
          matches.push({
            scope: "nodeflow_node_identity",
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

    if (args.scopes.includes("nodeflow") || args.scopes.includes("nodeflow_detail")) {
      for (const node of buildGraphNodesFromWorkflow(workflow)) {
        if (matches.length >= args.maxMatches) break;
        const haystack = buildProjectGraphSearchText(node);
        if (haystack && includesQuery(haystack, args.query)) {
          matches.push({
            scope: args.scopes.includes("nodeflow_detail") ? "nodeflow_node_detail" : "nodeflow_node",
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

    if (args.scopes.includes("nodeflow_links")) {
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
            scope: "nodeflow_link",
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
            scope: "nodeflow_graph_link",
            link_id: link.id,
            snippet: buildSnippet(haystack, args.query, radius),
          });
        }
      }
    }

    if (args.scopes.includes("nodeflow_approvals")) {
      for (const approval of bridge.getPendingNodeFlowExecutionApprovals()) {
        if (matches.length >= args.maxMatches) break;
        const haystack = [
          approval.id,
          approval.nodeId,
          approval.nodeRef,
          approval.nodeType,
          approval.nodeTitle,
          approval.action,
          approval.providerLabel,
          approval.modelLabel,
          approval.promptPreview || "",
          ...(approval.inputSummary || []),
        ]
          .filter(Boolean)
          .join(" ");
        if (haystack && includesQuery(haystack, args.query)) {
          matches.push({
            scope: "nodeflow_execution_approval",
            approval_id: approval.id,
            node_id: approval.nodeId,
            node_ref: approval.nodeRef,
            title: approval.nodeTitle,
            action: approval.action,
            snippet: buildSnippet(haystack, args.query, radius),
          });
        }
      }
    }

    if (args.scopes.includes("nodeflow_maps")) {
      for (const map of buildProjectGraphMaps(workflow)) {
        if (matches.length >= args.maxMatches) break;
        const haystack = [map.mapId, map.name, map.view || ""].filter(Boolean).join(" ");
        if (haystack && includesQuery(haystack, args.query)) {
          matches.push({
            scope: "nodeflow_map",
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
