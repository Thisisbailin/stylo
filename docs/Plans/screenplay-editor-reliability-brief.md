# Mission Brief — Screenplay Editor Reliability

Objective:
- Make Fountain format changes deterministic, prevent false character/scene extraction, and make autosave distinguish its own delayed echoes from external edits.
- Expose the project character library in screenplay Info and let `@` select a canonical existing role.

Out-of-scope:
- Replacing the project-wide agent runtime, redesigning non-screenplay panels, or adding external dependencies.

Inputs / Outputs (contracts):
- Input: Fountain text, project `roles`, script node revisions, block-editor format actions.
- Output: canonical line edits, bounded character/scene identities, conflict-safe saved script nodes, role-library UI bindings.

Acceptance Criteria (AC):
- AC1: Chinese action prose is not inferred as a character; explicit cues and exact role aliases are.
- AC2: localized/duplicated scene time suffixes do not become part of the location.
- AC3: format conversion preserves visible content and autosave does not structurally reinterpret the document.
- AC4: delayed save echoes are acknowledged without false conflicts; genuine external edits still conflict.
- AC5: Info lists project roles and `@` opens a searchable role selector that writes the canonical mention.
- AC6: identity synchronization reuses existing roles and repairs duplicate flow node IDs.

Constraints:
- No dependency changes; preserve existing Fountain documents and user-authored role fields.
- Keyboard interaction remains accessible; all new popovers and controls have labels.

Dependencies & Risks:
- Existing projects may contain already-created spurious identities. This change prevents new ones and repairs duplicate node IDs; it does not automatically delete differently named historical identities.
- Project-wide typecheck can be affected by unrelated in-progress runtime edits in the shared worktree.

Platform Differences via Platform Layer:
- None. The implementation is React/browser based and uses the existing desktop web surface.
