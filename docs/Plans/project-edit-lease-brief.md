# Project edit lease — Brief

## Problem

Stylo currently protects cloud writes with optimistic version checks, but every signed-in client is still allowed to enter an editable session. Two clients can therefore alternate writes, repeatedly receive `409 Conflict`, and reopen the conflict decision modal even after the user has already chosen a copy.

The persisted cloud resource is the whole account workspace (`ProjectData`), not an individual Flow project. Concurrency control must protect that real write boundary.

## Outcome

- At most one authenticated client may edit and write an account workspace at a time.
- The server, not the UI, is authoritative.
- A lease expires automatically after a crashed or disconnected client stops renewing it.
- A blocked client sees one blocking decision surface: create an isolated local project or exit the signed-in project.
- Identical-content CAS races converge silently instead of opening a false conflict modal.

## Non-goals

- Collaborative multi-writer editing or CRDT/OT merging.
- Per-Flow-project locking before the cloud persistence boundary is partitioned by project.
- Permanent device ownership. The lock is a short renewable session lease.

## Safety invariants

1. Every cloud project mutation requires a live server lease owned by the request device and session.
2. Lease acquisition is atomic and may replace only an expired lease or renew the same session.
3. The client stops staging cloud writes immediately when ownership is lost.
4. Local-only work never silently rejoins cloud sync.
5. Existing CAS/version checks remain in place behind the lease as defense in depth.
