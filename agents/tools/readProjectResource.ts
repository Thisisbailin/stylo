import type { QalamAgentBridge } from "../bridge/qalamBridge";
import {
  buildScriptResourceLinks,
  buildScriptResourceMaps,
  buildScriptResourceNodes,
  findScriptResourceLink,
  findScriptResourceMap,
  findScriptResourceNode,
} from "./scriptResources";
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

export const READ_PROJECT_RESOURCE_LAYERS = ["script", "nodeflow"] as const;
export const READ_PROJECT_RESOURCE_ENTITIES = ["node", "link", "map", "approval"] as const;
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
  "script:node",
  "script:link",
  "script:map",
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
      description: "Which project layer to read from: script or nodeflow.",
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
    name: {
      type: "string",
      description: "Name for nodeflow map lookup.",
    },
    node_id: {
      type: "string",
      description: "Concrete node id for script or nodeflow node reads.",
    },
    node_ref: {
      type: "string",
      description: "Stable node ref for script or nodeflow node reads.",
    },
    link_id: {
      type: "string",
      description: "Link id for script or nodeflow link reads.",
    },
    link_role: {
      type: "string",
      enum: ["connection", "reference"],
      description: "Which NodeFlow link role to read when entity=link.",
    },
    map_id: {
      type: "string",
      description: "NodeFlow map id such as map:workspace or map:view:xxx.",
    },
    lens_kind: {
      type: "string",
      description: "Reserved map lens kind.",
    },
    anchor_ref: {
      type: "string",
      description: "Reserved anchor ref.",
    },
    node_kind: {
      type: "string",
      description: "Optional script or nodeflow node kind filter.",
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
  const name = trim(raw.name) || undefined;
  const nodeId = trim(raw.node_id ?? raw.nodeId) || undefined;
  const nodeRef = trim(raw.node_ref ?? raw.nodeRef) || undefined;
  const linkId = trim(raw.link_id ?? raw.linkId) || undefined;
  const linkRole = trim(raw.link_role ?? raw.linkRole) as "connection" | "reference" | "";
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

  if (layer === "script" && !["node", "link", "map"].includes(entity)) {
    throw new Error("script 层仅支持 node、link、map。");
  }
  if (layer === "nodeflow" && !["node", "link", "map", "approval"].includes(entity)) {
    throw new Error("nodeflow 层仅支持 node、link、map 或 approval。");
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
  return {
    layer,
    entity,
    view: (view || (entity === "node" ? "detail" : entity === "map" ? "full" : "")) as ResourceView | "",
    name,
    nodeId,
    nodeRef,
    linkId,
    linkRole: linkRole || undefined,
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
    "Read a concrete entity from the shared project world. Public reads focus on Script source/foundation/archive resources and NodeFlow canvas resources.",
  parameters: readProjectResourceParameters,
  execute: async (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const workflow = bridge.getNodeFlowSnapshot();
    const projectData = bridge.getProjectData();

    if (args.layer === "script") {
      if (args.entity === "node") {
        const item = findScriptResourceNode(projectData, { nodeId: args.nodeId, nodeRef: args.nodeRef });
        if (!item) {
          return {
            layer: "script",
            entity: "node",
            target: "script:node",
            view: args.view || "detail",
            found: false,
            node_id: args.nodeId || null,
            node_ref: args.nodeRef || null,
          };
        }
        const identity = {
          node_id: item.nodeId,
          node_ref: item.ref,
          kind: item.type,
          title: item.title,
          resource_type: item.resourceType,
          locked: item.locked,
          source_ref: item.sourceRef || null,
        };
        return {
          layer: "script",
          entity: "node",
          target: "script:node",
          view: args.view,
          found: true,
          artifact: {
            kind: "node",
            target: "script:node",
            id: item.nodeId,
            ref: item.ref,
            title: item.title,
            node_kind: item.type,
          },
          item:
            args.view === "identity"
              ? identity
              : {
                  ...identity,
                  body: clipStructuredValue(item.body, args.maxChars),
                  meta: item.meta || {},
                  x: item.x ?? null,
                  y: item.y ?? null,
                },
        };
      }

      if (args.entity === "link") {
        const link = args.linkId ? findScriptResourceLink(projectData, args.linkId) : null;
        return link
          ? {
              layer: "script",
              entity: "link",
              target: "script:link",
              found: true,
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
              item: {
                link_id: link.id,
                from_node_ref: link.fromRef,
                from_title: link.fromTitle || null,
                to_node_ref: link.toRef,
                to_title: link.toTitle || null,
                link_type: link.type,
              },
            }
          : {
              layer: "script",
              entity: "link",
              target: "script:link",
              found: false,
              link_id: args.linkId || null,
            };
      }

      const map = findScriptResourceMap(projectData, { mapId: args.mapId, name: args.name });
      const maps = buildScriptResourceMaps(projectData);
      const nodes = buildScriptResourceNodes(projectData);
      const links = buildScriptResourceLinks(projectData);
      const effectiveMap = map || maps[0] || null;
      const visibleNodes =
        effectiveMap?.view === "source"
          ? nodes.filter((node) => node.resourceType === "source_node")
          : effectiveMap?.view === "archives"
            ? nodes.filter((node) => node.resourceType === "archive_node")
            : effectiveMap?.view === "timeline"
              ? nodes.filter((node) => node.resourceType === "timeline_block" || node.resourceType === "script_index")
              : nodes.filter((node) => node.resourceType !== "source_node");
      return {
        layer: "script",
        entity: "map",
        target: "script:map",
        view: args.view || "full",
        found: Boolean(effectiveMap),
        artifact: effectiveMap
          ? {
              kind: "map",
              target: "script:map",
              id: effectiveMap.mapId,
              title: effectiveMap.name,
            }
          : undefined,
        item: effectiveMap
          ? {
              ...effectiveMap,
              nodes: visibleNodes.map((node) => ({
                node_id: node.nodeId,
                node_ref: node.ref,
                kind: node.type,
                title: node.title,
                resource_type: node.resourceType,
              })),
              links: links.map((link) => ({
                link_id: link.id,
                from_node_ref: link.fromRef,
                to_node_ref: link.toRef,
                link_type: link.type,
              })),
            }
          : null,
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
            target: "nodeflow:node",
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
          target: "nodeflow:node",
          view: "identity",
          found: true,
          artifact: {
            kind: "node",
            target: "nodeflow:node",
            id: rawNode.id,
            ref: getNodeFlowNodeRef(rawNode),
            title: getNodeFlowNodeTitle(rawNode, workflow.nodeFlowContext),
            node_kind: rawNode.type,
          },
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
            target: "nodeflow:node",
            view: "detail",
            found: true,
            artifact: {
              kind: "node",
              target: "nodeflow:node",
              id: node.nodeId,
              ref: node.ref,
              title: node.title,
              node_kind: node.type,
            },
            item: {
              node_id: node.nodeId,
              node_ref: node.ref,
              kind: node.type,
              title: node.title,
              position:
                typeof node.x === "number" && typeof node.y === "number" ? { x: node.x, y: node.y } : null,
              parent_id: node.parentId || null,
              incoming_links: linkRelations.incomingLinks,
              outgoing_links: linkRelations.outgoingLinks,
              body: clipStructuredValue(node.body, args.maxChars),
              meta: clipStructuredValue({ ...(node.meta || {}), plane: node.plane }, args.maxChars),
            },
          }
        : {
            layer: "nodeflow",
            entity: "node",
            target: "nodeflow:node",
            view: "detail",
            found: false,
            node_id: args.nodeId || null,
            node_ref: args.nodeRef || null,
          };
    }

    if (args.entity === "link") {
      if (args.linkRole === "reference") {
        const link = findGraphLink(workflow, args.linkId!);
        return link
          ? {
              layer: "nodeflow",
              entity: "link",
              target: "nodeflow:link",
              role: "reference",
              found: true,
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
              item: {
                link_id: link.id,
                role: "reference",
                source_ref: link.sourceRef,
                target_ref: link.targetRef,
              },
            }
          : {
              layer: "nodeflow",
              entity: "link",
              target: "nodeflow:link",
              role: "reference",
              found: false,
              link_id: args.linkId || null,
            };
      }

      const link = findExecutionLink(workflow, args.linkId!);
      return link
        ? {
            layer: "nodeflow",
            entity: "link",
            target: "nodeflow:link",
            role: "connection",
            found: true,
            artifact: {
              kind: "link",
              target: "nodeflow:link",
              id: link.id,
              title: "connection",
              source: {
                node_id: link.fromNodeId,
                handle: link.fromPort,
              },
              destination: {
                node_id: link.toNodeId,
                handle: link.toPort,
              },
            },
            item: {
              link_id: link.id,
              role: "connection",
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
            target: "nodeflow:link",
            role: "connection",
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
            target: "nodeflow:approval",
            found: true,
            artifact: {
              kind: "approval",
              target: "nodeflow:approval",
              id: approval.id,
              title: approval.nodeTitle,
            },
            item: {
              approval_id: approval.id,
              node_id: approval.nodeId,
              node_ref: approval.nodeRef || null,
              node_kind: approval.nodeType,
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
            target: "nodeflow:approval",
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
          target: "nodeflow:map",
          found: true,
          artifact: {
            kind: "map",
            target: "nodeflow:map",
            id: map.mapId,
            title: map.name,
          },
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
          target: "nodeflow:map",
          found: false,
          map_id: args.mapId || null,
          name: args.name || null,
        };
  },
  summarize: (output: any) => {
    if (output?.found === false) return `未找到 ${output?.layer || "graph"} ${output?.entity || "resource"}`;
    if (output?.layer === "script" && output?.entity === "node") {
      return `读取 Script 资源${output?.view === "identity" ? "识别层" : "细节层"} ${output.item?.title || output.item?.node_ref || ""}`;
    }
    if (output?.layer === "script" && output?.entity === "link") {
      return `读取 Script 关系 ${output.item?.link_id || output.link_id || ""}`.trim();
    }
    if (output?.layer === "script" && output?.entity === "map") {
      return `读取 Script 地图 ${output.item?.name || output?.view || "foundation"}`;
    }
    if (output?.layer === "nodeflow" && output?.entity === "node") {
      return `读取 NodeFlow 节点${output?.view === "identity" ? "识别层" : "细节层"} ${output.item?.title || output.item?.node_ref || output.item?.node_id || ""}`;
    }
    if (output?.layer === "nodeflow" && output?.entity === "link") {
      return `读取 NodeFlow ${output?.role === "reference" ? "引用关系" : "连接关系"} ${output.item?.link_id || output.link_id || ""}`.trim();
    }
    if (output?.layer === "nodeflow" && output?.entity === "approval") {
      return `读取 NodeFlow 待审批执行请求 ${output.item?.node_title || output.item?.node_ref || output.item?.node_id || ""}`;
    }
    return `读取 NodeFlow 地图 ${output.item?.name || output.map_id || ""}`.trim();
  },
};
