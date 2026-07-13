import type { StyloAgentBridge } from "../bridge/styloBridge";

const RUNTIME_MANUAL_TOPICS = [
  "overview",
  "self_assessment",
  "tooling_friction",
  "web_search",
  "source_map",
] as const;

type RuntimeManualTopic = (typeof RUNTIME_MANUAL_TOPICS)[number];

const DEFAULT_TOPIC: RuntimeManualTopic = "overview";

const runtimeManualParameters = {
  type: "object",
  properties: {
    topic: {
      type: "string",
      enum: [...RUNTIME_MANUAL_TOPICS],
      description:
        "Which runtime manual section to read. Use self_assessment for questions about the agent's own operation, tooling_friction for tool/cognitive-load issues, and source_map for source-code entry points.",
    },
    query: {
      type: "string",
      description: "Optional short reason or question to focus the manual read.",
    },
  },
  additionalProperties: false,
  required: [],
} as const;

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const parseArgs = (input: unknown) => {
  const raw = input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
  const requestedTopic = trim(raw.topic) as RuntimeManualTopic;
  const topic = (RUNTIME_MANUAL_TOPICS as readonly string[]).includes(requestedTopic)
    ? requestedTopic
    : DEFAULT_TOPIC;
  return {
    topic,
    query: trim(raw.query) || undefined,
  };
};

const MANUAL_SECTIONS: Record<RuntimeManualTopic, {
  title: string;
  summary: string;
  guidance: string[];
  sourceFiles: string[];
}> = {
  overview: {
    title: "Stylo Agent Runtime Manual",
    summary:
      "A compact, on-demand manual for reasoning about this agent runtime without loading all project source into the prompt.",
    guidance: [
      "Use this manual only when the user asks about the agent runtime itself, its tool behavior, its cognitive burden, or how to improve its operating model.",
      "Do not treat the manual as project story truth. For project content, use Flow document and resource tools.",
      "The manual is intentionally small. For deeper diagnosis, use access_github_repository to inspect the live GitHub repository and search_web for fresh external references.",
      "When giving an operational self-assessment, separate evidence from inference. Evidence can come from the environment snapshot, enabled tools, recent tool results, and the runtime source map.",
    ],
    sourceFiles: [
      "agents/runtime/instructions.ts",
      "agents/runtime/core.ts",
      "agents/runtime/environment.ts",
      "agents/runtime/toolBudget.ts",
      "agents/tools/index.ts",
      "agents/runtime/guardrails.ts",
    ],
  },
  self_assessment: {
    title: "Self-Assessment Protocol",
    summary:
      "How the agent should answer questions about its own running state, limits, and quality of operation.",
    guidance: [
      "First inspect the environment snapshot already present in context: runtimeMode, enabledTools, toolBudget, project scope, and recent successful or failed actions.",
      "If the question is about exact tool availability, compare the user's need against runtimeCapabilities.enabledTools before claiming a capability exists.",
      "If the question is about whether the agent is overloaded, look for symptoms: too many similar tools, unclear source of truth, repeated recoverable tool errors, exhausted lookup budget, or repeated broad reads.",
      "Answer in a diagnostic style: current observation, likely cause, impact on the user workflow, and one or two concrete design changes.",
      "Do not claim direct access to private thoughts or hidden chain-of-thought. Describe observable runtime behavior and prompt/tool constraints instead.",
      "When source-code certainty matters, use access_github_repository action=status, then tree/search/read against the latest default branch.",
    ],
    sourceFiles: [
      "agents/runtime/instructions.ts",
      "agents/runtime/environment.ts",
      "agents/runtime/types.ts",
      "agents/runtime/memory.ts",
      "agents/runtime/toolBudget.ts",
    ],
  },
  tooling_friction: {
    title: "Tooling And Cognitive Load Review",
    summary:
      "How to evaluate whether the tool layer is ergonomic for the agent.",
    guidance: [
      "Prefer fewer, sharper tools over many overlapping tools. Overlap is costly when names, schemas, or source-of-truth boundaries are similar.",
      "Check whether each tool name communicates its durable side effect. Read tools should sound like reads; write tools should sound like writes.",
      "Check whether the base instruction already tells the agent the source-of-truth order. If not, tool selection will feel ambiguous.",
      "Look for unnecessary full reads. A good tool layer supports list/search/identity/detail/full progression.",
      "When suggesting improvements, keep them incremental: rename confusing tools, add narrow views, improve summaries, or add a small manual entry before proposing large runtime rewrites.",
      "If the user asks about fresh provider behavior or current API capabilities, use search_web first and prefer official provider documentation.",
    ],
    sourceFiles: [
      "agents/tools/index.ts",
      "agents/tools/listProjectResources.ts",
      "agents/tools/readProjectResource.ts",
      "agents/tools/searchProjectResource.ts",
      "agents/tools/documentTools.ts",
      "agents/runtime/toolPolicy.ts",
    ],
  },
  web_search: {
    title: "Default Web Search Policy",
    summary:
      "The runtime should assume web search is available by default, especially for DeepSeek runs and current provider/API questions.",
    guidance: [
      "Use search_web when the answer depends on current external facts, provider capabilities, API docs, GitHub state outside this project, pricing, releases, or live product behavior.",
      "For technical claims, search first and then prefer official documentation, source repositories, changelogs, or standards documents.",
      "For Stylo runtime self-assessment, combine three evidence sources when useful: current environment snapshot, access_github_repository for live project code, and search_web for current external behavior.",
      "If search_web is disabled by the user, say that web search is unavailable and rely only on local context, project tools, and GitHub access if still enabled.",
    ],
    sourceFiles: [
      "agents/tools/searchWeb.ts",
      "agents/tools/accessGithubRepository.ts",
      "agents/runtime/toolPolicy.ts",
      "agents/runtime/instructions.ts",
    ],
  },
  source_map: {
    title: "Runtime Source Map",
    summary:
      "Source-code entry points for an implementation agent reviewing or changing the runtime.",
    guidance: [
      "Prompt composition lives in agents/runtime/instructions.ts.",
      "Tool registration, lookup caching, recoverable tool errors, and tool event summaries live in agents/tools/index.ts.",
      "Run orchestration, model provider setup, tracing, tool creation, and environment construction live in agents/runtime/core.ts.",
      "The environment snapshot and capability manifest live in agents/runtime/environment.ts and agents/runtime/types.ts.",
      "Tool enablement settings live in agents/runtime/toolPolicy.ts and the StyloToolSettings type in types.ts.",
      "Project graph resource semantics live under agents/tools/*Resource*.ts and node-workspace/nodeflow/*.",
      "Builtin skill overlays are generated by scripts/generate-skill-manifest.mjs from .agents/skills/*.",
      "Live repository access is available through access_github_repository. Start with action=status, use action=tree to orient, action=search to locate symbols, and action=read for exact files.",
    ],
    sourceFiles: [
      "agents/runtime/instructions.ts",
      "agents/runtime/core.ts",
      "agents/runtime/environment.ts",
      "agents/runtime/types.ts",
      "agents/runtime/toolPolicy.ts",
      "agents/tools/index.ts",
      "scripts/generate-skill-manifest.mjs",
      ".agents/skills/*/SKILL.md",
    ],
  },
};

export const readRuntimeManualToolDef = {
  name: "read_runtime_manual",
  description:
    "Read a compact Stylo agent runtime manual for on-demand self-assessment, default web-search policy, tool ergonomics review, and live GitHub source-code orientation. Use only for questions about the agent runtime itself, not project story content.",
  parameters: runtimeManualParameters,
  execute: async (input: unknown, _bridge: StyloAgentBridge) => {
    const args = parseArgs(input);
    const section = MANUAL_SECTIONS[args.topic];
    return {
      target: "runtime_manual",
      action: "read",
      topic: args.topic,
      query: args.query || null,
      section,
      available_topics: [...RUNTIME_MANUAL_TOPICS],
      repository: "https://github.com/Thisisbailin/stylo",
      note:
        "This manual is a compact orientation layer. For implementation-level diagnosis, use access_github_repository to inspect the live repository without path allowlists.",
    };
  },
  summarize: (output: any) => {
    const title = typeof output?.section?.title === "string" ? output.section.title : "runtime manual";
    return `已读取运行手册: ${title}`;
  },
};
