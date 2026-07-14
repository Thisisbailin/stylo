# Plan — Canvas Node Placement

Architecture Intent Block:
- Separate initial placement from interactive movement. Placement may inspect occupancy when a node enters the graph; dragging only mutates the active node.
- Keep alignment calculation pure and make its distances screen-consistent through zoom-adjusted thresholds.

Work Breakdown:
1. Remove render-time normalization of existing node positions.
2. Replace continuous magnetic pull with guide-preview and release-only snap thresholds.
3. Skip snapping for multi-selection and exclude invisible projection anchors from alignment targets.
4. Reduce guide opacity, thickness, animation, and glow.
5. Add focused alignment tests and run typecheck, tests, and production build.

Verification Plan (by AC):
- AC1/AC5: source-path review plus regression test for pure active-node alignment.
- AC2/AC3: alignment unit tests and callback-path review.
- AC4: CSS inspection and production build.

Rollback Points:
- Restore render-time normalization only if legacy projects rely on automatic coordinate rewriting.
- Restore previous guide CSS independently without changing interaction behavior.
