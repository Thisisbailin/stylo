# Project edit lease — Plan

1. Add a D1 lease table and an authenticated acquire/renew/release endpoint.
2. Add a shared server guard and require it for project PUT and snapshot restore mutations.
3. Add a client lease hook with heartbeat, visibility/focus recovery, and ownership-loss handling.
4. Gate project sync on lease ownership and send the lease token with every write.
5. Add a blocking occupied-workspace modal with local-project and exit choices.
6. Make local projects explicitly isolated from cloud sync.
7. Treat an identical remote snapshot after a stale CAS as successful convergence.
8. Add architecture/unit tests, typecheck, production build, and verification notes.

## Rollback

- Revert the client gating and server guard together.
- The additive lease table can remain unused or be dropped in a later migration.
- CAS/version validation remains the underlying write-safety mechanism.
