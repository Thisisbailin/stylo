# Verify — Stylo Agent Runtime

Date: 2026-07-13

## AC -> Evidence Mapping

- AC1 — Per-run SDK isolation: `tests/agentRuntimeArchitecture.test.ts` verifies distinct clients/providers and statically rejects process-wide Agents SDK default mutation. Result: pass.
- AC2 — DeepSeek compatibility: request/response/stream reasoning normalization and assistant tool-call transaction preservation are covered by focused tests. Result: pass.
- AC3 — Declarative tools: catalog uniqueness, registry parity, capability settings, lookup caching, mutation invalidation and budget classification are covered by focused tests. Result: pass.
- AC4 — Bounded context: shared projection compacts text and item counts, removes incomplete tool transactions, and D1 uses optimistic concurrency. Result: pass.
- AC5 — Deterministic event flow: SDK stream projection deduplicates final output; the React reducer ignores replayed tool terminal events and trips its repeated-failure fuse. Result: pass.
- AC6 — Message rendering: the O(n) tool transaction timeline, HTTP(S)-only links, stale durable-result rejection, runtime HTTP validation and SSE CRLF/multi-line decoding are covered by focused tests. Local DOM smoke check confirmed the Agent surface mounts as `role=log`, `aria-live=polite`, `aria-busy=false`, with no Agent-specific console warning and no unsafe anchors. Result: pass.
- AC7 — Strict typecheck, full tests, production build and offline high-severity dependency audit all pass. Result: pass.

Instruction coverage: **IC = 7/7 = 1.0**.

## Commands and Results

```text
npm run typecheck
PASS — TypeScript strict, exit 0

npm test
PASS — 62/62 tests, 0 failures, exit 0

npm run build
PASS — Vite production build, 7199 modules transformed, exit 0

npm audit --offline --audit-level=high
PASS — 0 vulnerabilities, exit 0

git diff --check
PASS — no whitespace errors, exit 0
```

## Runtime / Platform Matrix

| Surface | Result | Evidence / Limit |
| --- | --- | --- |
| Web client | Pass | Strict typecheck, full test suite, Vite production build and local DOM smoke check. |
| Cloudflare Pages Function + D1 | Pass (static/contract) | Function code participates in strict typecheck; D1 CAS and API adapter boundaries have architecture tests. No deployment or remote D1 mutation was performed. |
| Electron shell | Not rerun | Agent changes are shared web/runtime code; production web bundle passed. Repository policy disallows executing packaging binaries without approval. |
| Live DeepSeek / OpenAI-compatible provider | Not run | Deliberately excluded: no API key access, external network call or billable model request. Compatibility is verified with deterministic request/response/stream fixtures. |

## UI Smoke Check

- Local Vite startup succeeded at `http://127.0.0.1:3000/`.
- Before an unrelated concurrent `index.html` change, the desktop workspace mounted the Agent message log at 388 × 146 px with `role=log`, `aria-live=polite` and `aria-busy=false`; no Agent-specific console issue or unsafe anchor was observed.
- In that workspace-only smoke check, Vite returned `/api/agent` HTTP 404 because the Cloudflare Functions backend was not started; the failure rendered as a visible terminal state. A duplicate React key warning came from existing `CreativeWorkspace` project data (`flow-project-mqpankfk`), outside the Agent stack.
- The concurrent entry-point change was preserved. The current web entry is a public architecture page rather than the desktop workspace; a second smoke check found no console warning/error and exposed the expected `DeepSeek`, `OpenAI Agents SDK` and `Canvas + Flow` runtime claims.
- No user credential, browser storage or remote service was accessed during either check.

## Architecture Intent Evidence

- Domain event and session projection logic is framework-independent and unit-testable.
- Provider creation, DeepSeek normalization, tools, session persistence, HTTP/SSE transport, React control and presentation are separate boundaries with one-way dependencies.
- Global SDK configuration mutation was removed; resource ownership and cleanup are scoped to each run.
- Tool capabilities and message status semantics have one authoritative definition instead of parallel UI/runtime lists.

## Rollback

- Provider runtime and stream projector can be reverted independently behind the existing `runStyloAgent` contract.
- Tool metadata can be reverted without changing individual tool implementations.
- React controller/reducer preserves the external hook contract, so the presentation boundary can be rolled back without changing backend protocol types.
