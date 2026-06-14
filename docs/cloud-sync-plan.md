Cloud Sync Plan (Production-Grade)

Purpose
- Provide a robust, production-ready cloud sync design that prevents data loss and ensures strong correctness guarantees.
- Support offline-first workflows, multiple devices, and partial connectivity.
- Make sync behavior observable, testable, and reversible.

Scope
- User project data (scripts, episodes, assets, settings).
- User secrets (API keys, tokens) handled separately with stricter security.
- Not a full backend blueprint; focuses on sync correctness and safety.

Non-Negotiables (Safety Guarantees)
- No silent data loss: every overwrite must be intentional and recoverable.
- Deterministic conflict resolution: predictable outcomes across devices.
- Idempotent writes: client retries must not duplicate or corrupt data.
- Visibility: all sync failures are surfaced and logged with trace IDs.
- Recovery: user can restore at least the last N snapshots.

High-Level Architecture
- Local-first model: client stores authoritative local copy in IndexedDB/SQLite.
- Server stores canonical record with versioning and audit log.
- Sync uses optimistic concurrency control (OCC) with server-issued version IDs.
- Delta sync over a cursor; avoid full document overwrites when possible.

Data Model
- Split project data into normalized tables (single-project per account):
  - user_project_meta: fileName/rawScript/guides/roles/designAssets/nodeFlow/nodeDefaults/usage/stats + updated_at (global version)
  - user_project_episodes: episode-level fields (no scenes)
  - user_project_scenes: scene rows keyed by (episode_id, scene_id)
- Secrets remain separate (user_secrets).
- Global OCC version uses user_project_meta.updated_at; any write bumps it.
- Maintain an audit log:
  - eventId, action, status, deviceId, timestamp, detail

Sync Protocol (Recommended)
1. Initial handshake
   - Client sends deviceId + lastKnownVersion per aggregate.
   - Server returns current version + cursor for deltas.
2. Pull phase
   - Client requests latest project snapshot (full GET).
3. Apply locally
   - Client validates schema, applies changes, updates local version.
4. Push phase
   - Client sends per-entity deltas (meta/episodes/scenes/roles) with baseVersion.
   - Server applies with compare-and-swap:
     - If baseVersion matches, accept -> new version.
     - If mismatch, return 409 conflict with latest version and server state.
5. Conflict handling
   - Client runs deterministic merge policy.
   - If auto-merge not safe, prompt user and store both copies.
6. Snapshotting
   - Server keeps rolling snapshots (e.g., last 10 versions).
   - Client keeps local backups before applying remote changes.

Conflict Resolution Strategy
- Prefer structured merges over full document overwrites.
- Example rules:
  - Arrays of objects keyed by id: merge by id.
  - For scalar fields: last-write-wins by server version, not client time.
  - For large text fields: keep both (append conflict marker) or prompt user.
- For secrets: never auto-merge; require explicit user confirmation.

Offline and Retry Behavior
- Local queue of pending mutations with stable operation IDs.
- Retry with exponential backoff + jitter.
- All operations must be idempotent; server de-duplicates by operation ID.
- If offline, UI indicates "local only" and shows pending count.

Security and Privacy
- Secrets should be encrypted before storage:
  - Client-side encryption with per-user key (recommended).
  - Or server-side encryption with KMS + strict access controls.
- Avoid sending secrets in project sync payloads.
- Enforce auth on every API call; include deviceId for auditability.
- Remove secrets from logs and crash reports.

Observability and Monitoring
- Add structured logs with traceId, userId, deviceId, version, action.
- Metrics:
  - sync_success, sync_conflict, sync_failed, sync_latency
- Alerts for sustained failure rates or conflict spikes.
- Client-side telemetry for "last sync time" and "pending ops".

Failure Modes and Guardrails
- Never allow empty local state to overwrite non-empty server state.
- Never write to server if initial pull has not completed successfully.
- Validate payloads against schema before saving.
- If validation fails, halt sync and surface error.

User Experience Requirements
- Clear status: "Synced", "Syncing", "Offline", "Conflict".
- Manual "Sync now" and "Restore version" actions.
- Transparent conflict UI with preview of both versions.

Testing and Verification
- Unit tests: merge logic, OCC, tombstones, idempotency.
- Integration tests: multi-device conflicts, offline edits, retry storms.
- Chaos tests: delayed responses, partial failures, server rollbacks.
- Automated regression suite for sync edge cases.

Rollout Plan
1. Add versioning and idempotency on server.
2. Add local op queue and delta sync on client.
3. Introduce conflict UI and snapshot restore.
4. Gradually enable for a percentage of users (feature flag).

Implementation Notes for This Codebase
- Project sync uses normalized tables and a delta payload; `/api/project` supports:
  - GET: reconstruct full ProjectData from tables.
  - PUT: accept `delta` (preferred) or full `projectData` for initial load.
- Secrets sync remains independent.
- Use server-issued `updated_at` from meta for conflict checks.
- Surface sync errors in UI with actionable detail.

Checklist (Minimum for Production)
- Server-side OCC with version IDs and 409 conflicts.
- Client op queue with idempotency keys.
- Snapshotting and restore UI.
- Conflict resolution UI for non-mergeable changes.
- Explicit "initial pull completed" gating before any push.
- Schema validation on client and server.
- Observability and alerting in place.
