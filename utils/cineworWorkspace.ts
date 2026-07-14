import type {
  CineworActorKeyframe,
  CineworActorTrack,
  CineworCameraShot,
  CineworEasing,
  CineworSceneState,
  CineworTrajectory,
  CineworVector3,
  CineworWorkspaceState,
  ProjectData,
  ProjectRoleIdentity,
  Scene,
} from "../types";

const MAX_SCENES = 24;
const MAX_ACTORS = 24;
const MAX_KEYFRAMES = 64;
const MAX_SHOTS = 64;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const text = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;
const slug = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56) || "scene";

const stableId = (prefix: string, source: string, index = 0) => `${prefix}-${slug(source)}-${index + 1}`;

const vector = (value: unknown, fallback: CineworVector3): CineworVector3 => {
  if (!Array.isArray(value)) return [...fallback];
  return [0, 1, 2].map((index) => finite(value[index], fallback[index])) as CineworVector3;
};

const trajectory = (value: unknown): CineworTrajectory => value === "arc" ? "arc" : "linear";
const easing = (value: unknown): CineworEasing =>
  value === "linear" || value === "ease-in" || value === "ease-out" ? value : "ease-in-out";

const normalizeKeyframe = (value: any, index: number): CineworActorKeyframe => ({
  id: text(value?.id, `state-${index + 1}`),
  label: text(value?.label, `状态 ${index + 1}`),
  time: clamp(finite(value?.time, index * 4), 0, 3600),
  position: vector(value?.position, [index * 2, 0, 0]),
  facing: finite(value?.facing, 0),
  easing: easing(value?.easing),
});

const normalizeActor = (value: any, index: number): CineworActorTrack => {
  const rawKeyframes = Array.isArray(value?.keyframes) ? value.keyframes.slice(0, MAX_KEYFRAMES) : [];
  const keyframes: CineworActorKeyframe[] = (rawKeyframes.length ? rawKeyframes : [
    { id: "entry", label: "入场", time: 0, position: [-2 + index * 1.4, 0, 2] },
    { id: "focus", label: "主状态", time: 6, position: [index * 1.2, 0, -0.5], facing: 25 },
  ])
    .map(normalizeKeyframe)
    .sort((a: CineworActorKeyframe, b: CineworActorKeyframe) => a.time - b.time);
  return {
    id: text(value?.id, `actor-${index + 1}`),
    label: text(value?.label, `演员 ${index + 1}`),
    roleId: text(value?.roleId) || undefined,
    color: /^#[0-9A-Fa-f]{6}$/.test(value?.color) ? value.color.toUpperCase() : "#91A6A0",
    trajectory: trajectory(value?.trajectory),
    arcHeight: clamp(finite(value?.arcHeight, 1.2), 0, 20),
    keyframes,
  };
};

const normalizeShot = (value: any, index: number): CineworCameraShot => ({
  id: text(value?.id, `shot-${index + 1}`),
  name: text(value?.name, `机位 ${index + 1}`),
  time: clamp(finite(value?.time, index * 4), 0, 3600),
  position: vector(value?.position, [7 - index * 2, 4, 8]),
  target: vector(value?.target, [0, 1.2, 0]),
  fov: clamp(finite(value?.fov, 42), 12, 100),
  trajectory: trajectory(value?.trajectory),
  arcHeight: clamp(finite(value?.arcHeight, 1.4), 0, 20),
  actorTrackId: text(value?.actorTrackId) || undefined,
  stateId: text(value?.stateId) || undefined,
});

export const normalizeCineworScene = (value: any, index = 0): CineworSceneState => {
  const duration = clamp(finite(value?.duration, 12), 1, 3600);
  const actors = (Array.isArray(value?.actors) ? value.actors : []).slice(0, MAX_ACTORS).map(normalizeActor);
  const shots = (Array.isArray(value?.shots) ? value.shots : []).slice(0, MAX_SHOTS).map(normalizeShot);
  return {
    id: text(value?.id, `cinewor-scene-${index + 1}`),
    title: text(value?.title, `场景 ${index + 1}`),
    sourceSceneId: text(value?.sourceSceneId) || undefined,
    sourceRoleId: text(value?.sourceRoleId) || undefined,
    duration,
    stage: {
      width: clamp(finite(value?.stage?.width, 16), 4, 160),
      depth: clamp(finite(value?.stage?.depth, 12), 4, 160),
      height: clamp(finite(value?.stage?.height, 4), 2.4, 40),
      gridVisible: value?.stage?.gridVisible !== false,
      axesVisible: value?.stage?.axesVisible === true,
    },
    actors,
    shots,
    updatedAt: finite(value?.updatedAt, Date.now()),
  };
};

export const normalizeCineworWorkspace = (value: unknown): CineworWorkspaceState | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as any;
  const scenes: CineworSceneState[] = (Array.isArray(raw.scenes) ? raw.scenes : []).slice(0, MAX_SCENES).map(normalizeCineworScene);
  if (!scenes.length) return undefined;
  const activeSceneId = scenes.some((scene: CineworSceneState) => scene.id === raw.activeSceneId)
    ? raw.activeSceneId
    : scenes[0].id;
  return {
    version: 1,
    activeSceneId,
    scenes,
    updatedAt: finite(raw.updatedAt, Date.now()),
  };
};

const uniqueBy = <T,>(items: T[], key: (item: T) => string) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

const actorFromRole = (role: ProjectRoleIdentity, index: number, duration: number): CineworActorTrack => ({
  id: stableId("actor", role.id || role.name, index),
  label: role.displayName || role.name,
  roleId: role.id,
  color: index % 3 === 0 ? "#91A6A0" : index % 3 === 1 ? "#A68F91" : "#8D98AA",
  trajectory: index % 2 === 0 ? "arc" : "linear",
  arcHeight: index % 2 === 0 ? 1.2 : 0,
  keyframes: [
    { id: "entry", label: "入场", time: 0, position: [-3 + index * 1.2, 0, 2.5], facing: 150, easing: "ease-in-out" },
    { id: "focus", label: "主状态", time: duration * 0.58, position: [-0.5 + index * 1.4, 0, -0.4], facing: 20, easing: "ease-in-out" },
    { id: "resolve", label: "收束", time: duration, position: [2.4 - index * 0.8, 0, -2], facing: -35, easing: "ease-out" },
  ],
});

const defaultShots = (duration: number): CineworCameraShot[] => [
  { id: "opening-wide", name: "开场全景", time: 0, position: [8, 5.5, 9], target: [0, 1.2, 0], fov: 46, trajectory: "linear", arcHeight: 0 },
  { id: "mid-reveal", name: "中段揭示", time: duration * 0.52, position: [-5.5, 3.2, 6], target: [0, 1.1, 0], fov: 36, trajectory: "arc", arcHeight: 1.6 },
  { id: "closing-close", name: "收束近景", time: duration, position: [3.2, 2.2, 3.8], target: [0.8, 1.25, -0.5], fov: 30, trajectory: "linear", arcHeight: 0 },
];

const sceneSources = (projectData: ProjectData) => {
  const activeProject = projectData.flowProjects?.find((project) => project.id === projectData.activeFlowProjectId);
  const projectRoles = uniqueBy(
    [...projectData.roles, ...(activeProject?.roles || [])],
    (role) => role.id || `${role.kind}:${slug(role.displayName || role.name)}`,
  );
  const roleScenes = uniqueBy(
    projectRoles.filter((role) => role.kind === "scene"),
    (role) => slug(role.displayName || role.name)
  ).map((role) => ({ id: role.id, title: role.displayName || role.name, role }));
  if (roleScenes.length) return roleScenes.slice(0, MAX_SCENES);

  const scriptScenes = uniqueBy(
    projectData.episodes.flatMap((episode) => episode.scenes.map((scene) => ({ scene, episodeTitle: episode.title }))),
    (item) => slug(item.scene.title || item.scene.location || item.scene.id)
  ).map(({ scene, episodeTitle }: { scene: Scene; episodeTitle: string }) => ({
    id: scene.id,
    title: scene.title || scene.location || `${episodeTitle} · ${scene.id}`,
    scene,
  }));
  return scriptScenes.slice(0, MAX_SCENES);
};

export const createCineworWorkspace = (projectData: ProjectData): CineworWorkspaceState => {
  const activeProject = projectData.flowProjects?.find((project) => project.id === projectData.activeFlowProjectId);
  const roles = uniqueBy(
    [...projectData.roles, ...(activeProject?.roles || [])],
    (role) => role.id || `${role.kind}:${slug(role.displayName || role.name)}`,
  );
  const people = roles.filter((role) => role.kind === "person" && role.status !== "archived").slice(0, 4);
  const sources = sceneSources(projectData);
  const now = Date.now();
  const seeds = sources.length ? sources : [{ id: "stage", title: projectData.fileName || "未命名调度场" }];
  const scenes = seeds.map((source, index): CineworSceneState => {
    const projectDuration = activeProject?.durationMin || 120;
    const duration = clamp(projectDuration / 10, 8, 30);
    const actors = people.map((role, roleIndex) => actorFromRole(role, roleIndex, duration));
    return {
      id: stableId("cinewor-scene", source.id || source.title, index),
      title: source.title,
      sourceSceneId: "scene" in source ? source.id : undefined,
      sourceRoleId: "role" in source ? source.id : undefined,
      duration,
      stage: { width: 16, depth: 12, height: 4, gridVisible: true, axesVisible: false },
      actors,
      shots: defaultShots(duration),
      updatedAt: now,
    };
  });
  return { version: 1, activeSceneId: scenes[0].id, scenes, updatedAt: now };
};

export const getActiveCineworWorkspace = (projectData: ProjectData) =>
  projectData.flowProjects?.find((project) => project.id === projectData.activeFlowProjectId)?.cinewor;

export const withActiveCineworWorkspace = (
  projectData: ProjectData,
  workspace: CineworWorkspaceState
): ProjectData => {
  const activeProjectId = projectData.activeFlowProjectId || projectData.flowProjects?.[0]?.id;
  if (!activeProjectId || !projectData.flowProjects?.length) return projectData;
  const updatedAt = Date.now();
  return {
    ...projectData,
    flowProjects: projectData.flowProjects.map((project) => project.id === activeProjectId
      ? { ...project, cinewor: { ...workspace, updatedAt }, updatedAt }
      : project),
  };
};

const ease = (mode: CineworEasing, value: number) => {
  const t = clamp(value, 0, 1);
  if (mode === "ease-in") return t * t;
  if (mode === "ease-out") return 1 - (1 - t) * (1 - t);
  if (mode === "ease-in-out") return t * t * (3 - 2 * t);
  return t;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const sampleCineworTrajectory = (
  from: CineworVector3,
  to: CineworVector3,
  progress: number,
  mode: CineworTrajectory,
  arcHeight: number
): CineworVector3 => {
  const t = clamp(progress, 0, 1);
  if (mode !== "arc" || arcHeight <= 0) return from.map((value, index) => lerp(value, to[index], t)) as CineworVector3;
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz) || 1;
  const control: CineworVector3 = [
    (from[0] + to[0]) * 0.5 - (dz / length) * arcHeight,
    (from[1] + to[1]) * 0.5,
    (from[2] + to[2]) * 0.5 + (dx / length) * arcHeight,
  ];
  const inverse = 1 - t;
  return [0, 1, 2].map((index) => inverse * inverse * from[index] + 2 * inverse * t * control[index] + t * t * to[index]) as CineworVector3;
};

export const sampleCineworActor = (track: CineworActorTrack, time: number) => {
  const frames = track.keyframes;
  if (!frames.length) return { position: [0, 0, 0] as CineworVector3, facing: 0 };
  if (frames.length === 1 || time <= frames[0].time) return { position: frames[0].position, facing: frames[0].facing };
  const last = frames[frames.length - 1];
  if (time >= last.time) return { position: last.position, facing: last.facing };
  const nextIndex = Math.max(1, frames.findIndex((frame) => frame.time >= time));
  const from = frames[nextIndex - 1];
  const to = frames[nextIndex];
  const progress = ease(to.easing, (time - from.time) / Math.max(0.001, to.time - from.time));
  return {
    position: sampleCineworTrajectory(from.position, to.position, progress, track.trajectory, track.arcHeight),
    facing: lerp(from.facing, to.facing, progress),
  };
};
