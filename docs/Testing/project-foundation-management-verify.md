# Verify - Project and Foundation Management

AC -> Evidence Mapping:
- Project create/edit forms expose a required name plus number and range duration inputs: browser DOM verified.
- Duration bounds are 1 and 450 on both duration controls: browser DOM attributes verified.
- Identity System gateway card is removed: browser DOM count is zero.
- Last remaining project cannot be deleted: browser state verified disabled delete control.
- New Foundation seed contains one full-duration time block and four requested space blocks: source contract verified in `foundation/scaffold.ts`.
- Project deletion uses a themed `alertdialog` confirmation before mutation: source and build verified.

Build:
- `npm run build`: pass.
- Vite emitted the existing large-chunk advisory only.
- `tsc --noEmit`: blocked by existing repository-wide errors in Cloudflare WebSocket types, legacy node types, Film Roll dependencies, and unrelated UI files; no diagnostic points to files changed for this feature.

Runtime:
- No new browser console errors were observed.
- Existing Clerk development-key warning remains outside this change.
- A later browser pass was blocked by the local URL security policy, so no destructive project mutation was submitted during verification.
