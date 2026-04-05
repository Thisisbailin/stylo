import { listBuiltinSkills, resolveBuiltinSkill } from "../runtime/skills";
import type { QalamAgentBridge } from "../bridge/qalamBridge";
import { searchKnowledgeResources } from "../../node-workspace/knowledge/resources";
import {
  buildGraphNodesFromWorkflow,
  buildProjectGraphIdentitySearchText,
  buildProjectGraphLinks,
  buildProjectGraphMaps,
  buildProjectGraphSearchText,
} from "../../node-workspace/nodeflow/projectGraph";

export const SEARCH_PROJECT_RESOURCE_LAYERS = ["knowledge", "nodeflow", "skill"] as const;
export const SEARCH_PROJECT_RESOURCE_FACETS = [
  "identity",
  "content",
  "anchors",
  "links",
  "detail",
  "maps",
  "approvals",
] as const;

type SearchLayer = (typeof SEARCH_PROJECT_RESOURCE_LAYERS)[number];
type SearchFacet = (typeof SEARCH_PROJECT_RESOURCE_FACETS)[number];

const searchProjectResourceParameters = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Search query in Chinese or any exact term to locate entities inside the shared project graph world.",
    },
    layers: {
      type: "array",
      items: {
        type: "string",
        enum: [...SEARCH_PROJECT_RESOURCE_LAYERS],
      },
      description: "Optional graph layers to search. Defaults to knowledge, nodeflow, and skill.",
    },
    facets: {
      type: "array",
      items: {
        type: "string",
        enum: [...SEARCH_PROJECT_RESOURCE_FACETS],
      },
      description: "Optional facets to search, such as identity, content, anchors, links, detail, maps, or approvals.",
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

  const layers = Array.isArray(raw.layers)
    ? raw.layers.map((item) => String(item)).filter((item): item is SearchLayer =>
        (SEARCH_PROJECT_RESOURCE_LAYERS as readonly string[]).includes(item)
      )
    : ([...SEARCH_PROJECT_RESOURCE_LAYERS] as SearchLayer[]);

  const facets = Array.isArray(raw.facets)
    ? raw.facets.map((item) => String(item)).filter((item): item is SearchFacet =>
        (SEARCH_PROJECT_RESOURCE_FACETS as readonly string[]).includes(item)
      )
    : (["identity", "anchors", "links", "maps", "approvals"] as SearchFacet[]);

  return {
    query,
    layers: layers.length ? layers : ([...SEARCH_PROJECT_RESOURCE_LAYERS] as SearchLayer[]),
    facets: facets.length ? facets : (["identity", "anchors", "links", "maps", "approvals"] as SearchFacet[]),
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
        layer: "skill",
        entity: "package",
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
    "Search across the shared project graph world when the exact locator is unknown. Public search now centers on Knowledge and NodeFlow, with skill packages kept as an auxiliary package layer.",
  parameters: searchProjectResourceParameters,
  execute: async (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const workflow = bridge.getNodeFlowSnapshot();
    const knowledge = bridge.getKnowledgeSnapshot();
    const matches: any[] = [];
    const radius = Math.max(80, Math.min(240, Math.floor(args.maxChars / 2)));

    if (args.layers.includes("skill")) {
      await pushSkillMatches(matches, args.query, args.maxMatches, radius);
    }

    if (args.layers.includes("knowledge")) {
      const knowledgeFacets = [
        args.facets.includes("identity") ? "identity" : null,
        args.facets.includes("content") ? "content" : null,
        args.facets.includes("anchors") ? "anchors" : null,
        args.facets.includes("links") ? "links" : null,
      ].filter(Boolean) as Array<"identity" | "content" | "anchors" | "links">;

      if (knowledgeFacets.length) {
        for (const item of searchKnowledgeResources(knowledge, {
          query: args.query,
          scopes: knowledgeFacets,
        }).items) {
          if (matches.length >= args.maxMatches) break;
          matches.push({
            layer: "knowledge",
            entity: "node",
            view: "identity",
            node_id: item.node.id,
            node_ref: item.node.ref,
            title: item.node.title,
            node_kind: item.node.kind,
            matched_facets: item.matchedScopes,
            snippet: item.matchedScopes.join(" · "),
          });
        }
      }
    }

    if (args.layers.includes("nodeflow")) {
      if (args.facets.includes("identity")) {
        for (const node of buildGraphNodesFromWorkflow(workflow)) {
          if (matches.length >= args.maxMatches) break;
          const haystack = buildProjectGraphIdentitySearchText(node);
          if (haystack && includesQuery(haystack, args.query)) {
            matches.push({
              layer: "nodeflow",
              entity: "node",
              view: "identity",
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

      if (args.facets.includes("detail")) {
        for (const node of buildGraphNodesFromWorkflow(workflow)) {
          if (matches.length >= args.maxMatches) break;
          const haystack = buildProjectGraphSearchText(node);
          if (haystack && includesQuery(haystack, args.query)) {
            matches.push({
              layer: "nodeflow",
              entity: "node",
              view: "detail",
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

      if (args.facets.includes("links")) {
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
              layer: "nodeflow",
              entity: "link",
              link_kind: "canvas",
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
              layer: "nodeflow",
              entity: "link",
              link_kind: "graph",
              link_id: link.id,
              snippet: buildSnippet(haystack, args.query, radius),
            });
          }
        }
      }

      if (args.facets.includes("approvals")) {
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
              layer: "nodeflow",
              entity: "approval",
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

      if (args.facets.includes("maps")) {
        for (const map of buildProjectGraphMaps(workflow)) {
          if (matches.length >= args.maxMatches) break;
          const haystack = [map.mapId, map.name, map.view || ""].filter(Boolean).join(" ");
          if (haystack && includesQuery(haystack, args.query)) {
            matches.push({
              layer: "nodeflow",
              entity: "map",
              map_id: map.mapId,
              name: map.name,
              snippet: buildSnippet(haystack, args.query, radius),
            });
          }
        }
      }
    }

    return {
      query: args.query,
      total_matches: matches.length,
      matches,
    };
  },
  summarize: (output: any) => `搜索到 ${output?.matches?.length || 0} 条图资源匹配`,
};
