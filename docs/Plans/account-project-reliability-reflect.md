# Reflect — Account and Project Reliability

What failed / nearly failed:
- The original delete endpoint combined account reset, project reset and project deletion. That allowed a global temporary write-guard table to enter a project-scoped SQL batch and caused the reported `Failed to reset account data`.
- Project creation generated its ID inside the mutation. Repeated submission therefore represented one user intent as two independent projects.
- A tombstone enforced only in the realtime gateway would still leave a narrow race for already-running writes. Database triggers were added so the invariant also exists at the persistence boundary.
- Local browser visual inspection could not finish because localhost navigation was blocked by the browser-control safety policy after an initial refused connection.

Three concrete improvements next time:
1. Model destructive use cases as separate commands and routes from the start; never overload reset and delete with an intent query parameter.
2. Generate idempotency identities at the UI-intent boundary and carry them through every mutation layer.
3. Put irreversible lifecycle invariants in the database as well as gateways, then test the full migration chain in an in-memory database before deployment.

Lessons appended to context memory:
- “Delete project” requires a durable tombstone; clearing rows alone is insufficient in an offline-first multi-writer system.
- Cross-system deletion must fail before authoritative deletion when object storage is unavailable, keeping the operation safely retryable.
- Public identity should expose one canonical name; authentication identifiers stay private and outside public DTOs.

