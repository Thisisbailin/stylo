import type { QalamResolvedSkill, QalamSkillLoader, QalamSkillManifest } from "./types";
import { GENERATED_SKILL_MANIFESTS, resolveGeneratedSkill } from "./skillManifest.generated";

export const listBuiltinSkills = (): QalamSkillManifest[] => GENERATED_SKILL_MANIFESTS.slice();

export const resolveBuiltinSkill = async (id: string): Promise<QalamResolvedSkill | null> => {
  return resolveGeneratedSkill(id);
};

export const matchBuiltinSkills = (input: {
  userText: string;
  explicitSkillIds?: string[];
}): QalamSkillManifest[] => {
  const explicit = new Set(input.explicitSkillIds || []);
  const text = input.userText.trim().toLowerCase();
  if (!text) return [];
  return GENERATED_SKILL_MANIFESTS.filter((skill) => {
    if (explicit.has(skill.id)) return false;
    if (skill.activationMode !== "implicit") return false;
    const hints = [...(skill.tags || []), ...(skill.implicitInvocationHints || [])]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    return hints.some((hint) => text.includes(hint));
  });
};

export class StaticSkillLoader implements QalamSkillLoader {
  listSkills(): QalamSkillManifest[] {
    return listBuiltinSkills();
  }

  async getSkill(id: string): Promise<QalamResolvedSkill | null> {
    return resolveBuiltinSkill(id);
  }
}
