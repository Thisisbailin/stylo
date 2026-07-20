# Reflect — Multi-device realtime project sync

## What failed or nearly failed

1. The original exclusive-lease rollout referenced a table that did not exist
   remotely, so every owner was denied before project data could load.
2. The first realtime draft wrote the new Yjs document while project catalog
   and Agent reads still used legacy split tables, creating two competing
   sources of truth.
3. Delaying the local Yjs mutation together with the network debounce created a
   race where a remote update could overtake a local React edit.
4. Deleting D1 rows alone could leave an active Durable Object with stale
   in-memory state capable of recreating the deleted project.
5. Cloudflare deployment aliases briefly lagged immutable deployment URLs
   during the one-time storage scan, so deletion evidence had to be based on the
   successful JSON result rather than the first request attempt.

## Three concrete improvements next time

1. Add a deployment contract check that validates every required binding and
   migration before enabling a client feature flag.
2. Introduce a single “project authority” interface first, then migrate every
   reader and writer behind it before shipping a new transport.
3. Include room-memory invalidation, offline cache invalidation, and object
   storage in reset/delete acceptance tests from the first plan revision.

## Lessons appended to context memory

- Transport liveness must never be treated as content ownership.
- Local CRDT application is immediate; only network flushing is debounced.
- A durable reset spans active room memory, D1 checkpoints/logs, local offline
  state, and project object prefixes.
