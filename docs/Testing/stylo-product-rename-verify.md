# Verification — Stylo Product Rename

Date: 2026-07-13

## Outcome

The application now uses Stylo as its canonical product, package, desktop, runtime, and UI identity. Qalam survives only where it is required to read pre-release user data or address GitHub/Cloudflare resources that have not yet been renamed externally.

## Acceptance Criteria Evidence

### AC1–AC3 — Canonical product identity

- `package.json` reports `name: stylo`, `productName: Stylo`, and `appId: ai.stylo.desktop`; the tracked Codex environment display name is also Stylo.
- `metadata.json`, page metadata, landing surfaces, Agent chrome, and About surfaces use Stylo.
- Canonical modules are `StyloAgent`, `styloBridge`, `styloMessageAdapter`, `useStyloAgent`, and `components/stylo/`.
- A case-insensitive filename audit found no Qalam-named active files.
- The old-name source audit found only compatibility readers, tests, and the current external repository/Pages/D1 coordinates.

### AC4 — Persisted state compatibility

- `utils/styloMigration.ts` migrates account-scoped project/config/backups/avatar, theme/debug/activity, execution-approval preferences, conversation/activity-v2, and Agent session state.
- New Stylo state wins; old state is never allowed to overwrite it.
- Unscoped old project data remains behind the existing user-consent migration boundary.
- D1 Agent sessions migrate from `qalam:` to `stylo:` on first access.
- Tests: `pre-release account data and Agent sessions migrate...`, `unscoped pre-release project data waits...`, and account-isolation/reset suites passed.

### AC5 — Project package compatibility

- New exports use `.stylo.zip`, `.stylo/`, `stylo-project-package`, `styloPackageResources`, and `stylo-package://`.
- Import accepts the corresponding Qalam package paths, manifest format, resource field, and resource URL.
- A generated Stylo ZIP was converted into a valid checksummed Qalam-format fixture and imported successfully in `legacy Qalam packages remain importable during the Stylo migration`.

### AC6 — Runtime/desktop protocol compatibility

- New WebSocket credentials use `stylo-auth.`; readers accept the old protocol during migration.
- New proxy credentials use `X-Stylo-Authorization`; the server accepts the old header.
- Electron exposes `window.styloDesktop`, while retaining a temporary old bridge alias for the currently deployed renderer.
- `STYLO_DESKTOP_URL` takes precedence over the old environment name.
- Electron copies old Qalam user-data into Stylo without replacing existing Stylo files.

### AC7 — Artwork

- Web manifest and HTML metadata reference the supplied Stylo PNG artwork.
- Public icons were normalized to real 128, 256, 512, and 1024 pixel variants.
- Electron PNG, ICNS, and ICO assets were generated from the same Stylo artwork and visually inspected after decoding.
- `file` identified the ICNS as a macOS icon and the ICO as a 256×256 PNG-backed Windows icon.

### AC8 — Automated verification

All commands exited successfully:

```text
npm test
85 tests passed, 0 failed

npm run typecheck
tsc --noEmit --strict --pretty false

npm run build
7210 modules transformed; production build completed in 6.20s

git diff --check
no whitespace errors
```

The production bundle emits `stylo-core-*.js` rather than a Qalam-named core chunk.

## External Handoff

The current repository URL, Cloudflare Pages URL, worker name, and D1 database name intentionally remain on their existing Qalam coordinates. After those services are renamed, update the isolated coordinates in `constants/productRepositories.ts`, `agents/tools/accessGithubRepository.ts`, `agents/tools/readRuntimeManual.ts`, `electron/desktop.config.cjs`, `wrangler.toml`, and the README deployment command. Compatibility readers should remain for at least one migration window.

## Residual Risk

Electron packaging/signing and a live Cloudflare deployment were not executed. Static desktop security tests, TypeScript, production web build, icon container inspection, and compatibility tests passed; final signed desktop artifacts should still receive a launch smoke test during release packaging.
