# Plan — Incremental realtime sync

## Architecture intent

The realtime room owns the current collaborative document and an ordered,
durable update log. A client operation is acknowledged after one local SQLite
transaction containing its operation ID, sequence, and update blob. D1 is a
derived read model generated after a burst or behind an explicit read barrier.

## Work breakdown

1. Client write amplification
   - Suppress semantically identical startup histories.
   - Merge nearby Yjs updates before network send.
   - Coalesce IndexedDB checkpoints independently from network writes.

2. Room incremental authority
   - Create `room_meta`, `room_updates`, and `room_operations` in the
     SQLite-backed Durable Object.
   - Bootstrap a legacy room once from the last D1 checkpoint.
   - Append operation ID and Yjs update in one synchronous SQLite transaction.
   - ACK and broadcast without awaiting D1.

3. Projection compaction
   - Reschedule one alarm only when an edit occurs.
   - On alarm, materialize one checkpoint and JSON projection for the settled
     sequence.
   - Delete compacted update blobs while retaining a bounded idempotency window.
   - Protect D1 from older projection overwrites with a sequence condition.

4. Strong read barrier
   - Add the internal Durable Object `/flush` endpoint.
   - Exact project HTTP reads and Agent runs flush before D1 reads.
   - Public/project existence checks flush only when a projection is absent.
   - Loop the barrier if a newer update arrives while an earlier projection is
     being written.

5. Legacy cleanup
   - Drop D1 `user_project_updates`; per-action authority now lives in the
     project Durable Object.
   - Remove global-log reset code and update architecture tests.

6. Verification
   - Typecheck.
   - Full test suite.
   - Wrangler Worker bundle dry run.
   - Production frontend build.

## Rollout order

1. Deploy the new realtime Worker while the legacy D1 log table still exists.
2. Deploy Pages Functions with the `/flush` read barrier.
3. Observe ACK latency, alarm failures, and projection lag.
4. Apply migration `0008_incremental_realtime_authority.sql` to remove the now
   unused D1 update table.

Rolling back before step 4 is code-only. After step 4, rollback requires keeping
the new Worker or recreating the legacy table before restoring old code.
