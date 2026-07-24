# Verify — Incremental realtime sync

## AC → evidence

- AC1/2 — incremental durable ACK
  - `realtime-worker/src/index.ts` stores `room_operations` and `room_updates`
    inside one `transactionSync`.
  - ACK follows that transaction and does not await D1.
  - `tests/realtimeProjectArchitecture.test.ts`.

- AC3 — event-triggered compaction
  - Edits reschedule a single Durable Object alarm.
  - `alarm()` writes one conditional D1 projection and compacts update blobs.
  - No `setInterval` exists in the project sync engine.
  - `tests/realtimeSyncLatency.test.ts`.

- AC4 — strong reads
  - Internal `/flush` loops until `projected_seq` reaches the requested room
    sequence.
  - Project, Agent, and public exact reads call the barrier before D1.
  - Existence-only routes flush only for a not-yet-projected new project.

- AC5 — idempotency
  - `room_operations` retains 2,000 operation IDs independently of compacted
    update blobs.

- AC6 — no-op startup and truthful UI
  - Semantic project equality suppresses structurally different Yjs history.
  - Status is delayed, top-centered, and visible only with pending authored
    operations.

## Quality gates

- `npm run typecheck`: pass.
- `npm test`: pass, 189/189.
- `npx wrangler deploy --dry-run --config realtime-worker/wrangler.toml`:
  pass; Worker bundles with Durable Object and D1 bindings.
- `npm run build`: pass; 7,278 modules transformed.
- `git diff --check`: pass.

## Release verification still required

- Two devices concurrently edit text and node positions.
- Disconnect/reconnect replays a pending operation once.
- Agent launched immediately after an edit sees the acknowledged Flow revision.
- D1 projection lag returns to zero after the edit debounce window.
- Migration 0008 is applied only after the new Worker and Pages barrier are
  live.
