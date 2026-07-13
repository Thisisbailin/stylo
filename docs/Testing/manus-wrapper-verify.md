# Verify — Manus Wrapper

AC -> Evidence Mapping:
- AC1: `tests/manusBranding.test.ts` verifies the landing uses `Manus` and the canonical repository URL — pass.
- AC2: the same test verifies Lab references Manus, LookBook, and Cinewor repository constants; TypeScript/build validate active anchor rendering — pass.
- AC3: `CreativeWorkspace` renders `ManusPanel`; the compatibility adapter preserves the existing implementation — pass.
- AC4: GitHub API reports `Thisisbailin/Manus`, public, default branch `main`, commit `a9a64d0`, with 26 repository tree entries — pass.
- AC5: Stylo and Manus validation suites both pass — pass.

Verification commands:
- Stylo `npm run typecheck` — pass.
- Stylo `npm test` — 68/68 pass.
- Stylo `npm run build` — pass, 7,203 modules transformed.
- Manus `npm run typecheck` — pass.
- Manus `npm test` — 3/3 pass.
- Manus `npm run build` — pass, library output `manus.js` + `manus.css`.
- `git diff --check` — pass.

Repository checks:
- Manus: `https://github.com/Thisisbailin/Manus` — public, `main`.
- LookBook: `https://github.com/Thisisbailin/LookBook` — private, `main`.
- Cinewor: `https://github.com/Thisisbailin/cinewor` — public, `main`.

Design-skill influence:
- Repository wrappers use active, tactile links with a restrained single surface treatment; local labs keep their existing action affordance so navigation semantics remain obvious.

# Evidence Block
- Motivation: give the screenplay wrapper a durable product identity and independent development home.
- Impact: landing architecture metadata, Lab navigation, screenplay wrapper naming adapter, external Manus repository.
- Plan: name boundary -> active repository links -> standalone extraction -> dual-repository verification.
- Verify: Stylo typecheck/68 tests/build and Manus typecheck/3 tests/build all pass; GitHub default branch verified.
- Rollback: revert Stylo naming/link files without touching screenplay data; the independent repository can remain archived or deleted separately if required.
