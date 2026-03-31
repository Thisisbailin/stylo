import type { QalamSkillDefinition, QalamSkillLoader } from "./types";

const DESIGN_TASTE_FRONTEND_OVERLAY = `
Act as a senior frontend design engineer.
Default to intentional, non-generic visual design and avoid bland SaaS cliches.
Use strong typography hierarchy, restrained color palettes, and meaningful spacing.
Prefer asymmetric but controlled layouts over repetitive equal-width card grids.
Avoid emoji, avoid purple/blue "AI glow" defaults, and avoid generic 3-column feature rows.
When motion is needed, favor transform/opacity animation, spring-based transitions, and staged reveals.
Keep interactions performant: no top/left animation, no noisy repaint-heavy effects on scrolling containers.
If the task is dashboard-like, prefer clean sans-serif systems and reduce decorative chrome.
If using components or libraries, verify they already exist in the project before importing them.
Respect the existing product visual language when modifying an established UI.
`;

const SKILL_DEFINITIONS: QalamSkillDefinition[] = [
  {
    id: "design-taste-frontend",
    title: "High-Agency Frontend Skill",
    description:
      "Senior UI/UX Engineer. Architect digital interfaces overriding default LLM biases. Enforces balanced design engineering.",
    systemOverlay: DESIGN_TASTE_FRONTEND_OVERLAY.trim(),
  },
];

export const listBuiltinSkills = () => SKILL_DEFINITIONS.slice();

export class StaticSkillLoader implements QalamSkillLoader {
  private readonly skills = listBuiltinSkills();

  listSkills(): QalamSkillDefinition[] {
    return this.skills;
  }

  getSkill(id: string): QalamSkillDefinition | null {
    return this.skills.find((skill) => skill.id === id) || null;
  }
}
