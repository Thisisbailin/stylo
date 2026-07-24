# Mission Brief — Realtime Sync Convergence

Objective:
- Make the realtime Yjs/WebSocket document the only authority for project-content synchronization.
- Send project updates only after a local data mutation; keep idle sessions network-quiet apart from connection liveness and reconnect recovery.
- Remove project-content conflict choices, manual pull/overwrite controls, and legacy snapshot-restore interaction.
- Present a compact top-level realtime status message instead of a version-selection dialog.

Out-of-scope:
- Media-generation job polling and Agent execution polling.
- Manual destructive project reset/delete operations.
- Replacing encrypted API-key storage with collaborative project data.
- Changing the project document schema or public-account visibility model.

Inputs / Outputs (contracts):
- Input: local `ProjectData` mutations, authenticated WebSocket messages, reset/delete room events.
- Output: coalesced Yjs updates, immediate remote application, acknowledgement-backed sync status, offline persistence.
- Project sync never asks the user to select a local or cloud snapshot.

Acceptance Criteria (AC):
- AC1: no project UI or active project runtime exposes local/cloud conflict selection, force pull, or snapshot restore.
- AC2: unchanged `ProjectData` produces no Yjs update and therefore no outbound project write.
- AC3: local mutations are coalesced and sent after the existing short debounce; remote mutations apply immediately.
- AC4: idle sessions do not run periodic project read/write polling.
- AC5: reconnect uses bounded backoff only after connection loss; queued edits survive reconnect.
- AC6: the top status describes realtime connection/saving state in compact text.
- AC7: typecheck, tests, production build, migration verification, and remote deployment pass.

Constraints (perf/i18n/a11y/privacy):
- Preserve offline-first local Yjs persistence and authenticated `(user_id, project_id)` room isolation.
- Do not expose account email, secrets, project content, or credentials in logs.
- Keep controls keyboard-accessible and status text readable without relying on color alone.
- Preserve unrelated worktree changes.

Dependencies & Risks:
- Yjs snapshot projection must not emit updates for semantically unchanged content.
- WebSocket reconnect and acknowledgement timers are recovery mechanisms, not polling, and remain required.
- API-key sync is account configuration, not collaborative project content; it must not surface a project version-choice dialog.

Platform Differences via Platform Layer:
- Browser, desktop wrapper, and mobile web share the same authenticated WebSocket protocol and UI state model.

