import { resolveBuiltinSkill } from "../runtime/skills";
import type { QalamAgentBridge } from "../bridge/qalamBridge";
import { parseKnowledgeAnchorRef } from "../../node-workspace/knowledge/anchors";
import { readKnowledgeResource } from "../../node-workspace/knowledge/resources";
import { getKnowledgeNodeById, getKnowledgeNodeByRef } from "../../node-workspace/knowledge/queries";
import {
  buildProjectGraphMaps,
  findExecutionLink,
  findGraphLink,
  findGraphNode,
} from "../../node-workspace/nodeflow/projectGraph";
import {
  findNodeFlowNode,
  getNodeFlowLinkRelationsForNode,
  getNodeFlowNodeRef,
  getNodeFlowNodeTitle,
} from "../../node-workspace/nodeflow/model";

export const READ_PROJECT_RESOURCE_LAYERS = ["knowledge", "nodeflow", "skill"] as const;
export const READ_PROJECT_RESOURCE_ENTITIES = ["node", "link", "map", "approval", "package"] as const;
export const READ_PROJECT_RESOURCE_VIEWS = [
  "identity",
  "detail",
  "full",
  "local",
  "anchor",
  "lens",
  "lifecycle",
  "timeline",
] as const;
export const READ_PROJECT_RESOURCE_TARGETS = [
  "skill:package",
  "knowledge:node",
  "knowledge:link",
  "knowledge:map",
  "nodeflow:node",
  "nodeflow:link",
  "nodeflow:map",
  "nodeflow:approval",
] as const;

type ResourceLayer = (typeof READ_PROJECT_RESOURCE_LAYERS)[number];
type ResourceEntity = (typeof READ_PROJECT_RESOURCE_ENTITIES)[number];
type ResourceView = (typeof READ_PROJECT_RESOURCE_VIEWS)[number];

const readProjectResourceParameters = {
  type: "object",
  properties: {
    layer: {
      type: "string",
      enum: [...READ_PROJECT_RESOURCE_LAYERS],
      description: "Which graph layer to read from: knowledge, nodeflow, or skill.",
    },
    entity: {
      type: "string",
      enum: [...READ_PROJECT_RESOURCE_ENTITIES],
      description: "Which graph entity to read in that layer.",
    },
    view: {
      type: "string",
      enum: [...READ_PROJECT_RESOURCE_VIEWS],
      description: "Optional read view such as identity, detail, full, local, anchor, lens, lifecycle, or timeline.",
    },
    item_id: {
      type: "string",
      description: "Item id for skill package lookup.",
    },
    name: {
      type: "string",
      description: "Name for skill package or nodeflow map lookup.",
    },
    node_id: {
      type: "string",
      description: "Concrete node id for knowledge or nodeflow node reads.",
    },
    node_ref: {
      type: "string",
      description: "Stable node ref for knowledge or nodeflow node reads.",
    },
    link_id: {
      type: "string",
      description: "Link id for knowledge or nodeflow link reads.",
    },
    link_kind: {
      type: "string",
      enum: ["canvas", "graph"],
      description: "Which NodeFlow link space to read when entity=link.",
    },
    map_id: {
      type: "string",
      description: "NodeFlow map id such as map:workspace or map:view:xxx.",
    },
    lens_kind: {
      type: "string",
      description: "Knowledge lens kind such as full, local, anchor, kind, or focus.",
    },
    anchor_ref: {
      type: "string",
      description: "Knowledge anchor ref such as script:raw, episode:1, or scene:1-3.",
    },
    node_kind: {
      type: "string",
      description: "Knowledge node kind filter for knowledge lens map reads.",
    },
    max_chars: {
      type: "integer",
      description: "Optional maximum characters to return for large text payloads.",
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

const clipText = (value: string, maxChars?: number) => {
  if (!maxChars || value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
};

const clipStructuredValue = (value: unknown, maxChars?: number): unknown => {
  if (typeof value === "string") return clipText(value, maxChars);
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => clipStructuredValue(item, maxChars));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 40)
        .map(([key, item]) => [key, clipStructuredValue(item, maxChars)])
    );
  }
  return value;
};

const parseArgs = (input: unknown) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("read_project_resource 需要对象参数。");
  }
  const raw = input as Record<string, unknown>;
  const layer = trim(raw.layer) as ResourceLayer;
  const entity = trim(raw.entity) as ResourceEntity;
  const view = trim(raw.view) as ResourceView;
  const itemId = trim(raw.item_id ?? raw.itemId) || undefined;
  const name = trim(raw.name) || undefined;
  const nodeId = trim(raw.node_id ?? raw.nodeId) || undefined;
  const nodeRef = trim(raw.node_ref ?? raw.nodeRef) || undefined;
  const linkId = trim(raw.link_id ?? raw.linkId) || undefined;
  const linkKind = trim(raw.link_kind ?? raw.linkKind) as "canvas" | "graph" | "";
  const mapId = trim(raw.map_id ?? raw.mapId) || undefined;
  const lensKind = trim(raw.lens_kind ?? raw.lensKind) || undefined;
  const anchorRef = trim(raw.anchor_ref ?? raw.anchorRef) || undefined;
  const nodeKind = trim(raw.node_kind ?? raw.nodeKind) || undefined;
  const maxChars = toPositiveInteger(raw.max_chars ?? raw.maxChars);

  if (!(READ_PROJECT_RESOURCE_LAYERS as readonly string[]).includes(layer)) {
    throw new Error(`read_project_resource 不支持 layer=${trim(raw.layer)}`);
  }
  if (!(READ_PROJECT_RESOURCE_ENTITIES as readonly string[]).includes(entity)) {
    throw new Error(`read_project_resource 不支持 entity=${trim(raw.entity)}`);
  }
  if (view && !(READ_PROJECT_RESOURCE_VIEWS as readonly string[]).includes(view)) {
    throw new Error(`read_project_resource 不支持 view=${trim(raw.view)}`);
  }

  if (layer === "skill" && entity !== "package") {
    throw new Error("skill 层仅支持 package。");
  }
  if (layer === "knowledge" && !["node", "link", "map"].includes(entity)) {
    throw new Error("knowledge 层仅支持 node、link、map。");
  }
  if (layer === "nodeflow" && !["node", "link", "map", "approval"].includes(entity)) {
    throw new Error("nodeflow 层仅支持 node、link、map 或 approval。");
  }

  if (layer === "skill" && entity === "package" && !itemId && !name) {
    throw new Error("读取 skill package 需要 item_id 或 name。");
  }
  if (entity === "node" && !nodeId && !nodeRef) {
    throw new Error("读取 node 需要 node_id 或 node_ref。");
  }
  if (entity === "link" && !linkId) {
    throw new Error("读取 link 需要 link_id。");
  }
  if (layer === "nodeflow" && entity === "map" && !mapId && !name) {
    throw new Error("读取 nodeflow map 需要 map_id 或 name。");
  }
  if (layer === "knowledge" && entity === "map" && (view === "anchor" || view === "timeline") && !anchorRef) {
    throw new Error(`knowledge map 的 ${view} 视图需要 anchor_ref。`);
  }
  if (layer === "knowledge" && entity === "map" && view === "local" && !nodeId && !nodeRef) {
    throw new Error("knowledge local map 需要 node_id 或 node_ref。");
  }

  return {
    layer,
    entity,
    view: (view || (entity === "node" ? "detail" : entity === "map" ? "full" : "")) as ResourceView | "",
    itemId,
    name,
    nodeId,
    nodeRef,
    linkId,
    linkKind: linkKind || undefined,
    mapId,
    lensKind,
    anchorRef,
    nodeKind,
    maxChars,
  };
};

export const readProjectResourceToolDef = {
  name: "read_project_resource",
  description:
    "Read a concrete entity from the shared project graph world. Public reads now focus on two main graph layers: Knowledge for long-term memory and NodeFlow for the visible working canvas. Skill packages remain auxiliary packages.",
  parameters: readProjectResourceParameters,
  execute: async (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const workflow = bridge.getNodeFlowSnapshot();
    const knowledge = bridge.getKnowledgeSnapshot();

    if (args.layer === "skill") {
      const skill = await resolveBuiltinSkill(args.itemId || args.name || "");
      return skill
        ? {
            layer: "skill",
            entity: "package",
            found: true,
            item_id: skill.id,
            title: skill.title,
            description: skill.description,
            version: skill.version || "",
            content: clipText(skill.guidanceMarkdown.trim(), args.maxChars),
            tags: skill.tags || [],
          }
        : {
            layer: "skill",
            entity: "package",
            found: false,
            item_id: args.itemId || null,
            name: args.name || null,
          };
    }

    if (args.layer === "knowledge") {
      if (args.entity === "node") {
        const resourceType = args.view === "identity" ? "knowledge_node_identity" : "knowledge_node_detail";
        return {
          layer: "knowledge",
          entity: "node",
          view: args.view,
          ...readKnowledgeResource(knowledge, {
            resourceType,
            nodeId: args.nodeId,
            nodeRef: args.nodeRef,
          }),
        };
      }

      if (args.entity === "link") {
        const link = knowledge.links.find((item) => item.id === args.linkId);
        const fromNode = link ? getKnowledgeNodeById(knowledge, link.fromNodeId) : null;
        const toNode = link ? getKnowledgeNodeById(knowledge, link.toNodeId) : null;
        return link
          ? {
              layer: "knowledge",
              entity: "link",
              found: true,
              item: {
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
                weight: link.weight ?? null,
              },
            }
          : {
              layer: "knowledge",
              entity: "link",
              found: false,
              link_id: args.linkId || null,
            };
      }

      const anchor = args.anchorRef ? parseKnowledgeAnchorRef(args.anchorRef) : undefined;
      if (args.anchorRef && !anchor) {
        throw new Error("knowledge anchor_ref 格式无效。请使用 script:raw、episode:1 或 scene:1-3。");
      }
      const resourceType =
        args.view === "local"
          ? "knowledge_local_map"
          : args.view === "anchor"
            ? "knowledge_anchor_map"
            : args.view === "lens"
              ? "knowledge_map_lens"
              : args.view === "lifecycle"
                ? "knowledge_lifecycle"
                : args.view === "timeline"
                  ? "knowledge_anchor_timeline"
                  : "knowledge_map";
      const lens =
        args.view === "lens"
          ? {
              id: `lens:${args.lensKind || "full"}:${args.anchorRef || args.nodeRef || args.nodeKind || "default"}`,
              kind: ((args.lensKind || "full") as "full" | "local" | "anchor" | "kind" | "focus"),
              focusNodeRefs: args.nodeRef ? [args.nodeRef] : undefined,
              anchorRefs: args.anchorRef ? [args.anchorRef] : undefined,
              nodeKinds: args.nodeKind ? [args.nodeKind] : undefined,
              depth: 1,
            }
          : undefined;
      return {
        layer: "knowledge",
        entity: "map",
        view: args.view || "full",
        ...readKnowledgeResource(knowledge, {
          resourceType,
          nodeId: args.nodeId,
          nodeRef: args.nodeRef,
          anchor,
          lens,
          depth: 1,
        }),
      };
    }

    if (args.entity === "node") {
      const rawNode = findNodeFlowNode(workflow, {
        nodeId: args.nodeId,
        nodeRef: args.nodeRef,
      });
      if (args.view === "identity") {
        if (!rawNode) {
          return {
            layer: "nodeflow",
            entity: "node",
            view: "identity",
            found: false,
            node_id: args.nodeId || null,
            node_ref: args.nodeRef || null,
          };
        }
        const status =
          typeof (rawNode.data as Record<string, unknown>)?.status === "string"
            ? String((rawNode.data as Record<string, unknown>).status)
            : null;
        const linkRelations = getNodeFlowLinkRelationsForNode(workflow, rawNode.id);
        return {
          layer: "nodeflow",
          entity: "node",
          view: "identity",
          found: true,
          item: {
            node_id: rawNode.id,
            node_ref: getNodeFlowNodeRef(rawNode),
            kind: rawNode.type,
            title: getNodeFlowNodeTitle(rawNode, workflow.nodeFlowContext),
            status,
            parent_id: rawNode.parentId || null,
            incoming_links: linkRelations.incomingLinks,
            outgoing_links: linkRelations.outgoingLinks,
          },
        };
      }

      const node = findGraphNode(workflow, {
        nodeId: args.nodeId,
        nodeRef: args.nodeRef,
      });
      const linkRelations =
        rawNode && node?.nodeId
          ? getNodeFlowLinkRelationsForNode(workflow, node.nodeId)
          : { incomingLinks: [], outgoingLinks: [] };
      return node
        ? {
            layer: "nodeflow",
            entity: "node",
            view: "detail",
            found: true,
            item: {
              node_id: node.nodeId,
              node_ref: node.ref,
              plane: node.plane,
              node_type: node.type,
              title: node.title,
              position:
                typeof node.x === "number" && typeof node.y === "number" ? { x: node.x, y: node.y } : null,
              parent_id: node.parentId || null,
              incoming_links: linkRelations.incomingLinks,
              outgoing_links: linkRelations.outgoingLinks,
              body: clipStructuredValue(node.body, args.maxChars),
              meta: clipStructuredValue(node.meta || {}, args.maxChars),
            },
          }
        : {
            layer: "nodeflow",
            entity: "node",
            view: "detail",
            found: false,
            node_id: args.nodeId || null,
            node_ref: args.nodeRef || null,
          };
    }

    if (args.entity === "link") {
      if (args.linkKind === "graph") {
        const link = findGraphLink(workflow, args.linkId!);
        return link
          ? {
              layer: "nodeflow",
              entity: "link",
              link_kind: "graph",
              found: true,
              item: {
                link_id: link.id,
                source_ref: link.sourceRef,
                target_ref: link.targetRef,
              },
            }
          : {
              layer: "nodeflow",
              entity: "link",
              link_kind: "graph",
              found: false,
              link_id: args.linkId || null,
            };
      }

      const link = findExecutionLink(workflow, args.linkId!);
      return link
        ? {
            layer: "nodeflow",
            entity: "link",
            link_kind: "canvas",
            found: true,
            item: {
              link_id: link.id,
              from_node_id: link.fromNodeId,
              to_node_id: link.toNodeId,
              from_port: link.fromPort,
              to_port: link.toPort,
              paused: link.paused,
            },
          }
        : {
            layer: "nodeflow",
            entity: "link",
            link_kind: "canvas",
            found: false,
            link_id: args.linkId || null,
          };
    }

    if (args.entity === "approval") {
      const approvals = bridge.getPendingNodeFlowExecutionApprovals();
      const approval =
        approvals.find((item) => item.id === args.linkId) ||
        approvals.find((item) => item.nodeId === args.nodeId) ||
        approvals.find((item) => item.nodeRef && item.nodeRef === args.nodeRef);
      return approval
        ? {
            layer: "nodeflow",
            entity: "approval",
            found: true,
            item: {
              approval_id: approval.id,
              node_id: approval.nodeId,
              node_ref: approval.nodeRef || null,
              node_type: approval.nodeType,
              node_title: approval.nodeTitle,
              action: approval.action,
              provider: approval.providerLabel,
              model: approval.modelLabel,
              prompt_preview: approval.promptPreview,
              input_summary: approval.inputSummary,
              created_at: approval.createdAt,
              approval_status: "pending",
            },
          }
        : {
            layer: "nodeflow",
            entity: "approval",
            found: false,
            approval_id: args.linkId || null,
            node_id: args.nodeId || null,
            node_ref: args.nodeRef || null,
          };
    }

    const maps = buildProjectGraphMaps(workflow);
    const needle = trim(args.name).toLowerCase();
    const map =
      maps.find((item) => item.mapId === args.mapId) ||
      maps.find((item) => needle && item.name.trim().toLowerCase() === needle);
    return map
      ? {
          layer: "nodeflow",
          entity: "map",
          found: true,
          item: {
            map_id: map.mapId,
            name: map.name,
            view: map.view,
            active: map.isActive,
            node_count: map.nodeCount,
            link_count: map.linkCount,
          },
        }
      : {
          layer: "nodeflow",
          entity: "map",
          found: false,
          map_id: args.mapId || null,
          name: args.name || null,
        };
  },
  summarize: (output: any) => {
    if (output?.found === false) return `未找到 ${output?.layer || "graph"} ${output?.entity || "resource"}`;
    if (output?.layer === "skill") return `读取技能包 ${output.title || output.item_id}`;
    if (output?.layer === "knowledge" && output?.entity === "node") {
      return `读取 Knowledge 节点${output?.view === "identity" ? "识别层" : "细节层"} ${output.item?.title || output.item?.ref || ""}`;
    }
    if (output?.layer === "knowledge" && output?.entity === "link") {
      return `读取 Knowledge 关系 ${output.item?.link_id || output.link_id || ""}`.trim();
    }
    if (output?.layer === "knowledge" && output?.entity === "map") {
      return `读取 Knowledge 地图 ${output?.view || "full"}`;
    }
    if (output?.layer === "nodeflow" && output?.entity === "node") {
      return `读取 NodeFlow 节点${output?.view === "identity" ? "识别层" : "细节层"} ${output.item?.title || output.item?.node_ref || output.item?.node_id || ""}`;
    }
    if (output?.layer === "nodeflow" && output?.entity === "link") {
      return `读取 NodeFlow ${output?.link_kind === "graph" ? "图引用连线" : "连线"} ${output.item?.link_id || output.link_id || ""}`.trim();
    }
    if (output?.layer === "nodeflow" && output?.entity === "approval") {
      return `读取 NodeFlow 待审批执行请求 ${output.item?.node_title || output.item?.node_ref || output.item?.node_id || ""}`;
    }
    return `读取 NodeFlow 地图 ${output.item?.name || output.map_id || ""}`.trim();
  },
};
