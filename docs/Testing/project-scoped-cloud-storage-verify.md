# Project-scoped cloud storage — Verification

## Automated

- `npm run typecheck` — PASS
- `npm test` — PASS, 187/187 tests
- `npm run build` — PASS
- `npm run audit` — PASS, 0 high-severity vulnerabilities
- Sequential SQLite execution of migrations `0001`, `0002`, and `0003` — PASS
- Two-project SQLite delete probe — PASS; deleting project A retained project B in both project metadata and Agent sessions
- `git diff --check` — PASS

## Coverage

- strict project-ID validation and fail-closed requests;
- composite D1 keys for project state, snapshots, and leases;
- explicit Agent/session/trace and Seedance project columns;
- active-project sync projection and sibling-preserving remote merge/reset;
- project-scoped Supabase upload, download, deletion, and reset prefixes;
- target-project lease acquisition before cloud deletion;
- project-scoped write guards, snapshot restore, reset, and catalog hydration.

## Release boundary

No remote migration or deployment was performed. The matching Functions and client must ship immediately after applying migration `0003`; older clients that omit `projectId` will fail closed by design.

