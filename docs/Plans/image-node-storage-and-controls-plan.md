# Plan — Image Node Storage And Controls

Architecture Intent Block:
- Keep project graph persistence in its existing D1-backed flow while treating Supabase Storage object references as explicit node-owned resources.
- Put upload, signed-read, reference collection, and authenticated deletion behind a small storage utility/API boundary.
- Use React Flow's asynchronous `onBeforeDelete` gate so cloud cleanup is part of the deletion decision instead of an unobserved side effect.
- Keep the media surface visually primary; controls are a separate, accessible rail outside the image bounds.

Work Breakdown:
1. Add optional image and review-copy storage references plus reusable client storage helpers.
2. Add an authenticated, owner-scoped Supabase bulk-delete endpoint.
3. Upload imported images to private storage, refresh signed URLs, and clean replaced objects.
4. Gate React Flow node deletion on storage cleanup.
5. Refactor the populated image card and theme the port/connection feedback.
6. Add focused tests and run typecheck, unit tests, production build, and local visual interaction checks.

Verification Plan (by AC):
- AC1: CSS source assertion plus visual theme check.
- AC2/AC6: storage-helper unit tests, component-path inspection, typecheck, and local import/reload check.
- AC3/AC4: collector tests, endpoint tests/source assertions, and local deletion failure/success checks.
- AC5: production build and browser screenshots at hover, focus, selected, and idle states.

Rollback Points:
- Remove `onBeforeDelete` and the storage endpoint independently to restore reference-only deletion.
- Revert the image-node markup/CSS without changing stored fields or upload behavior.
- Revert theme CSS variables without touching storage behavior.
