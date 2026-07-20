# Mission Brief — Multi-device realtime project sync

## Objective

- Replace project edit leases with authenticated multi-writer collaboration.
- Let desktop, mobile, and web edit the same `(user_id, project_id)` concurrently.
- Propagate accepted operations to other connected devices without a blocking
  conflict dialog or editing-right modal.
- Reset all development project data once before the new protocol is deployed.

## Out of scope

- Anonymous/guest projects.
- Collaboration between different account owners.
- Preserving pre-realtime test project data.
- Deleting Clerk accounts, account profiles, account avatars, or encrypted API
  key settings during the project-data reset.

## Contracts

Client update:

```ts
type ProjectRealtimeUpdate = {
  type: "update";
  actorId: string;
  opId: string;
  update: string; // base64 Yjs update
};
```

Server messages:

```ts
type ProjectRealtimeMessage =
  | {
  type: "sync" | "update";
  serverSeq: number;
  update: string;
}
  | {
  type: "ack";
  opId: string;
  serverSeq: number;
}
  | {
  type: "reset";
  mode: "reset" | "delete";
}
```

- `opId` is idempotent per account/project.
- `serverSeq` is monotonic per account/project.
- D1 stores the Yjs checkpoint, materialized project JSON, and a bounded update
  log under `(user_id, project_id)`.
- Entity arrays are represented as Yjs maps keyed by stable IDs; text values use
  `Y.Text`.
- Reconnect sends the current Yjs state vector checkpoint and idempotently
  resends locally unacknowledged updates.
- Reset/delete first clears the active Durable Object room, broadcasts the
  reset, and only then removes durable rows and object storage.

## Acceptance criteria

1. No project route or UI requires `x-project-edit-lease`; no 423 editing gate
   can prevent an authenticated owner from opening a project.
2. Two clients can update different nodes concurrently and converge to the same
   graph without a conflict prompt.
3. Concurrent edits to the same Markdown/script document converge without
   dropping either client's non-overlapping input.
4. An operation committed by client A is visible on connected client B through
   the realtime channel; reconnecting clients merge the authoritative Yjs
   checkpoint without a destructive overwrite.
5. Offline operations remain queued locally, are idempotently replayed, and
   converge after reconnect.
6. The one-time reset deletes all project-scoped D1 state and project object
   storage for every account, while preserving account identity/settings.
7. Automated tests cover idempotency, reconnect retry, concurrent entity edits,
   concurrent text edits, hibernation recovery, and stale-room reset.

## Constraints and risks

- Realtime delivery needs a stateful WebSocket coordinator; D1 alone cannot
  push changes to connected clients.
- A CRDT library is recommended for text correctness rather than implementing
  an unreviewed custom text algorithm.
- The reset is irreversible and has no data rollback.
- Functions, database migration, realtime worker, and clients must deploy as
  one compatibility boundary because old lease clients will no longer write.
- WebSocket authentication must validate the Clerk account before joining a
  project room; room identity is always derived from authenticated user and
  normalized project ID.

## Platform differences

- Desktop, mobile web, and desktop web use one protocol and state machine.
- Backgrounded mobile clients disconnect and replay from the last acknowledged
  `serverSeq` when foregrounded.
