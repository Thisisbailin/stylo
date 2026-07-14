import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type { ProjectData } from "../types";
import {
  createCineworWorkspace,
  normalizeCineworWorkspace,
  sampleCineworActor,
  sampleCineworTrajectory,
  withActiveCineworWorkspace,
} from "../utils/cineworWorkspace";
import { normalizeProjectData } from "../utils/projectData";

const makeProject = (): ProjectData => ({
  fileName: "Cinewor integration",
  rawScript: "",
  episodes: [{
    id: 1,
    title: "第一集",
    content: "",
    scenes: [{ id: "scene-script", title: "雨夜站台", content: "" }],
    status: "pending",
  }],
  roles: [
    {
      id: "place-station",
      name: "雨夜站台",
      displayName: "雨夜站台",
      mention: "雨夜站台",
      kind: "scene",
      tone: "sky",
      summary: "",
      description: "",
      portraits: [],
    },
    {
      id: "person-lin",
      name: "林默",
      displayName: "林默",
      mention: "林默",
      kind: "person",
      tone: "emerald",
      summary: "",
      description: "",
      portraits: [],
    },
  ],
  designAssets: [],
  canvas: { viewport: null },
  flow: { flowNodes: [], links: [] },
  activeFlowProjectId: "project-a",
  flowProjects: [
    {
      id: "project-a",
      title: "A",
      color: "slate",
      durationMin: 120,
      rootNodeId: "root-a",
      createdAt: 1,
      updatedAt: 1,
      flow: { flowNodes: [], links: [] },
    },
    {
      id: "project-b",
      title: "B",
      color: "slate",
      durationMin: 60,
      rootNodeId: "root-b",
      createdAt: 1,
      updatedAt: 1,
      flow: { flowNodes: [], links: [] },
    },
  ],
  stats: { context: { total: 0, success: 0, error: 0 } },
});

test("Cinewor seeds native scenes and binds existing project roles", () => {
  const workspace = createCineworWorkspace(makeProject());
  assert.equal(workspace.version, 1);
  assert.equal(workspace.scenes.length, 1);
  assert.equal(workspace.scenes[0].sourceRoleId, "place-station");
  assert.equal(workspace.scenes[0].actors[0].roleId, "person-lin");
  assert.ok(workspace.scenes[0].duration >= 8 && workspace.scenes[0].duration <= 30);
  assert.equal(workspace.scenes[0].shots.length, 3);
});

test("Cinewor normalization bounds hostile arrays and repairs invalid vectors", () => {
  const scene = createCineworWorkspace(makeProject()).scenes[0];
  const normalized = normalizeCineworWorkspace({
    version: 9,
    activeSceneId: "missing",
    scenes: Array.from({ length: 40 }, (_, index) => ({
      ...scene,
      id: `scene-${index}`,
      actors: Array.from({ length: 40 }, (__, actorIndex) => ({
        ...scene.actors[0],
        id: `actor-${actorIndex}`,
        keyframes: [{ ...scene.actors[0].keyframes[0], position: [Number.NaN, 4] }],
      })),
    })),
  });
  assert.ok(normalized);
  assert.equal(normalized?.version, 1);
  assert.equal(normalized?.scenes.length, 24);
  assert.equal(normalized?.scenes[0].actors.length, 24);
  assert.deepEqual(normalized?.scenes[0].actors[0].keyframes[0].position, [0, 4, 0]);
  assert.equal(normalized?.activeSceneId, "scene-0");
});

test("Cinewor trajectory sampling is deterministic for linear and arc motion", () => {
  assert.deepEqual(sampleCineworTrajectory([0, 0, 0], [10, 0, 0], 0.5, "linear", 3), [5, 0, 0]);
  const arc = sampleCineworTrajectory([0, 0, 0], [10, 0, 0], 0.5, "arc", 3);
  assert.equal(arc[0], 5);
  assert.ok(arc[2] > 0);

  const workspace = createCineworWorkspace(makeProject());
  const track = workspace.scenes[0].actors[0];
  const state = sampleCineworActor(track, track.keyframes[1].time);
  assert.deepEqual(state.position, track.keyframes[1].position);
});

test("Cinewor commits only to the active Flow project", () => {
  const project = makeProject();
  const workspace = createCineworWorkspace(project);
  const updated = withActiveCineworWorkspace(project, workspace);
  assert.equal(updated.flowProjects?.[0].cinewor?.activeSceneId, workspace.activeSceneId);
  assert.equal(updated.flowProjects?.[1].cinewor, undefined);
  assert.notEqual(updated, project);
});

test("project normalization preserves duplicate legacy projects with repaired ids", () => {
  const project = makeProject();
  const normalized = normalizeProjectData({
    ...project,
    flowProjects: project.flowProjects?.map((flowProject) => ({ ...flowProject, id: "legacy-duplicate" })),
    activeFlowProjectId: "legacy-duplicate",
  });
  assert.deepEqual(normalized.flowProjects?.map((flowProject) => flowProject.id), [
    "legacy-duplicate",
    "legacy-duplicate-2",
  ]);
  assert.equal(normalized.activeFlowProjectId, "legacy-duplicate");
});

test("Cinewor is a lazy native Lab without iframe or CDN coupling", async () => {
  const [app, settings, moduleBar, lab, viewport, viteConfig] = await Promise.all([
    readFile(path.join(process.cwd(), "App.tsx"), "utf8"),
    readFile(path.join(process.cwd(), "node-workspace/components/ProjectSettingsPanel.tsx"), "utf8"),
    readFile(path.join(process.cwd(), "node-workspace/components/ModuleBar.tsx"), "utf8"),
    readFile(path.join(process.cwd(), "node-workspace/components/CineworLab.tsx"), "utf8"),
    readFile(path.join(process.cwd(), "node-workspace/components/cinewor/CineworViewport.tsx"), "utf8"),
    readFile(path.join(process.cwd(), "vite.config.ts"), "utf8"),
  ]);
  assert.match(app, /React\.lazy\([\s\S]*components\/CineworLab/);
  assert.match(app, /projectData=\{projectData\}[\s\S]*setProjectData=\{setProjectData\}/);
  assert.match(settings, /actionKey: "cineworLab"/);
  assert.match(moduleBar, /"cineworLab"/);
  assert.match(lab, /withActiveCineworWorkspace/);
  assert.doesNotMatch(lab, /<iframe|unpkg|jsdelivr|cdnjs/);
  assert.match(viewport, /from "three"/);
  assert.match(viewport, /OrbitControls/);
  assert.match(viewport, /renderer\.dispose\(\)/);
  assert.match(viteConfig, /node_modules\/three\/[\s\S]*cinewor-vendor/);
});
