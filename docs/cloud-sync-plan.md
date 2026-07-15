# Account and Cloud Sync Architecture

## Scope

Stylo has one local workspace namespace and one remote data namespace per authenticated account. Project state and encrypted provider secrets share the account transport boundary but use independent versioned resources and conflict decisions.

Binary media is not cloud project state. Cloud project snapshots contain metadata and local-media references; the portable project package remains the binary source of truth.

## Required Invariants

1. No request from account A may complete into account B's state.
2. No push is allowed before a successful initial remote handshake.
3. Every push uses an immutable value, a server-issued base version, and a payload-bound operation ID.
4. At most one write per resource may be in flight.
5. A retry reuses the same operation ID and exact payload.
6. A CAS conflict creates a new operation only after adopting the returned remote version.
7. A non-empty remote project cannot be replaced by an empty local project without the explicit reset marker.
8. Local and remote divergence is never resolved by a timeout or silent last-write-wins rule.
9. `synced` means the server returned a valid version receipt. Agent preparation additionally requires an exact project-revision receipt.
10. Agent requests start with no project payload. They receive only project identity and the confirmed expected revision, then explore through tools.
11. The compact cloud representation may omit the duplicate top-level Flow, but normalization must restore it from the selected active project before reading its revision.
12. Project reset is a synchronization-generation boundary: the previous engine is disposed before local clearing or remote deletion begins.
13. A terminal `synced` state is published only after active-write accounting settles; `pendingOps` must be zero unless a newer local snapshot exists.
14. Foundation-only project variants are semantically empty, and Foundation-generated documents must remain byte-stable after project normalization.

## Account Boundary

`AccountApiSession` is the sole authenticated HTTP boundary for a mounted account scope.

- It binds every request to the account's stable token provider and device ID.
- It retries authentication exactly once with `skipCache` after 401/403.
- Every request has a hard timeout; a stalled transport cannot leave the UI loading indefinitely.
- It aborts pending token acquisition and all network requests when the account scope is disposed.
- Project sync, secret sync, profile, avatar metadata, snapshots, restore, audit diagnostics, and account reset use the same session.
- Clerk bridge callbacks have stable identities; React renders cannot recreate the account session.

Local storage keys include the encoded account scope. Agent conversations additionally include the project ID. Legacy unscoped data remains quarantined until the user explicitly imports it.

## Sync State Machine

`VersionedSyncEngine<T>` is independent of React. React hooks are lifecycle adapters only.

```text
disabled -> loading -> synced
                    -> syncing -> synced
                    -> conflict -> syncing | synced
                    -> offline  -> loading | syncing
                    -> error    -> refresh | next explicit attempt
```

The engine owns:

- a serialized command tail;
- one confirmed remote snapshot and opaque remote version;
- one debounced latest local snapshot;
- retry state with exponential backoff and jitter;
- an abort controller scoped to the account lifecycle;
- explicit conflict resolution;
- short-lived write holds used by Agent revision leases.

The engine does not own React state, Clerk, fetch URL construction, or project-specific delta logic.

## Project Protocol

`GET /api/project` returns:

```json
{
  "projectData": {},
  "updatedAt": 123,
  "projectRevision": 42
}
```

`PUT /api/project` sends `If-Match`, the same `updatedAt` in the body, an operation ID, and the active project revision. The operation ID is cryptographically bound to mode, base version, revision, and the complete sanitized payload.

The D1 write guard and data mutations execute in one batch. A successful response confirms both the new remote version and project revision. A 409 response includes the latest hydrated project, remote version, and project revision.

## Project Reset

Reset pauses project synchronization and disposes the current engine before revision zero is installed locally. The client then clears project-scoped Agent state, local baselines and backups, requests remote deletion, and finally starts a new engine generation that performs a version-zero handshake.

The explicit empty-overwrite marker remains until the new handshake confirms either an absent remote project or a committed empty snapshot. Every existing project, Agent, audit, asset, and write-guard row is deleted in one ordered D1 batch. Object-storage cleanup is best-effort after the authoritative D1 reset and cannot convert an already committed project reset into a false failure response.

## Agent Revision Lease

Agent startup does not wait for the whole canvas to become idle.

1. Capture one NodeFlow store snapshot.
2. Merge that exact snapshot into a project value.
3. Acquire a sync lease for its revision.
4. Force a full project save and verify the server revision receipt.
5. Send only `expectedRevision` to the Agent API.
6. Hold later background project writes until the Agent stream ends or fails.
7. Release the lease in `finally`.

This gives the Agent one stable remote starting revision while preserving the zero-knowledge exploration rule.

## Secrets

Secrets use the same engine and CAS rules but a separate endpoint, baseline, and encrypted server record. Secret values are never merged. If both local and remote changed, the user selects one version in a UI that reveals only which provider slots are configured, never secret text.

## Failure Handling

- Network, 408, 425, 429, and 5xx failures retry with bounded backoff and jitter.
- Initial loading uses a shorter retry budget than writes, then transitions to an actionable error.
- Authentication refresh happens in the account session, not in each resource hook.
- Validation, malformed receipts, 4xx protocol errors, and revision mismatches fail immediately.
- Going offline preserves the latest staged snapshot without consuming retries.
- Account disposal aborts loads, saves, token waits, conflict waits, and Agent leases.
- Project conflict choices create local/remote backups before replacement.
- Server snapshots and audit records remain the recovery path for committed remote versions.

## Verification

The regression suite covers account isolation, token refresh, token-wait abort, initial pull gating, immutable snapshots, serialized writes, settled pending counts, semantic-empty Foundation variants, Foundation normalization idempotency, atomic account reset, retry idempotency, CAS conflict choices, remote-version rebasing, Agent write holds, exact revision receipts, offline/runtime compatibility, and disposal during in-flight work.
