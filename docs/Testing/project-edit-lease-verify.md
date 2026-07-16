# Project edit lease — Verification

## Automated

- `npm run typecheck` — PASS
- `npm test` — PASS, 189/189 tests
- `npm run build` — PASS
- `npm audit --audit-level=high` — PASS, 0 vulnerabilities
- `sqlite3` migration load for `0001` + `0002` + `0003` — PASS
- SQLite takeover probe — PASS: the observed lease changed one row; replaying
  the stale token changed zero rows and left the phone lease intact.

Coverage includes:

- atomic `(user_id, project_id)` lease acquisition shape;
- request-time and transaction-time write fencing;
- project PUT, snapshot restore, and reset mutation coverage;
- client lease headers and heartbeat behavior;
- observed-generation takeover and stale-takeover rejection shape;
- old-device recovery-draft preservation;
- removal of the local-only project path;
- authenticated cloud-account gate with no guest-project fallback;
- unconditional cloud capability for every signed-in account (no rollout-off cohort);
- identical remote snapshot convergence without a conflict dialog;
- conflict-request coalescing.

## UI and deployment boundary

- The blocked editor offers explicit takeover, retry, or account exit. There is
  no local-project action.
- Signed-out users see the cloud-account gate and cannot create a guest project.
- A full two-client end-to-end check still requires deploying the matching D1
  migration, Pages Functions, web client, and desktop client together. No
  production state was changed during this task.
