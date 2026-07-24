import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type { NodeFlowFile, PdfInputNodeData } from "../node-workspace/types";
import { createDefaultNodeFlowNodeData } from "../node-workspace/nodeflow/defaults";
import { getNodeHandles } from "../node-workspace/utils/handles";
import { isNodeTypeAllowedInFoundationAxis } from "../node-workspace/foundation/axes";
import { parseNodeFlowFile } from "../node-workspace/nodeflow/schema";
import { toNodeFlowNodeRecord } from "../node-workspace/nodeflow/model";
import {
  buildNodeFlowPackageBlob,
  readNodeFlowImportFile,
} from "../node-workspace/nodeflow/package";

const highlight = {
  id: "highlight-1",
  page: 2,
  x: 0.12,
  y: 0.24,
  width: 0.42,
  height: 0.06,
  color: "yellow" as const,
  createdAt: 1_700_000_000_000,
};

const makePdfProject = (pdf: string): NodeFlowFile => ({
  version: 2,
  revision: 4,
  name: "PDF Project",
  nodes: [
    {
      id: "note-1",
      type: "text",
      position: { x: 0, y: 0 },
      data: { title: "阅读笔记", text: "# 要点\n\n角色动机需要复核。" },
    },
    {
      id: "pdf-1",
      type: "pdfInput",
      position: { x: 360, y: 0 },
      data: {
        pdf,
        filename: "research.pdf",
        mimeType: "application/pdf",
        storageBucket: null,
        storagePath: null,
        fileSize: 128,
        highlights: [highlight],
      },
    },
  ],
  links: [{
    id: "note-to-pdf",
    source: "note-1",
    target: "pdf-1",
    sourceHandle: "text",
    targetHandle: "text",
  }],
});

test("PDF input defaults, handles, and Foundation classification share media architecture", () => {
  const defaults = createDefaultNodeFlowNodeData("pdfInput") as PdfInputNodeData;
  assert.equal(defaults.pdf, null);
  assert.equal(defaults.mimeType, "application/pdf");
  assert.deepEqual(defaults.highlights, []);
  assert.deepEqual(getNodeHandles("pdfInput"), { inputs: ["text"], outputs: [] });
  assert.equal(isNodeTypeAllowedInFoundationAxis("character", "pdfInput"), true);
  assert.equal(isNodeTypeAllowedInFoundationAxis("time", "pdfInput"), false);
});

test("PDF input schema preserves valid highlights and rejects unsafe geometry", () => {
  const parsed = parseNodeFlowFile(makePdfProject("https://example.test/research.pdf"));
  const pdfNode = parsed.nodes.find((node) => node.type === "pdfInput");
  assert.deepEqual((pdfNode?.data as PdfInputNodeData).highlights, [highlight]);

  const record = toNodeFlowNodeRecord(pdfNode!);
  assert.deepEqual(record.inputs, ["text"]);
  assert.deepEqual(record.outputs, []);
  assert.equal(record.body.highlightCount, 1);

  const invalid = makePdfProject("https://example.test/research.pdf");
  (invalid.nodes[1].data as PdfInputNodeData).highlights = [{
    ...highlight,
    x: 0.8,
    width: 0.4,
  }];
  assert.throws(() => parseNodeFlowFile(invalid), /PDF 高亮 1 无效/);
});

test("Stylo package round-trip restores PDF media, highlights, and note connection", async () => {
  const minimalPdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
    "utf8"
  );
  const source = `data:application/pdf;base64,${minimalPdf.toString("base64")}`;
  const original = makePdfProject(source);
  const blob = await buildNodeFlowPackageBlob(original);
  const imported = await readNodeFlowImportFile(new File(
    [blob],
    "pdf-project.stylo.zip",
    { type: "application/zip" }
  ));
  const pdfNode = imported.nodes.find((node) => node.type === "pdfInput");
  const pdfData = pdfNode?.data as PdfInputNodeData;

  assert.match(pdfData.pdf || "", /^data:application\/pdf;base64,/);
  assert.deepEqual(pdfData.highlights, [highlight]);
  assert.equal(imported.links[0]?.source, "note-1");
  assert.equal(imported.links[0]?.target, "pdf-1");
  assert.equal(imported.links[0]?.targetHandle, "text");
  assert.equal(original.nodes[1].data.pdf, source, "packing must not mutate the source PDF node");
});

test("PDF UI exposes create entries, double-click reader, highlighter, and linked notes", async () => {
  const [flowSurface, floatingBar, nodeSource, readerSource] = await Promise.all([
    readFile(path.resolve("node-workspace/components/FlowSurface.tsx"), "utf8"),
    readFile(path.resolve("node-workspace/components/FloatingActionBar.tsx"), "utf8"),
    readFile(path.resolve("node-workspace/nodes/PdfInputNode.tsx"), "utf8"),
    readFile(path.resolve("node-workspace/components/PdfReaderOverlay.tsx"), "utf8"),
  ]);

  assert.match(flowSurface, /label: "PDF"[\s\S]*type: "pdfInput"/);
  assert.match(flowSurface, /node\.type === "pdfInput"\) setActivePdfNodeId\(node\.id\)/);
  assert.match(floatingBar, /label: "PDF"[\s\S]*onClick: onAddPdf/);
  assert.match(nodeSource, /inputs=\{\["text"\]\}/);
  assert.match(nodeSource, /uploadStorageFile\(file/);
  assert.match(readerSource, /updateNodeData\(nodeId, \{ highlights:/);
  assert.match(readerSource, /link\.target === nodeId/);
  assert.match(readerSource, /Markdown 笔记/);
});
