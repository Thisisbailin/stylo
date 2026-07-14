# Mission Brief — Canvas Node Placement

Objective:
- Make Flow node dragging deterministic: the dragged node follows the pointer, existing nodes never reflow, and alignment assistance stays visually secondary.
- Keep collision-aware placement only for newly created or imported nodes.

Out-of-scope:
- Automatic graph layout and Foundation scaffold organization.
- Changing persisted node coordinates or link routing formats.

Inputs / Outputs (contracts):
- Input: React Flow node position changes, drag callbacks, viewport zoom, and existing node bounds.
- Output: raw drag positions while moving; an optional final edge snap for one node on release; a low-emphasis guide preview.

Acceptance Criteria (AC):
- AC1: Moving one node never changes another node's stored position.
- AC2: Drag movement is not magnetically rewritten; snapping occurs only on release within 4 screen pixels.
- AC3: Multi-node drag preserves relative positions and skips snapping.
- AC4: Alignment guide visibility begins within 14 screen pixels and remains visually subordinate.
- AC5: New/imported nodes may receive an initial non-overlapping position, but no render-time collision normalization runs.

Constraints:
- No new dependency.
- Preserve current project schema and React Flow integration.
- Thresholds must remain visually consistent across zoom levels.

Dependencies & Risks:
- React Flow emits controlled position changes during drag; project state must continue accepting those positions.
- Final snapping is committed through the existing position-change persistence path.

Platform Differences via Platform Layer:
- None. The behavior is pointer-input based and shared by web and desktop builds.
