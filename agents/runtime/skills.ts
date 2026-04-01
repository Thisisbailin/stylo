import type { QalamResolvedSkill, QalamSkillLoader, QalamSkillManifest } from "./types";
import { GENERATED_SKILL_MANIFESTS, resolveGeneratedSkill } from "./skillManifest.generated";

export const listBuiltinSkills = (): QalamSkillManifest[] => GENERATED_SKILL_MANIFESTS.slice();

export const resolveBuiltinSkill = async (id: string): Promise<QalamResolvedSkill | null> => {
  return resolveGeneratedSkill(id);
};

export const resolveActivatedSkills = async (input: {
  explicitSkillIds?: string[];
  loader?: QalamSkillLoader;
}) => {
  const loader = input.loader || new StaticSkillLoader();
  const explicitSkillIds = Array.from(new Set((input.explicitSkillIds || []).filter(Boolean)));
  const resolved = (
    await Promise.all(explicitSkillIds.map((skillId) => loader.getSkill(skillId)))
  ).filter(Boolean) as QalamResolvedSkill[];
  return {
    skills: resolved,
    explicitSkillIds,
    implicitSkillIds: [] as string[],
  };
};

export class StaticSkillLoader implements QalamSkillLoader {
  listSkills(): QalamSkillManifest[] {
    return listBuiltinSkills();
  }

  async getSkill(id: string): Promise<QalamResolvedSkill | null> {
    return resolveBuiltinSkill(id);
  }
}
