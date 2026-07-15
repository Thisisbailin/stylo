# Verify — Agent reset boundary and work-stage messages

## Outcome

Reset creates a new project generation: the live Flow revision returns to `0`, mandatory Foundation initialization remains revision-neutral, and project-scoped Agent browser memory is cleared. Agent runtime messages now render directly as thinking, tool, and answer rows; approvals remain independently actionable.

## AC → evidence mapping

- **AC1 — revision-zero reset:** `resetNodeFlowProjectState` rotates the generation/abort boundary and clears project graph, canvas, asset, context, execution, and approval state with `revision: 0`. Unit test passes.
- **AC2 — scoped Agent memory cleanup:** `resetStyloProjectAgentStorage` removes the matching conversation key, resets activity, and deletes only SDK sessions whose encoded account/project prefix matches. Cross-account preservation unit test passes.
- **AC3 — no pre-reset Agent influence:** generation rotation invalidates durable results already guarded by `StyloAgent`; the reset token cancels the current run and replaces all in-memory conversations with one new empty conversation. The new conversation id also creates a new server session namespace.
- **AC4 — direct work timeline:** the pure timeline projector pairs tool transactions and preserves ordered thinking, tool, intermediate, and final messages without a run-level container. Unit test passes.
- **AC5 — completion cleanup:** redundant connection and response statuses disappear while final assistant Markdown remains a top-level timeline item.
- **AC6 — approvals remain actionable:** approvals remain independent decision cards. Unit test passes.
- **AC7 — repository gates:** all commands below pass.

## Tool-result semantics

The UI no longer treats every normally returned tool call as a successful project action:

- `target=tool_budget`, `skipped=true`, or matching budget/duplicate summaries → **已跳过**
- `updated=false` or `Document not updated` → **未变更**
- real normal completion → **成功**
- runtime/tool exception → **失败**

This is a display projection only; the OpenAI Agents SDK transport contract remains unchanged.

## Verification commands

- `npm run typecheck` → pass, exit `0`
- `npm test` → pass, `75/75`
- `npm run build` → pass, Vite `7.3.6`, `7208` modules transformed
- `npm audit --offline --audit-level=high` → pass, `0 vulnerabilities`
- `git diff --check` → pass

## Platform checks

- Browser renderer: shared React/CSS implementation compiled by the production build.
- Electron renderer: uses the same compiled React/CSS bundle.
- Native Electron visual launch was not performed because repository rules prohibit executing the Electron binary without explicit approval.

## Instruction coverage

IC = `1.0` (`7/7` acceptance criteria covered).

## Evidence Block

- **Motivation:** prevent reset projects from inheriting old revisions or Agent context; reduce message-stream clutter.
- **Impact:** project reset coordinator, NodeFlow initialization/reset, Agent browser storage, conversation lifecycle, timeline projection, Agent message UI.
- **Plan:** isolate reset boundaries; group raw messages without altering runtime history; retain approvals; verify state semantics.
- **Verify:** strict typecheck, 75 tests, production build, offline audit, diff check.
- **Rollback:** revert the reset token/storage coordinator and work-stage projector independently; no migration or dependency rollback is required.
