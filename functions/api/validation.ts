type ValidationResult = { ok: true; error?: undefined } | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const MAX_FLOW_PROJECTS = 3;
const MAX_CINEWOR_SCENES = 24;
const MAX_CINEWOR_ACTORS = 24;
const MAX_CINEWOR_STATES = 64;
const MAX_CINEWOR_SHOTS = 64;
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

const validateVector3 = (value: unknown, path: string): ValidationResult => (
  Array.isArray(value) && value.length === 3 && value.every(isNumber)
    ? { ok: true }
    : { ok: false, error: `${path} must be a finite [x, y, z] vector` }
);

const validateCinewor = (value: unknown, path: string): ValidationResult => {
  if (value === undefined) return { ok: true };
  if (!isRecord(value)) return { ok: false, error: `${path} is not an object` };
  if (value.version !== 1) return { ok: false, error: `${path}.version must be 1` };
  if (!isString(value.activeSceneId)) return { ok: false, error: `${path}.activeSceneId is not a string` };
  if (!Array.isArray(value.scenes)) return { ok: false, error: `${path}.scenes is not an array` };
  if (value.scenes.length > MAX_CINEWOR_SCENES) return { ok: false, error: `${path}.scenes exceeds max ${MAX_CINEWOR_SCENES}` };
  const sceneIds = new Set<string>();
  for (let sceneIndex = 0; sceneIndex < value.scenes.length; sceneIndex += 1) {
    const scene = value.scenes[sceneIndex];
    const scenePath = `${path}.scenes[${sceneIndex}]`;
    if (!isRecord(scene) || !isString(scene.id) || !scene.id.trim()) return { ok: false, error: `${scenePath}.id is invalid` };
    if (sceneIds.has(scene.id)) return { ok: false, error: `${path}.scenes has duplicate id: ${scene.id}` };
    sceneIds.add(scene.id);
    if (!isString(scene.title) || !isNumber(scene.duration)) return { ok: false, error: `${scenePath} title or duration is invalid` };
    if (!isRecord(scene.stage)) return { ok: false, error: `${scenePath}.stage is not an object` };
    if (![scene.stage.width, scene.stage.depth, scene.stage.height].every(isNumber)) return { ok: false, error: `${scenePath}.stage dimensions are invalid` };
    if (!Array.isArray(scene.actors) || scene.actors.length > MAX_CINEWOR_ACTORS) return { ok: false, error: `${scenePath}.actors is invalid` };
    for (let actorIndex = 0; actorIndex < scene.actors.length; actorIndex += 1) {
      const actor = scene.actors[actorIndex];
      const actorPath = `${scenePath}.actors[${actorIndex}]`;
      if (!isRecord(actor) || !isString(actor.id) || !isString(actor.label)) return { ok: false, error: `${actorPath} identity is invalid` };
      if (!Array.isArray(actor.keyframes) || actor.keyframes.length > MAX_CINEWOR_STATES) return { ok: false, error: `${actorPath}.keyframes is invalid` };
      for (let frameIndex = 0; frameIndex < actor.keyframes.length; frameIndex += 1) {
        const frame = actor.keyframes[frameIndex];
        const framePath = `${actorPath}.keyframes[${frameIndex}]`;
        if (!isRecord(frame) || !isString(frame.id) || !isNumber(frame.time) || !isNumber(frame.facing)) return { ok: false, error: `${framePath} is invalid` };
        const vectorValidation = validateVector3(frame.position, `${framePath}.position`);
        if (!vectorValidation.ok) return vectorValidation;
      }
    }
    if (!Array.isArray(scene.shots) || scene.shots.length > MAX_CINEWOR_SHOTS) return { ok: false, error: `${scenePath}.shots is invalid` };
    for (let shotIndex = 0; shotIndex < scene.shots.length; shotIndex += 1) {
      const shot = scene.shots[shotIndex];
      const shotPath = `${scenePath}.shots[${shotIndex}]`;
      if (!isRecord(shot) || !isString(shot.id) || !isNumber(shot.time) || !isNumber(shot.fov)) return { ok: false, error: `${shotPath} is invalid` };
      const positionValidation = validateVector3(shot.position, `${shotPath}.position`);
      if (!positionValidation.ok) return positionValidation;
      const targetValidation = validateVector3(shot.target, `${shotPath}.target`);
      if (!targetValidation.ok) return targetValidation;
    }
  }
  if (value.scenes.length && !sceneIds.has(value.activeSceneId)) return { ok: false, error: `${path}.activeSceneId does not exist` };
  return { ok: true };
};

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
    const cineworValidation = validateCinewor(project.cinewor, `${path}[${i}].cinewor`);
    if (!cineworValidation.ok) return cineworValidation;
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
