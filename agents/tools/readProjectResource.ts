import { resolveBuiltinSkill } from "../runtime/skills";
import type { QalamAgentBridge } from "../bridge/qalamBridge";
import {
  buildProjectGraphMaps,
  findExecutionLink,
  findGraphLink,
  findGraphNode,
  findProjectedSourceNode,
} from "../../node-workspace/nodeflow/projectGraph";

export const READ_PROJECT_RESOURCE_TYPES = [
  "skill_package",
  "source_node",
  "graph_node",
  "execution_link",
  "graph_link",
  "map",
] as const;

const readProjectResourceParameters = {
  type: "object",
  properties: {
    resource_type: {
      type: "string",
      enum: [...READ_PROJECT_RESOURCE_TYPES],
      description: "Which graph resource to read.",
    },
    item_id: {
      type: "string",
      description: "Item id for skill_package or graph_link.",
    },
    name: {
      type: "string",
      description: "Name for skill_package, source_node, or map lookup.",
    },
    source_ref: {
      type: "string",
      description: "Projected source ref, for example source:scene:1-3 or scene:1-3.",
    },
    node_id: {
      type: "string",
      description: "Concrete node id for graph_node.",
    },
    node_ref: {
      type: "string",
      description: "Stable node ref for graph_node.",
    },
    link_id: {
      type: "string",
      description: "Link id for execution_link or graph_link.",
    },
    map_id: {
      type: "string",
      description: "Map id such as map:workspace or map:view:xxx.",
    },
    view: {
      type: "string",
      description: "Map view name.",
    },
    max_chars: {
      type: "integer",
      description: "Optional maximum characters to return for large text payloads.",
    },
  },
  additionalProperties: false,
  required: ["resource_type"],
} as const;

type ResourceType = (typeof READ_PROJECT_RESOURCE_TYPES)[number];

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

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
    throw new Error("read_project_resource 需要对象参数。");
  }
  const raw = input as Record<string, unknown>;
  const resourceType = trim(raw.resource_type);
  const itemId = trim(raw.item_id ?? raw.itemId) || undefined;
  const name = trim(raw.name) || undefined;
  const sourceRef = trim(raw.source_ref ?? raw.sourceRef) || undefined;
  const nodeId = trim(raw.node_id ?? raw.nodeId) || undefined;
  const nodeRef = trim(raw.node_ref ?? raw.nodeRef) || undefined;
  const linkId = trim(raw.link_id ?? raw.linkId ?? raw.edge_id ?? raw.edgeId) || itemId;
  const mapId = trim(raw.map_id ?? raw.mapId) || undefined;
  const view = trim(raw.view) || undefined;
  const maxChars = toPositiveInteger(raw.max_chars ?? raw.maxChars);

  if (!resourceType) throw new Error("read_project_resource 需要 resource_type。");
  if (!(READ_PROJECT_RESOURCE_TYPES as readonly string[]).includes(resourceType)) {
    throw new Error(`read_project_resource 不支持 resource_type=${resourceType}`);
  }
  if (resourceType === "skill_package" && !itemId && !name) {
    throw new Error("skill_package 需要 item_id 或 name。");
  }
  if (resourceType === "source_node" && !sourceRef && !name) {
    throw new Error("source_node 需要 source_ref 或 name。");
  }
  if (resourceType === "graph_node" && !nodeId && !nodeRef) {
    throw new Error("graph_node 需要 node_id 或 node_ref。");
  }
    if ((resourceType === "graph_link" || resourceType === "execution_link") && !linkId) {
      throw new Error(`${resourceType} 需要 link_id。`);
    }
  if (resourceType === "map" && !mapId && !view && !name) {
    throw new Error("map 需要 map_id、view 或 name。");
  }

  return {
    resourceType: resourceType as ResourceType,
    itemId,
    name,
    sourceRef,
    nodeId,
    nodeRef,
    linkId,
    mapId,
    view,
    maxChars,
  };
};

const clipText = (value: string, maxChars?: number) => {
  if (!maxChars || value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
};

const clipStructuredValue = (value: unknown, maxChars?: number): unknown => {
  if (typeof value === "string") return clipText(value, maxChars);
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => clipStructuredValue(item, maxChars));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).slice(0, 40).map(([key, item]) => [key, clipStructuredValue(item, maxChars)])
    );
  }
  return value;
};

export const readProjectResourceToolDef = {
  name: "read_project_resource",
  description:
    "Read a concrete graph resource from the current project. Supports skill packages, projected source nodes, graph nodes, graph links, and map views.",
  parameters: readProjectResourceParameters,
  execute: async (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const projectData = bridge.getProjectData();
    const workflow = bridge.getNodeFlowSnapshot();

    if (args.resourceType === "skill_package") {
      const skill = await resolveBuiltinSkill(args.itemId || args.name || "");
      return skill
        ? {
            resource_type: "skill_package",
            found: true,
            item_id: skill.id,
            title: skill.title,
            description: skill.description,
            version: skill.version || "",
            content: clipText(skill.guidanceMarkdown.trim(), args.maxChars),
            tags: skill.tags || [],
          }
        : {
            resource_type: "skill_package",
            found: false,
            item_id: args.itemId || null,
            name: args.name || null,
          };
    }

    if (args.resourceType === "source_node") {
      const node = findProjectedSourceNode(projectData, {
        ref: args.sourceRef,
        sourceRef: args.sourceRef,
        title: args.name,
      });
      return node
        ? {
            resource_type: "source_node",
            found: true,
            ref: node.ref,
            plane: node.plane,
            node_type: node.type,
            title: node.title,
            locked: true,
            source_ref: node.sourceRef || null,
            body: clipStructuredValue(node.body, args.maxChars),
          }
        : {
            resource_type: "source_node",
            found: false,
            source_ref: args.sourceRef || null,
            name: args.name || null,
          };
    }

    if (args.resourceType === "graph_node") {
      const node = findGraphNode(workflow, {
        nodeId: args.nodeId,
        nodeRef: args.nodeRef,
      });
      return node
        ? {
            resource_type: "graph_node",
            found: true,
            node_id: node.nodeId,
            node_ref: node.ref,
            plane: node.plane,
            node_type: node.type,
            title: node.title,
            position: typeof node.x === "number" && typeof node.y === "number" ? { x: node.x, y: node.y } : null,
            parent_id: node.parentId || null,
            body: clipStructuredValue(node.body, args.maxChars),
            meta: clipStructuredValue(node.meta || {}, args.maxChars),
          }
        : {
            resource_type: "graph_node",
            found: false,
            node_id: args.nodeId || null,
            node_ref: args.nodeRef || null,
          };
    }

    if (args.resourceType === "execution_link") {
      const link = findExecutionLink(workflow, args.linkId!);
      return link
        ? {
            resource_type: "execution_link",
            found: true,
            link_id: link.id,
            from_node_id: link.fromNodeId,
            to_node_id: link.toNodeId,
            from_port: link.fromPort,
            to_port: link.toPort,
            paused: link.paused,
          }
        : {
            resource_type: "execution_link",
            found: false,
            link_id: args.linkId || null,
          };
    }

    if (args.resourceType === "graph_link") {
      const link = findGraphLink(workflow, args.linkId!);
      return link
        ? {
            resource_type: "graph_link",
            found: true,
            link_id: link.id,
            source_ref: link.sourceRef,
            target_ref: link.targetRef,
          }
        : {
            resource_type: "graph_link",
            found: false,
            link_id: args.linkId || null,
          };
    }

    const maps = buildProjectGraphMaps(workflow);
    const needle = trim(args.name || args.view).toLowerCase();
    const map =
      maps.find((item) => item.mapId === args.mapId) ||
      maps.find((item) => item.view === args.view) ||
      maps.find((item) => needle && item.name.trim().toLowerCase() === needle);
    return map
      ? {
          resource_type: "map",
          found: true,
          map_id: map.mapId,
          name: map.name,
          view: map.view,
          active: map.isActive,
          node_count: map.nodeCount,
          link_count: map.linkCount,
        }
      : {
          resource_type: "map",
          found: false,
          map_id: args.mapId || null,
          view: args.view || null,
          name: args.name || null,
        };
  },
  summarize: (output: any) => {
    if (!output?.found) return `未找到 ${output?.resource_type || "resource"}`;
    if (output.resource_type === "skill_package") return `读取技能包 ${output.title || output.item_id}`;
    if (output.resource_type === "source_node") return `读取 source 节点 ${output.title || output.ref}`;
    if (output.resource_type === "graph_node") return `读取 graph 节点 ${output.title || output.node_ref || output.node_id}`;
    if (output.resource_type === "execution_link") return `读取执行连线 ${output.link_id}`;
    if (output.resource_type === "graph_link") return `读取 graph 连线 ${output.link_id}`;
    return `读取地图 ${output.name || output.map_id}`;
  },
};
