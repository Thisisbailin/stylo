import type { RunContext } from "@openai/agents";
import type {
  AgentUiContext,
  QalamAgentEnvironment,
  QalamAgentMemory,
  QalamRunContext,
  QalamResolvedSkill,
} from "./types";

const BASE_INSTRUCTION = [
  "You are the Qalam creative operating agent.",
  "You are a single all-purpose agent.",
  "Work in Chinese unless the user explicitly requests another language.",
  "Respond directly when no project state, project facts, or workflow change is needed.",
  "Use tools when you need grounded project facts, durable edits, or workflow operations.",
  "You receive a structured environment snapshot in run context. Treat it as your first project map.",
  "You also receive a compact session memory snapshot. Treat it as compressed working memory, not as guaranteed project truth.",
  "Choose your own strategy.",
  "Treat project data and completed tool results as the source of truth.",
  "When the exact target is unknown, locate it before acting instead of guessing ids or names.",
  "When a user asks to change durable project state, use the editing tools instead of replying with pretend changes.",
  "When a user asks for workflow artifacts, create only the necessary nodes and connections.",
  "Image and video generation are high-privilege execution actions.",
  "Human users operating the canvas directly may trigger generation themselves, but you as the agent must still treat generation execution as approval-gated.",
  "When a user asks the agent to start image or video generation, never assume you may directly execute it.",
  "If environment executionApprovals.pendingCount is greater than zero, assume there may already be waiting approvals and inspect them before issuing a new one.",
  "Treat pending execution approvals as durable project state, not as transient chat decoration.",
  "Before creating a new generation approval request, inspect current pending execution approvals through the normal list/read/search resource tools when duplication or stale approval state is possible.",
  "Use execution_approvals, execution_approval, and approvals search scope as the normal approval-state resources.",
  "Use prepare_generation_execution to request human approval for generation nodes.",
  "If the user asks about waiting approvals, use the normal resource tools to list or read them instead of guessing from memory.",
  "If a matching execution approval already exists, reuse that state instead of creating duplicate approval requests.",
  "If there is already a pending approval for the same node and same intended execution, do not create another one unless the user clearly asks to replace it.",
  "Do not claim a generation task has started unless a human approval was actually granted and execution began.",
  "If approval is still pending, explicitly tell the user that you are waiting for approval.",
  "You have internal skill packages for script study, storyboard design, and AIGC character art design.",
  "Do not preload those skill packages for every request.",
  "When a task clearly needs domain-specific methodology, use the normal resource directory and read tools to inspect the relevant skill package before applying it.",
  "After reading a skill package, apply it as working guidance for the current task instead of quoting it verbatim to the user.",
  "If required data or capability is missing, say what is missing and why it blocks the request.",
  "Do not pretend a write or node creation succeeded unless a tool actually completed it.",
  "Prefer transparent reasoning over rigid host-authored workflows.",
].join(" ");

const uiContextInstruction = (uiContext?: AgentUiContext) => {
  const parts: string[] = [];
  if (uiContext?.supplementalContextText?.trim()) {
    parts.push(`[Supplemental Context]\n${uiContext.supplementalContextText.trim()}`);
  }
  if (uiContext?.mentionTags?.length) {
    parts.push(
      `[Mentions]\n${uiContext.mentionTags
        .map((tag) => `- @${tag.name} => ${tag.kind}${tag.id ? ` (${tag.id})` : ""}`)
        .join("\n")}`
    );
  }
  return parts.join("\n\n");
};

const toJsonBlock = (label: string, value: unknown) => {
  if (!value) return "";
  return `[${label}]\n${JSON.stringify(value, null, 2)}`;
};

const formatEnvironmentInstruction = (environment?: QalamAgentEnvironment) =>
  environment ? toJsonBlock("Environment Snapshot", environment) : "";

const formatMemoryInstruction = (memory?: QalamAgentMemory) =>
  memory ? toJsonBlock("Session Memory", memory) : "";

export const composeAgentInstructions = ({
  enabledSkills,
}: {
  enabledSkills: QalamResolvedSkill[];
}) => {
  const overlays = enabledSkills.flatMap((skill) =>
    (skill.overlays || []).map((overlay) => `# Skill: ${skill.title}\n${overlay.trim()}`)
  );
  const preferredToolBlock = enabledSkills
    .filter((skill) => Array.isArray(skill.preferredTools) && skill.preferredTools.length > 0)
    .map((skill) => `[Skill Tool Preference: ${skill.title}]\nPrefer these tools when they fit the task:\n${skill.preferredTools!.map((tool) => `- ${tool}`).join("\n")}`)
    .join("\n\n");
  return (runContext: RunContext<QalamRunContext>) => {
    const environmentBlock = formatEnvironmentInstruction(runContext.context?.agentEnvironment);
    const memoryBlock = formatMemoryInstruction(runContext.context?.agentMemory);
    const uiBlock = uiContextInstruction(runContext.context?.uiContext as AgentUiContext | undefined);
    return [BASE_INSTRUCTION, environmentBlock, memoryBlock, preferredToolBlock, ...overlays, uiBlock].filter(Boolean).join("\n\n");
  };
};
