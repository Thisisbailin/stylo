# Plan — Manus Wrapper

Architecture Intent Block:
- Treat Manus as the wrapper/product boundary and screenplay/Fountain as its domain implementation.
- Keep the Stylo adapter thin through a named `ManusPanel` export.
- Keep external project labs as links and local visual/runtime labs as in-app actions.

Work Breakdown:
1. Rename wrapper metadata and introduce the Manus code-facing entrypoint.
2. Convert landing and Lab repository entries to explicit, active links.
3. Create the dedicated GitHub repository and extract a standalone React package from the current editor.
4. Add tests/documentation and validate both repositories.

Verification Plan:
- Static link/name tests for Stylo landing and Lab metadata.
- Stylo: `npm run typecheck`, `npm test`, `npm run build`.
- Manus: `npm run typecheck`, `npm test`, `npm run build`.
- GitHub repository URL and default branch verified with `gh repo view`.

Rollback Points:
- Product naming/link changes can be reverted independently from the new repository.
- `ManusPanel` remains a compatibility adapter, so the existing screenplay implementation can be restored without data migration.
