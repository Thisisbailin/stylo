import { listBuiltinSkills } from "../runtime/skills";

const listSkillPackagesParameters = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const listSkillPackagesToolDef = {
  name: "list_skill_packages",
  description:
    "List the internal skill packages available to the agent. Use this before reading a skill package when a task may need specialized playbook guidance.",
  parameters: listSkillPackagesParameters,
  execute: async () => {
    const items = listBuiltinSkills().map((skill) => ({
      id: skill.id,
      title: skill.title,
      description: skill.description,
      tags: skill.tags || [],
      preferred_tools: skill.preferredTools || [],
      version: skill.version || "",
    }));
    return {
      total: items.length,
      items,
    };
  },
  summarize: (output: any) => `已列出内部 skill 包，共 ${output?.total ?? 0} 项`,
};
