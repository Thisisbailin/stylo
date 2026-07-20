import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("project editing is authenticated and multi-writer without a device lease", () => {
  const app = read("App.tsx");
  const hook = read("hooks/useCloudSync.ts");
  const endpoint = read("functions/api/project-realtime.ts");
  const migration = read("migrations/0004_realtime_collaboration.sql");

  assert.doesNotMatch(app, /ProjectEditLease|projectEditLease|ProjectEditLeaseModal/);
  assert.doesNotMatch(hook, /project-lease|x-project-edit-lease|status === 423/);
  assert.equal(existsSync("hooks/useProjectEditLease.ts"), false);
  assert.equal(existsSync("components/ProjectEditLeaseModal.tsx"), false);
  assert.equal(existsSync("functions/api/project-lease.ts"), false);

  assert.match(endpoint, /readWebSocketCredential/);
  assert.match(endpoint, /getUserId\(authenticated, context\.env\)/);
  assert.match(endpoint, /idFromName\(`\$\{userId\}:\$\{projectId\}`\)/);
  assert.match(migration, /DROP TABLE IF EXISTS user_project_edit_leases/);
  assert.match(migration, /PRIMARY KEY \(user_id, project_id\)/);
  assert.match(migration, /UNIQUE \(user_id, project_id, op_id\)/);
});

test("the realtime room persists, deduplicates, survives hibernation, and broadcasts", () => {
  const worker = read("realtime-worker/src/index.ts");

  assert.match(worker, /deserializeAttachment/);
  assert.match(worker, /await this\.ensureLoaded\(attachedIdentity\)/);
  assert.match(worker, /SELECT server_seq FROM user_project_updates/);
  assert.match(worker, /INSERT INTO user_project_updates/);
  assert.match(worker, /INSERT INTO user_project_documents/);
  assert.match(worker, /ON CONFLICT\(user_id, project_id\) DO UPDATE/);
  assert.match(worker, /const candidate = new Y\.Doc\(\)/);
  assert.match(worker, /for \(const peer of this\.state\.getWebSockets\(\)\)/);
});

test("project reset clears the active room before durable rows can be replayed", () => {
  const worker = read("realtime-worker/src/index.ts");
  const reset = read("functions/api/account-data-reset.ts");
  const engine = read("sync/realtimeProjectSyncEngine.ts");

  assert.match(worker, /private async resetProject/);
  assert.match(worker, /this\.doc\.getMap\("project"\)\.clear\(\)/);
  assert.match(worker, /DELETE FROM user_project_updates/);
  assert.match(worker, /DELETE FROM user_project_documents/);
  assert.match(worker, /JSON\.stringify\(\{ type: "reset", mode \}\)/);
  assert.match(reset, /await resetRealtimeRooms\(/);
  assert.match(reset, /x-stylo-reset-mode/);
  assert.match(engine, /if \(message\.type === "reset"\)/);
  assert.match(engine, /deleteRealtimeDocument\(this\.storageKey\)/);
});

test("catalog, snapshot reads, and Agent context share the realtime document authority", () => {
  const catalog = read("functions/api/projects.ts");
  const project = read("functions/api/project.ts");
  const agentState = read("functions/api/_agentProjectState.ts");

  assert.match(catalog, /FROM user_project_documents/);
  assert.match(project, /FROM user_project_documents/);
  assert.match(agentState, /FROM user_project_documents/);
  assert.match(agentState, /buildAgentProjectStateFromRealtimeDocument/);
});

test("local project changes enter Yjs immediately while network writes are coalesced", () => {
  const engine = read("sync/realtimeProjectSyncEngine.ts");

  assert.match(engine, /stage\(local: ProjectData\)[\s\S]*applyProjectSnapshot\(/);
  assert.match(engine, /this\.queueUpdate\(update\)/);
  assert.match(engine, /this\.stageTimer = setTimeout/);
  assert.match(engine, /requeuePendingAcks/);
  assert.match(engine, /Y\.mergeUpdates/);
});
