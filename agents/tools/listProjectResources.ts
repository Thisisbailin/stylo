import { listBuiltinSkills } from "../runtime/skills";
import type { QalamAgentBridge } from "../bridge/qalamBridge";
import { buildKnowledgeAnchorRegistryProjection } from "../../node-workspace/knowledge/maps";
import { listKnowledgeNodeIdentities } from "../../node-workspace/knowledge/queries";
import {
  buildGraphNodesFromWorkflow,
  buildProjectGraphLinks,
  buildProjectGraphMaps,
} from "../../node-workspace/nodeflow/projectGraph";
import { getNodeFlowLinkRelationsForNode } from "../../node-workspace/nodeflow/model";

export const LIST_PROJECT_RESOURCE_LAYERS = ["knowledge", "nodeflow", "skill"] as const;
export const LIST_PROJECT_RESOURCE_ENTITIES = ["node", "link", "map", "approval", "package"] as const;
export const LIST_PROJECT_RESOURCE_TARGETS = [
  "knowledge:node",
  "knowledge:link",
  "knowledge:map",
  "nodeflow:node",
  "nodeflow:link",
  "nodeflow:map",
  "nodeflow:approval",
  "skill:package",
] as const;

type ResourceLayer = (typeof LIST_PROJECT_RESOURCE_LAYERS)[number];
type ResourceEntity = (typeof LIST_PROJECT_RESOURCE_ENTITIES)[number];

const listProjectResourcesParameters = {
  type: "object",
  properties: {
    layer: {
      type: "string",
      enum: [...LIST_PROJECT_RESOURCE_LAYERS],
      description: "Which graph layer to inspect: knowledge for long-term memory, nodeflow for the visible working canvas, or skill for internal packages.",
    },
    entity: {
      type: "string",
      enum: [...LIST_PROJECT_RESOURCE_ENTITIES],
      description: "Which graph entity to list inside the chosen layer.",
    },
    plane: {
      type: "string",
      enum: ["source", "semantic", "design", "execution"],
      description: "Optional plane filter when listing NodeFlow nodes.",
    },
    link_kind: {
      type: "string",
      enum: ["canvas", "graph"],
      description: "Optional link kind when listing NodeFlow links.",
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
  const plane = trim(raw.plane) || undefined;
  const linkKind = trim(raw.link_kind ?? raw.linkKind) as "canvas" | "graph" | "";
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
  if (layer === "skill" && entity !== "package") {
    throw new Error("skill 层仅支持 package。");
  }

  return {
    layer,
    entity,
    plane,
    linkKind: linkKind || undefined,
    maxItems,
  };
};

export const listProjectResourcesToolDef = {
  name: "list_project_resources",
  description:
    "List graph entities before reading them. The public graph world has two main layers: Knowledge for long-term memory and NodeFlow for the visible working canvas. Skill packages remain an auxiliary package layer.",
  parameters: listProjectResourcesParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const workflow = bridge.getNodeFlowSnapshot();
    const knowledge = bridge.getKnowledgeSnapshot();

    if (args.layer === "skill") {
      const items = listBuiltinSkills().slice(0, args.maxItems).map((skill) => ({
        item_id: skill.id,
        title: skill.title,
        description: skill.description,
        tags: skill.tags || [],
        version: skill.version || "",
      }));
      return {
        layer: "skill",
        entity: "package",
        total: listBuiltinSkills().length,
        items,
      };
    }

    if (args.layer === "knowledge") {
      if (args.entity === "node") {
        const items = listKnowledgeNodeIdentities(knowledge).slice(0, args.maxItems);
        return {
          layer: "knowledge",
          entity: "node",
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
          };
        });
        return {
          layer: "knowledge",
          entity: "link",
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
      ];
      return {
        layer: "knowledge",
        entity: "map",
        total: items.length,
        items,
      };
    }

    if (args.entity === "node") {
      const allNodes = buildGraphNodesFromWorkflow(workflow);
      const filteredNodes = args.plane ? allNodes.filter((node) => node.plane === args.plane) : allNodes;
      const items = filteredNodes.slice(0, args.maxItems).map((node) => ({
        node_id: node.nodeId,
        node_ref: node.ref,
        plane: node.plane,
        node_type: node.type,
        title: node.title,
        status: typeof node.meta?.status === "string" ? String(node.meta.status) : null,
        parent_id: node.parentId || null,
        incoming_link_count: node.nodeId ? getNodeFlowLinkRelationsForNode(workflow, node.nodeId).incomingLinks.length : 0,
        outgoing_link_count: node.nodeId ? getNodeFlowLinkRelationsForNode(workflow, node.nodeId).outgoingLinks.length : 0,
        position:
          typeof node.x === "number" && typeof node.y === "number" ? { x: node.x, y: node.y } : null,
      }));
      return {
        layer: "nodeflow",
        entity: "node",
        view: "identity",
        total: filteredNodes.length,
        items,
      };
    }

    if (args.entity === "link") {
      const canvasLinks =
        !args.linkKind || args.linkKind === "canvas"
          ? workflow.links.map((link) => ({
              link_kind: "canvas" as const,
              link_id: link.id,
              from_node_id: link.source,
              to_node_id: link.target,
              from_port: link.sourceHandle ?? null,
              to_port: link.targetHandle ?? null,
              paused: Boolean(link.data?.hasPause),
            }))
          : [];
      const graphLinks =
        !args.linkKind || args.linkKind === "graph"
          ? buildProjectGraphLinks(workflow).map((link) => ({
              link_kind: "graph" as const,
              link_id: link.id,
              source_ref: link.sourceRef,
              target_ref: link.targetRef,
            }))
          : [];
      const items = [...canvasLinks, ...graphLinks].slice(0, args.maxItems);
      return {
        layer: "nodeflow",
        entity: "link",
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
        node_type: approval.nodeType,
        node_title: approval.nodeTitle,
        action: approval.action,
        provider: approval.providerLabel,
        model: approval.modelLabel,
        created_at: approval.createdAt,
      }));
      return {
        layer: "nodeflow",
        entity: "approval",
        total: approvals.length,
        items,
      };
    }

    const maps = buildProjectGraphMaps(workflow);
    return {
      layer: "nodeflow",
      entity: "map",
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
    const layer = output?.layer || "graph";
    const entity = output?.entity || "resource";
    const count = output?.items?.length || 0;
    if (layer === "skill") return `列出 ${count} 个技能包`;
    if (layer === "knowledge" && entity === "node") return `列出 ${count} 个 Knowledge 节点`;
    if (layer === "knowledge" && entity === "link") return `列出 ${count} 条 Knowledge 关系`;
    if (layer === "knowledge" && entity === "map") return `列出 ${count} 种 Knowledge 地图视图`;
    if (layer === "nodeflow" && entity === "node") return `列出 ${count} 个 NodeFlow 节点`;
    if (layer === "nodeflow" && entity === "link") return `列出 ${count} 条 NodeFlow 连线`;
    if (layer === "nodeflow" && entity === "approval") return `列出 ${count} 个 NodeFlow 待审批执行请求`;
    return `列出 ${count} 张 NodeFlow 地图`;
  },
};
