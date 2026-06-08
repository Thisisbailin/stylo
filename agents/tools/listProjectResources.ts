import type { QalamAgentBridge } from "../bridge/qalamBridge";
import { buildKnowledgeAnchorRegistryProjection } from "../../node-workspace/knowledge/maps";
import { listKnowledgeNodeIdentities } from "../../node-workspace/knowledge/queries";
import {
  buildGraphNodesFromWorkflow,
  buildProjectGraphLinks,
  buildProjectGraphMaps,
} from "../../node-workspace/nodeflow/projectGraph";
import { getNodeFlowLinkRelationsForNode } from "../../node-workspace/nodeflow/model";

export const LIST_PROJECT_RESOURCE_LAYERS = ["knowledge", "nodeflow"] as const;
export const LIST_PROJECT_RESOURCE_ENTITIES = ["node", "link", "map", "approval"] as const;
export const LIST_PROJECT_RESOURCE_TARGETS = [
  "knowledge:node",
  "knowledge:link",
  "knowledge:map",
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
      description: "Which graph layer to inspect: knowledge for long-term memory or nodeflow for the visible working canvas.",
    },
    entity: {
      type: "string",
      enum: [...LIST_PROJECT_RESOURCE_ENTITIES],
      description: "Which graph entity to list inside the chosen layer.",
    },
    link_role: {
      type: "string",
      enum: ["connection", "reference"],
      description: "Optional NodeFlow link role filter when listing links.",
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
  if (layer === "knowledge" && !["node", "link", "map"].includes(entity)) {
    throw new Error("knowledge 层仅支持 node、link 或 map。");
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
    "List graph entities before reading them. The public graph world has two main layers: Knowledge for long-term memory and NodeFlow for the visible working canvas.",
  parameters: listProjectResourcesParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const workflow = bridge.getNodeFlowSnapshot();
    const knowledge = bridge.getKnowledgeSnapshot();

    if (args.layer === "knowledge") {
      if (args.entity === "node") {
        const items = listKnowledgeNodeIdentities(knowledge).slice(0, args.maxItems).map((item) => ({
          ...item,
          artifact: {
            kind: "node",
            target: "knowledge:node",
            id: item.id,
            ref: item.ref,
            title: item.title,
            node_kind: item.kind,
          },
        }));
        return {
          layer: "knowledge",
          entity: "node",
          target: "knowledge:node",
          view: "identity",
          total: knowledge.nodes.length,
          items,
        };
      }

      if (args.entity === "link") {
        const items = knowledge.links.slice(0, args.maxItems).map((link) => {
          const fromNode = knowledge.nodes.find((node) => node.id === link.fromNodeId);
          const toNode = knowledge.nodes.find((node) => node.id === link.toNodeId);
          return {
            link_id: link.id,
            from_node_id: link.fromNodeId,
            from_node_ref: fromNode?.ref || null,
            from_title: fromNode?.package.title || null,
            to_node_id: link.toNodeId,
            to_node_ref: toNode?.ref || null,
            to_title: toNode?.package.title || null,
            link_type: link.type,
            origin: link.origin,
            status: link.status || "active",
            artifact: {
              kind: "link",
              target: "knowledge:link",
              id: link.id,
              title: link.type,
              source: {
                node_id: link.fromNodeId,
                node_ref: fromNode?.ref || null,
                title: fromNode?.package.title || null,
              },
              destination: {
                node_id: link.toNodeId,
                node_ref: toNode?.ref || null,
                title: toNode?.package.title || null,
              },
            },
          };
        });
        return {
          layer: "knowledge",
          entity: "link",
          target: "knowledge:link",
          total: knowledge.links.length,
          items,
        };
      }

      const items = [
        { map_view: "full", title: "Knowledge Map", description: "完整长期记忆地图" },
        { map_view: "local", title: "Local Map", description: "围绕某个知识节点的局部地图" },
        { map_view: "anchor", title: "Anchor Map", description: "围绕某个 script / episode / scene anchor 的地图" },
        { map_view: "lens", title: "Lens Map", description: "按 focus / kind 等镜头投影出的地图" },
        { map_view: "lifecycle", title: "Lifecycle Map", description: "按生命周期观察知识网" },
        { map_view: "timeline", title: "Anchor Timeline", description: "按 anchor 查看知识演化时间线" },
      ].map((item) => ({
        ...item,
        artifact: {
          kind: "map",
          target: "knowledge:map",
          id: item.map_view,
          title: item.title,
        },
      }));
      return {
        layer: "knowledge",
        entity: "map",
        target: "knowledge:map",
        total: items.length,
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
    if (layer === "knowledge" && entity === "node") return `列出 ${count} 个 Knowledge 节点`;
    if (layer === "knowledge" && entity === "link") return `列出 ${count} 条 Knowledge 关系`;
    if (layer === "knowledge" && entity === "map") return `列出 ${count} 种 Knowledge 地图视图`;
    if (layer === "nodeflow" && entity === "node") return `列出 ${count} 个 NodeFlow 节点`;
    if (layer === "nodeflow" && entity === "link") return `列出 ${count} 条 NodeFlow 连线`;
    if (layer === "nodeflow" && entity === "approval") return `列出 ${count} 个 NodeFlow 待审批执行请求`;
    return `列出 ${count} 张 NodeFlow 地图`;
  },
};
