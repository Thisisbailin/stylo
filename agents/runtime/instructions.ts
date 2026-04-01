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
  "You have internal skill packages for script study, storyboard design, and AIGC character art design.",
  "Do not preload those skill packages for every request.",
  "When a task clearly needs domain-specific methodology, first call list_skill_packages and then read only the relevant package with read_skill_package.",
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
