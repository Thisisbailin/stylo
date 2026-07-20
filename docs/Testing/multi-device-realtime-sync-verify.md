# Verify — Multi-device realtime project sync

## AC to evidence

- AC1 — No edit lease:
  - Lease modal, hook, API route, request header, and production helper removed.
  - Migration `0004_realtime_collaboration.sql` drops the lease table.
  - `tests/realtimeProjectArchitecture.test.ts` passes.
- AC2 — Concurrent graph changes:
  - Empty stable-ID arrays are created as Yjs maps from the first checkpoint.
  - Concurrent first-node test preserves both nodes and converges.
- AC3 — Concurrent text:
  - Project strings use `Y.Text`.
  - Concurrent script edits converge and retain both non-overlapping inserts.
- AC4 — Live propagation:
  - Authenticated Pages WebSocket route scopes the room by
    `(Clerk user_id, project_id)`.
  - Durable Object persists before acknowledgement and broadcasts to peers.
- AC5 — Offline/reconnect:
  - IndexedDB stores the complete local Yjs state.
  - Unacknowledged updates are merged back into the retry queue on disconnect,
    server error, or 15-second acknowledgement timeout.
- AC6 — One-time reset:
  - Final remote D1 counts: `user_project_documents=0`,
    `user_project_updates=0`.
  - Legacy lease table absent.
  - Supabase project-prefix scan: 0 objects in `assets`, 0 objects in
    `public-assets`.
  - Temporary reset route and secret removed; route now returns HTTP 405.
- AC7 — Automation:
  - `npm run typecheck`: pass.
  - `npm test`: 189/189 pass.
  - `npm run build`: pass.

## Deployment evidence

- Realtime Worker: `stylo-project-realtime`
  - Version: `d9472c26-1063-4476-9113-be59cfd2691e`
  - Public root returns 404; rooms are reachable only through authenticated
    Pages Functions.
- Pages production deployment:
  - ID: `85fcaa10-04a0-4b4c-b524-73f0f842d89f`
  - URL: `https://85fcaa10.node-qalam.pages.dev`
- `https://node-qalam.pages.dev/api/project-realtime` returns HTTP 426 without
  a WebSocket upgrade, proving the deployed route is active.

## Platform checks

- Web/mobile web/desktop web share the same JavaScript protocol and account
  scope.
- Background disconnect uses the same checkpoint/retry path.
- A signed-in two-device production smoke test still requires two user-owned
  interactive sessions; automation did not bypass Clerk authentication.

## Evidence Block

- Motivation: remove the infrastructure-dependent edit lock and support
  seamless same-account multi-device editing.
- Impact: client sync engine, Pages auth boundary, D1 schema/read models,
  project reset, Agent project reads, standalone realtime Worker.
- Plan: remove leases, introduce Yjs room authority, unify readers, clear test
  data, verify and deploy in dependency order.
- Verify: strict typecheck, 189 tests, production build, remote D1/schema,
  object-prefix scan, deployment inspection.
- Rollback: redeploy the previous Pages deployment and Worker version; migration
  rollback is intentionally not provided because test data was explicitly
  discarded and the lease table was the failing dependency.
