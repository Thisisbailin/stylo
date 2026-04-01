# Qalam Agent Architecture

## Goal

Use `OpenAI Agents SDK JS` as the runtime foundation for a single general-purpose creative agent inside Qalam.

The agent's product role is:

- analyze needs and provide grounded advice
- inspect existing project data such as script and project context
- write durable understanding documents as the foundation for downstream work
- create and modify node workflows to execute actual work

This is not a multi-agent system.
This is one primary agent with domain tools and optional skills.

## Product Position

The agent should not be a generic chat assistant.
It should behave like a domain-native creative operating layer for:

- demand analysis and production guidance
- project data inspection
- understanding document writing
- node-based workflow creation

## Capability Model

The agent should be designed around three primary capability classes, plus one baseline conversational layer.

### Baseline layer: analysis and advice

The baseline layer is always available.
It covers:

- requirement analysis
- tradeoff discussion
- production suggestions
- planning support

This layer does not need tool use for every response, but should use tools when project facts matter.

### Capability 1: inspect existing data

The agent must be able to read what already exists in the project, including:

- raw script
- episode and scene content
- project summary and episode summaries
- character library
- location library
- existing NodeFlow context when relevant

This capability is the retrieval foundation for all grounded work.

### Capability 2: write understanding documents

The agent must be able to produce durable documents derived from project data.
These documents are not casual chat replies.
They are working artifacts that become the foundation for later steps.

Examples:

- plot synopsis
- episode summary
- character analysis
- location analysis
- storyboard draft
- prompt draft

For the current implementation, the first durable understanding artifacts are persisted directly into project data:

- `context.projectSummary`
- `context.episodeSummaries[]`
- `episodes[].summary`

The runtime also supports `create_text_node` as the first operational artifact write path inside NodeFlow.
Later, the project may introduce a dedicated understanding registry, but the conceptual capability should already be explicit now.

### Capability 3: node workflow operations

The agent must be able to create node-based workflows that turn understanding into executable work.

Examples:

- create a text node with a storyboard draft
- create a text node with a shot prompt pack
- create workflow scaffolding for downstream generation work

The agent should eventually do more than create isolated nodes.
Its long-term workflow role is to assemble practical working structures inside NodeFlow.

The system should prefer LLM autonomy in reasoning and planning, while restricting execution to a small, reliable tool surface.

## Why OpenAI Agents SDK JS

`OpenAI Agents SDK JS` matches the target philosophy better than graph-first frameworks:

- agent-first instead of workflow-first
- tool-based autonomy without forcing explicit state graphs
- easy to keep a single all-purpose agent
- natural fit for TypeScript and the existing frontend stack
- supports incremental hardening with sessions, guardrails, tracing, and tool contracts

This project should let the LLM decide:

- when to inspect project data
- when to search script content
- when to write an understanding artifact
- when to update a character or location
- when to create or extend a node workflow
- when to answer directly without tool use

But the project should not let the LLM mutate app state outside explicit tools.

## Core Principles

1. One agent only

There is exactly one primary agent runtime for the product.
No planner agent, no writer agent, no critic agent.
Specialization is provided through skills, not separate agents.

2. Thin orchestration

Do not recreate a custom reasoning loop like the current Qalam implementation.
The runtime should mostly be:

- agent instructions
- tools
- session context
- run invocation
- UI rendering of outputs and tool activity

3. Strict action boundary

All state mutations must happen through tools.
The agent never writes directly into React state or store internals.

4. Skills are capability overlays

Skills are not agents.
A skill is a package of:

- domain instructions
- optional examples
- optional tool preferences
- optional output style constraints

5. Grounded output over freeform invention

When the user asks about script or project content, the agent should prefer using tools and citing episode/scene evidence rather than answering from loose memory.

## Target Runtime Architecture

### Layer 1: UI Layer

Keep the visible UI responsibility in the current frontend:

- chat panel
- conversation history
- attachment UI
- tool activity display
- settings panel

This layer should become presentation-only.
It should not contain agent reasoning logic.

Suggested ownership:

- `QalamAgent.tsx`: becomes a UI shell and event bridge
- `AgentSettingsPanel.tsx`: provider/model/runtime settings only

### Layer 2: Agent Runtime Layer

Add a dedicated runtime module, for example:

- `agents/runtime/agent.ts`
- `agents/runtime/session.ts`
- `agents/runtime/skills.ts`

Responsibilities:

- create the OpenAI agent
- load base instructions
- inject enabled skills
- register tools
- execute runs
- stream or collect outputs
- return structured events to UI

This is the replacement for the current hand-written loop in `QalamAgent.tsx`.

### Layer 3: Tool Layer

Move tool implementations out of UI-specific folders into stable runtime-facing modules.

Suggested destination:

- `agents/tools/readProjectData.ts`
- `agents/tools/searchScriptData.ts`
- `agents/tools/upsertCharacter.ts`
- `agents/tools/upsertLocation.ts`
- `agents/tools/createTextNode.ts`

These can reuse logic from the current:

- `node-workspace/components/qalam/toolActions.ts`

But they should no longer be defined as UI helpers.

### Layer 4: App Bridge Layer

Some tools need access to live app state and store mutation.
That should go through a bridge interface rather than importing React components directly.

Example bridge shape:

```ts
export interface QalamAgentBridge {
  getProjectData(): ProjectData;
  setProjectData(updater: (prev: ProjectData) => ProjectData): void;
  addTextNode(input: {
    title: string;
    text: string;
    x?: number;
    y?: number;
    parentId?: string;
  }): { id: string; title: string };
  getViewport(): NodeFlowViewport | null;
  getNodeCount(): number;
}
```

The agent runtime depends on this bridge, not on React or Zustand internals.

## Tool Set V1

The first version should stay small.

### Class 1: inspect existing data

1. `list_project_resources`

Purpose:

- inspect available project resources before detailed reading

Notes:

- first use should reduce blind guessing
- currently covers episodes and understanding coverage
- later it should expand to workflow and richer project resource catalogs

2. `read_project_resource`

Purpose:

- read a concrete project resource by typed locator

Notes:

- current stabilized resources:
  - `episode_script`
  - `scene_script`
  - `project_summary`
  - `episode_summary`
  - `character_profile`
  - `scene_profile`
  - `guide_document`

3. `search_project_resource`

Purpose:

- locate unknown or fuzzy resources before exact reads

Notes:

- current stabilized scopes:
  - `script`
  - `understanding`
  - `characters`
  - `scenes`
  - `guides`

### Class 2: write understanding documents

4. `edit_understanding_resource`

Purpose:

- persist durable understanding artifacts into project data

Requirements:

- current stabilized resource types:
  - `project_summary`
  - `episode_summary`
  - `character_profile`
  - `scene_profile`
- the write surface is now unified by resource type instead of many separate write tools

### Class 3: node workflow operations

5. `create_workflow_node`

Purpose:

- create a single workflow node the agent can later connect into a working graph

Requirements:

- explicit `node_ref` required
- current stabilized node types:
  - `text`
  - `imageGen`
- return `node_ref`, `node_id`, and default head/tail handle metadata

6. `connect_workflow_nodes`

Purpose:

- connect the tail of one existing node to the head of another

Requirements:

- prefer `source_ref` and `target_ref`
- support fallback `source_node_id` and `target_node_id`
- current default connection matrix:
  - `text -> text` uses `text/text`
  - `text -> imageGen` uses `text/text`
- the graph itself may later support one-to-many and many-to-one edges without requiring new tools

## Current Implementation Snapshot

As of the current refactor stage, the runtime is no longer a hand-written chat loop.
It is a single-agent runtime built around:

- `OpenAI Agents SDK JS`
- OpenAI-compatible `Responses`
- local session persistence
- explicit bridge-based tools
- UI-side activity rendering for thinking, tool actions, tool results, and streaming assistant output

The currently stabilized tool surface is:

- `list_project_resources`
- `read_project_resource`
- `search_project_resource`
- `edit_understanding_resource`
- `create_workflow_node`
- `connect_workflow_nodes`

The following tools exist but are not part of the stabilized runtime surface yet:

- `read_project_data`
- `search_script_data`
- `upsert_character`
- `upsert_location`
- `write_project_summary`
- `write_episode_summary`
- `create_text_node`
- `create_node_workflow`

This means the project has completed the first runnable milestone:

- one single agent
- stable Qwen/OpenRouter Responses path
- minimal inspect / write / operate capabilities
- streaming UI feedback

But it has not yet completed:

- understanding-layer expansion
- skill productization
- workflow scaffold stabilization
- guardrails
- Cloudflare Pages Functions runtime migration
- session compaction and deterministic input shaping
- production-grade tracing and policy enforcement

## Cloudflare Deployment Target

The industrialized deployment target is:

- frontend UI on Cloudflare Pages
- agent runtime on Cloudflare Pages Functions
- browser acting only as presentation and event-consumer
- provider secrets stored in Cloudflare environment bindings

This project does not need a self-managed server to become production-shaped.
But it does need to stop running the primary agent runtime inside the browser.

The migration target should therefore be:

1. `QalamAgent` becomes a client of `/api/agent`
2. the main `run()` invocation moves into a Pages Function
3. sessions, audit, and later tracing move to Cloudflare-managed storage and observability primitives

## Industrialization Roadmap

The recommended order is:

1. Move runtime execution from the browser to Cloudflare Pages Functions.
2. Introduce session hardening:
   - trim
   - compaction
   - deterministic session input shaping
3. Add guardrails:
   - input classification
   - tool input validation
   - tool output validation
   - write/operation tripwires
4. Add production tracing instead of relying mainly on browser debug logs.
5. Separate stable tools from legacy tools in the registry and docs.
6. Continue expanding understanding and workflow capabilities only after the execution substrate is controlled.
- formal tracing integration

## Skill Model

Skills should be stored as local assets and loaded dynamically.

Suggested structure:

- `skills/<skill-id>/SKILL.md`
- `skills/<skill-id>/agents/openai.yaml`
- optional examples or references

Each skill should define:

- purpose
- activation hints
- output style
- preferred capability class and preferred tools
- constraints

### Example skill categories for Qalam

1. `script-analysis`

Focus:

- summarize plot
- identify dramatic beats
- find scene conflicts

2. `storyboard-writer`

Focus:

- convert scenes into shot-oriented storyboard drafts
- maintain visual continuity

3. `character-bible-editor`

Focus:

- maintain forms, visual states, and design rationale

4. `prompt-polish`

Focus:

- rewrite prompts for image/video generation
- improve specificity without changing intent

### How skills should affect runtime

Skills should modify:

- instruction blocks
- examples
- allowed or preferred tools
- answer style

Skills should not create independent agent identities.

## Session and Memory Model

The agent should use session memory, but keep long-term project truth in project data.

### Session memory

Use for:

- recent conversation turns
- current user intent
- current drafting context

Do not use session memory as canonical project storage.

### Project memory

Canonical truth stays in:

- `ProjectData`
- character library
- location library
- NodeFlow nodes

The model may remember a draft in session, but any approved artifact should be written via tools.

## Attachments

Attachment support should be redesigned instead of patched.

Current issue:

- the UI accepts images
- the runtime does not truly pass them into the model

Target design:

1. If the model/runtime supports image input, pass normalized attachment content explicitly.
2. If not supported, disable image attachments for that provider/runtime path.
3. Never imply the model has seen an image when only filename metadata was sent.

## Guardrails

The project should keep guardrails light, not heavy.

Recommended guardrails:

1. Grounding guardrail

When answering about script/project facts, prefer tool-backed evidence.

2. Write-action guardrail

Before mutating character/location libraries or creating nodes, the action should be explicit in the tool call and visible in UI.

3. Schema guardrail

All tool IO must be validated.
Invalid tool output should fail visibly, not silently degrade to fake success.

4. No hidden success

Unknown or unavailable tools must return errors, never synthetic success placeholders.

## Replacement Plan For Current QalamAgent

### Keep

- visual shell and panel layout in `QalamAgent.tsx`
- settings UI in `AgentSettingsPanel.tsx`
- project schemas in `types.ts`
- useful tool logic from `toolActions.ts`
- workflow store integration points

### Replace

- custom mode detection loop
- manual multi-step tool orchestration
- tool-call success simulation
- attachment pseudo-support
- UI-owned agent logic

### Deprecate

- `node-workspace/components/qalam/useQalamTooling.ts`
- most of the orchestration code inside `QalamAgent.tsx`

### Extract

Move these into runtime-oriented directories:

- tool schemas
- tool execution layer
- skills loader
- agent bootstrap

## Suggested Directory Layout

```txt
agents/
  runtime/
    agent.ts
    session.ts
    instructions.ts
    skills.ts
    types.ts
  tools/
    index.ts
    readProjectData.ts
    searchScriptData.ts
    upsertCharacter.ts
    upsertLocation.ts
    createTextNode.ts
  bridge/
    qalamBridge.ts
skills/
  script-analysis/
    SKILL.md
    agents/openai.yaml
  storyboard-writer/
    SKILL.md
    agents/openai.yaml
  character-bible-editor/
    SKILL.md
    agents/openai.yaml
```

## Migration Stages

### Stage 1: Runtime skeleton

Goal:

- introduce OpenAI Agents SDK JS runtime
- no behavior change in UI yet

Deliverables:

- agent bootstrap
- session wiring
- empty skill loader
- tool registration shell

### Stage 2: Tool migration

Goal:

- move current tools to runtime-safe modules

Deliverables:

- bridge interface
- read/search tools
- write tools
- strict tool validation

### Stage 3: UI integration

Goal:

- make `QalamAgent.tsx` call the new runtime

Deliverables:

- chat send path migrated
- tool events surfaced in UI
- conversation persistence preserved

### Stage 4: Skill activation

Goal:

- load domain skills

Deliverables:

- skill registry
- per-run skill selection
- instruction composition

### Stage 5: Hardening

Goal:

- remove legacy orchestration
- add tracing and action visibility

Deliverables:

- runtime logs
- better error reporting
- attachment path correctness

## Recommended First Build Scope

Do not try to rebuild the full agent at once.

The first useful vertical slice should be:

1. user asks a script question
2. agent decides whether to call `get_episode_script` or `get_scene_script`
3. agent reads the relevant script body
4. agent produces a grounded understanding artifact or answer
5. optionally persists that artifact as a project summary, episode summary, or text node if the user asks to save the result

This proves:

- runtime integration
- tool autonomy
- project grounding
- understanding-document write flow
- basic node operation flow

without rebuilding the entire Qalam surface area immediately.

## Non-Goals

The new architecture should explicitly avoid:

- multi-agent orchestration
- graph-first runtime design
- hidden automatic writes to project state
- provider-specific hacks inside UI components
- pretending unsupported attachments were understood

## Decision Summary

Chosen foundation:

- `OpenAI Agents SDK JS`

Rejected as primary foundation:

- `LangGraph.js` for now, because the project prefers agent autonomy over graph-first control
- `OpenClaw`, because it is too product-heavy for embedding into Qalam
- `Nanobot`, because it is not mature enough to serve as the core runtime here

## Immediate Next Step

Create a technical design for:

- agent runtime API
- bridge contract
- v1 tool schemas
- skill loading contract

That document should directly drive implementation.
