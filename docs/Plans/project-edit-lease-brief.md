# Project edit lease — Brief

## Problem

Stylo currently protects cloud writes with optimistic version checks, but every signed-in client is still allowed to enter an editable session. Two clients can therefore alternate writes, repeatedly receive `409 Conflict`, and reopen the conflict decision modal even after the user has already chosen a copy.

The persisted cloud resource is an independent `(user_id, project_id)` project. Concurrency control protects that exact write boundary while allowing different projects in one account to be edited independently.

## Outcome

- At most one authenticated client may edit and write one project at a time.
- The server, not the UI, is authoritative.
- A lease expires automatically after a crashed or disconnected client stops renewing it.
- A second device can explicitly take over the cloud editing session; the former device is fenced and becomes read-only.
- Every project remains cloud-backed. There is no local-only project fork.
- Project editing requires an authenticated cloud account; missing account
  configuration is a visible deployment error, never a guest-project fallback.
- The former sync-rollout gate is removed from both client and server; cloud
  capability cannot be disabled for a subset of authenticated accounts.
- Losing a lease preserves the local working copy as a recovery draft before reconciliation.
- Identical-content CAS races converge silently instead of opening a false conflict modal.

## Non-goals

- Collaborative multi-writer editing or CRDT/OT merging.
- Permanent device ownership. The lock is a short renewable session lease.

## Safety invariants

1. Every cloud project mutation requires a live server lease owned by the request device and session.
2. Normal acquisition may replace only an expired lease or renew the same session. Explicit takeover uses compare-and-swap against the observed lease generation.
3. The client stops staging cloud writes immediately when ownership is lost.
4. A former editor cannot write after takeover; its next heartbeat or save transitions it to the occupied-project surface.
5. Existing CAS/version checks remain in place behind the lease as defense in depth.
