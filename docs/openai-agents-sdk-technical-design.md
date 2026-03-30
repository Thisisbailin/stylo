# Qalam Agent Technical Design

## Scope

This document turns the high-level agent architecture into implementation-facing contracts.

It defines:

- runtime API
- runtime event model
- app bridge contract
- v1 tool schemas
- skill loading contract
- UI integration boundary

This document is intentionally biased toward:

- one primary agent
- maximum LLM autonomy
- minimum orchestration code
- explicit action tools

## Capability Taxonomy

The runtime should be designed around four layers:

1. baseline analysis and advice
2. inspect existing data
3. write understanding documents
4. node workflow operations

### Baseline analysis and advice

This layer covers:

- requirement analysis
- option comparison
- planning
- practical recommendations

It does not require tool use for every answer, but should use tools whenever project facts matter.

### Inspect existing data

This is the retrieval layer.
It includes:

- script lookup
- episode and scene lookup
- character and location lookup
- evidence gathering from project data

### Write understanding documents

This is the durable artifact layer.
It includes outputs derived from project data that become the foundation for later work, such as:

- plot synopsis
- episode summary
- character analysis
- location analysis
- storyboard draft
- prompt draft

### Node workflow operations

This is the execution layer.
It includes:

- text node creation
- future workflow scaffolding
- future multi-node workflow creation

## Runtime API

The runtime should expose one primary entry point.

Suggested file:

- `agents/runtime/agent.ts`

Suggested API:

```ts
export type QalamRunInput = {
  sessionId: string;
  userText: string;
  attachments?: AgentAttachment[];
  enabledSkillIds?: string[];
  uiContext?: AgentUiContext;
};

export type QalamRunOptions = {
  onEvent?: (event: AgentRuntimeEvent) => void;
  signal?: AbortSignal;
};

export type QalamRunResult = {
  finalText: string;
  sessionId: string;
  outputItems: AgentOutputItem[];
  toolCalls: AgentExecutedToolCall[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export interface QalamAgentRuntime {
  run(input: QalamRunInput, options?: QalamRunOptions): Promise<QalamRunResult>;
}

export function createQalamAgentRuntime(
  deps: QalamAgentRuntimeDeps
): QalamAgentRuntime;
```

## Runtime Dependencies

```ts
export type QalamAgentRuntimeDeps = {
  bridge: QalamAgentBridge;
  skillLoader: QalamSkillLoader;
  configProvider: QalamAgentConfigProvider;
  sessionStore: QalamSessionStore;
  tracer?: QalamAgentTracer;
};
```

### Dependency responsibilities

`bridge`

- app state access
- app mutations through controlled methods
- durable artifact persistence and node operations

`skillLoader`

- loads skill metadata and prompt overlays

`configProvider`

- returns model/runtime config

`sessionStore`

- stores recent conversation memory and tool activity

`tracer`

- optional observability hook

## Runtime Event Model

The UI should not infer runtime state from raw SDK responses.
The runtime should emit normalized events.

```ts
export type AgentRuntimeEvent =
  | { type: "run_started"; sessionId: string; runId: string }
  | { type: "trace"; runId: string; entry: AgentTraceEntry }
  | { type: "message_delta"; runId: string; delta: string; accumulatedText: string }
  | { type: "tool_called"; call: AgentExecutedToolCall }
  | { type: "tool_completed"; call: AgentExecutedToolCall }
  | { type: "tool_failed"; call: AgentExecutedToolCall; error: string }
  | { type: "message_completed"; runId: string; text: string }
  | { type: "run_completed"; runId: string; result: QalamRunResult }
  | { type: "run_failed"; runId: string; error: string };
```

### Design note

The UI should only consume these events and render:

- tool queue items
- tool results
- thinking / progress status
- assistant text
- error state

The UI should not know whether the runtime internally used one or multiple tool rounds.

## Session Model

Suggested file:

- `agents/runtime/session.ts`

```ts
export type QalamSessionRecord = {
  id: string;
  messages: AgentSessionMessage[];
  updatedAt: number;
};

export type AgentSessionMessage = {
  role: "user" | "assistant" | "tool";
  text?: string;
  toolName?: string;
  toolCallId?: string;
  toolStatus?: "success" | "error";
  toolOutput?: unknown;
  createdAt: number;
};

export interface QalamSessionStore {
  getSession(sessionId: string): Promise<QalamSessionRecord | null> | QalamSessionRecord | null;
  saveSession(record: QalamSessionRecord): Promise<void> | void;
}
```

### Rules

1. Keep session memory small.
2. Long-term truth stays in `ProjectData`, not session history.
3. Tool outputs saved in session should be summarized or structured, not copied as giant blobs unless necessary.

## Agent Config Provider

Suggested file:

- `agents/runtime/config.ts`

```ts
export type QalamAgentModelConfig = {
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export type QalamAgentConfig = {
  model: QalamAgentModelConfig;
  enableTracing?: boolean;
  enableStreaming?: boolean;
};

export interface QalamAgentConfigProvider {
  getConfig(): Promise<QalamAgentConfig> | QalamAgentConfig;
}
```

### Design note

Do not mix provider-specific UI settings into runtime core types.
Normalize them first, then hand one clean config object to the runtime.

## App Bridge Contract

Suggested file:

- `agents/bridge/qalamBridge.ts`

```ts
import type { ProjectData } from "../types";
import type { WorkflowViewport } from "../../node-workspace/types";

export type CreateTextNodeInput = {
  title: string;
  text: string;
  x?: number;
  y?: number;
  parentId?: string;
};

export type CreateTextNodeResult = {
  id: string;
  title: string;
};

export interface QalamAgentBridge {
  getProjectData(): ProjectData;
  updateProjectData(updater: (prev: ProjectData) => ProjectData): void;
  addTextNode(input: CreateTextNodeInput): CreateTextNodeResult;
  getViewport(): WorkflowViewport | null;
  getNodeCount(): number;
}
```

### Bridge rules

1. The bridge is synchronous from the runtime's point of view unless a tool truly needs async.
2. The runtime does not import React components.
3. The runtime does not import Zustand store directly.
4. All write access to app state passes through bridge methods.

## Tool Registration Contract

Suggested file:

- `agents/tools/index.ts`

```ts
export type QalamToolFactoryDeps = {
  bridge: QalamAgentBridge;
};

export type QalamRegisteredTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (input: unknown) => Promise<unknown> | unknown;
};

export function createQalamTools(
  deps: QalamToolFactoryDeps
): QalamRegisteredTool[];
```

### Tool execution rules

1. Unknown tools must fail loudly.
2. Disabled tools must fail loudly.
3. Tool outputs must be explicit JSON-like objects.
4. Tool result summaries for UI should be derived from actual outputs, not synthetic placeholders.

## Tool Classes In V1

The V1 tool layer should map directly to the product capability model.

### Class 1: inspect existing data

Tools:

- `list_project_resources`
- `read_project_resource`
- `search_project_resource`

### Class 2: write understanding documents

Tools:

- `edit_understanding_resource`

For the current implementation, durable understanding documents are persisted directly into project data through one unified tool:

- `edit_understanding_resource`

Supported resource types in the stabilized surface are:

- `project_summary`
- `episode_summary`
- `character_profile`
- `scene_profile`

### Class 3: node workflow operations

Tools:

- `create_workflow_node`
- `connect_workflow_nodes`

For the current implementation, node operations are intentionally atomic.
The agent is expected to plan a workflow by:

1. creating nodes one by one
2. connecting nodes one by one

instead of relying on a broad workflow template tool.

## V1 Tool Schemas

These schemas are product-level contracts, not just SDK registration details.

### Durable artifact rule

Any output that is meant to become the basis for later work should be treated as a durable understanding document.
That means:

- it should be explicit in intent
- it should be saveable
- it should not be treated as ordinary assistant chatter

### `list_project_resources`

Input:

```ts
export type ListProjectResourcesInput = {
  resource_type:
    | "episodes"
    | "understanding_project"
    | "understanding_episodes"
    | "understanding_characters"
    | "understanding_scenes"
    | "understanding_guides";
};
```

Output:

```ts
export type ListProjectResourcesOutput = {
  resource_type: string;
  total?: number;
  items?: unknown[];
};
```

### `read_project_resource`

Input:

```ts
export type ReadProjectResourceInput = {
  resource_type:
    | "episode_script"
    | "scene_script"
    | "project_summary"
    | "episode_summary"
    | "character_profile"
    | "scene_profile"
    | "guide_document";
  name?: string;
  guide_type?: string;
  scene_id?: string;
  episode_id?: number;
  scene_index?: number;
  max_chars?: number;
};
```

Output:

```ts
export type ReadProjectResourceOutput = {
  resource_type: string;
  found: boolean;
  content?: string;
  summary?: string;
  name?: string;
  scene_id?: string;
  scene_title?: string;
  episode_id?: number;
  episode_label?: string;
};
```

### `search_project_resource`

Input:

```ts
export type SearchProjectResourceInput = {
  query: string;
  resource_scopes?: Array<"script" | "understanding" | "characters" | "scenes" | "guides">;
  episode_id?: number;
  max_matches?: number;
  max_chars?: number;
};
```

Output:

```ts
export type SearchProjectResourceOutput = {
  query: string;
  matches: Array<{
    scope: string;
    episode_id?: number;
    scene_id?: string;
    name?: string;
    snippet: string;
  }>;
};
```

### `edit_understanding_resource`

Input:

```ts
export type WriteUnderstandingResourceInput = {
  resource_type: "project_summary" | "episode_summary" | "character_profile" | "scene_profile";
  episode_id?: number;
  name?: string;
  summary?: string;
  bio?: string;
  role?: string;
  is_main?: boolean;
  type?: string;
  description?: string;
  visuals?: string;
};
```

Output:

```ts
export type WriteUnderstandingResourceOutput = {
  resource_type: string;
  created?: boolean;
  updated?: boolean;
  field?: string;
  chars?: number;
  episode_id?: number;
  episode_label?: string;
  name?: string;
  summary?: string;
  bio?: string;
  description?: string;
  visuals?: string;
};
```

### `create_workflow_node`

Input:

```ts
export type CreateWorkflowNodeInput = {
  node_ref: string;
  node_type: "text" | "imageGen";
  title?: string;
  text?: string;
  aspect_ratio?: "1:1" | "16:9" | "9:16" | "4:3" | "21:9";
};
```

Output:

```ts
export type CreateWorkflowNodeOutput = {
  node_ref: string;
  node_id: string;
  node_type: "text" | "imageGen";
  title: string;
  default_output_handle?: "text" | "image" | null;
  default_input_handles?: Array<"text" | "image">;
};
```

### `connect_workflow_nodes`

Input:

```ts
export type ConnectWorkflowNodesInput = {
  source_ref?: string;
  target_ref?: string;
  source_node_id?: string;
  target_node_id?: string;
  source_handle?: "text" | "image";
  target_handle?: "text" | "image";
};
```

Output:

```ts
export type ConnectWorkflowNodesOutput = {
  edge_id: string;
  source_ref?: string;
  target_ref?: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: "text" | "image";
  target_handle: "text" | "image";
};
```

### Operation contract note

The operation layer should remain LLM-plannable.
The agent should compose workflows from repeated atomic actions instead of relying on many pre-baked workflow template tools.

## Current Implementation Status

The current codebase has completed the first runnable milestone:

- one single agent runtime
- OpenAI-compatible `Responses`
- Qwen as the primary provider
- OpenRouter as the fallback provider
- local session persistence
- streaming assistant text in the UI
- normalized runtime events for thinking, tool actions, and tool results

The currently stabilized tools are:

- `list_project_resources`
- `read_project_resource`
- `search_project_resource`
- `edit_understanding_resource`
- `create_workflow_node`
- `connect_workflow_nodes`

The following tool families still exist outside the stabilized tool surface:

- broad retrieval (`read_project_data`, `search_script_data`)
- legacy write paths (`write_project_summary`, `write_episode_summary`)
- multi-node workflow creation
- older operation helpers (`create_text_node`, `operate_project_workflow`)

So the next implementation phase should focus on:

- Cloudflare Pages Functions migration
- guardrails
- session hardening
- understanding-layer expansion
- skill productization
- workflow operation hardening

## Cloudflare Industrialization Direction

The industrialized target runtime should be:

- browser UI on Cloudflare Pages
- primary agent run loop on Cloudflare Pages Functions
- provider secrets in Cloudflare bindings
- sessions and audit persisted in Cloudflare-managed storage

That means the browser should eventually stop directly invoking `run()` with provider credentials.

The migration should happen in this order:

1. define a request/stream protocol for `/api/agent`
2. move the model invocation into Pages Functions
3. keep the browser as a streaming client and local state renderer
4. gradually move session persistence, tracing, and policy enforcement server-side

## Tool Validation Rules

Each tool module should expose:

- input validator
- executor
- optional UI summary formatter

Suggested shape:

```ts
export type ValidatedTool<I, O> = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  validate: (input: unknown) => I;
  execute: (input: I, deps: QalamToolFactoryDeps) => Promise<O> | O;
  summarize?: (output: O) => string;
};
```

### Hard requirement

Do not silently coerce invalid input into fake success.
Validation errors must surface as actual tool failures.

## Skill Loader Contract

Suggested file:

- `agents/runtime/skills.ts`

```ts
export type QalamSkillDefinition = {
  id: string;
  title: string;
  description: string;
  systemOverlay: string;
  preferredOutcome?: "answer" | "understanding_document" | "node_workflow";
  preferredTools?: string[];
  disabledTools?: string[];
  examples?: Array<{
    input: string;
    output: string;
  }>;
};

export interface QalamSkillLoader {
  listSkills(): Promise<QalamSkillDefinition[]> | QalamSkillDefinition[];
  getSkill(id: string): Promise<QalamSkillDefinition | null> | QalamSkillDefinition | null;
}
```

### Loading source

For V1, read from:

- `skills/<skill-id>/SKILL.md`
- `skills/<skill-id>/agents/openai.yaml`

### Skill composition rules

1. Base system instruction always exists.
2. Enabled skills append overlays.
3. Conflicts resolve by runtime composition rules, not by separate agents.
4. If a skill disables a tool, that tool is excluded from that run.

### Skill routing rule

Skills should bias the agent toward one of these outcome patterns:

- answer directly
- inspect then answer
- inspect then write understanding document
- inspect then create node artifact

## Runtime Instruction Composition

Suggested function:

```ts
export type ComposeAgentInstructionsInput = {
  baseInstruction: string;
  enabledSkills: QalamSkillDefinition[];
  uiContext?: AgentUiContext;
};

export function composeAgentInstructions(
  input: ComposeAgentInstructionsInput
): string;
```

### Composition order

1. base instruction
2. product behavior rules
3. active skill overlays
4. optional UI context hints

### Base instruction goals

The base instruction should say:

- the agent is the Qalam creative operating layer
- use tools when facts or mutations are involved
- cite episode/scene evidence when relevant
- never invent successful writes
- if a write is requested, use tools instead of pretending the change happened

## Attachment Contract

V1 recommendation:

- keep attachment support out of the runtime until provider support is confirmed

Define the type now, but mark it unsupported unless runtime path is explicitly implemented.

```ts
export type AgentAttachment = {
  id: string;
  kind: "image";
  name: string;
  mimeType: string;
  url: string;
};
```

### Rule

If attachments are unsupported for the current runtime path:

- reject them explicitly
- or hide them in UI

Do not continue with metadata-only pseudo-vision behavior.

## UI Integration Contract

The UI should call one runtime method and render events.

Suggested hook:

- `agents/react/useQalamAgent.ts`

```ts
export type UseQalamAgentOptions = {
  runtime: QalamAgentRuntime;
  sessionId: string;
  onEvent?: (event: AgentRuntimeEvent) => void;
};

export type UseQalamAgentResult = {
  isRunning: boolean;
  sendMessage: (input: QalamRunInput) => Promise<QalamRunResult>;
  cancel: () => void;
};
```

### UI responsibilities

`QalamAgent.tsx` should:

- collect input
- display messages
- display runtime events
- persist UI conversation records
- distinguish normal replies from durable artifacts when the runtime marks them as such

It should not:

- decide how many tool rounds to run
- parse raw tool call payloads
- implement retry orchestration
- simulate tool results

## Conversation UI Mapping

Current UI uses:

- chat message
- tool message
- tool result message

That can stay, but the mapping should come from runtime events.

Suggested mapper:

```ts
export function mapRuntimeEventToUiMessage(
  event: AgentRuntimeEvent
): Message | null;
```

## Tracing Contract

Optional but recommended.

```ts
export interface QalamAgentTracer {
  onRunStarted(input: QalamRunInput): void;
  onToolCalled(call: AgentExecutedToolCall): void;
  onToolCompleted(call: AgentExecutedToolCall): void;
  onRunCompleted(result: QalamRunResult): void;
  onRunFailed(error: string): void;
}
```

This should be runtime-only and optional.

## Error Model

Normalize errors into stable categories.

```ts
export type AgentErrorCode =
  | "invalid_input"
  | "tool_validation_failed"
  | "tool_execution_failed"
  | "provider_request_failed"
  | "provider_response_invalid"
  | "attachments_unsupported"
  | "runtime_aborted";
```

```ts
export type AgentRuntimeError = {
  code: AgentErrorCode;
  message: string;
  cause?: unknown;
};
```

### Rule

The UI should show user-readable messages.
The runtime should preserve machine-readable error codes.

## Recommended File Layout

```txt
agents/
  bridge/
    qalamBridge.ts
  runtime/
    agent.ts
    config.ts
    instructions.ts
    session.ts
    skills.ts
    types.ts
  tools/
    index.ts
    readProjectData.ts
    searchScriptData.ts
    upsertCharacter.ts
    upsertLocation.ts
    createTextNode.ts
    schemas.ts
  react/
    useQalamAgent.ts
```

## Implementation Sequence

### Step 1

Create types and contracts only:

- runtime types
- bridge interface
- tool input/output types
- skill definition types

### Step 2

Implement bridge and tool modules without changing UI:

- wrap existing `toolActions` logic
- preserve current behavior where correct
- fix contract bugs while extracting

### Step 3

Implement agent runtime:

- base instructions
- tool registration
- session memory
- event emission

### Step 4

Add a thin React hook:

- connect runtime to `QalamAgent.tsx`

### Step 5

Remove legacy hand-written orchestration from UI.

## Explicit Technical Decisions

1. No multi-agent support in V1.
2. No graph runtime in V1.
3. No hidden provider-specific branching in UI.
4. No unsupported attachment path in V1.
5. No fake success on unknown tools.
6. Skills are overlays, not runtime identities.

## Definition of Done For V1

V1 is complete when all of the following are true:

1. A user can ask a script-grounded question.
2. The agent can autonomously choose read/search tools.
3. The agent can answer with grounded output.
4. The agent can write a durable understanding artifact from project data.
5. The agent can persist that artifact as a text node when requested.
6. The agent can update a character or location through tools.
7. The UI only renders runtime events and no longer contains custom tool orchestration logic.
