import type { QalamAgentBridge } from "../bridge/qalamBridge";
import {
  buildScriptResourceNodes,
  buildScriptResourceSearchText,
  findScriptResourceNode,
  type ScriptResourceNode,
} from "./scriptResources";

const DOCUMENT_KINDS = ["any", "script", "archive", "note"] as const;
type DocumentKind = (typeof DOCUMENT_KINDS)[number];

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

const normalizeKind = (value: unknown): DocumentKind => {
  const kind = trim(value).toLowerCase();
  if ((DOCUMENT_KINDS as readonly string[]).includes(kind)) return kind as DocumentKind;
  if (kind === "document") return "any";
  if (kind === "md" || kind === "markdown") return "archive";
  if (kind === "fountain") return "script";
  return "any";
};

const getDocumentKind = (node: ScriptResourceNode): Exclude<DocumentKind, "any"> => {
  if (node.type === "script.document") return "script";
  if (node.type === "script.archive") return "archive";
  return "note";
};

const isDocumentResource = (node: ScriptResourceNode) =>
  node.resourceType === "document_node" || node.resourceType === "archive_node";

const matchesKind = (node: ScriptResourceNode, kind: DocumentKind) =>
  kind === "any" || getDocumentKind(node) === kind;

const getRawNodeId = (node: ScriptResourceNode) =>
  typeof node.meta?.nodeId === "string" && node.meta.nodeId.trim() ? node.meta.nodeId : "";

const documentIdentity = (node: ScriptResourceNode) => ({
  document_id: typeof node.meta?.documentId === "string" ? node.meta.documentId : node.nodeId,
  document_ref: node.ref,
  node_id: node.nodeId,
  raw_node_id: getRawNodeId(node) || null,
  kind: getDocumentKind(node),
  title: node.title,
  resource_type: node.resourceType,
  format: typeof node.body.format === "string" ? node.body.format : null,
  locked: node.locked,
});

const findDocumentsParameters = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Optional search query. Omit or leave blank to list current documents.",
    },
    document_kind: {
      type: "string",
      enum: [...DOCUMENT_KINDS],
      description: "Optional document kind filter: script, archive, note, or any.",
    },
    max_items: {
      type: "integer",
      description: "Maximum number of documents to return.",
    },
  },
  additionalProperties: false,
} as const;

const readDocumentParameters = {
  type: "object",
  properties: {
    document_ref: {
      type: "string",
      description: "Stable document ref such as script:document:<id> or script:archive:<id>.",
    },
    document_id: {
      type: "string",
      description: "Document id without the script:document/archive prefix.",
    },
    node_id: {
      type: "string",
      description: "Resource node id such as document:<id> or archive:<id>.",
    },
    view: {
      type: "string",
      enum: ["identity", "detail", "full"],
      description: "Read view. Use identity before detail/full when locating targets.",
    },
    max_chars: {
      type: "integer",
      description: "Optional maximum characters for document content.",
    },
  },
  additionalProperties: false,
} as const;

const createDocumentParameters = {
  type: "object",
  properties: {
    document_kind: {
      type: "string",
      enum: ["script", "archive", "note"],
      description: "Document kind to create.",
    },
    title: {
      type: "string",
      description: "Document title.",
    },
    content: {
      type: "string",
      description: "Initial document content.",
    },
    node_ref: {
      type: "string",
      description: "Optional stable Flow node ref.",
    },
    x: {
      type: "number",
      description: "Optional canvas x position.",
    },
    y: {
      type: "number",
      description: "Optional canvas y position.",
    },
    parent_id: {
      type: "string",
      description: "Optional parent node id.",
    },
  },
  required: ["document_kind"],
  additionalProperties: false,
} as const;

const updateDocumentParameters = {
  type: "object",
  properties: {
    document_ref: {
      type: "string",
      description: "Stable document ref such as script:document:<id> or script:archive:<id>.",
    },
    document_id: {
      type: "string",
      description: "Document id without the script:document/archive prefix.",
    },
    node_id: {
      type: "string",
      description: "Resource node id such as document:<id> or archive:<id>.",
    },
    title: {
      type: "string",
      description: "Optional replacement title.",
    },
    content: {
      type: "string",
      description: "Optional replacement document content.",
    },
    patch: {
      type: "object",
      description: "Optional structured data patch for the backing Flow node.",
      additionalProperties: true,
    },
  },
  additionalProperties: false,
} as const;

const resolveDocumentLocator = (raw: Record<string, unknown>) => {
  const documentRef = trim(raw.document_ref ?? raw.documentRef);
  const documentId = trim(raw.document_id ?? raw.documentId);
  const nodeId = trim(raw.node_id ?? raw.nodeId);
  return {
    nodeRef: documentRef || (documentId ? `script:document:${documentId}` : undefined),
    nodeId: nodeId || (documentId ? `document:${documentId}` : undefined),
  };
};

const resolveDocumentNode = (bridge: QalamAgentBridge, input: unknown) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Document tool needs an object argument.");
  }
  const raw = input as Record<string, unknown>;
  const workflow = bridge.getNodeFlowSnapshot();
  const projectData = bridge.getProjectData();
  const locator = resolveDocumentLocator(raw);
  if (!locator.nodeId && !locator.nodeRef) {
    throw new Error("Document lookup needs document_ref, document_id, or node_id.");
  }
  const node = findScriptResourceNode(projectData, locator, workflow);
  if (!node || !isDocumentResource(node)) return null;
  return node;
};

export const findDocumentsToolDef = {
  name: "find_documents",
  description: "Find or list Flow document nodes. Prefer this before reading or updating documents when the target is unknown.",
  parameters: findDocumentsParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    const query = trim(raw.query);
    const documentKind = normalizeKind(raw.document_kind ?? raw.documentKind);
    const maxItems = Math.max(1, Math.min(50, toPositiveInteger(raw.max_items ?? raw.maxItems) || 12));
    const lowerQuery = query.toLocaleLowerCase();
    const workflow = bridge.getNodeFlowSnapshot();
    const projectData = bridge.getProjectData();
    const docs = buildScriptResourceNodes(projectData, workflow)
      .filter((node) => isDocumentResource(node) && matchesKind(node, documentKind))
      .filter((node) => {
        if (!lowerQuery) return true;
        return buildScriptResourceSearchText(node).toLocaleLowerCase().includes(lowerQuery);
      });

    return {
      target: "document",
      query: query || null,
      document_kind: documentKind,
      total: docs.length,
      items: docs.slice(0, maxItems).map((node) => ({
        ...documentIdentity(node),
        preview: typeof node.meta?.preview === "string" ? node.meta.preview : "",
      })),
    };
  },
  summarize: (output: any) => `Found ${output?.items?.length || 0}/${output?.total || 0} document(s)`,
};

export const readDocumentToolDef = {
  name: "read_document",
  description: "Read a concrete Flow document by document_ref, document_id, or node_id.",
  parameters: readDocumentParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    const raw = input as Record<string, unknown>;
    const node = resolveDocumentNode(bridge, input);
    const view = trim(raw?.view).toLowerCase() || "detail";
    const maxChars = toPositiveInteger(raw?.max_chars ?? raw?.maxChars) || 2400;
    if (!node) {
      return {
        target: "document",
        found: false,
        document_ref: trim(raw?.document_ref ?? raw?.documentRef) || null,
        document_id: trim(raw?.document_id ?? raw?.documentId) || null,
        node_id: trim(raw?.node_id ?? raw?.nodeId) || null,
      };
    }
    const identity = documentIdentity(node);
    if (view === "identity") {
      return {
        target: "document",
        found: true,
        view,
        item: identity,
      };
    }
    const content = typeof node.body.content === "string" ? node.body.content : "";
    return {
      target: "document",
      found: true,
      view,
      item: {
        ...identity,
        body: {
          ...node.body,
          content: view === "full" ? content : clipText(content, maxChars),
        },
        meta: node.meta || {},
      },
    };
  },
  summarize: (output: any) => output?.found ? `Read document ${output?.item?.title || output?.item?.document_ref}` : "Document not found",
};

export const createDocumentToolDef = {
  name: "create_document",
  description: "Create a script, archive, or note document node in Flow.",
  parameters: createDocumentParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("create_document needs an object argument.");
    }
    const raw = input as Record<string, unknown>;
    const kind = normalizeKind(raw.document_kind ?? raw.documentKind);
    if (kind === "any") throw new Error("create_document needs document_kind=script, archive, or note.");
    const content = typeof raw.content === "string" ? raw.content : "";
    if (kind === "note" && !content.trim()) {
      throw new Error("create_document document_kind=note needs non-empty content.");
    }
    const nodeType = kind === "script" ? "scriptPage" : kind === "archive" ? "mdText" : "text";
    const title = trim(raw.title) || (kind === "script" ? "剧本文档" : kind === "archive" ? "档案文档" : "文本节点");
    const created = bridge.createNodeFlowNode({
      expectedRevision: bridge.getNodeFlowSnapshot().revision,
      type: nodeType,
      nodeRef: trim(raw.node_ref ?? raw.nodeRef) || undefined,
      title,
      text: content,
      content,
      documentId: kind === "script" || kind === "archive" ? `${kind}-${Date.now().toString(36)}` : undefined,
      x: typeof raw.x === "number" ? raw.x : undefined,
      y: typeof raw.y === "number" ? raw.y : undefined,
      parentId: trim(raw.parent_id ?? raw.parentId) || undefined,
    });
    return {
      target: "document",
      action: "create",
      item: {
        document_kind: kind,
        title: created.title,
        raw_node_id: created.nodeId,
        node_ref: created.nodeRef || null,
        node_type: created.nodeType,
      },
    };
  },
  summarize: (output: any) => `Created ${output?.item?.document_kind || "document"} ${output?.item?.title || ""}`.trim(),
};

export const updateDocumentToolDef = {
  name: "update_document",
  description: "Update an existing Flow document node by document_ref, document_id, or node_id.",
  parameters: updateDocumentParameters,
  execute: (input: unknown, bridge: QalamAgentBridge) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("update_document needs an object argument.");
    }
    const raw = input as Record<string, unknown>;
    const node = resolveDocumentNode(bridge, raw);
    if (!node) {
      return {
        target: "document",
        action: "update",
        updated: false,
        error: "Document not found.",
      };
    }
    const rawNodeId = getRawNodeId(node);
    if (!rawNodeId) throw new Error("update_document could not resolve the backing Flow node id.");
    const patch =
      raw.patch && typeof raw.patch === "object" && !Array.isArray(raw.patch)
        ? { ...(raw.patch as Record<string, unknown>) }
        : {};
    const title = trim(raw.title);
    const hasContent = typeof raw.content === "string";
    if (title) patch.title = title;
    if (hasContent) {
      patch.text = raw.content;
      patch.content = raw.content;
      patch.preview = String(raw.content || "").replace(/\s+/g, " ").slice(0, 180);
      patch.updatedAt = Date.now();
    }
    if (!Object.keys(patch).length) throw new Error("update_document needs title, content, or patch.");
    const updated = bridge.updateNodeFlowNode({
      expectedRevision: bridge.getNodeFlowSnapshot().revision,
      nodeId: rawNodeId,
      patch,
    });
    return {
      target: "document",
      action: "update",
      updated: true,
      item: {
        ...documentIdentity(node),
        raw_node_id: updated.nodeId,
        node_ref: updated.nodeRef || null,
        title: updated.title,
        patch: updated.patch,
      },
    };
  },
  summarize: (output: any) => output?.updated ? `Updated document ${output?.item?.title || output?.item?.document_ref}` : "Document not updated",
};
