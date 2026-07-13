# Mission Brief — Manus Wrapper

Objective:
- Establish `Manus` as the formal product name for Stylo's screenplay-writing wrapper.
- Use the name in code-facing wrapper APIs and the public landing page while retaining Fountain/screenplay terminology for the underlying document format.
- Add Manus, LookBook, and Cinewor to Lab as active GitHub repository links.
- Publish the current screenplay editor implementation into a dedicated `Thisisbailin/Manus` repository for independent development.

Out-of-scope:
- Removing Stylo-specific screenplay integration from Stylo.
- Replacing the Fountain engine or changing the universal Agent surface.
- Automatically synchronizing future changes between the Stylo and Manus repositories.

Inputs / Outputs (contracts):
- Input: current screenplay engine, editor blocks, chrome, persistence coordinator, styles, landing architecture metadata, Lab entries.
- Output: a named `ManusPanel` wrapper API, updated product copy and repository links, and an independently buildable Manus source repository.

Acceptance Criteria (AC):
- AC1: Landing architecture uses `Manus`, links it to `https://github.com/Thisisbailin/Manus`, and no longer presents it as a disabled wrapper.
- AC2: Lab shows active repository links for Manus, LookBook, and Cinewor; local labs keep their existing open behavior.
- AC3: Stylo imports/renders the screenplay wrapper through the `ManusPanel` name without breaking existing behavior.
- AC4: `Thisisbailin/Manus` exists and contains the screenplay editor engine, React editor, styles, tests, and setup documentation.
- AC5: Stylo typecheck, tests, and production build pass; the Manus repository typecheck, tests, and build pass.

Constraints:
- Preserve unrelated working-tree changes.
- No new Stylo dependencies.
- Repository links open in a new tab with accessible labels.

Dependencies & Risks:
- LookBook is currently private; the Lab/landing link works for authorized GitHub users but remains unavailable publicly until its visibility changes.
- The extracted repository is a point-in-time fork; future synchronization is intentionally manual until a package/subtree strategy is chosen.

Platform Differences via Platform Layer:
- No native platform differences. GitHub links use standard external anchors.
