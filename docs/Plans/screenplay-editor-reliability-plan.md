# Plan — Screenplay Editor Reliability

Architecture Intent Block:
- Keep parsing and save reconciliation as pure, unit-tested domain functions.
- Keep project identity creation in the existing Lookbook synchronization boundary.
- Keep UI responsible only for choosing a role and emitting a canonical Fountain cue.

Work Breakdown:
1. Tighten line/scene parsing and introduce canonical known-identity resolution.
2. Add a save coordinator for source acknowledgement, stale echoes, adoption, and conflicts.
3. Reuse the parser in Lookbook synchronization and deduplicate invalid flow IDs.
4. Add Info character library and keyboard-driven `@` picker.
5. Add regression tests and run typecheck, tests, and production build.

Verification Plan:
- AC1–AC4: `tests/screenplayEngine.test.ts`.
- AC6: `tests/lookbookIdentities.test.ts`.
- AC5: TypeScript/build verification plus local UI inspection where the runtime is available.

Rollback Points:
- Fountain engine, save coordinator, identity sync, and UI integration are isolated files and can be reverted independently.
