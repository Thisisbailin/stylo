# Verify — Canvas Node Placement

AC -> Evidence Mapping:
- AC1: Local browser drag check moved one text node while the other three sampled node rectangles remained unchanged. `tests/edgeAlignment.test.ts` also verifies target-node immutability.
- AC2: Alignment tests verify guide-only behavior outside the 4px release threshold and exact snapping inside it.
- AC3: `finishNodeDrag` skips alignment when more than one node is selected; raw React Flow position changes preserve group geometry.
- AC4: Snap guides use a 1px gradient line, 0.14–0.30 opacity, 100ms fade, and no glow, sheen, or scale animation.
- AC5: Existing nodes are mapped directly from persisted positions. Collision-aware search remains limited to node creation/import placement.

Verification Results:
- `npm run typecheck`: pass.
- `npm test`: pass, 117/117.
- `npm run build`: pass.
- Local browser interaction: pass; release snap aligned the active card edge exactly and did not move sampled neighboring cards.

Build Matrix:
- Web production bundle: pass.
- macOS desktop renderer bundle: covered by the shared Vite production build.
- iPadOS/iOS: not applicable to this React/Electron workspace.

Known Non-blocking Observation:
- The local persisted sample data emits an existing duplicate Flow project key warning. It is outside node placement and was not modified.

# Evidence Block
- Motivation: Eliminate unpredictable node movement and reduce alignment-guide prominence.
- Impact: Flow drag persistence, release snapping, initial placement, and alignment-guide visuals.
- Plan: Remove render-time reflow, make snap release-only and zoom-aware, skip group snapping, simplify guide styling.
- Verify: Typecheck, 117 tests, production build, and local browser drag comparison all passed.
- Rollback: Restore the previous alignment utility and render-time normalization; guide styling can be reverted independently.
