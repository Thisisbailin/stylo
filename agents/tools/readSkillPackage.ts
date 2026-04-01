import { resolveBuiltinSkill } from "../runtime/skills";

const readSkillPackageParameters = {
  type: "object",
  properties: {
    skill_id: {
      type: "string",
      description: "The skill package id returned by list_skill_packages.",
    },
  },
  additionalProperties: false,
  required: ["skill_id"],
} as const;

const parseArgs = (input: unknown) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("read_skill_package 需要对象参数。");
  }
  const raw = input as Record<string, unknown>;
  const skillId = typeof raw.skill_id === "string" ? raw.skill_id.trim() : "";
  if (!skillId) {
    throw new Error("read_skill_package 需要 skill_id。");
  }
  return { skillId };
};

export const readSkillPackageToolDef = {
  name: "read_skill_package",
  description:
    "Read the full guidance markdown for one internal skill package. Use this only when the current task clearly needs that specialized playbook.",
  parameters: readSkillPackageParameters,
  execute: async (input: unknown) => {
    const { skillId } = parseArgs(input);
    const skill = await resolveBuiltinSkill(skillId);
    if (!skill) {
      throw new Error(`未找到内部 skill 包：${skillId}`);
    }
    return {
      id: skill.id,
      title: skill.title,
      description: skill.description,
      version: skill.version || "",
      tags: skill.tags || [],
      preferred_tools: skill.preferredTools || [],
      guidance_markdown: skill.guidanceMarkdown,
    };
  },
  summarize: (output: any) => `已读取内部 skill 包 ${output?.title || output?.id || ""}`.trim(),
};
