# Project-scoped cloud storage — Architecture reflection

## Resulting authority boundary

The cloud no longer treats an account as one mutable project aggregate. Each project owns an independent metadata/version row, child rows, snapshots, edit lease, Agent history, traces, generated-asset ownership, and object-storage prefix under `(user_id, project_id)`.

The client still presents up to three Flow projects in one local `ProjectData` shell, so synchronization uses a projection boundary: only the active project is serialized to one cloud resource, and applying remote state replaces only that project in the local list. Reset and delete follow the same rule and preserve siblings.

## Consistency choices

- Project IDs are validated at the HTTP boundary and never inferred from document payloads.
- Every mutation is fenced both by the project lease and by optimistic version CAS in the same D1 batch.
- Project deletion acquires the target project's lease before clearing its D1 rows and object prefix.
- Agent/session queries use explicit project columns; session-name prefixes are no longer the authorization boundary.
- Supabase paths include both account and project scopes, so a valid account token for project A cannot address project B through the project-scoped endpoints.

## Destructive migration decision

The user confirmed all existing development data is disposable. Migration `0003` therefore drops and recreates project, lease, Agent, trace, and Seedance ownership tables instead of carrying ambiguous account-wide rows forward. Account profiles and encrypted secrets remain intact.

## Remaining debt

1. Migration `0003` is development-only and must never be copied as a future production migration strategy.
2. A future project export/import service should retain the same explicit cloud project ID boundary.
3. Multi-writer editing remains intentionally unsupported; enabling it requires an operation-log/CRDT design rather than weakening the lease.

