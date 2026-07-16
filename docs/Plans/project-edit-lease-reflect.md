# Project edit lease — Architecture reflection

## Why the lock is project-scoped

Migration `0003_project_scoped_cloud.sql` moves the CAS and storage boundary to `(user_id, project_id)`. The lease now follows that same boundary, so two different projects in one account can be edited independently while two clients still cannot edit the same project concurrently.

## Chosen protocol

- Server-issued random lease token, scoped to authenticated user + device + runtime session.
- 45-second TTL and 12-second heartbeat.
- Atomic conditional acquisition: only an expired lease or the same session can update the row.
- Project writes retain optimistic CAS and idempotency checks.
- A second transaction-time lease guard is inserted into the same D1 batch as each mutation. If ownership changed or expired after request validation, the guard deliberately fails and D1 rolls back the entire batch.
- Normal unload and explicit exit attempt release; TTL is the crash/network-partition fallback.

The transaction-time fence is essential. A request-start check alone has a time-of-check/time-of-use race: an old client could pass validation, pause, and write after a new client acquires ownership.

## Client behavior

- Cloud sync engines start only while the lease is owned.
- A `423 Locked` write immediately drops client ownership and blocks editing.
- A blocked client can retry, exit, or explicitly continue editing on this device.
- Explicit takeover is compare-and-swap against the lease the client observed. A stale takeover cannot evict a newer third editor.
- The previous device is fenced server-side, saves a recovery draft, and reconciles through CAS if it later takes ownership again.
- All projects remain cloud-backed; there is no local-only escape path.
- Signed-out users now stop at the cloud-account gate instead of entering a
  guest workspace.
- The old client and server sync-rollout gates were removed completely, so
  stale deployment variables cannot return a 403 to only part of the user base.
- Identical-content CAS conflicts converge automatically.
- Equivalent conflict requests are coalesced into one decision.

## Remaining architectural debt

1. Multi-writer collaboration would require an operation log plus CRDT/OT semantics; this lease deliberately chooses single-writer consistency instead.
2. Old desktop builds do not know the project-scoped lease protocol and will fail closed after deployment. Migration and compatible clients must be deployed as one release boundary.

## Deployment order

1. Apply D1 migrations through `0003_project_scoped_cloud.sql` in order.
2. Deploy Functions and the matching web/desktop client.
3. Verify acquire/renew/release audit entries and one controlled two-client contention test.
4. Roll out the desktop build before expecting older installed clients to resume cloud writes.
