# Qalam

Qalam is a node-first creative workspace for script organization, identity assets, and AI-assisted production flow design.

The current product is no longer related to Google AI Studio. This repository now centers on one primary canvas system plus two supporting runtime surfaces:

- `Nodes`: the central infinite canvas with two planes
  - `Flow`: the user-facing workflow surface
  - `Script`: the project archive and script-organization surface
- `Qalam Agent`: a single general-purpose project agent built on `@openai/agents`

## What The App Does

- Import and organize project/script data
- Build visual workflows in `Nodes / Flow`
- Organize script archives in `Nodes / Script`
- Run image, video, audio, and reference-based generation flows
- Use `Qalam Agent` to collaborate across the same graph world:
  - read project archive facts
  - edit script resources
  - operate the visible workflow canvas
- Persist project state locally, with optional cloud sync

## Core Architecture

Qalam no longer treats reading, editing, and operating as actions over three unrelated modules.

The project now revolves around one shared graph philosophy:

- `node`
- `link`
- `map`

This philosophy lands in two tightly related systems:

- `Script`
  - the project archive and script organization surface
  - user-facing on the space axis
  - used by the agent for grounded project context
- `NodeFlow`
  - the upper-level workflow canvas for user work and execution
  - user-facing flow design and execution

In tool terms, the runtime aims to stay aligned to three atomic actions:

- `read`
  - unified graph reading across `Script` and `NodeFlow`
- `edit`
  - script-resource mutation for project archives
- `operate`
  - nodeflow-layer mutation for the visible workflow canvas

The public tool protocol is now intentionally graph-shaped instead of module-shaped:

- `read`
  - `list_project_resources`
  - `read_project_resource`
  - `search_project_resource`
  - uses `layer / entity / view`
  - reads `node / link / map / approval`
- `edit`
  - `edit_script_resource`
  - writes project archive entities on the script surface
- `operate`
  - `operate_project_resource`
  - uses `entity / action`
  - operates only `NodeFlow` graph entities
  - current atomic actions:
    - node: `create / update / move / remove`
    - link: `connect / unlink`

All three now converge on a shared output shape:

- `target`
- `layer`
- `entity`
- `artifact`

So the agent is no longer switching between unrelated tool worlds. It is acting inside one shared graph world with different planes and mutation boundaries.

This means the agent and the user are no longer modeled as working in separate systems.

They collaborate around the same central `Nodes` world:

- the user works mainly on the `Flow` front side
- the agent reads and edits project archives through `Script`
- the agent helps operate the visible workflow canvas

## Current Runtime Stack

- Frontend: React 18 + TypeScript + Vite
- Styling: Tailwind CSS 4
- Canvas/workflow: `@xyflow/react`, `konva`, `zustand`
- Agent runtime: `@openai/agents`
- Auth: Clerk
- Cloud persistence: Cloudflare Pages Functions + D1
- Asset upload helpers: Supabase Storage signed upload URLs

## Model And Provider Paths

Qalam currently supports multiple model/provider lanes depending on the task:

- Agent/chat: `Qwen` or `OpenRouter`
- Image and multimodal text generation: OpenAI-compatible or provider-specific endpoints configured in-app
- Voice and audio flows: `Qwen`
- Video generation: `Seedance`, `Vidu`, plus other service-specific paths already wired in the codebase

Most provider keys can be supplied either:

- through environment variables
- through the in-app settings panels for local use

## Local Development

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Run

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Minimal Local Config

The app can run in a reduced local mode without full cloud services.

If `VITE_CLERK_PUBLISHABLE_KEY` is not set, the app falls back to guest mode and cloud sync is disabled.

For useful local testing, the most common env vars are:

```bash
VITE_CLERK_PUBLISHABLE_KEY=
VITE_API_BASE=

QWEN_API_KEY=
VITE_QWEN_API_KEY=
DASHSCOPE_API_KEY=
VITE_DASHSCOPE_API_KEY=

OPENROUTER_API_KEY=
VITE_OPENROUTER_API_KEY=

VIDU_API_KEY=
VITE_VIDU_API_KEY=
VIDU_BASE_URL=
VITE_VIDU_BASE_URL=

ARK_API_KEY=
VITE_ARK_API_KEY=
VIDEO_API_KEY=
VITE_VIDEO_API_KEY=
```

Notes:

- `Qwen` is the default primary route for the current agent and several media flows.
- `OpenRouter` is supported as an alternate agent/chat path.
- `VITE_API_BASE` is useful when the frontend runs locally but `/api/*` should hit a deployed Cloudflare Pages backend.

## Cloud Sync And Backend

Qalam includes optional authenticated cloud sync backed by Cloudflare Pages Functions and D1.

### Frontend env

```bash
VITE_CLERK_PUBLISHABLE_KEY=
VITE_API_BASE=
VITE_SYNC_ROLLOUT_PERCENT=100
VITE_SYNC_ROLLOUT_SALT=
VITE_SYNC_ROLLOUT_ALLOWLIST=
```

### Pages Functions env

```bash
CLERK_SECRET_KEY=
CLERK_JWT_KEY=

QWEN_API_KEY=
DASHSCOPE_API_KEY=
OPENAI_API_KEY=
OPENROUTER_API_KEY=

OPENAI_TRACING_API_KEY=
AGENT_TRACE_INCLUDE_SENSITIVE_DATA=false

SYNC_ROLLOUT_PERCENT=100
SYNC_ROLLOUT_SALT=
SYNC_ROLLOUT_ALLOWLIST=

SUPABASE_SECRET_KEY=
```

### Wrangler-managed vars

This project uses `wrangler.toml` for non-secret Pages variables. Add plain-text values such as `SUPABASE_URL` under `[vars]` in `wrangler.toml`, not in the Cloudflare dashboard secret editor.

```toml
[vars]
SUPABASE_URL = "https://<project-ref>.supabase.co"
```

Notes:

- Keep `SUPABASE_SECRET_KEY` in Cloudflare Pages secrets.
- `SUPABASE_SERVICE_ROLE` is still supported by the code for backward compatibility, but `SUPABASE_SECRET_KEY` is the preferred current name.
- Asset uploads expect Supabase Storage buckets `public-assets` and `assets` to exist.

### Required bindings

- D1 binding name: `DB`

The project sync endpoints create and evolve the required D1 tables in code, so there is no separate SQL bootstrap requirement for the current schema path.

## Main Backend Surfaces

- `functions/api/agent.ts`: edge agent runtime over `@openai/agents`
- `functions/api/project.ts`: authenticated project persistence and delta sync
- `functions/api/project-snapshots.ts`: snapshot history
- `functions/api/project-restore.ts`: restore from snapshots
- `functions/api/upload-url.ts`: Supabase signed upload URL helper
- `functions/api/download-url.ts`: Supabase download URL helper

## Product Structure

- `App.tsx`: top-level application shell
- `node-workspace/components/NodeFlow.tsx`: central `Script` + `Flow` canvas
- `node-workspace/components/QalamAgent.tsx`: embedded project agent UI
- `node-workspace/components/AgentSettingsPanel.tsx`: provider, tool, and runtime settings
- `agents/`: Qalam agent runtime, unified graph tools, memory, bridge, and guardrails

## Repo Status

This repository has been renamed and cleaned up to match the current product name: `Qalam`.

Legacy references to earlier project names and paths such as `eSheep`, `Script2Video`, and `QalamWeb` have been removed from the active code paths and current docs tracked in the repository.
