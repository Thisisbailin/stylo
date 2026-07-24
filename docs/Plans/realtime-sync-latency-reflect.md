# Reflect — Incremental realtime sync

## Root cause

The client already emitted incremental Yjs updates, but the server handled every
one like a snapshot save: clone the whole document, materialize project JSON,
encode a full Yjs state, insert a global update row, and rewrite the entire D1
document before ACK. A tiny node-position change therefore paid project-sized
CPU, serialization, and remote database latency.

## Design corrections

1. “Incremental transport” and “incremental durability” are separate. Both are
   now incremental on the acknowledgement path.
2. D1 is no longer the realtime coordination atom. Durable Object SQLite owns
   ordering, idempotency, and crash recovery for its room.
3. Full snapshots still have value as compact read models, but only after a
   settled burst or an explicit consistency barrier.
4. A read barrier must target a sequence, not merely wait for whichever
   projection promise already exists. Otherwise an update arriving during a
   flush can make Agent state one operation stale.
5. Idempotency IDs must outlive compacted update blobs for a bounded retry
   window.

## Remaining production observability

- Record aggregate `append_to_ack_ms`, `projection_ms`, `projection_lag_seq`,
  pending update bytes, and alarm retry count without payloads or PII.
- Alert when projection lag remains non-zero beyond the debounce/retry window.
- Measure p50/p95/p99 separately for browser-to-room RTT and room projection.

## Follow-up

If catalog queries require sub-450 ms metadata freshness, add a small
project-metadata projection rather than reintroducing full-document writes into
the ACK path.
