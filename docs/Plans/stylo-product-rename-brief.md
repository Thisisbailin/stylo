# Mission Brief — Stylo Product Rename

## Objective

Promote `Stylo` from the public-facing label to the canonical application name across the web app, Electron desktop app, runtime code, package metadata, documentation, and visual assets, replacing the former internal codename `Qalam`.

The rename must not make existing local projects, Agent conversations, saved desktop state, exported project packages, or Cloudflare data unreadable while external resources are migrated to `stylo`.

## Out of scope

- Replacing or redesigning the user-provided Stylo icon.
- Reworking Manus, LookBook, Cinewor, or unrelated workspace interaction behavior.
- Removing compatibility for existing `.qalam` project packages or Qalam-namespaced persisted browser data.

## Inputs / Outputs

Inputs:

- Existing source identifiers and visible strings containing `Qalam`, `qalam`, or `QALAM`.
- Existing persisted keys, session IDs, Electron bridge names, exported package manifests, and deployment environment names.
- The user-provided `public/icon-*.png` Stylo artwork.

Outputs:

- `Stylo`, `stylo`, and `STYLO` become the canonical names used by current code and UI.
- Web metadata, landing page, desktop metadata, window chrome, and package metadata use Stylo.
- New project exports use the Stylo package namespace and extension.
- Existing Qalam browser storage, session identifiers, project packages, Electron bridge clients, environment variables, and the immutable Pages hostname remain readable through an explicit legacy compatibility layer.
- The GitHub repository, Cloudflare Pages project, and active D1 database use `stylo`.
- Desktop and web icon targets are generated from or reference the current Stylo artwork.

## Acceptance Criteria

1. Active user-facing product text contains no Qalam branding; the immutable Pages hostname may appear only as a documented legacy transport coordinate.
2. Canonical TypeScript/React/runtime symbols and active file paths use Stylo naming.
3. Package metadata uses `stylo`, product name `Stylo`, and desktop app id `ai.stylo.desktop`.
4. Existing Qalam local storage and Agent sessions migrate without overwriting newer Stylo data.
5. Existing `.qalam`/`qalam-project-package` archives import, while new exports use `.stylo`/`stylo-project-package`.
6. `STYLO_*` and `VITE_STYLO_*` configuration names take precedence, with legacy `QALAM_*` fallbacks during the compatibility window.
7. The web favicon/landing brand and Electron `.icns`/`.ico` assets use the supplied Stylo icon.
8. Type checking, tests, production build, and targeted rename/compatibility assertions pass.

## Constraints

- Preserve unrelated dirty-worktree changes.
- Migrate GitHub and Cloudflare resources without deleting rollback data.
- Do not expose or rewrite local secret values.
- Do not silently discard old persisted data.
- Retain compatibility identifiers only in a clearly named legacy layer or tests.

## Dependencies & Risks

- Changing Electron `appId`/product name may change the user-data directory. Mitigation: migrate the old Qalam directory into Stylo before the first window is created.
- A blind storage-key rename would present an empty project. Mitigation: copy-once migration, Stylo-first reads, and legacy fallbacks.
- Old project archives are durable user files. Mitigation: dual-format import and Stylo-only new export.
- Cloudflare cannot rename an assigned `*.pages.dev` subdomain in place. Mitigation: keep the existing endpoint as a documented legacy transport coordinate until a Stylo custom domain is attached or the project is explicitly recreated.

## Platform Differences

- Web: migrate browser-owned keys and update favicons/metadata.
- Electron: update app metadata and renderer bridge while retaining a legacy bridge alias; migrate the old user-data directory.
- Cloudflare: use the `stylo` Pages project and D1 database; retain the old D1 database as rollback data until a separately confirmed cleanup.
