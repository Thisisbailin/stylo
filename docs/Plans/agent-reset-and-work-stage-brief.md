# Mission Brief — Agent reset boundary and work-stage messages

## Objective

- Make **Reset project data** reset the live Flow revision to `0` and clear project-scoped Agent conversations, tool activity, and local SDK session memory.
- Ensure an in-flight Agent result from the pre-reset account generation cannot repopulate the cleared project.
- Replace the flat status/tool stream with run-scoped work stages. Tool calls stay collapsed by default, and a completed run automatically collapses before its final answer.

## Out of scope

- Changing Agent tool budgets or provider/model behavior.
- Replacing the existing server-side Agent session store.
- Restyling approval cards or the final Markdown answer.

## Inputs / outputs

- Input: account scope, project id, current Flow store, persisted Agent storage, runtime messages.
- Reset output: empty initial project, Flow `revision = 0`, new account generation, empty project-scoped Agent UI/session/activity state.
- Timeline output: user/final messages remain top-level; status, tool, and non-final assistant messages sharing a run id form one work-stage item.

## Acceptance Criteria

1. Resetting project data sets the live NodeFlow revision to `0` and removes nodes, links, graph links, viewport/context assets, approvals, and execution state.
2. The active project's Agent conversation, activity, and matching local SDK sessions are cleared without touching another account or project.
3. The Agent receives a new empty conversation after reset, and any pre-reset in-flight result is ignored by the existing account-generation guard.
4. Multiple status/tool records in one run render under one work-stage summary; individual tool details are closed by default.
5. When a final assistant message arrives, its preceding work stage collapses automatically while the final answer stays visible.
6. Pending approvals remain top-level and actionable.
7. Typecheck, focused unit tests, full tests, build, audit, and diff checks pass.

## Constraints

- No new dependency or network access.
- Use existing theme variables and Phosphor icons.
- Preserve keyboard-native `<details>` semantics and reduced-motion behavior.
- Do not mutate unrelated dirty worktree changes.

## Risks

- Direct `localStorage.removeItem` does not update mounted persisted-state hooks; the reset token must also replace in-memory conversation state.
- A request already running during reset may finish later; account generation must change before clearing project state so its result is rejected.
- Legacy messages without `meta.isFinal` must remain visible rather than being incorrectly hidden as work chatter.

## Platform differences

No platform-specific branch. The behavior is shared by the browser and Electron renderer; server session deletion remains in the existing Pages Function.
