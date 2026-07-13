# Verification — Stylo Product Rename

Date: 2026-07-13

## Outcome

The application now uses Stylo as its canonical product, package, desktop, runtime, UI, GitHub, Pages-project, and active D1 identity. Qalam survives only where it is required to read pre-release user data or address the immutable legacy Pages hostname.

## Acceptance Criteria Evidence

### AC1–AC3 — Canonical product identity

- `package.json` reports `name: stylo`, `productName: Stylo`, and `appId: ai.stylo.desktop`; the tracked Codex environment display name is also Stylo.
- `metadata.json`, page metadata, landing surfaces, Agent chrome, and About surfaces use Stylo.
- Canonical modules are `StyloAgent`, `styloBridge`, `styloMessageAdapter`, `useStyloAgent`, and `components/stylo/`.
- A case-insensitive filename audit found no Qalam-named active files.
- The old-name source audit found only compatibility readers/tests and the immutable legacy Pages hostname.

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

## External Migration

- GitHub: `Thisisbailin/qalam` was renamed to `Thisisbailin/stylo`; the local `origin` and in-product repository links use the new coordinate.
- Cloudflare Pages: the project was renamed from `node-qalam` to `stylo` without deleting its deployments, secrets, Git integration, or Functions configuration.
- Cloudflare D1: the source database was exported, a `stylo` database was created in APAC, and all 18 user tables and 230 rows were compared successfully before switching the binding UUID in `wrangler.toml`.
- Deployment: Wrangler published the production Functions bundle and Cloudflare's project API reports the new D1 UUID for both production and preview environments.
- Rollback: the former D1 database remains intact and is not deleted automatically.
- Hostname: Cloudflare does not support changing an assigned `*.pages.dev` subdomain in place. `node-qalam.pages.dev` therefore remains a documented legacy transport endpoint until a Stylo custom domain is attached or a destructive project recreation is separately approved.

Compatibility readers should remain for at least one migration window.

## Residual Risk

Electron packaging/signing was not executed. Static desktop security tests, TypeScript, production web build, icon container inspection, compatibility tests, and the live Cloudflare deployment passed; final signed desktop artifacts should still receive a launch smoke test during release packaging.
