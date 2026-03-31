import type { QalamResolvedSkill, QalamSkillLoader, QalamSkillManifest } from "./types";
import { GENERATED_SKILL_MANIFESTS, resolveGeneratedSkill } from "./skillManifest.generated";

export const listBuiltinSkills = (): QalamSkillManifest[] => GENERATED_SKILL_MANIFESTS.slice();

export const resolveBuiltinSkill = async (id: string): Promise<QalamResolvedSkill | null> => {
  return resolveGeneratedSkill(id);
};

export class StaticSkillLoader implements QalamSkillLoader {
  listSkills(): QalamSkillManifest[] {
    return listBuiltinSkills();
  }

  async getSkill(id: string): Promise<QalamResolvedSkill | null> {
    return resolveBuiltinSkill(id);
  }
}
