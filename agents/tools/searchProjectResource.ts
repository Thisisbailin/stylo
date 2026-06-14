import type { QalamAgentBridge } from "../bridge/qalamBridge";
import {
  buildScriptResourceLinks,
  buildScriptResourceMaps,
  buildScriptResourceNodes,
  buildScriptResourceSearchText,
} from "./scriptResources";
import {
  buildGraphNodesFromWorkflow,
  buildProjectGraphIdentitySearchText,
  buildProjectGraphLinks,
  buildProjectGraphMaps,
  buildProjectGraphSearchText,
} from "../../node-workspace/nodeflow/projectGraph";

export const SEARCH_PROJECT_RESOURCE_LAYERS = ["script", "nodeflow"] as const;
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
      description: "Optional project layers to search. Defaults to script and nodeflow.",
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

export const searchProjectResourceToolDef = {
  name: "search_project_resource",
  description:
    "Search across the shared Flow project world when the exact locator is unknown. Public search centers on Script archives and visible canvas graph resources.",
  parameters: searchProjectResourceParameters,
  execute: async (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const workflow = bridge.getNodeFlowSnapshot();
    const projectData = bridge.getProjectData();
    const matches: any[] = [];
    const radius = Math.max(80, Math.min(240, Math.floor(args.maxChars / 2)));

    if (args.layers.includes("script")) {
      if (args.facets.includes("identity") || args.facets.includes("content") || args.facets.includes("detail")) {
        for (const node of buildScriptResourceNodes(projectData)) {
          if (matches.length >= args.maxMatches) break;
          const haystack = buildScriptResourceSearchText(node);
          if (!haystack || !includesQuery(haystack, args.query)) continue;
          matches.push({
            layer: "script",
            entity: "node",
            target: "script:node",
            view: args.facets.includes("content") || args.facets.includes("detail") ? "detail" : "identity",
            node_id: node.nodeId,
            node_ref: node.ref,
            title: node.title,
            node_kind: node.type,
            resource_type: node.resourceType,
            snippet: buildSnippet(haystack, args.query, radius),
            artifact: {
              kind: "node",
              target: "script:node",
              id: node.nodeId,
              ref: node.ref,
              title: node.title,
              node_kind: node.type,
            },
          });
        }
      }

      if (args.facets.includes("links")) {
        for (const link of buildScriptResourceLinks(projectData)) {
          if (matches.length >= args.maxMatches) break;
          const haystack = [link.id, link.fromRef, link.toRef, link.type, link.fromTitle, link.toTitle].filter(Boolean).join(" ");
          if (!haystack || !includesQuery(haystack, args.query)) continue;
          matches.push({
            layer: "script",
            entity: "link",
            target: "script:link",
            link_id: link.id,
            snippet: buildSnippet(haystack, args.query, radius),
            artifact: {
              kind: "link",
              target: "script:link",
              id: link.id,
              title: link.type,
              source: { node_ref: link.fromRef },
              destination: { node_ref: link.toRef },
            },
          });
        }
      }

      if (args.facets.includes("maps")) {
        for (const map of buildScriptResourceMaps(projectData)) {
          if (matches.length >= args.maxMatches) break;
          const haystack = [map.mapId, map.name, map.view].join(" ");
          if (!includesQuery(haystack, args.query)) continue;
          matches.push({
            layer: "script",
            entity: "map",
            target: "script:map",
            map_id: map.mapId,
            title: map.name,
            snippet: buildSnippet(haystack, args.query, radius),
            artifact: {
              kind: "map",
              target: "script:map",
              id: map.mapId,
              title: map.name,
            },
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
              target: "nodeflow:node",
              view: "identity",
              node_id: node.nodeId,
              node_ref: node.ref,
              kind: node.type,
              title: node.title,
              snippet: buildSnippet(haystack, args.query, radius),
              artifact: {
                kind: "node",
                target: "nodeflow:node",
                id: node.nodeId,
                ref: node.ref,
                title: node.title,
                node_kind: node.type,
              },
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
              target: "nodeflow:node",
              view: "detail",
              node_id: node.nodeId,
              node_ref: node.ref,
              kind: node.type,
              title: node.title,
              snippet: buildSnippet(haystack, args.query, radius),
              artifact: {
                kind: "node",
                target: "nodeflow:node",
                id: node.nodeId,
                ref: node.ref,
                title: node.title,
                node_kind: node.type,
              },
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
              target: "nodeflow:link",
              role: "connection",
              link_id: link.id,
              snippet: buildSnippet(haystack, args.query, radius),
              artifact: {
                kind: "link",
                target: "nodeflow:link",
                id: link.id,
                title: "connection",
                source: {
                  node_id: link.source,
                  handle: link.sourceHandle ?? null,
                },
                destination: {
                  node_id: link.target,
                  handle: link.targetHandle ?? null,
                },
              },
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
              target: "nodeflow:link",
              role: "reference",
              link_id: link.id,
              snippet: buildSnippet(haystack, args.query, radius),
              artifact: {
                kind: "link",
                target: "nodeflow:link",
                id: link.id,
                title: "reference",
                source: {
                  node_ref: link.sourceRef,
                },
                destination: {
                  node_ref: link.targetRef,
                },
              },
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
              target: "nodeflow:approval",
              approval_id: approval.id,
              node_id: approval.nodeId,
              node_ref: approval.nodeRef,
              title: approval.nodeTitle,
              action: approval.action,
              snippet: buildSnippet(haystack, args.query, radius),
              artifact: {
                kind: "approval",
                target: "nodeflow:approval",
                id: approval.id,
                title: approval.nodeTitle,
              },
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
              target: "nodeflow:map",
              map_id: map.mapId,
              name: map.name,
              snippet: buildSnippet(haystack, args.query, radius),
              artifact: {
                kind: "map",
                target: "nodeflow:map",
                id: map.mapId,
                title: map.name,
              },
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
