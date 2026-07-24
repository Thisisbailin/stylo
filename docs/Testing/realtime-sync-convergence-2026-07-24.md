# Realtime Sync Convergence — Test Record — 2026-07-24

## Scope

- Event-driven Yjs project synchronization.
- Realtime handshake delta calculation.
- Removal of snapshot/CAS conflict selection and restore paths.
- Deterministic background account-vault synchronization.
- D1 cleanup and production release.

## Commands and Results

```text
npm run typecheck
PASS

npm test
PASS 180 / 180

npm run build
PASS (Vite chunk-size warnings unchanged)

git diff --check
PASS

SQLite migrations 0001–0007
PASS
Final project tables: deletions, documents, updates, visibility
Deletion-boundary triggers: 10
```

## Production

```text
D1 0006: applied
D1 0007: applied
D1 pending migrations: none

Realtime Worker version:
f36d8c02-ba5a-4dee-a45e-476976b05cd1

Pages deployment:
https://5b40b77c.node-qalam.pages.dev

Production:
https://node-qalam.pages.dev -> HTTP 200
```

## Evidence Block

- Motivation: Remove conflicting snapshot and realtime sync models, eliminate idle writes, and make multi-device collaboration continuous.
- Impact: Project sync hook/engine, Yjs projection, Realtime Durable Object protocol, sync settings UI, account-vault settings sync, D1 schema, project read/Agent projection.
- Plan: Inventory → isolate authorities → add state-vector handshake → remove legacy paths → test → migrate → Worker deploy → Pages deploy.
- Verify: strict typecheck, 180 tests, production build, diff check, local/remote schema inspection, remote deployment and health checks.
- Rollback: Pages can roll back to the previous deployment; Worker can roll back to its prior version. D1 migration 0007 intentionally drops development-only legacy tables and is not data-restorative; realtime documents remain intact.

