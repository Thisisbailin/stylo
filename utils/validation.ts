type ValidationResult = { ok: true } | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export const validateProjectData = (data: unknown): ValidationResult => {
  if (!isRecord(data)) return { ok: false, error: "projectData is not an object" };
  const rawScript = (data as Record<string, unknown>).rawScript;
  if (rawScript !== undefined && !isString(rawScript)) {
    return { ok: false, error: "rawScript is not a string" };
  }

  const context = (data as Record<string, unknown>).context;
  if (context !== undefined) {
    if (!isRecord(context)) return { ok: false, error: "context is not an object" };
    const projectSummary = (context as Record<string, unknown>).projectSummary;
    if (projectSummary !== undefined && !isString(projectSummary)) {
      return { ok: false, error: "context.projectSummary is not a string" };
    }
    const roles = (context as Record<string, unknown>).roles;
    if (roles !== undefined) {
      if (!Array.isArray(roles)) return { ok: false, error: "context.roles is not an array" };
      for (let i = 0; i < roles.length; i += 1) {
        const role = roles[i];
        if (!isRecord(role)) return { ok: false, error: `context.roles[${i}] is not an object` };
        if (!isString(role.name)) return { ok: false, error: `context.roles[${i}].name is not a string` };
        if (!isString(role.mention)) return { ok: false, error: `context.roles[${i}].mention is not a string` };
        if (!Array.isArray(role.portraits)) return { ok: false, error: `context.roles[${i}].portraits is not an array` };
      }
    }
  }

  const episodes = (data as Record<string, unknown>).episodes;
  if (!Array.isArray(episodes)) return { ok: false, error: "episodes is not an array" };

  for (let i = 0; i < episodes.length; i += 1) {
    const ep = episodes[i];
    if (!isRecord(ep)) return { ok: false, error: `episodes[${i}] is not an object` };
    if (!isNumber(ep.id)) return { ok: false, error: `episodes[${i}].id is not a number` };
    if (!isString(ep.title)) return { ok: false, error: `episodes[${i}].title is not a string` };
    if (!isString(ep.content)) return { ok: false, error: `episodes[${i}].content is not a string` };
    if (ep.scenes !== undefined && !Array.isArray(ep.scenes)) {
      return { ok: false, error: `episodes[${i}].scenes is not an array` };
    }
  }

  return { ok: true };
};
