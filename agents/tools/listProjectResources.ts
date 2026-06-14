import type { QalamAgentBridge } from "../bridge/qalamBridge";
import {
  buildScriptResourceLinks,
  buildScriptResourceMaps,
  buildScriptResourceNodes,
} from "./scriptResources";
import {
  buildGraphNodesFromWorkflow,
  buildProjectGraphLinks,
  buildProjectGraphMaps,
} from "../../node-workspace/nodeflow/projectGraph";
import { getNodeFlowLinkRelationsForNode } from "../../node-workspace/nodeflow/model";

export const LIST_PROJECT_RESOURCE_LAYERS = ["script", "nodeflow"] as const;
export const LIST_PROJECT_RESOURCE_ENTITIES = ["node", "link", "map", "approval"] as const;
export const LIST_PROJECT_RESOURCE_TARGETS = [
  "script:node",
  "script:link",
  "script:map",
  "nodeflow:node",
  "nodeflow:link",
  "nodeflow:map",
  "nodeflow:approval",
] as const;

type ResourceLayer = (typeof LIST_PROJECT_RESOURCE_LAYERS)[number];
type ResourceEntity = (typeof LIST_PROJECT_RESOURCE_ENTITIES)[number];

const listProjectResourcesParameters = {
  type: "object",
  properties: {
    layer: {
      type: "string",
      enum: [...LIST_PROJECT_RESOURCE_LAYERS],
      description: "Which Flow access path to inspect: script for source/foundation/archive resources or nodeflow for the visible graph runtime.",
    },
    entity: {
      type: "string",
      enum: [...LIST_PROJECT_RESOURCE_ENTITIES],
      description: "Which graph entity to list inside the chosen layer.",
    },
    link_role: {
      type: "string",
      enum: ["connection", "reference"],
      description: "Optional Flow graph link role filter when listing links.",
    },
    max_items: {
      type: "integer",
      description: "Optional maximum number of items to return.",
    },
  },
  additionalProperties: false,
  required: ["layer", "entity"],
} as const;

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
    throw new Error("list_project_resources 需要对象参数。");
  }
  const raw = input as Record<string, unknown>;
  const layer = trim(raw.layer) as ResourceLayer;
  const entity = trim(raw.entity) as ResourceEntity;
  const linkRole = trim(raw.link_role ?? raw.linkRole) as "connection" | "reference" | "";
  const maxItems = Math.max(1, Math.min(200, toPositiveInteger(raw.max_items ?? raw.maxItems) || 50));

  if (!(LIST_PROJECT_RESOURCE_LAYERS as readonly string[]).includes(layer)) {
    throw new Error(`list_project_resources 不支持 layer=${trim(raw.layer)}`);
  }
  if (!(LIST_PROJECT_RESOURCE_ENTITIES as readonly string[]).includes(entity)) {
    throw new Error(`list_project_resources 不支持 entity=${trim(raw.entity)}`);
  }
  if (layer === "script" && !["node", "link", "map"].includes(entity)) {
    throw new Error("script 层仅支持 node、link 或 map。");
  }
  if (layer === "nodeflow" && !["node", "link", "map", "approval"].includes(entity)) {
    throw new Error("nodeflow 层仅支持 node、link、map 或 approval。");
  }

  return {
    layer,
    entity,
    linkRole: linkRole || undefined,
    maxItems,
  };
};

export const listProjectResourcesToolDef = {
  name: "list_project_resources",
  description:
    "List project entities before reading them. Flow exposes source/foundation/archive resources through script and visible graph runtime resources through the internal nodeflow key.",
  parameters: listProjectResourcesParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const workflow = bridge.getNodeFlowSnapshot();
    const projectData = bridge.getProjectData();

    if (args.layer === "script") {
      if (args.entity === "node") {
        const nodes = buildScriptResourceNodes(projectData);
        const items = nodes.slice(0, args.maxItems).map((item) => ({
          node_id: item.nodeId,
          node_ref: item.ref,
          kind: item.type,
          title: item.title,
          resource_type: item.resourceType,
          locked: item.locked,
          source_ref: item.sourceRef || null,
          artifact: {
            kind: "node",
            target: "script:node",
            id: item.nodeId,
            ref: item.ref,
            title: item.title,
            node_kind: item.type,
          },
        }));
        return {
          layer: "script",
          entity: "node",
          target: "script:node",
          view: "identity",
          total: nodes.length,
          items,
        };
      }

      if (args.entity === "link") {
        const links = buildScriptResourceLinks(projectData);
        const items = links.slice(0, args.maxItems).map((link) => ({
          link_id: link.id,
          from_node_ref: link.fromRef,
          from_title: link.fromTitle || null,
          to_node_ref: link.toRef,
          to_title: link.toTitle || null,
          link_type: link.type,
          artifact: {
            kind: "link",
            target: "script:link",
            id: link.id,
            title: link.type,
            source: {
              node_ref: link.fromRef,
              title: link.fromTitle || null,
            },
            destination: {
              node_ref: link.toRef,
              title: link.toTitle || null,
            },
          },
        }));
        return {
          layer: "script",
          entity: "link",
          target: "script:link",
          total: links.length,
          items,
        };
      }

      const maps = buildScriptResourceMaps(projectData);
      const items = maps.slice(0, args.maxItems).map((item) => ({
        ...item,
        artifact: {
          kind: "map",
          target: "script:map",
          id: item.mapId,
          title: item.name,
        },
      }));
      return {
        layer: "script",
        entity: "map",
        target: "script:map",
        total: maps.length,
        items,
      };
    }

    if (args.entity === "node") {
      const allNodes = buildGraphNodesFromWorkflow(workflow);
      const filteredNodes = allNodes;
      const items = filteredNodes.slice(0, args.maxItems).map((node) => ({
        node_id: node.nodeId,
        node_ref: node.ref,
        kind: node.type,
        title: node.title,
        status: typeof node.meta?.status === "string" ? String(node.meta.status) : null,
        parent_id: node.parentId || null,
        incoming_link_count: node.nodeId ? getNodeFlowLinkRelationsForNode(workflow, node.nodeId).incomingLinks.length : 0,
        outgoing_link_count: node.nodeId ? getNodeFlowLinkRelationsForNode(workflow, node.nodeId).outgoingLinks.length : 0,
        position:
          typeof node.x === "number" && typeof node.y === "number" ? { x: node.x, y: node.y } : null,
        artifact: {
          kind: "node",
          target: "nodeflow:node",
          id: node.nodeId,
          ref: node.ref,
          title: node.title,
          node_kind: node.type,
        },
      }));
      return {
        layer: "nodeflow",
        entity: "node",
        target: "nodeflow:node",
        view: "identity",
        total: filteredNodes.length,
        items,
      };
    }

    if (args.entity === "link") {
      const canvasLinks =
        !args.linkRole || args.linkRole === "connection"
          ? workflow.links.map((link) => ({
              role: "connection" as const,
              link_id: link.id,
              from_node_id: link.source,
              to_node_id: link.target,
              from_port: link.sourceHandle ?? null,
              to_port: link.targetHandle ?? null,
              paused: Boolean(link.data?.hasPause),
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
            }))
          : [];
      const graphLinks =
        !args.linkRole || args.linkRole === "reference"
          ? buildProjectGraphLinks(workflow).map((link) => ({
              role: "reference" as const,
              link_id: link.id,
              source_ref: link.sourceRef,
              target_ref: link.targetRef,
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
            }))
          : [];
      const items = [...canvasLinks, ...graphLinks].slice(0, args.maxItems);
      return {
        layer: "nodeflow",
        entity: "link",
        target: "nodeflow:link",
        total: canvasLinks.length + graphLinks.length,
        items,
      };
    }

    if (args.entity === "approval") {
      const approvals = bridge.getPendingNodeFlowExecutionApprovals();
      const items = approvals.slice(0, args.maxItems).map((approval) => ({
        approval_id: approval.id,
        node_id: approval.nodeId,
        node_ref: approval.nodeRef || null,
        node_kind: approval.nodeType,
        node_title: approval.nodeTitle,
        action: approval.action,
        provider: approval.providerLabel,
        model: approval.modelLabel,
        created_at: approval.createdAt,
        artifact: {
          kind: "approval",
          target: "nodeflow:approval",
          id: approval.id,
          title: approval.nodeTitle,
        },
      }));
      return {
        layer: "nodeflow",
        entity: "approval",
        target: "nodeflow:approval",
        total: approvals.length,
        items,
      };
    }

    const maps = buildProjectGraphMaps(workflow);
    return {
      layer: "nodeflow",
      entity: "map",
      target: "nodeflow:map",
      total: maps.length,
      items: maps.slice(0, args.maxItems).map((map) => ({
        map_id: map.mapId,
        name: map.name,
        view: map.view,
        active: map.isActive,
        node_count: map.nodeCount,
        link_count: map.linkCount,
        artifact: {
          kind: "map",
          target: "nodeflow:map",
          id: map.mapId,
          title: map.name,
        },
      })),
    };
  },
  summarize: (output: any) => {
    const layer = output?.layer || "graph";
    const entity = output?.entity || "resource";
    const count = output?.items?.length || 0;
    if (layer === "script" && entity === "node") return `列出 ${count} 个 Script 资源`;
    if (layer === "script" && entity === "link") return `列出 ${count} 条 Script 关系`;
    if (layer === "script" && entity === "map") return `列出 ${count} 种 Script 地图视图`;
    if (layer === "nodeflow" && entity === "node") return `列出 ${count} 个 Flow 节点`;
    if (layer === "nodeflow" && entity === "link") return `列出 ${count} 条 Flow 连线`;
    if (layer === "nodeflow" && entity === "approval") return `列出 ${count} 个 Flow 待审批执行请求`;
    return `列出 ${count} 张 Flow 地图`;
  },
};
