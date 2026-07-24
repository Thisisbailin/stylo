# Plan — Realtime Sync Convergence

Architecture Intent Block:
- `RealtimeProjectSyncEngine` is the sole project-content sync state machine.
- React observes immutable project-state mutations and stages them into one Yjs document.
- Yjs emits a network update only when its shared types actually change.
- WebSocket inbound messages are push-driven; outbound messages are mutation-driven and acknowledgement-backed.
- UI consumes connection state and never participates in reconciliation.

Work Breakdown (≤1 day each):
1. Inventory active and dead sync paths, conflict UI, manual refresh, polling, and snapshot restore.
2. Remove project manual refresh and legacy version-choice surfaces.
3. Add explicit semantic no-op protection and event-driven status behavior to the realtime engine.
4. Make API-key reconciliation deterministic and non-blocking so no cloud conflict dialog can interrupt editing.
5. Add architecture/regression tests and update verification records.
6. Run local quality gates, apply the pending D1 migration, deploy Worker and Pages, then verify production.

Verification Plan (by AC):
- AC1: source-architecture tests assert removed imports, controls, endpoints, and labels.
- AC2–AC5: realtime engine tests inspect mutation/no-op behavior, update coalescing, reconnect-only timers, and absence of intervals.
- AC6: component test/source assertion for compact realtime status copy and absence of force-sync action.
- AC7: `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`, D1 migration/trigger inspection, deployment output, production health checks.

Rollback Points:
- UI removal can be reverted independently from engine changes.
- Engine no-op/status changes can be reverted without changing the D1 schema.
- Worker and Pages deployments can be rolled back to their prior deployment versions; migration 0006 is additive and can remain dormant.

