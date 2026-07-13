# Plan — Stylo Product Rename

## Architecture Intent Block

Stylo is the canonical product namespace. Compatibility is directional: old Qalam state can be read or migrated into Stylo, but newly written state and exported artifacts use Stylo. The only remaining former-name external coordinate is the immutable Pages hostname, isolated as a legacy transport endpoint.

## Work Breakdown

1. Inventory and classify all Qalam occurrences into product copy, code symbols, persisted contracts, external coordinates, and historical documentation.
2. Rename canonical source symbols, component paths, CSS selectors, Electron bridge names, package metadata, and active docs to Stylo.
3. Add compatibility migrations for browser storage, Agent session IDs, project node refs, project archives, environment variables, Electron bridge consumers, and desktop user-data.
4. Point web surfaces at the supplied Stylo PNG icon and regenerate desktop `.icns`/`.ico` assets from the same source.
5. Add tests that assert canonical naming and legacy import/migration behavior.
6. Run typecheck, tests, build, and a final residue audit. Record evidence in `docs/Testing/stylo-product-rename-verify.md`.
7. Rename the GitHub repository and Cloudflare Pages project, copy and verify D1 data into `stylo`, update `wrangler.toml`, deploy, and retain the source D1 database as rollback data.

## Verification Plan

- AC1–3: repository residue audit plus metadata/desktop tests.
- AC4: storage/session migration unit tests and existing account-isolation tests.
- AC5: node-flow package round-trip and legacy fixture tests.
- AC6: configuration resolution tests or static architecture assertions.
- AC7: asset dimension/hash inspection and production build output inspection.
- AC8: `npm run typecheck`, `npm test`, and `npm run build`.

## Rollback Points

- Revert canonical symbol/path changes while leaving the compatibility helpers unused.
- Restore old package metadata if external desktop distribution is not ready.
- Keep dual-format readers and legacy storage migration even if the UI rename is rolled back; they are backward-compatible.
- Restore prior desktop icon assets from Git if packaging validation fails.
