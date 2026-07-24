# Verify — PDF Input Reader And Notes

Date: 2026-07-24

AC -> Evidence Mapping:
- AC1: `pdfInput` is registered in node types, defaults, placement, Foundation media classification, creation menus, and Agent workflow schemas. `tests/pdfInputNode.test.ts` verifies the shared media architecture.
- AC2: `PdfInputNode` validates PDF files up to 64 MB, uploads them through the existing authenticated project-scoped storage boundary, persists bucket/path/size metadata, refreshes signed URLs, and removes replaced or cleared objects.
- AC3: Double-clicking a populated PDF node opens `PdfReaderOverlay`, which provides native Chromium PDF rendering, page navigation, and 50–200% zoom.
- AC4: The reader supports drag-to-highlight annotations in yellow, green, or blue. Normalized page geometry is persisted in node data, validated by the import schema, restored from project packages, and individually removable.
- AC5: PDF nodes accept incoming text connections. The reader resolves connected text, Markdown-text, and script-page nodes into an associated Markdown notes sidebar.
- AC6: PDF binary data is packed and hydrated through the same project-resource path used by image/audio/video nodes. The package round-trip test restores the PDF, annotations, and its note connection.

Verification Results:
- `npm run typecheck`: pass.
- `npm test`: pass, 184/184.
- `npm run build`: pass.
- `git diff --check`: pass.
- Local in-app browser: the public landing route loaded without new console warnings or errors. The live workspace remained behind its existing account login gate, so authenticated upload and reader interaction were not exercised against user data.

Known Non-blocking Observations:
- Highlight annotations are project-side overlays and do not rewrite the source PDF binary.
- Rendering uses Chromium's built-in PDF viewer, so no new PDF runtime dependency or external CDN was introduced.
- The production build retains the existing Vite warning for chunks larger than 500 kB.

Build Matrix:
- Web production bundle: pass.
- macOS Electron renderer: covered by the shared Chromium/Vite production build.
- iPadOS/iOS: not applicable to this React/Electron workspace.

# Evidence Block
- Motivation: Add PDF as a first-class project resource with reading, annotation, and connected Markdown notes.
- Impact: NodeFlow types and menus, private project storage, package import/export, schema validation, the Flow surface, Agent resource contracts, and reader UI.
- Plan: Reuse the media lifecycle, add a full-screen PDF reader, persist normalized highlights, and interpret incoming text links as associated notes.
- Verify: Strict typecheck, 184 tests, production build, package round-trip coverage, source-contract UI tests, and unauthenticated browser smoke checks passed.
- Rollback: Remove the `pdfInput` registry entries and reader components; existing PDF-specific node data remains isolated from other node types.
