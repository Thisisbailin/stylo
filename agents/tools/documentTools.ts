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

const splitLines = (value: string) => value.split(/\r\n|\n|\r/);

const documentStats = (content: string) => ({
  content_chars: content.length,
  line_count: content ? splitLines(content).length : 0,
});

const normalizeOperation = (value: unknown) => {
  const operation = trim(value).toLowerCase();
  if (["replace", "append", "prepend", "replace_range"].includes(operation)) return operation;
  return "replace";
};

const buildLineSlice = (content: string, raw: Record<string, unknown>, maxChars: number) => {
  const lines = splitLines(content);
  const startLine = Math.max(1, toPositiveInteger(raw.start_line ?? raw.startLine) || 1);
  const lineCount = Math.max(1, Math.min(200, toPositiveInteger(raw.line_count ?? raw.lineCount) || 80));
  const startIndex = Math.min(startLine - 1, lines.length);
  const selectedLines = lines.slice(startIndex, startIndex + lineCount);
  return {
    content: clipText(selectedLines.join("\n"), maxChars),
    range: {
      start_line: startLine,
      end_line: selectedLines.length ? startLine + selectedLines.length - 1 : startLine,
      returned_lines: selectedLines.length,
      total_lines: content ? lines.length : 0,
    },
  };
};

const mergeWithSingleNewline = (before: string, after: string) => {
  if (!before) return after;
  if (!after) return before;
  if (before.endsWith("\n") || after.startsWith("\n")) return `${before}${after}`;
  return `${before}\n${after}`;
};

const buildContentUpdate = (currentContent: string, raw: Record<string, unknown>) => {
  if (typeof raw.content !== "string") return null;
  const operation = normalizeOperation(raw.operation);
  const content = raw.content;
  if (operation === "append") {
    const nextContent = mergeWithSingleNewline(currentContent, content);
    return {
      operation,
      content: nextContent,
      changed_lines: {
        start_line: currentContent ? splitLines(currentContent).length + 1 : 1,
        end_line: splitLines(nextContent).length,
      },
    };
  }
  if (operation === "prepend") {
    const nextContent = mergeWithSingleNewline(content, currentContent);
    return {
      operation,
      content: nextContent,
      changed_lines: {
        start_line: 1,
        end_line: splitLines(content).length,
      },
    };
  }
  if (operation === "replace_range") {
    const startLine = toPositiveInteger(raw.start_line ?? raw.startLine);
    const endLine = toPositiveInteger(raw.end_line ?? raw.endLine) ?? startLine;
    if (!startLine || !endLine || endLine < startLine) {
      throw new Error("update_document operation=replace_range needs valid start_line and end_line.");
    }
    const lines = splitLines(currentContent);
    const replacementLines = splitLines(content);
    const startIndex = Math.min(startLine - 1, lines.length);
    const deleteCount = Math.max(0, Math.min(endLine, lines.length) - startIndex);
    lines.splice(startIndex, deleteCount, ...replacementLines);
    return {
      operation,
      content: lines.join("\n"),
      changed_lines: {
        start_line: startLine,
        end_line: startLine + replacementLines.length - 1,
      },
    };
  }
  return {
    operation: "replace",
    content,
    changed_lines: {
      start_line: 1,
      end_line: content ? splitLines(content).length : 0,
    },
  };
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
      enum: ["identity", "detail", "slice", "full"],
      description: "Read view. Use identity before detail/full when locating targets. Use slice for long documents.",
    },
    max_chars: {
      type: "integer",
      description: "Optional maximum characters for document content.",
    },
    start_line: {
      type: "integer",
      description: "1-based starting line for view=slice.",
    },
    line_count: {
      type: "integer",
      description: "Number of lines for view=slice. Capped by the tool.",
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
      description: "Document content used by operation. Prefer append or replace_range for long documents.",
    },
    operation: {
      type: "string",
      enum: ["replace", "append", "prepend", "replace_range"],
      description: "Content update mode. Defaults to replace for backwards compatibility.",
    },
    start_line: {
      type: "integer",
      description: "1-based first line for operation=replace_range.",
    },
    end_line: {
      type: "integer",
      description: "1-based last line for operation=replace_range.",
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
    if (view === "slice") {
      const slice = buildLineSlice(content, raw, maxChars);
      return {
        target: "document",
        found: true,
        view,
        item: {
          ...identity,
          body: {
            format: node.body.format,
            content: slice.content,
          },
          ...documentStats(content),
          range: slice.range,
          meta: node.meta || {},
        },
      };
    }
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
        ...documentStats(content),
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
    const currentContent = typeof node.body.content === "string" ? node.body.content : "";
    const contentUpdate = buildContentUpdate(currentContent, raw);
    const patch =
      raw.patch && typeof raw.patch === "object" && !Array.isArray(raw.patch)
        ? { ...(raw.patch as Record<string, unknown>) }
        : {};
    const title = trim(raw.title);
    if (title) patch.title = title;
    if (contentUpdate) {
      patch.text = contentUpdate.content;
      patch.content = contentUpdate.content;
      patch.preview = contentUpdate.content.replace(/\s+/g, " ").slice(0, 180);
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
        operation: contentUpdate?.operation || "patch",
        changed_lines: contentUpdate?.changed_lines || null,
        content_chars: contentUpdate ? contentUpdate.content.length : currentContent.length,
        line_count: contentUpdate ? documentStats(contentUpdate.content).line_count : documentStats(currentContent).line_count,
        patch_keys: Object.keys(updated.patch),
      },
    };
  },
  summarize: (output: any) => output?.updated ? `Updated document ${output?.item?.title || output?.item?.document_ref}` : "Document not updated",
};
