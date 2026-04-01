import { listBuiltinSkills } from "../runtime/skills";
import type { QalamAgentBridge } from "../bridge/qalamBridge";
import {
  buildGraphNodesFromWorkflow,
  buildProjectedSourceNodes,
  buildProjectGraphMaps,
} from "../../node-workspace/nodeflow/projectGraph";

export const LIST_PROJECT_RESOURCE_TYPES = [
  "skill_packages",
  "source_nodes",
  "graph_nodes",
  "execution_links",
  "graph_links",
  "maps",
] as const;

const listProjectResourcesParameters = {
  type: "object",
  properties: {
    resource_type: {
      type: "string",
      enum: [...LIST_PROJECT_RESOURCE_TYPES],
      description: "Which graph resource directory to inspect.",
    },
    plane: {
      type: "string",
      enum: ["source", "semantic", "design", "execution"],
      description: "Optional plane filter when resource_type=graph_nodes.",
    },
    max_items: {
      type: "integer",
      description: "Optional maximum number of items to return for list results.",
    },
  },
  additionalProperties: false,
  required: ["resource_type"],
} as const;

type ResourceType = (typeof LIST_PROJECT_RESOURCE_TYPES)[number];

const toPositiveInteger = (value: unknown) => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
};

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const parseArgs = (input: unknown) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("list_project_resources 需要对象参数。");
  }
  const raw = input as Record<string, unknown>;
  const resourceType = trim(raw.resource_type);
  const plane = trim(raw.plane) || undefined;
  const maxItems = toPositiveInteger(raw.max_items ?? raw.maxItems);
  if (!resourceType) throw new Error("list_project_resources 需要 resource_type。");
  if (!(LIST_PROJECT_RESOURCE_TYPES as readonly string[]).includes(resourceType)) {
    throw new Error(`list_project_resources 不支持 resource_type=${resourceType}`);
  }
  return {
    resourceType: resourceType as ResourceType,
    plane,
    maxItems: Math.max(1, Math.min(200, maxItems || 50)),
  };
};

export const listProjectResourcesToolDef = {
  name: "list_project_resources",
  description:
    "List available graph resource directories before reading them. Supports skill packages, projected source nodes, graph nodes, graph links, and maps.",
  parameters: listProjectResourcesParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const projectData = bridge.getProjectData();
    const workflow = bridge.getNodeFlowSnapshot();

    if (args.resourceType === "skill_packages") {
      const items = listBuiltinSkills().slice(0, args.maxItems).map((skill) => ({
        item_id: skill.id,
        title: skill.title,
        description: skill.description,
        tags: skill.tags || [],
        version: skill.version || "",
      }));
      return {
        resource_type: "skill_packages",
        total: listBuiltinSkills().length,
        items,
      };
    }

    if (args.resourceType === "source_nodes") {
      const items = buildProjectedSourceNodes(projectData).slice(0, args.maxItems).map((node) => ({
        ref: node.ref,
        plane: node.plane,
        node_type: node.type,
        title: node.title,
        source_ref: node.sourceRef || null,
        locked: true,
      }));
      return {
        resource_type: "source_nodes",
        total: buildProjectedSourceNodes(projectData).length,
        items,
      };
    }

    if (args.resourceType === "graph_nodes") {
      const allNodes = buildGraphNodesFromWorkflow(workflow);
      const filteredNodes = args.plane ? allNodes.filter((node) => node.plane === args.plane) : allNodes;
      const items = filteredNodes.slice(0, args.maxItems).map((node) => ({
        node_id: node.nodeId,
        node_ref: node.ref,
        plane: node.plane,
        node_type: node.type,
        title: node.title,
        parent_id: node.parentId || null,
        position:
          typeof node.x === "number" && typeof node.y === "number" ? { x: node.x, y: node.y } : null,
      }));
      return {
        resource_type: "graph_nodes",
        total: filteredNodes.length,
        items,
      };
    }

    if (args.resourceType === "execution_links") {
      const items = workflow.links.slice(0, args.maxItems).map((link) => ({
        link_id: link.id,
        from_node_id: link.source,
        to_node_id: link.target,
        from_port: link.sourceHandle ?? null,
        to_port: link.targetHandle ?? null,
        paused: Boolean(link.data?.hasPause),
      }));
      return {
        resource_type: "execution_links",
        total: workflow.links.length,
        items,
      };
    }

    if (args.resourceType === "graph_links") {
      const items = (workflow.graphLinks || []).slice(0, args.maxItems).map((link) => ({
        link_id: link.id,
        source_ref: link.sourceRef,
        target_ref: link.targetRef,
      }));
      return {
        resource_type: "graph_links",
        total: (workflow.graphLinks || []).length,
        items,
      };
    }

    const maps = buildProjectGraphMaps(workflow);
      return {
        resource_type: "maps",
      total: maps.length,
      items: maps.slice(0, args.maxItems).map((map) => ({
        map_id: map.mapId,
        name: map.name,
        view: map.view,
        active: map.isActive,
        node_count: map.nodeCount,
        link_count: map.linkCount,
      })),
    };
  },
  summarize: (output: any) => {
    if (output?.resource_type === "skill_packages") return `列出 ${output.items?.length || 0} 个技能包`;
    if (output?.resource_type === "source_nodes") return `列出 ${output.items?.length || 0} 个 source 节点`;
    if (output?.resource_type === "graph_nodes") return `列出 ${output.items?.length || 0} 个 graph 节点`;
    if (output?.resource_type === "execution_links") return `列出 ${output.items?.length || 0} 条执行连线`;
    if (output?.resource_type === "graph_links") return `列出 ${output.items?.length || 0} 条 graph 连线`;
    return `列出 ${output?.items?.length || 0} 张地图`;
  },
};
