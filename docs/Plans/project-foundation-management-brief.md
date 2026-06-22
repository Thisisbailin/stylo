# Mission Brief - Project and Foundation Management

Objective:
- Let users create, rename, resize, switch, and delete projects from Foundation management.
- Accept project durations from 1 to 450 minutes.
- Seed a single full-duration time block and four space blocks: 规格、风格、角色、场景.
- Preserve existing block split, reorder, resize, archive, and boundary-link interactions.

Out-of-scope:
- Removing the three-project product limit.
- Supporting an empty workspace with no project.
- Changing non-Foundation node behavior.

Inputs / Outputs (contracts):
- Project input: non-empty title and integer duration in the inclusive range 1-450.
- Project updates persist into `ProjectData.flowProjects`, active `flow`, Foundation root, index, and time block documents.
- Project deletion requires an explicit confirmation and leaves at least one project.

Acceptance Criteria (AC):
- New projects require a name and accept any integer duration from 1 through 450.
- Existing projects can update both name and duration.
- A project can be deleted after a confirmation dialog when another project exists.
- New projects start with one time block and exactly four requested space blocks.
- The Identity System card is absent from Foundation management.
- Production build succeeds.

Constraints:
- Reuse existing theme tokens, icons, card styling, and persistence flow.
- Keep keyboard focus states and explicit form labels.

Dependencies & Risks:
- Duration edits must rescale existing time blocks without breaking their order or boundary links.
- Active-project deletion must switch active flow atomically.
