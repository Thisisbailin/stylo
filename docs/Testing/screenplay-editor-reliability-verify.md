# Verify — Screenplay Editor Reliability

AC -> Evidence Mapping:
- AC1: `tests/screenplayEngine.test.ts` verifies Chinese action prose is not inferred as a person and exact aliases bind to canonical roles — pass.
- AC2: `tests/screenplayEngine.test.ts` verifies `.INT. 古宅门前 - 夜 - DAY` resolves to location `古宅门前` — pass.
- AC3: format conversion and explicit empty dialogue/character cue tests — pass.
- AC4: save-coordinator stale echo, acknowledgement, and external conflict tests — pass.
- AC5: strict TypeScript check and production build cover the Info role library and searchable `@` picker — pass.
- AC6: `tests/lookbookIdentities.test.ts` verifies existing-role reuse, prose rejection, and duplicate flow-node repair — pass.

Verification commands:
- `npm run typecheck` — pass.
- `npm test` — 54/54 pass.
- `npm run build` — pass, 7,193 modules transformed.
- `git diff --check` — pass.

Platform Difference Checks:
- Shared React/Electron surface only; no platform-specific behavior changed.

# Evidence Block
- Motivation: eliminate intermittent format/save failures and connect screenplay cues to project identities.
- Impact: Fountain parser, screenplay save reconciliation, Lookbook identity synchronization, screenplay Info/editor UI, regression tests.
- Plan: isolate pure parsing/save logic, reuse it at the identity boundary, then add role-library interactions.
- Verify: strict typecheck, 54 unit tests, and production Vite build all pass.
- Rollback: revert the Fountain engine, save coordinator, Lookbook sync, and UI integration independently; no schema migration or dependency change is involved.
