type ValidationResult = { ok: true; error?: undefined } | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const MAX_FLOW_PROJECTS = 3;
const FLOW_HANDLE_TYPES = new Set(["image", "text", "audio", "video", "multi"]);
const PROJECT_PATCH_KEYS = new Set([
  "fileName",
  "rawScript",
  "episodes",
  "roles",
  "phase5Usage",
  "designAssets",
  "canvas",
  "flow",
  "activeFlowProjectId",
  "flowProjects",
  "nodeDefaults",
  "scriptCanvas",
  "stats"
]);

const validateFlow = (value: unknown, path: string): ValidationResult => {
  if (value === undefined) return { ok: true };
  if (!isRecord(value)) return { ok: false, error: `${path} is not an object` };
  const flow = value as Record<string, unknown>;
  const nodes = Array.isArray(flow.flowNodes) ? flow.flowNodes : [];
  const nodeIds = new Set<string>();
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (!isRecord(node)) return { ok: false, error: `${path}.flowNodes[${i}] is not an object` };
    if (!isString(node.id) || !node.id.trim()) {
      return { ok: false, error: `${path}.flowNodes[${i}].id is not a non-empty string` };
    }
    if (nodeIds.has(node.id)) return { ok: false, error: `${path}.flowNodes has duplicate node id: ${node.id}` };
    nodeIds.add(node.id);
  }

  const links = Array.isArray(flow.links) ? flow.links : [];
  for (let i = 0; i < links.length; i += 1) {
    const link = links[i];
    if (!isRecord(link)) return { ok: false, error: `${path}.links[${i}] is not an object` };
    if (!isString(link.source) || !isString(link.target)) {
      return { ok: false, error: `${path}.links[${i}] source/target must be strings` };
    }
    if (nodeIds.size > 0 && (!nodeIds.has(link.source) || !nodeIds.has(link.target))) {
      return { ok: false, error: `${path}.links[${i}] points to a missing node` };
    }
    const sourceHandle = link.sourceHandle;
    const targetHandle = link.targetHandle;
    if (sourceHandle !== undefined && (!isString(sourceHandle) || !FLOW_HANDLE_TYPES.has(sourceHandle))) {
      return { ok: false, error: `${path}.links[${i}].sourceHandle is invalid` };
    }
    if (targetHandle !== undefined && (!isString(targetHandle) || !FLOW_HANDLE_TYPES.has(targetHandle))) {
      return { ok: false, error: `${path}.links[${i}].targetHandle is invalid` };
    }
  }

  if (flow.graphLinks !== undefined && !Array.isArray(flow.graphLinks)) {
    return { ok: false, error: `${path}.graphLinks is not an array` };
  }
  return { ok: true };
};

const validateFlowProjects = (value: unknown, path: string, activeFlowProjectId?: unknown): ValidationResult => {
  if (value === undefined) return { ok: true };
  if (!Array.isArray(value)) return { ok: false, error: `${path} is not an array` };
  if (value.length > MAX_FLOW_PROJECTS) return { ok: false, error: `${path} exceeds max ${MAX_FLOW_PROJECTS}` };
  const ids = new Set<string>();
  for (let i = 0; i < value.length; i += 1) {
    const project = value[i];
    if (!isRecord(project)) return { ok: false, error: `${path}[${i}] is not an object` };
    if (!isString(project.id) || !project.id.trim()) return { ok: false, error: `${path}[${i}].id is not a non-empty string` };
    if (ids.has(project.id)) return { ok: false, error: `${path} has duplicate project id: ${project.id}` };
    ids.add(project.id);
    const flowValidation = validateFlow(project.flow, `${path}[${i}].flow`);
    if (!flowValidation.ok) return flowValidation;
    if (project.roles !== undefined && !Array.isArray(project.roles)) {
      return { ok: false, error: `${path}[${i}].roles is not an array` };
    }
    if (project.designAssets !== undefined && !Array.isArray(project.designAssets)) {
      return { ok: false, error: `${path}[${i}].designAssets is not an array` };
    }
  }
  if (isString(activeFlowProjectId) && activeFlowProjectId.trim() && value.length > 0 && !ids.has(activeFlowProjectId)) {
    return { ok: false, error: `activeFlowProjectId does not exist in ${path}` };
  }
  return { ok: true };
};

export const validateProjectPayload = (data: unknown): ValidationResult => {
  if (!isRecord(data)) return { ok: false, error: "projectData is not an object" };
  const rawScript = (data as Record<string, unknown>).rawScript;
  if (rawScript !== undefined && !isString(rawScript)) {
    return { ok: false, error: "rawScript is not a string" };
  }

  const episodes = (data as Record<string, unknown>).episodes;
  if (!Array.isArray(episodes)) return { ok: false, error: "episodes is not an array" };

  const canvas = (data as Record<string, unknown>).canvas;
  if (canvas !== undefined && !isRecord(canvas)) return { ok: false, error: "canvas is not an object" };
  const flow = (data as Record<string, unknown>).flow;
  const flowValidation = validateFlow(flow, "flow");
  if (!flowValidation.ok) return flowValidation;
  const activeFlowProjectId = (data as Record<string, unknown>).activeFlowProjectId;
  if (activeFlowProjectId !== undefined && !isString(activeFlowProjectId)) {
    return { ok: false, error: "activeFlowProjectId is not a string" };
  }
  const flowProjectsValidation = validateFlowProjects((data as Record<string, unknown>).flowProjects, "flowProjects", activeFlowProjectId);
  if (!flowProjectsValidation.ok) return flowProjectsValidation;

  for (let i = 0; i < episodes.length; i += 1) {
    const ep = episodes[i];
    if (!isRecord(ep)) return { ok: false, error: `episodes[${i}] is not an object` };
    if (!isNumber(ep.id)) return { ok: false, error: `episodes[${i}].id is not a number` };
    if (!isString(ep.title)) return { ok: false, error: `episodes[${i}].title is not a string` };
    if (!isString(ep.content)) return { ok: false, error: `episodes[${i}].content is not a string` };
    if (ep.status !== undefined && !isString(ep.status)) {
      return { ok: false, error: `episodes[${i}].status is not a string` };
    }
  }

  return { ok: true };
};

export const validateSecretsPayload = (secrets: unknown): ValidationResult => {
  if (!isRecord(secrets)) return { ok: false, error: "secrets is not an object" };
  const keys = ["textApiKey", "multiApiKey", "videoApiKey"] as const;
  for (const key of keys) {
    const value = secrets[key];
    if (value !== undefined && !isString(value)) {
      return { ok: false, error: `${key} is not a string` };
    }
  }
  return { ok: true };
};

export const validateProjectDelta = (delta: unknown): ValidationResult => {
  if (!isRecord(delta)) return { ok: false, error: "delta is not an object" };

  if (delta.meta !== undefined) {
    if (!isRecord(delta.meta)) return { ok: false, error: "delta.meta is not an object" };
    const meta = delta.meta as Record<string, unknown>;
    const stringKeys = ["fileName", "rawScript"];
    for (const key of stringKeys) {
      if (meta[key] !== undefined && !isString(meta[key])) {
        return { ok: false, error: `delta.meta.${key} is not a string` };
      }
    }
    if (meta.designAssets !== undefined && !Array.isArray(meta.designAssets)) {
      return { ok: false, error: "delta.meta.designAssets is not an array" };
    }
    if (meta.nodeDefaults !== undefined && !isRecord(meta.nodeDefaults)) {
      return { ok: false, error: "delta.meta.nodeDefaults is not an object" };
    }
    if (meta.scriptCanvas !== undefined && !isRecord(meta.scriptCanvas)) {
      return { ok: false, error: "delta.meta.scriptCanvas is not an object" };
    }
    if (meta.roles !== undefined) {
      if (!Array.isArray(meta.roles)) return { ok: false, error: "delta.meta.roles is not an array" };
    }
    if (meta.canvas !== undefined && !isRecord(meta.canvas)) {
      return { ok: false, error: "delta.meta.canvas is not an object" };
    }
    const metaFlowValidation = validateFlow(meta.flow, "delta.meta.flow");
    if (!metaFlowValidation.ok) return metaFlowValidation;
    if (meta.activeFlowProjectId !== undefined && !isString(meta.activeFlowProjectId)) {
      return { ok: false, error: "delta.meta.activeFlowProjectId is not a string" };
    }
    const flowProjectsValidation = validateFlowProjects(meta.flowProjects, "delta.meta.flowProjects", meta.activeFlowProjectId);
    if (!flowProjectsValidation.ok) return flowProjectsValidation;
  }

  if (delta.episodes !== undefined) {
    if (!Array.isArray(delta.episodes)) return { ok: false, error: "delta.episodes is not an array" };
    for (let i = 0; i < delta.episodes.length; i += 1) {
      const ep = delta.episodes[i];
      if (!isRecord(ep)) return { ok: false, error: `delta.episodes[${i}] is not an object` };
      if (!isNumber(ep.id)) return { ok: false, error: `delta.episodes[${i}].id is not a number` };
      if (!isString(ep.title)) return { ok: false, error: `delta.episodes[${i}].title is not a string` };
      if (!isString(ep.content)) return { ok: false, error: `delta.episodes[${i}].content is not a string` };
    }
  }

  if (delta.scenes !== undefined) {
    if (!Array.isArray(delta.scenes)) return { ok: false, error: "delta.scenes is not an array" };
    for (let i = 0; i < delta.scenes.length; i += 1) {
      const scene = delta.scenes[i];
      if (!isRecord(scene)) return { ok: false, error: `delta.scenes[${i}] is not an object` };
      if (!isNumber(scene.episodeId)) return { ok: false, error: `delta.scenes[${i}].episodeId is not a number` };
      if (!isString(scene.id)) return { ok: false, error: `delta.scenes[${i}].id is not a string` };
      if (!isString(scene.title)) return { ok: false, error: `delta.scenes[${i}].title is not a string` };
      if (!isString(scene.content)) return { ok: false, error: `delta.scenes[${i}].content is not a string` };
    }
  }

  if (delta.roles !== undefined) {
    if (!Array.isArray(delta.roles)) return { ok: false, error: "delta.roles is not an array" };
    for (let i = 0; i < delta.roles.length; i += 1) {
      const role = delta.roles[i];
      if (!isRecord(role)) return { ok: false, error: `delta.roles[${i}] is not an object` };
      if (!isString(role.id)) return { ok: false, error: `delta.roles[${i}].id is not a string` };
      if (!isString(role.name)) return { ok: false, error: `delta.roles[${i}].name is not a string` };
      if (!isString(role.mention)) return { ok: false, error: `delta.roles[${i}].mention is not a string` };
      if (!Array.isArray(role.portraits)) return { ok: false, error: `delta.roles[${i}].portraits is not an array` };
    }
  }

  if (delta.deleted !== undefined) {
    if (!isRecord(delta.deleted)) return { ok: false, error: "delta.deleted is not an object" };
  }

  return { ok: true };
};

export const validateProjectPatch = (patch: unknown): ValidationResult => {
  if (!isRecord(patch)) return { ok: false, error: "patch is not an object" };
  const set = patch.set;
  const unset = patch.unset;
  if (!isRecord(set)) return { ok: false, error: "patch.set is not an object" };
  if (!Array.isArray(unset)) return { ok: false, error: "patch.unset is not an array" };

  for (const key of Object.keys(set)) {
    if (!PROJECT_PATCH_KEYS.has(key)) {
      return { ok: false, error: `patch.set has invalid key: ${key}` };
    }
  }

  for (let i = 0; i < unset.length; i += 1) {
    const key = unset[i];
    if (!isString(key)) return { ok: false, error: `patch.unset[${i}] is not a string` };
    if (!PROJECT_PATCH_KEYS.has(key)) {
      return { ok: false, error: `patch.unset has invalid key: ${key}` };
    }
  }

  return { ok: true };
};
