# Mission Brief — Incremental realtime sync

## Objective

- Make every authored project action travel and persist as a Yjs increment.
- Remove full-project serialization and remote D1 writes from the ACK path.
- Compact increments into a read snapshot once after an edit burst, not once
  per pointer frame.
- Keep Agent and explicit HTTP reads strongly consistent with acknowledged
  realtime state.
- Show “正在同步更改” only while a real authored update awaits durable ACK.

## Architecture boundary

- Browser Y.Doc: local-first collaborative working state.
- Project Durable Object SQLite: authoritative ordered increment log for one
  `(user_id, project_id)` room.
- D1 `user_project_documents`: compacted read projection for catalog, HTTP,
  public pages, and Agent context.
- IndexedDB: coalesced local offline checkpoint.

## Acceptance criteria

1. A small edit appends only its Yjs update to room SQLite before ACK.
2. The ACK path does not stringify or remotely rewrite the full project.
3. A one-shot alarm, scheduled only by edits, compacts a settled burst into one
   Yjs/JSON projection.
4. Agent and exact project reads flush to at least the required room sequence
   before reading D1.
5. Duplicate operation IDs remain idempotent after update-log compaction.
6. Startup semantic no-ops do not upload or display sync activity.
7. Typecheck, tests, Worker dry-run bundle, and production build pass.

## Constraints

- ACK only after the incremental update is durable in Durable Object SQLite.
- No polling or fixed sync interval.
- Durable Object SQLite is the coordination atom; external D1 I/O must not be
  held inside an input-wide concurrency block.
- Project deletion must clear room authority before D1 projection data.
- No remote migration or deployment without an explicit release action.

## Out of scope

- Replacing Yjs.
- Per-field relational projections of every Flow node.
- Public deployment in this implementation turn.
