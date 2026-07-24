# Verify — Account and Project Reliability

AC -> Evidence Mapping:
- AC1: `tests/publicAccountSquare.test.ts` asserts the account workspace contains the private login-email treatment and no “显示名称” field. Result: pass.
- AC2: `tests/publicAccountSquare.test.ts` asserts account-level publication copy and per-project publication controls. Result: pass.
- AC3: `tests/publicAccountSquare.test.ts` submits the same stable project ID twice and asserts one project row. Result: pass.
- AC4: `tests/realtimeProjectArchitecture.test.ts` asserts project deletion calls `/api/project-delete` and no longer references `/api/account-data-reset`. Result: pass.
- AC5: `tests/accountDataReset.test.ts` verifies project-scoped D1 deletion; lifecycle source contract verifies object storage -> tombstone -> realtime -> D1 ordering. Result: pass.
- AC6: migration, realtime gateway and Durable Object assertions verify tombstones, HTTP 410 and delete-mode socket closure. Result: pass.
- AC7: account/project reset remains POST-only while permanent deletion is a dedicated DELETE endpoint. Result: pass.
- AC8: strict typecheck, 200 tests, SQLite migration execution, production build and diff whitespace check all pass.

Build Matrix:
- Shared web/Electron TypeScript build: pass.
- `npm run typecheck`: pass.
- `npm test`: 200/200 pass.
- `npm run build`: pass; existing large-chunk advisory remains non-blocking.
- SQLite migrations 0001–0006 applied to an in-memory database: pass; 12 deletion-guard triggers created.
- `git diff --check`: pass.

Platform Difference Checks:
- Web and Electron use the same `AccountWorkspace` implementation.
- Narrow widths retain the existing single-column fallback.
- Browser screenshot verification was not available because the browser-control environment rejected localhost navigation after an initial connection failure. No security-policy bypass was attempted; UI contracts are covered by source assertions, strict compilation and production rendering build.

Instruction Coverage:
- IC = 8/8 acceptance criteria = 1.0.
