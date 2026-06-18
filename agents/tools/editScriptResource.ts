import type { FlowState, ProjectData } from "../../types";
import type { NodeFlowNode } from "../../node-workspace/types";
import type { QalamAgentBridge } from "../bridge/qalamBridge";
import { ensureFlow, findScriptResourceNode } from "./scriptResources";

export const EDIT_SCRIPT_ENTITIES = ["archive", "folder"] as const;
export const EDIT_SCRIPT_ACTIONS = ["create", "update"] as const;
export const EDIT_SCRIPT_TARGETS = ["script:archive", "script:folder"] as const;

type EditScriptEntity = (typeof EDIT_SCRIPT_ENTITIES)[number];
type EditScriptAction = (typeof EDIT_SCRIPT_ACTIONS)[number];

const editScriptResourceParameters = {
  type: "object",
  properties: {
    entity: {
      type: "string",
      enum: [...EDIT_SCRIPT_ENTITIES],
      description: "Resource entity to edit: archive markdown document or folder node.",
    },
    action: {
      type: "string",
      enum: [...EDIT_SCRIPT_ACTIONS],
      description: "Atomic edit action.",
    },
    node_id: {
      type: "string",
      description: "Existing resource node id, such as archive:abc or folder:node-id.",
    },
    node_ref: {
      type: "string",
      description: "Existing resource ref, such as script:archive:abc or script:folder:node-id.",
    },
    document_id: {
      type: "string",
      description: "Archive document id for update.",
    },
    title: {
      type: "string",
      description: "Archive or folder title.",
    },
    content: {
      type: "string",
      description: "Markdown content for an archive document.",
    },
    x: {
      type: "number",
      description: "Optional x position for a newly created node.",
    },
    y: {
      type: "number",
      description: "Optional y position for a newly created node.",
    },
  },
  additionalProperties: false,
  required: ["entity", "action"],
} as const;

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeCanvas = (projectData: ProjectData): FlowState => ensureFlow(projectData.flow);

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
      entity: "folder";
      action: "create";
      title: string;
      x?: number;
      y?: number;
    }
  | {
      entity: "folder";
      action: "update";
      nodeId?: string;
      nodeRef?: string;
      title: string;
    };

const parseArgs = (input: unknown): ParsedArgs => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("edit_script_resource expects an object argument.");
  }
  const raw = input as Record<string, unknown>;
  const entity = trim(raw.entity) as EditScriptEntity;
  const action = trim(raw.action) as EditScriptAction;
  if (!(EDIT_SCRIPT_ENTITIES as readonly string[]).includes(entity)) {
    throw new Error(`edit_script_resource does not support entity=${trim(raw.entity)}`);
  }
  if (!(EDIT_SCRIPT_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`edit_script_resource does not support action=${trim(raw.action)}`);
  }

  const nodeId = trim(raw.node_id ?? raw.nodeId) || undefined;
  const nodeRef = trim(raw.node_ref ?? raw.nodeRef) || undefined;
  const documentId = trim(raw.document_id ?? raw.documentId) || undefined;
  const title = trim(raw.title) || undefined;
  const rawContent = typeof raw.content === "string" ? raw.content : undefined;
  const x = typeof raw.x === "number" ? raw.x : undefined;
  const y = typeof raw.y === "number" ? raw.y : undefined;

  if (entity === "archive" && action === "create") {
    return {
      entity,
      action,
      title: title || "Archive document",
      content: rawContent || "",
      x,
      y,
    };
  }

  if (entity === "archive" && action === "update") {
    if (!nodeId && !nodeRef && !documentId) {
      throw new Error("Updating an archive requires node_id, node_ref, or document_id.");
    }
    if (title == null && rawContent == null) {
      throw new Error("Updating an archive requires title or content.");
    }
    return { entity, action, nodeId, nodeRef, documentId, title, content: rawContent };
  }

  if (entity === "folder" && action === "create") {
    return {
      entity,
      action,
      title: title || "Folder",
      x,
      y,
    };
  }

  if (entity === "folder" && action === "update") {
    if (!nodeId && !nodeRef) {
      throw new Error("Updating a folder requires node_id or node_ref.");
    }
    if (!title) {
      throw new Error("Updating a folder requires title.");
    }
    return { entity, action, nodeId, nodeRef, title };
  }

  throw new Error(`Unsupported edit_script_resource operation: ${entity}/${action}`);
};

const archiveIdFromArgs = (projectData: ProjectData, args: Extract<ParsedArgs, { entity: "archive"; action: "update" }>) => {
  if (args.documentId) return args.documentId;
  const node = findScriptResourceNode(projectData, { nodeId: args.nodeId, nodeRef: args.nodeRef });
  const documentId = typeof node?.meta?.documentId === "string" ? node.meta.documentId : "";
  return documentId || "";
};

const folderNodeIdFromArgs = (projectData: ProjectData, args: Extract<ParsedArgs, { entity: "folder"; action: "update" }>) => {
  const node = findScriptResourceNode(projectData, { nodeId: args.nodeId, nodeRef: args.nodeRef });
  const nodeId = typeof node?.meta?.nodeId === "string" ? node.meta.nodeId : "";
  if (nodeId) return nodeId;
  if (args.nodeId?.startsWith("folder:")) return args.nodeId.slice("folder:".length);
  if (args.nodeRef?.startsWith("script:folder:")) return args.nodeRef.slice("script:folder:".length);
  return args.nodeId || "";
};

const compactPreview = (content: string) => content.replace(/\s+/g, " ").trim().slice(0, 180);

const createArchiveNode = (id: string, title: string, content: string, x?: number, y?: number): NodeFlowNode => ({
  id: `md-${id}`,
  type: "mdText",
  position: {
    x: typeof x === "number" ? x : 160,
    y: typeof y === "number" ? y : 180,
  },
  style: { width: 320, height: 252 },
  data: {
    documentId: id,
    title,
    text: content,
    content,
    preview: compactPreview(content),
    documentKind: "archive",
    format: "markdown",
    createdAt: Date.now(),
  },
});

const createFolderNode = (id: string, title: string, x?: number, y?: number): NodeFlowNode => ({
  id,
  type: "folder",
  position: {
    x: typeof x === "number" ? x : 80,
    y: typeof y === "number" ? y : 120,
  },
  style: { width: 230, height: 128 },
  data: {
    title,
  },
});

export const editScriptResourceToolDef = {
  name: "edit_script_resource",
  description:
    "Edit ordinary Flow resources exposed through the script map. Archives are markdown nodes; folders are ordinary folder nodes.",
  parameters: editScriptResourceParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const args = parseArgs(input);

    if (args.entity === "archive" && args.action === "create") {
      const id = createId("archive");
      const node = createArchiveNode(id, args.title, args.content, args.x, args.y);
      bridge.updateProjectData((prev) => {
        const canvas = normalizeCanvas(prev);
        return {
          ...prev,
          flow: {
            ...canvas,
            flowNodes: [...(canvas.flowNodes || []), node],
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
          title: args.title,
        },
        item: {
          node_id: `archive:${id}`,
          node_ref: `script:archive:${id}`,
          document_id: id,
          title: args.title,
        },
      };
    }

    if (args.entity === "archive" && args.action === "update") {
      const current = bridge.getProjectData();
      const documentId = archiveIdFromArgs(current, args);
      if (!documentId) throw new Error("Archive document not found.");
      let updatedTitle = "";
      bridge.updateProjectData((prev) => {
        const canvas = normalizeCanvas(prev);
        const flowNodes = (canvas.flowNodes || []).map((node) => {
          const data = node.data as { documentId?: string; title?: string; text?: string; content?: string };
          const nodeDocumentId = typeof data.documentId === "string" ? data.documentId : node.id.replace(/^md-/, "");
          if (node.type !== "mdText" || nodeDocumentId !== documentId) return node;
          const content = args.content ?? data.content ?? data.text ?? "";
          updatedTitle = args.title ?? data.title ?? "Archive document";
          return {
            ...node,
            data: {
              ...data,
              title: updatedTitle,
              text: content,
              content,
              preview: compactPreview(content),
            },
          };
        });
        const updatedFlowNode = flowNodes.some((node) => {
          const data = node.data as { documentId?: string };
          return node.type === "mdText" && (data.documentId === documentId || node.id === `md-${documentId}`);
        });
        if (!updatedFlowNode) {
          throw new Error("Archive document not found.");
        }
        return {
          ...prev,
          flow: {
            ...canvas,
            flowNodes,
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
          title: updatedTitle || "Archive document",
        },
        item: {
          node_id: `archive:${documentId}`,
          node_ref: `script:archive:${documentId}`,
          document_id: documentId,
          title: updatedTitle || "Archive document",
        },
      };
    }

    if (args.entity === "folder" && args.action === "create") {
      const id = createId("folder");
      const node = createFolderNode(id, args.title, args.x, args.y);
      bridge.updateProjectData((prev) => {
        const canvas = normalizeCanvas(prev);
        return {
          ...prev,
          flow: {
            ...canvas,
            flowNodes: [...(canvas.flowNodes || []), node],
          },
        };
      });
      return {
        layer: "script",
        entity: "folder",
        target: "script:folder",
        action: "create",
        updated: true,
        artifact: {
          kind: "node",
          target: "script:folder",
          id: `folder:${id}`,
          ref: `script:folder:${id}`,
          title: args.title,
        },
        item: {
          node_id: `folder:${id}`,
          node_ref: `script:folder:${id}`,
          folder_id: id,
          title: args.title,
        },
      };
    }

    const current = bridge.getProjectData();
    const folderNodeId = folderNodeIdFromArgs(current, args);
    if (!folderNodeId) throw new Error("Folder node not found.");
    let updatedTitle = args.title;
    bridge.updateProjectData((prev) => {
      const canvas = normalizeCanvas(prev);
      let found = false;
      const flowNodes = (canvas.flowNodes || []).map((node) => {
        if (node.type !== "folder" || node.id !== folderNodeId) return node;
        found = true;
        return {
          ...node,
          data: {
            ...node.data,
            title: args.title,
          },
        };
      });
      if (!found) throw new Error("Folder node not found.");
      return {
        ...prev,
        flow: {
          ...canvas,
          flowNodes,
        },
      };
    });
    return {
      layer: "script",
      entity: "folder",
      target: "script:folder",
      action: "update",
      updated: true,
      artifact: {
        kind: "node",
        target: "script:folder",
        id: `folder:${folderNodeId}`,
        ref: `script:folder:${folderNodeId}`,
        title: updatedTitle,
      },
      item: {
        node_id: `folder:${folderNodeId}`,
        node_ref: `script:folder:${folderNodeId}`,
        folder_id: folderNodeId,
        title: updatedTitle,
      },
    };
  },
  summarize: (output: any) => {
    if (output?.entity === "folder") return `Update folder ${output.item?.title || ""}`.trim();
    if (output?.action === "create") return `Create archive ${output.item?.title || ""}`.trim();
    return `Update archive ${output?.item?.title || ""}`.trim();
  },
};
