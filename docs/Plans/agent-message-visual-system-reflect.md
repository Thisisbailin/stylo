# Reflect — Agent Message Visual System and Rendering Audit

## What failed / nearly failed

1. The first visual pass over-applied theme color to rounded icon badges. It was technically theme-aware but visually read as generic SaaS and diverged from Stylo's landing-page icon language. The corrected split keeps icons editorial and unboxed while letting message surfaces follow Account Theme.
2. A server-rendering test imported `@phosphor-icons/react` through CommonJS under Node 22. The package's current module metadata caused `exports is not defined` before the test ran. The test was replaced with a source-contract assertion, while the actual component was validated in Vite and Electron.
3. Adding a later responsive CSS block exposed an older Foundation test that selected the last `@media (max-width: 760px)` in the entire tail stylesheet. The test now scopes itself to the first narrow-screen block after the feature's final layout marker.
4. Unique icons improved recognition but initially gave every work event equal visual weight. In mixed runs that made the stream feel busier, not clearer. The corrected hierarchy treats icons as identifiers only, while container weight, indentation, contrast, and deduplication determine importance.
5. The first pending-approval hierarchy used an accent rail plus nested bordered surfaces and three strongly styled actions. It dominated the stream but looked over-designed. The final card uses one themed surface, one information region, a quiet divider, and only one primary action.

## Three concrete improvements next time

1. Separate icon language from container language in the initial visual matrix: icon glyph, icon ground, message surface, interaction state, and theme color should each be reviewed independently.
2. Test third-party visual components through the repository's actual Vite runtime when their package export metadata is incompatible with the Node test compiler; reserve source-contract tests for exhaustive mapping and styling invariants.
3. Anchor CSS architecture tests to a feature marker plus its local selector block, never to a global last-occurrence heuristic.
4. Validate message types as realistic mixed sequences, not isolated component specimens; hierarchy failures only become obvious when user, tools, approvals, work summaries, and final answers appear together.

## Lessons appended to context memory

- Stylo's landing page supplies the icon grammar; Account Theme supplies the in-app surface grammar.
- Theme adaptation is not synonymous with adding colored backgrounds. Semantic glyph color plus variable-driven surfaces is sufficient.
- The production Agent history is capped at 120 raw messages, but projection and offscreen rendering should still remain efficient under synthetic worst-case input.
- Distinct message identities and strong message hierarchy are separate requirements: keep semantic icons unique, but subordinate operational events through grouping, indentation, contrast, and redundancy removal.
