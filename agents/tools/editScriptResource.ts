import type { ProjectData, ScriptCanvasState } from "../../types";
import type { QalamAgentBridge } from "../bridge/qalamBridge";
import { ensureScriptCanvas, findScriptResourceNode } from "./scriptResources";

export const EDIT_SCRIPT_ENTITIES = ["archive", "space_block"] as const;
export const EDIT_SCRIPT_ACTIONS = ["create", "update"] as const;
export const EDIT_SCRIPT_TARGETS = ["script:archive", "script:space_block"] as const;

type EditScriptEntity = (typeof EDIT_SCRIPT_ENTITIES)[number];
type EditScriptAction = (typeof EDIT_SCRIPT_ACTIONS)[number];

const editScriptResourceParameters = {
  type: "object",
  properties: {
    entity: {
      type: "string",
      enum: [...EDIT_SCRIPT_ENTITIES],
      description: "Which Script resource entity to edit: archive document or space axis block.",
    },
    action: {
      type: "string",
      enum: [...EDIT_SCRIPT_ACTIONS],
      description: "Atomic Script edit action. Archive supports create/update. Space block supports update.",
    },
    node_id: {
      type: "string",
      description: "Existing script resource node id such as archive:abc or space:space-characters.",
    },
    node_ref: {
      type: "string",
      description: "Existing script resource ref such as script:archive:abc or script:space:space-characters.",
    },
    document_id: {
      type: "string",
      description: "Archive document id for update.",
    },
    block_id: {
      type: "string",
      description: "Space axis block id for update.",
    },
    title: {
      type: "string",
      description: "Archive or space block title.",
    },
    content: {
      type: "string",
      description: "Markdown content for the archive document or space block.",
    },
    x: {
      type: "number",
      description: "Optional x position for a newly created archive document.",
    },
    y: {
      type: "number",
      description: "Optional y position for a newly created archive document.",
    },
  },
  additionalProperties: false,
  required: ["entity", "action"],
} as const;

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeCanvas = (projectData: ProjectData): ScriptCanvasState => ensureScriptCanvas(projectData.scriptCanvas);

type ParsedArgs =
  | {
      entity: "archive";
      action: "create";
      title: string;
      content: string;
      x?: number;
      y?: number;
    }
  | {
      entity: "archive";
      action: "update";
      nodeId?: string;
      nodeRef?: string;
      documentId?: string;
      title?: string;
      content?: string;
    }
  | {
      entity: "space_block";
      action: "update";
      nodeId?: string;
      nodeRef?: string;
      blockId?: string;
      title?: string;
      content?: string;
    };

const parseArgs = (input: unknown): ParsedArgs => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("edit_script_resource 需要对象参数。");
  }
  const raw = input as Record<string, unknown>;
  const entity = trim(raw.entity) as EditScriptEntity;
  const action = trim(raw.action) as EditScriptAction;
  if (!(EDIT_SCRIPT_ENTITIES as readonly string[]).includes(entity)) {
    throw new Error(`edit_script_resource 不支持 entity=${trim(raw.entity)}`);
  }
  if (!(EDIT_SCRIPT_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`edit_script_resource 不支持 action=${trim(raw.action)}`);
  }

  const nodeId = trim(raw.node_id ?? raw.nodeId) || undefined;
  const nodeRef = trim(raw.node_ref ?? raw.nodeRef) || undefined;
  const documentId = trim(raw.document_id ?? raw.documentId) || undefined;
  const blockId = trim(raw.block_id ?? raw.blockId) || undefined;
  const title = trim(raw.title) || undefined;
  const rawContent = typeof raw.content === "string" ? raw.content : undefined;
  const x = typeof raw.x === "number" ? raw.x : undefined;
  const y = typeof raw.y === "number" ? raw.y : undefined;

  if (entity === "archive" && action === "create") {
    return {
      entity,
      action,
      title: title || "档案文档",
      content: rawContent || "",
      x,
      y,
    };
  }

  if (entity === "archive" && action === "update") {
    if (!nodeId && !nodeRef && !documentId) {
      throw new Error("更新 archive 需要 node_id、node_ref 或 document_id。");
    }
    if (title == null && rawContent == null) {
      throw new Error("更新 archive 至少需要 title 或 content。");
    }
    return { entity, action, nodeId, nodeRef, documentId, title, content: rawContent };
  }

  if (entity === "space_block" && action === "create") {
    throw new Error("space_block 当前只支持 update；新建空间轴区块由 Script UI 管理。");
  }

  if (!nodeId && !nodeRef && !blockId) {
    throw new Error("更新 space_block 需要 node_id、node_ref 或 block_id。");
  }
  if (title == null && rawContent == null) {
    throw new Error("更新 space_block 至少需要 title 或 content。");
  }
  return { entity: "space_block", action: "update", nodeId, nodeRef, blockId, title, content: rawContent };
};

const archiveIdFromArgs = (projectData: ProjectData, args: Extract<ParsedArgs, { entity: "archive"; action: "update" }>) => {
  if (args.documentId) return args.documentId;
  const node = findScriptResourceNode(projectData, { nodeId: args.nodeId, nodeRef: args.nodeRef });
  const documentId = typeof node?.meta?.documentId === "string" ? node.meta.documentId : "";
  return documentId || "";
};

const spaceBlockIdFromArgs = (
  projectData: ProjectData,
  args: Extract<ParsedArgs, { entity: "space_block"; action: "update" }>
) => {
  if (args.blockId) return args.blockId;
  const node = findScriptResourceNode(projectData, { nodeId: args.nodeId, nodeRef: args.nodeRef });
  const blockId = typeof node?.meta?.blockId === "string" ? node.meta.blockId : "";
  return blockId || "";
};

export const editScriptResourceToolDef = {
  name: "edit_script_resource",
  description:
    "Edit the Script foundation plane. Use it for durable project archive documents and existing space-axis blocks. This writes to ProjectData.scriptCanvas.",
  parameters: editScriptResourceParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);

    if (args.entity === "archive" && args.action === "create") {
      const id = createId("archive");
      const createdAt = Date.now();
      const node = {
        id,
        title: args.title,
        content: args.content,
        position: {
          x: typeof args.x === "number" ? args.x : 160,
          y: typeof args.y === "number" ? args.y : 180,
        },
        createdAt,
      };
      bridge.updateProjectData((prev) => {
        const canvas = normalizeCanvas(prev);
        return {
          ...prev,
          scriptCanvas: {
            ...canvas,
            textNodes: [...(canvas.textNodes || []), node],
          },
        };
      });
      return {
        layer: "script",
        entity: "archive",
        target: "script:archive",
        action: "create",
        updated: true,
        artifact: {
          kind: "node",
          target: "script:archive",
          id: `archive:${id}`,
          ref: `script:archive:${id}`,
          title: node.title,
        },
        item: {
          node_id: `archive:${id}`,
          node_ref: `script:archive:${id}`,
          document_id: id,
          title: node.title,
        },
      };
    }

    if (args.entity === "archive" && args.action === "update") {
      const current = bridge.getProjectData();
      const documentId = archiveIdFromArgs(current, args);
      if (!documentId) throw new Error("未找到要更新的 archive 文档。");
      let updatedTitle = "";
      bridge.updateProjectData((prev) => {
        const canvas = normalizeCanvas(prev);
        const textNodes = (canvas.textNodes || []).map((node) => {
          if (node.id !== documentId) return node;
          updatedTitle = args.title ?? node.title;
          return {
            ...node,
            title: args.title ?? node.title,
            content: args.content ?? node.content,
          };
        });
        if (!textNodes.some((node) => node.id === documentId)) {
          throw new Error("未找到要更新的 archive 文档。");
        }
        return {
          ...prev,
          scriptCanvas: {
            ...canvas,
            textNodes,
          },
        };
      });
      return {
        layer: "script",
        entity: "archive",
        target: "script:archive",
        action: "update",
        updated: true,
        artifact: {
          kind: "node",
          target: "script:archive",
          id: `archive:${documentId}`,
          ref: `script:archive:${documentId}`,
          title: updatedTitle || "档案文档",
        },
        item: {
          node_id: `archive:${documentId}`,
          node_ref: `script:archive:${documentId}`,
          document_id: documentId,
          title: updatedTitle || "档案文档",
        },
      };
    }

    const current = bridge.getProjectData();
    const blockId = spaceBlockIdFromArgs(current, args);
    if (!blockId) throw new Error("未找到要更新的 space_block。");
    let updatedTitle = "";
    bridge.updateProjectData((prev) => {
      const canvas = normalizeCanvas(prev);
      const timeline = canvas.timeline;
      if (!timeline) throw new Error("当前项目没有 Script foundation timeline。");
      const spaceBlocks = (timeline.spaceBlocks || []).map((block) => {
        if (block.id !== blockId) return block;
        updatedTitle = args.title ?? block.title;
        return {
          ...block,
          title: args.title ?? block.title,
          content: args.content ?? block.content,
        };
      });
      if (!spaceBlocks.some((block) => block.id === blockId)) {
        throw new Error("未找到要更新的 space_block。");
      }
      return {
        ...prev,
        scriptCanvas: {
          ...canvas,
          timeline: {
            ...timeline,
            spaceBlocks,
          },
        },
      };
    });
    return {
      layer: "script",
      entity: "space_block",
      target: "script:space_block",
      action: "update",
      updated: true,
      artifact: {
        kind: "node",
        target: "script:space_block",
        id: `space:${blockId}`,
        ref: `script:space:${blockId}`,
        title: updatedTitle || "空间轴区块",
      },
      item: {
        node_id: `space:${blockId}`,
        node_ref: `script:space:${blockId}`,
        block_id: blockId,
        title: updatedTitle || "空间轴区块",
      },
    };
  },
  summarize: (output: any) => {
    if (output?.entity === "space_block") return `更新 Script 空间轴区块 ${output.item?.title || ""}`.trim();
    if (output?.action === "create") return `创建 Script 档案 ${output.item?.title || ""}`.trim();
    return `更新 Script 档案 ${output?.item?.title || ""}`.trim();
  },
};
