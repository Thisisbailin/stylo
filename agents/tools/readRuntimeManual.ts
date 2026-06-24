import type { QalamAgentBridge } from "../bridge/qalamBridge";

const RUNTIME_MANUAL_TOPICS = [
  "overview",
  "self_assessment",
  "tooling_friction",
  "source_map",
] as const;

type RuntimeManualTopic = (typeof RUNTIME_MANUAL_TOPICS)[number];

const DEFAULT_TOPIC: RuntimeManualTopic = "overview";
const REPO_RAW_BASE = "https://raw.githubusercontent.com/Thisisbailin/qalam";
const REPO_BRANCH_CANDIDATES = ["main", "master"] as const;
const DEFAULT_SOURCE_MAX_CHARS = 12000;

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
    source_path: {
      type: "string",
      description:
        "Optional repository source file to read from GitHub. Must be one of the concrete sourceFiles returned by the manual; glob patterns are not supported.",
    },
    include_source: {
      type: "boolean",
      description:
        "Set true only when implementation-level source evidence is needed. The tool will fetch the selected source_path from the Qalam GitHub repository.",
    },
    max_chars: {
      type: "integer",
      description: "Optional maximum source characters to return when include_source=true.",
    },
  },
  additionalProperties: false,
  required: [],
} as const;

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const toPositiveInteger = (value: unknown) => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
};

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
    sourcePath: trim(raw.source_path ?? raw.sourcePath) || undefined,
    includeSource: raw.include_source === true || raw.includeSource === true,
    maxChars: toPositiveInteger(raw.max_chars ?? raw.maxChars) || DEFAULT_SOURCE_MAX_CHARS,
  };
};

const MANUAL_SECTIONS: Record<RuntimeManualTopic, {
  title: string;
  summary: string;
  guidance: string[];
  sourceFiles: string[];
}> = {
  overview: {
    title: "Qalam Agent Runtime Manual",
    summary:
      "A compact, on-demand manual for reasoning about this agent runtime without loading all project source into the prompt.",
    guidance: [
      "Use this manual only when the user asks about the agent runtime itself, its tool behavior, its cognitive burden, or how to improve its operating model.",
      "Do not treat the manual as project story truth. For project content, use Flow document and resource tools.",
      "The manual is intentionally small. It points to source-code entry points so an implementation agent can inspect the repository when deeper diagnosis is needed.",
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
  source_map: {
    title: "Runtime Source Map",
    summary:
      "Source-code entry points for an implementation agent reviewing or changing the runtime.",
    guidance: [
      "Prompt composition lives in agents/runtime/instructions.ts.",
      "Tool registration, lookup caching, recoverable tool errors, and tool event summaries live in agents/tools/index.ts.",
      "Run orchestration, model provider setup, tracing, tool creation, and environment construction live in agents/runtime/core.ts.",
      "The environment snapshot and capability manifest live in agents/runtime/environment.ts and agents/runtime/types.ts.",
      "Tool enablement settings live in agents/runtime/toolPolicy.ts and the QalamToolSettings type in types.ts.",
      "Project graph resource semantics live under agents/tools/*Resource*.ts and node-workspace/nodeflow/*.",
      "Builtin skill overlays are generated by scripts/generate-skill-manifest.mjs from .agents/skills/*.",
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

const concreteSourceFiles = () =>
  Array.from(
    new Set(
      Object.values(MANUAL_SECTIONS)
        .flatMap((section) => section.sourceFiles)
        .filter((sourceFile) => !sourceFile.includes("*"))
    )
  ).sort();

const clipText = (value: string, maxChars: number) =>
  value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;

const fetchSourceFile = async (sourcePath: string, maxChars: number) => {
  const allowed = new Set(concreteSourceFiles());
  if (!allowed.has(sourcePath)) {
    return {
      found: false,
      error:
        "source_path is not in the runtime manual allowlist. Read topic=source_map first and choose one concrete sourceFiles entry.",
      allowed_source_paths: [...allowed],
    };
  }

  for (const branch of REPO_BRANCH_CANDIDATES) {
    const url = `${REPO_RAW_BASE}/${branch}/${sourcePath}`;
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const text = await response.text();
      return {
        found: true,
        branch,
        source_path: sourcePath,
        source_url: url,
        truncated: text.length > maxChars,
        content: clipText(text, maxChars),
      };
    } catch (error: any) {
      return {
        found: false,
        source_path: sourcePath,
        error: error?.message || "Failed to fetch source file.",
      };
    }
  }

  return {
    found: false,
    source_path: sourcePath,
    error: "Source file was not found on the configured GitHub branches.",
    tried_branches: [...REPO_BRANCH_CANDIDATES],
  };
};

export const readRuntimeManualToolDef = {
  name: "read_runtime_manual",
  description:
    "Read a compact Qalam agent runtime manual for on-demand self-assessment, tool ergonomics review, source-code orientation, and allowlisted GitHub source reads. Use only for questions about the agent runtime itself, not project story content.",
  parameters: runtimeManualParameters,
  execute: async (input: unknown, _bridge: QalamAgentBridge) => {
    const args = parseArgs(input);
    const section = MANUAL_SECTIONS[args.topic];
    const source = args.includeSource && args.sourcePath
      ? await fetchSourceFile(args.sourcePath, args.maxChars)
      : null;
    return {
      target: "runtime_manual",
      action: "read",
      topic: args.topic,
      query: args.query || null,
      section,
      source,
      available_topics: [...RUNTIME_MANUAL_TOPICS],
      allowed_source_paths: concreteSourceFiles(),
      repository: "https://github.com/Thisisbailin/qalam",
      note:
        "This manual is a compact orientation layer. For implementation-level diagnosis, set include_source=true with an allowed concrete source_path.",
    };
  },
  summarize: (output: any) => {
    const title = typeof output?.section?.title === "string" ? output.section.title : "runtime manual";
    return `已读取运行手册: ${title}`;
  },
};
