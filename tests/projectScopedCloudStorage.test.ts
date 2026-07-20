import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { mergeStyloScopedProjectData, resetStyloScopedProjectData } from "../agents/runtime/projectScope";
import { normalizeProjectId } from "../functions/api/_projectScope";
import type { ProjectData } from "../types";

const read = (path: string) => readFileSync(path, "utf8");

const projectData = (activeId: string, ids: string[]): ProjectData => ({
  fileName: activeId,
  rawScript: "",
  episodes: [],
  roles: [],
  designAssets: [],
  canvas: { viewport: { x: 0, y: 0, zoom: 1 } },
  stats: { context: { total: 0, success: 0, error: 0 } },
  activeFlowProjectId: activeId,
  flow: { revision: 0, flowNodes: [], graphLinks: [], globalAssetHistory: [], links: [] },
  flowProjects: ids.map((id, index) => ({
    id,
    title: id,
    color: "#888888",
    rootNodeId: `root-${id}`,
    durationMin: 120,
    createdAt: index + 1,
    updatedAt: index + 1,
    flow: { revision: index, flowNodes: [], graphLinks: [], globalAssetHistory: [], links: [] },
  })),
});

test("project ids are fail-closed and safe for SQL and object-store boundaries", () => {
  assert.equal(normalizeProjectId("project-a"), "project-a");
  assert.equal(normalizeProjectId(" scene:01.v2 "), "scene:01.v2");
  assert.equal(normalizeProjectId(""), "");
  assert.equal(normalizeProjectId("../project-a"), "");
  assert.equal(normalizeProjectId("项目-a"), "");
});

test("applying one remote project cannot replace a sibling local project", () => {
  const local = projectData("project-a", ["project-a", "project-b"]);
  const remoteB = projectData("project-b", ["project-b"]);
  remoteB.flowProjects![0].title = "remote-b";
  remoteB.flowProjects![0].flow.revision = 9;

  const merged = mergeStyloScopedProjectData(local, remoteB, "project-b");
  assert.equal(merged.activeFlowProjectId, "project-a");
  assert.equal(merged.fileName, "project-a");
  assert.equal(merged.flowProjects?.find((item) => item.id === "project-a")?.title, "project-a");
  assert.equal(merged.flowProjects?.find((item) => item.id === "project-b")?.title, "remote-b");
  assert.equal(merged.flowProjects?.find((item) => item.id === "project-b")?.flow.revision, 9);
});

test("resetting one project keeps every sibling project intact", () => {
  const local = projectData("project-a", ["project-a", "project-b"]);
  local.flowProjects![1].flow.revision = 7;
  const empty = projectData("empty-template", ["empty-template"]);
  const reset = resetStyloScopedProjectData(local, empty, "project-a");

  assert.deepEqual(reset.flowProjects?.map((item) => item.id), ["project-a", "project-b"]);
  assert.equal(reset.activeFlowProjectId, "project-a");
  assert.equal(reset.flowProjects?.find((item) => item.id === "project-a")?.flow.revision, 0);
  assert.equal(reset.flowProjects?.find((item) => item.id === "project-b")?.flow.revision, 7);
});

test("D1 authorities, realtime documents, Agent history, and assets have explicit project columns", () => {
  const migration = [
    read("migrations/0003_project_scoped_cloud.sql"),
    read("migrations/0004_realtime_collaboration.sql"),
  ].join("\n");
  const compositePrimaryKeys = migration.match(/PRIMARY KEY \(user_id, project_id[^)]*\)/g) || [];
  assert.ok(compositePrimaryKeys.length >= 10);
  assert.match(migration, /CREATE TABLE agent_sessions[\s\S]*project_id TEXT NOT NULL/);
  assert.match(migration, /CREATE TABLE agent_traces[\s\S]*project_id TEXT NOT NULL/);
  assert.match(migration, /CREATE TABLE agent_spans[\s\S]*project_id TEXT NOT NULL/);
  assert.match(migration, /CREATE TABLE user_seedance_assets[\s\S]*PRIMARY KEY \(user_id, project_id, asset_id\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS user_project_documents[\s\S]*PRIMARY KEY \(user_id, project_id\)/);
});

test("network and object storage operations carry and enforce projectId", () => {
  const realtime = read("sync/realtimeProjectSyncEngine.ts");
  const storageClient = read("node-workspace/nodeflow/storageObjects.ts");
  const upload = read("functions/api/upload-url.ts");
  const download = read("functions/api/download-url.ts");
  const deletion = read("functions/api/storage-objects.ts");

  assert.match(realtime, /projectId=\$\{encodeURIComponent\(this\.options\.projectId\)\}/);
  assert.match(storageClient, /JSON\.stringify\(\{ projectId, objects: uniqueObjects \}\)/);
  assert.match(upload, /users\/\$\{userId\}\/projects\/\$\{projectId\}\//);
  assert.match(download, /path\.startsWith\(projectPrefix\)/);
  assert.match(deletion, /path\.startsWith\(projectPrefix\)/);
});
