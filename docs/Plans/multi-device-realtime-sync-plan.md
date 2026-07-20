# Plan — Multi-device realtime project sync

## Architecture intent

D1 remains the durable project authority. A project-scoped Durable Object
coordinates Yjs updates and broadcasts them, while clients persist a Yjs
checkpoint and unacknowledged update queue in IndexedDB. Materialized project
JSON is a read model for project catalogs and Agent context, not the unit of
concurrency. Editing is authorized by account/project scope, never by a device
lease.

## Work breakdown

1. Remove lease gating
   - Remove the modal, hook, request header, project-lease route usage, and
     transaction lease guard.
   - Keep authenticated account/project scope and operation idempotency.
   - Rollback: restore the existing lease files and guards.

2. Add operation persistence
   - Add Yjs checkpoint/materialized-document and bounded update-log tables.
   - Assign monotonic per-project `server_seq` in the project Durable Object.
   - Deduplicate updates by `(user_id, project_id, op_id)`.
   - Rollback: disable the new endpoints before any production data exists.

3. Add realtime transport
   - Add a project-room WebSocket coordinator with Clerk-authenticated joins.
   - Broadcast accepted receipts and replay missing operations on reconnect.
   - Use heartbeat/reconnect only for transport health, never editing rights.
   - Rollback: fall back to cursor polling against the same operation log.

4. Add client collaboration engine
   - Durable IndexedDB Yjs checkpoint plus resend of unacknowledged updates.
   - Stable-ID Yjs maps for project entities and `Y.Text` for Markdown/script.
   - Apply remote operations without re-emitting them as local edits.
   - Rollback: read-only checkpoint loader remains available.

5. One-time development-data reset
   - D1 dry-run counts by project-scoped table.
   - Delete project rows globally in one controlled command sequence.
   - Delete `users/*/projects/*` objects from both project buckets.
   - Preserve Clerk users, `user_profile`, `user_secrets`, and account avatar
     paths.
   - Rollback: none for deleted test data; export counts and audit output first.

6. Verify and release atomically
   - Two-client concurrency/reconnect tests and production build.
   - Deploy migration, Functions/realtime worker, web, and desktop together.
   - Verify A-to-B propagation and offline replay with synthetic clean projects.

## Remote reset result

The approved reset found zero rows in the legacy project tables, then deleted
all project-scoped D1 tables and applied migrations `0002`–`0004`. The final
remote check showed:

- `user_project_documents`: 0 rows.
- `user_project_updates`: 0 rows.
- `user_project_edit_leases`: absent.
- Supabase `assets/users/*/projects/*`: 0 objects.
- Supabase `public-assets/users/*/projects/*`: 0 objects.

The temporary global object-reset route and one-time secret were removed after
verification. Account tables and avatar prefixes were excluded.

## Verification

- AC1: source-boundary tests prove no lease header/route/modal remains.
- AC2–3: deterministic two-actor convergence tests.
- AC4–5: WebSocket receipt/replay and offline queue tests.
- AC6: before/after D1 counts plus object-prefix deletion report.
- AC7: typecheck, full tests, build, audit, and two-device smoke test.
