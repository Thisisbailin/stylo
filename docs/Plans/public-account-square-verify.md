# Verify — Public Account Square

AC -> Evidence Mapping:
- AC1: `migrations/0005_public_account_square.sql`, `functions/api/publication.ts`, `tests/publicAccountSquare.test.ts` -> pass. Account and per-project visibility are persisted separately; publishing requires a unique username.
- AC2: `functions/api/profile.ts`, `functions/api/public-directory.ts`, `functions/api/public-profile.ts` -> pass. Search never returns email or internal user ID; project rows are filtered on the server.
- AC3: `functions/api/public-project.ts`, `functions/api/public-project-realtime.ts`, `realtime-worker/src/index.ts` -> pass. Public sockets are tagged `view`, update attempts are rejected, visibility changes revoke existing viewer sockets, and rolling deploys preserve legacy owner-edit gateways.
- AC4: `functions/api/_publicAccess.ts`, `functions/api/view-traces.ts` -> pass. Authenticated profile/project reads create account-bound traces; self-views are ignored; current presence uses a 45-second heartbeat window.
- AC5: `node-workspace/components/AccountWorkspace.tsx`, `utils/accountProjects.ts` -> pass. The account workspace owns project create/switch/rename/delete and renders the current project hierarchy.
- AC6: `node-workspace/components/FloatingActionBar.tsx`, `node-workspace/components/FlowSurface.tsx` -> pass. Account and User Square entry points are exposed; Foundation's project shelf and project mutation handlers are removed.
- AC7: `node-workspace/components/AccountWorkspace.tsx`, component contract test, strict typecheck and production build -> pass. Full-screen desktop and narrow-screen layouts include loading, empty, error, dialog labels and keyboard-native controls. An authenticated visual smoke test was not possible from the local browser session because it stopped at the sign-in boundary; no authentication bypass was added.
- AC8: local verification -> pass.

Verification Results:
- `npm run typecheck`: pass.
- `npm test`: pass, 195/195 tests.
- `npm run build`: pass; Vite reports the repository's existing large-chunk warning only.
- `git diff --check`: pass.
- Network audit: not run because repository policy requires approval before network access.
- Supabase remote verification: not run; this change does not alter Supabase schema, RLS, authentication, or storage paths. The existing server-only storage cleanup remains unchanged.

Platform Difference Checks:
- Web and Electron share the same React implementation.
- Narrow screens use a single-column content flow and compact icon navigation; desktop uses a persistent account rail and multi-column project/publication layout.
- No native platform-specific branch was introduced.

Production Deployment:
- Realtime Worker `stylo-project-realtime`: version `62e2bfba-100a-4e2c-870e-c03c2d4a625e`, 100% active.
- D1 database `stylo`: migration `0005_public_account_square.sql` applied successfully; remote migration list is empty afterward.
- Production Pages deployment: `0a4b0569-c53c-40f0-9030-3fcb967ae5b1` on branch `main`.
- Immutable deployment URL: `https://0a4b0569.node-qalam.pages.dev`.
- Production alias: `https://node-qalam.pages.dev` returned HTTP 200.
- New unauthenticated directory/profile routes returned HTTP 401; the realtime route returned HTTP 426 without a WebSocket upgrade.
- Remote schema-only inspection confirmed the visibility table, visit table, username index and visit index. No account/project content rows were read.
- Direct access to the Worker's `workers.dev` hostname timed out from the verification network; Cloudflare's deployment control plane reports the new Worker version at 100%, and application traffic uses the Pages Durable Object binding rather than that public hostname.

Rollback:
- Redeploy the previous Pages deployment and Worker version if production errors appear.
- Existing owner edit sockets remain compatible because headerless legacy gateways are interpreted as owner-only edit traffic.
- The additive D1 columns/tables can remain dormant during a code rollback; dropping them is unnecessary and would destroy publication/trace history.

Instruction Coverage:
- 8/8 acceptance criteria covered locally (IC = 1.0).
