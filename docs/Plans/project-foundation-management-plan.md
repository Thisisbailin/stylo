# Plan - Project and Foundation Management

Architecture Intent Block:
- Keep project metadata canonical in `FlowProject` and Foundation structure canonical in each project's `FlowState`.
- Share one duration normalizer across hydration, project actions, and Foundation parsing.

Work Breakdown:
- Normalize project duration limits and Foundation defaults.
- Add create/edit/delete project commands that update project metadata and graph documents together.
- Replace the fixed duration selector with labeled name, number, and range inputs.
- Add a themed delete confirmation dialog and remove the Identity System gateway card.
- Build and verify the main management interactions in the running app.

Verification Plan:
- TypeScript/Vite production build.
- Browser verification for create form, edit form, confirmation dialog, and Foundation defaults.

Rollback Points:
- Project action handlers are isolated from node interaction handlers.
- Default axis changes affect newly seeded or missing Foundation structures only.
