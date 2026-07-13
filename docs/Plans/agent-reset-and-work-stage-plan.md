# Plan — Agent reset boundary and work-stage messages

## Architecture Intent Block

Treat reset as an account/project boundary operation, not a content edit. The reset coordinator clears the canonical project, the live Flow state, and all project-scoped Agent memory surfaces. Treat Agent rendering as a projection: raw runtime messages remain intact, while a pure timeline projector groups run-owned work into a compact UI stage.

## Work breakdown

1. Add project/account session-prefix helpers and a pure local Agent-storage reset function.
   - AC: only matching conversation, activity, and SDK sessions are removed.
   - Rollback: remove helper and keep existing storage behavior.
2. Wire reset into `App` and forward a reset token through `CreativeWorkspace` to `StyloAgent`.
   - AC: Flow revision is `0`; active Agent run is cancelled/invalidated; conversation is replaced.
   - Rollback: revert token prop and reset coordinator call.
3. Extend the message timeline projection with run-scoped work stages.
   - AC: status/tool/non-final assistant messages group; final answers and approvals stay top-level.
   - Rollback: restore flat projector.
4. Build the compact work-stage renderer and visual states.
   - AC: tools default closed; completed stage auto-closes; active stage can remain open; accessibility labels are present.
   - Rollback: render existing status/tool lines directly.
5. Add tests and run all repository gates.

## Verification plan

- Unit tests for scoped storage cleanup, revision-zero reset, grouping, final-answer separation, and approval preservation.
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm audit --offline --audit-level=high`
- `git diff --check`

## Rollback points

Each numbered step is independently reversible. No schema migration or external dependency is introduced.
