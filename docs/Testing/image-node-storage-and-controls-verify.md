# Verify — Image Node Storage And Controls

AC -> Evidence Mapping:
- AC1: `tests/imageStorageLifecycle.test.ts` asserts that node-port CSS contains theme variables and no fixed `rgba(74, 222, 128, ...)`. A local browser check under the active brick-red theme reported `--app-accent: #b3483f`; the rendered port gradient and shadow resolved to the same red channels.
- AC2: `ImageInputNode` uploads a selected file to `assets`, persists `storageBucket` / `storagePath`, and refreshes a 24-hour signed read URL from that reference. Production typecheck and build pass.
- AC3: React Flow `onBeforeDelete` collects the private source and public review-copy references, awaits authenticated deletion, and returns `false` on failure. Replacement follows the same cleanup rule and compensates by deleting a newly uploaded object when old-object cleanup fails.
- AC4: `normalizeStorageDeleteObjects` tests cover allow-listed buckets, deduplication, and rejection of another user's prefix. `removeSupabaseStorageObjects` tests cover grouped bucket deletion.
- AC5: Source/CSS tests confirm the populated node has no `media-input-info` lower panel, uses the full image surface, and exposes a right-side `image-input-control-rail` revealed by hover, focus, or selection. The live empty-state canvas rendered without clipping or new console errors.
- AC6: Collector tests confirm data-URL-only legacy nodes yield no owned object and therefore remain deletable without a storage request.

Verification Results:
- `npm run typecheck`: pass.
- `npm test`: pass, 162/162.
- `npm run build`: pass.
- `git diff --check`: pass.
- Local in-app browser: pass for empty image card layout, image-node overflow contract, active-theme port gradient/shadow, and runtime loading.

External Documentation Check:
- Supabase changelog reviewed through 2026-07-10. The upcoming JavaScript SDK TypeScript 5+ requirement is satisfied by this project's TypeScript 5.8.x toolchain.
- Supabase JavaScript Storage deletion continues to accept an array of full object paths within one bucket; the endpoint groups references by bucket before calling `remove`.

Known Non-blocking Observations:
- Live project data currently emits an existing duplicate React key warning for `flow-project-main`; this change did not create or modify that project identity.
- No real storage object was uploaded during browser QA, avoiding test data in the user's production Supabase account. Upload/delete behavior is covered by pure lifecycle tests and the authenticated API boundary.

Build Matrix:
- Web production bundle: pass.
- macOS Electron renderer: covered by the shared Vite production build.
- iPadOS/iOS: not applicable to this React/Electron workspace.

# Evidence Block
- Motivation: Theme-correct connection feedback, garbage-free image storage, and an image-first node surface.
- Impact: ImageInput node data and UI, React Flow deletion gating, Supabase Storage API boundary, and port/connection CSS.
- Plan: Persist explicit storage references, validate ownership server-side, delete before node removal, move operations to a floating rail, and derive feedback colors from theme variables.
- Verify: Strict typecheck, 162 tests, production build, source assertions, and local browser computed-style/layout checks all passed.
- Rollback: Remove `onBeforeDelete` and the storage endpoint independently; revert image-node markup/CSS separately; optional storage fields are backward-compatible and can remain unread.
