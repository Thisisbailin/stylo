# Mission Brief — Project-scoped cloud storage

## Objective

Move cloud project authority from one account-wide aggregate to independent `(user_id, project_id)` resources. Versions, snapshots, edit leases, project metadata, screenplay rows, Flow nodes, Agent history/traces, generated-asset ownership, object storage, restores, and resets must all share that scope.

## Out of scope

- Multi-writer collaborative editing.
- Cross-project transactions.
- Automatic semantic merging between two different project snapshots.

## Contracts

- Every project API request carries a validated `projectId`.
- D1 primary and foreign lookup boundaries use both `user_id` and `project_id`.
- The client synchronizes only the active Flow project projection and preserves inactive local projects.
- A read-only project catalog exposes the projects available to an account.
- A one-time destructive development migration clears legacy test project data and rebuilds project-scoped tables.
- Object storage paths use `users/{user_id}/projects/{project_id}/` and cannot be read or deleted through a sibling project scope.

## Acceptance criteria

1. Writes to project A cannot read, version, snapshot, lease, restore, reset, delete, inspect Agent history, or access objects belonging to project B.
2. Switching the active project creates a separate sync engine and edit lease.
3. Remote application replaces only the matching local project projection.
4. Project test data is cleared once; account profile and encrypted API-key data remain intact.
5. Missing/invalid project IDs fail closed.
6. Typecheck, complete tests, production build, migration syntax, and isolation tests pass.

## Constraints and risks

- The current `ProjectData` client model contains multiple Flow projects; projection and merge must prevent inactive-project loss.
- Migration must run before the matching Functions/client release.
- The migration is intentionally destructive for project/Agent test data and must not be reused later as a production migration strategy.
- Project IDs are opaque identifiers, never authorization tokens; user identity remains the primary authorization boundary.

## Platform differences

None. Web and desktop use the same authenticated HTTP contract.
