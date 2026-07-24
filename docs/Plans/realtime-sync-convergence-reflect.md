# Reflect — Realtime Sync Convergence

What failed / nearly failed:
- The first no-op regression test found that `syncIdArray` wrote its type marker on every React render. That would have created meaningless Yjs updates even when project data was unchanged.
- The first production deployment preceded the final no-op fix. A second verified Pages deployment was required so production matched the tested source state.
- The in-app browser timed out during production visual inspection. HTTP, deployment, schema, build, and source-level UI verification succeeded, but no visual screenshot is claimed.

Three concrete improvements next time:
1. Add a protocol-level fake WebSocket test that counts outbound messages across connect, idle, edit, acknowledgement, and reconnect phases.
2. Build the release artifact only after every final regression test and record its asset manifest hash before deployment.
3. Keep the realtime status UI covered by an automated browser snapshot in CI so visual verification does not depend on an interactive browser session.

Lessons appended to context memory:
- A WebSocket handshake is not automatically event-efficient: sending the full client document after every server sync is still an unnecessary write. State-vector exchange is the correct reconciliation boundary.
- “No polling” requires semantic no-op checks below React, at the shared-data mutation layer.
- Account vault settings and collaborative project content need separate state machines; sharing a generic version-conflict engine created incorrect product semantics.

