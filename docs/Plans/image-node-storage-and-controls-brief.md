# Mission Brief — Image Node Storage And Controls

Objective:
- Make connection-port emphasis follow the active Stylo color theme instead of a fixed fluorescent green.
- Store newly imported image-node files in authenticated Supabase Storage and delete every owned storage object before the node is removed.
- Turn populated image nodes into image-first cards whose metadata and actions live in an auto-revealing floating control rail on the right.

Out-of-scope:
- Migrating legacy data-URL images that have no Supabase object reference.
- Moving project graph/state persistence from Cloudflare D1 to Supabase.
- Redesigning audio and video input cards.

Inputs / Outputs (contracts):
- Input: an image `File`, authenticated upload/download/delete API requests, React Flow node deletion candidates, and active theme CSS variables.
- Output: a private Supabase object reference (`storageBucket`, `storagePath`), a signed display URL, guarded deletion of all node-owned objects, and image-only card content with floating controls.

Acceptance Criteria (AC):
- AC1: Port, connection-path, and target-side highlights derive from `--app-accent` / `--node-accent` and contain no fixed green RGB values.
- AC2: A successful image import uploads to the private `assets` bucket and persists its bucket/path reference; signed URLs are refreshed from that reference.
- AC3: Deleting an image node removes its private source object and any public review-copy object first; a failed cloud deletion cancels the local node deletion.
- AC4: The deletion endpoint authenticates the user, accepts only allow-listed buckets, and rejects paths outside `users/<current-user>/`.
- AC5: A populated image card contains only the complete, uncropped image; caption, dimensions, replace, upload state, and review state are exposed through right-side floating controls that reveal on hover/focus/selection.
- AC6: Legacy data-URL and external URL nodes remain readable and deletable without attempting to delete unowned objects.

Constraints:
- No new dependency and no service-role credential in client code.
- Preserve the existing NodeFlow file shape through optional fields.
- Use transform/opacity transitions for the floating controls and retain keyboard labels/focus states.
- Keep private image access time-limited through signed download URLs.

Dependencies & Risks:
- Supabase object deletion and D1 project-state persistence cannot form one cross-provider transaction. The UI therefore deletes storage first and cancels the React Flow deletion on failure.
- A process failure after storage deletion but before D1 persistence could leave a stale node reference. The operation is intentionally fail-closed against storage garbage, and signed previews remain available during the current session.
- Existing data-URL images have no path to delete; only newly uploaded or already referenced objects can be cleaned.

Platform Differences via Platform Layer:
- None. Browser and Electron renderer share the same React Flow and authenticated Pages Functions paths.
