# Account / Project Reliability — Test Evidence (2026-07-24)

Commands and results:

```text
npm run typecheck
PASS — TypeScript strict check completed with no diagnostics.

npm test
PASS — 200 tests, 0 failed, 0 skipped.

sqlite3 :memory: ".read migrations/0001_initial.sql" ... ".read migrations/0006_project_deletion_tombstones.sql"
PASS — all migrations applied; 12 PROJECT_DELETED guard triggers present.

npm run build
PASS — Vite production build completed, 7277 modules transformed.

git diff --check
PASS — no whitespace errors.
```

Non-blocking observation:
- Vite reports existing chunks above 500 kB; this change does not add a new dependency and does not alter the current chunking strategy.
