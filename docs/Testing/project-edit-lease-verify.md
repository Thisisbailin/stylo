# Project edit lease — Verification

## Automated

- `npm run typecheck` — PASS
- `npm test` — PASS, 187/187 tests
- `npm run build` — PASS
- `sqlite3` migration load for `0001` + `0002` + `0003` — PASS

Coverage includes:

- atomic `(user_id, project_id)` lease acquisition shape;
- request-time and transaction-time write fencing;
- project PUT, snapshot restore, and reset mutation coverage;
- client lease headers and heartbeat behavior;
- isolated local-project fallback;
- identical remote snapshot convergence without a conflict dialog;
- conflict-request coalescing.

## UI inspection

Local app viewport `1422 × 800`:

- blocking overlay uses fixed positioning and z-index `10000`;
- dialog is centered at `520 × 443` with a 28px radius;
- three explicit actions are present: local project, retry, exit.

The local Vite instance correctly rendered the unavailable-lease state, but the configured remote Pages backend returned `405` for `/api/project-lease` because this new Function is not deployed yet. Full two-client end-to-end verification therefore requires the migration and Pages deployment described in the architecture reflection; no production state was changed during this task.
