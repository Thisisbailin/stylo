# Plan — Project-scoped cloud storage

## Architecture intent

`project_id` becomes part of the resource identity at every layer: client projection → HTTP request → lease → CAS version → D1 transaction → snapshot/restore/reset. No layer may infer project scope from mutable document content after request validation.

## Work breakdown

1. Add project-ID parsing/validation and a project catalog API.
2. Add a one-time development migration that clears project test data and rebuilds account-keyed tables with composite project keys.
3. Scope project load/save, bulk rows, CAS guards, snapshots, restore, reset, leases, Agent sessions/traces, Seedance ownership, and Supabase object paths.
4. Project the active client project for sync and merge remote data without deleting inactive projects.
5. Key lease and baseline sessions by account + project; send project ID on every project request.
6. Make cloud-project deletion acquire the target project's lease and atomically clear only that project before removing it locally.
7. Add isolation and migration architecture tests.
8. Run typecheck, tests, build, audit, and write verification/reflection evidence.

## Rollback points

- Before migration: revert code and discard migration.
- After migration: retain the composite schema; do not restore account-wide primary keys.
- Client rollback must continue sending `projectId`; removing it would intentionally fail closed.
