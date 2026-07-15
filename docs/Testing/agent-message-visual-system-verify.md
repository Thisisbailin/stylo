# Verify — Agent Message Visual System and Rendering Audit

## Outcome

Stylo Agent gives every visible message kind and every registered tool a distinct Phosphor duotone icon. User and assistant messages are now borderless editorial rows. Thinking, tool activity, and intermediate output render directly in the timeline without a run-level work-stage card or disclosure. Approval remains the only message-level decision card. Redundant connection and response statuses are removed once more useful work or a final answer exists.

The pending approval surface was reduced to one simple themed card: no accent rail, no gradient, no nested bordered cards, one quiet action divider, and one primary action.

The render path memoizes stable message items, coalesces scroll work into one animation frame, avoids redundant pinned-state writes, isolates offscreen history with `content-visibility`, batches high-frequency stream deltas, and debounces conversation persistence.

## AC → Evidence Mapping

- **AC1 — major message identities:** user, assistant answer, thinking, response status, and approval each have a distinct icon key in `STYLO_PRIMARY_MESSAGE_VISUALS`; coverage test passes.
- **AC2 — complete tool identities:** all 17 entries in `STYLO_TOOL_CATALOG` have unique exhaustive mappings in `STYLO_TOOL_MESSAGE_VISUALS`; unknown tools use `tool_generic`; coverage test passes.
- **AC3 — product visual language:** icons use Phosphor `duotone` without badge backgrounds or glow. Message surfaces use `--app-panel-muted`, `--app-panel-soft`, `--app-border`, and `--app-accent-strong`, matching Account Theme; visual-contract test passes.
- **AC4 — message correctness:** tool request/result pairing, direct run ordering, final-answer separation, approval separation, and skipped/no-change outcome labels are covered by unit tests.
- **AC5 — streaming efficiency:** `MessageItemView` is memoized, scroll frames are cancelled/coalesced, pinned state changes only on actual transitions, and inactive history uses native render containment; structural tests pass.
- **AC6 — projection budget:** 10,000 synthetic input messages project to 6,000 direct display items below the `1000ms` guardrail. Production conversations are additionally capped at 120 raw messages.
- **AC7 — desktop behavior:** local browser inspection verified direct thinking rows, absence of work-stage controls, distinct tool icons, approval layout, and borderless user/final answer identities.
- **AC8 — theme adaptation:** isolated Electron preview verified Light, Dark, and Green through the actual Account Theme controls. Text contrast, borders, accents, cards, and buttons updated with the selected theme.
- **AC9 — mixed-message hierarchy:** source contracts and browser inspection confirm direct answers, low-contrast thinking/tool details, completion-status deduplication, and a single-layer approval card.
- **Regression — Foundation dock:** existing layout tests confirm the operation bar stays bottom-centered whether Foundation is collapsed or expanded, including narrow screens.

## Verification Commands

- `git diff --check` → pass
- `npm run typecheck` → pass, strict TypeScript, exit `0`
- `npm test` → pass, `91/91`
- `npm run build` → pass, Vite `7.3.6`, `7212` modules transformed
- Production Agent bundle (`stylo-core`) → `286.74 kB`, gzip `87.67 kB`

## Platform Checks

- Web and Electron share the same React/CSS message implementation; production web build passed.
- Local Electron used a separate temporary user-data directory and synthetic messages only. No user project or production Agent session was read or mutated.
- Light, Dark, and Green were exercised through the real Account Theme UI. Other presets use the same variable contract.

## Instruction Coverage

IC = `1.0` (`9/9` acceptance criteria covered).

## Evidence Block

- **Motivation:** make Agent work legible without generic tool icons or noisy raw event streams, while preserving Stylo's theme-aware product identity.
- **Impact:** Agent message visual policy, icon presentation, timeline projection, message rendering/scrolling, theme CSS, and architecture tests. No runtime protocol or persisted message schema changed.
- **Plan:** keep the tool catalog authoritative; isolate UI policy; memoize stable leaves; retain native disclosures; validate synthetic load and real Electron themes.
- **Verify:** strict typecheck, 91 tests, production build, synthetic projection benchmark, and Light/Dark/Green Electron inspection.
- **Rollback:** remove the visual-policy/icon component references and the scoped message CSS; revert memo/scroll/render-containment changes independently. No data migration or dependency rollback is required.
