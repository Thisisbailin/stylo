import type { StyloResolvedSkill, StyloSkillLoader, StyloSkillManifest } from "./types";
import { GENERATED_SKILL_MANIFESTS, resolveGeneratedSkill } from "./skillManifest.generated";

export const listBuiltinSkills = (): StyloSkillManifest[] => GENERATED_SKILL_MANIFESTS.slice();

export const resolveBuiltinSkill = async (id: string): Promise<StyloResolvedSkill | null> => {
  return resolveGeneratedSkill(id);
};

export const resolveActivatedSkills = async (input: {
  explicitSkillIds?: string[];
  loader?: StyloSkillLoader;
}) => {
  const loader = input.loader || new StaticSkillLoader();
  const explicitSkillIds = Array.from(new Set((input.explicitSkillIds || []).filter(Boolean)));
  const resolved = (
    await Promise.all(explicitSkillIds.map((skillId) => loader.getSkill(skillId)))
  ).filter(Boolean) as StyloResolvedSkill[];
  return {
    skills: resolved,
    explicitSkillIds,
    implicitSkillIds: [] as string[],
  };
};

export class StaticSkillLoader implements StyloSkillLoader {
  listSkills(): StyloSkillManifest[] {
    return listBuiltinSkills();
  }

  async getSkill(id: string): Promise<StyloResolvedSkill | null> {
    return resolveBuiltinSkill(id);
  }
}
