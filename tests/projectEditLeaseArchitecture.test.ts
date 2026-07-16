import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("the edit lease is project scoped and acquired atomically", () => {
  const migration = read("migrations/0003_project_scoped_cloud.sql");
  const endpoint = read("functions/api/project-lease.ts");
  const guard = read("functions/api/_projectEditLease.ts");

  assert.match(migration, /PRIMARY KEY \(user_id, project_id\)/);
  assert.match(migration, /lease_id TEXT NOT NULL/);
  assert.match(migration, /expires_at INTEGER NOT NULL/);
  assert.match(endpoint, /INSERT INTO user_project_edit_leases/);
  assert.match(endpoint, /ON CONFLICT\(user_id, project_id\) DO UPDATE/);
  assert.match(endpoint, /WHERE expires_at <= \?7 OR \(device_id = excluded\.device_id AND session_id = excluded\.session_id\)/);
  assert.match(endpoint, /action === "takeover"/);
  assert.match(guard, /WHERE user_id = \?1 AND project_id = \?2 AND lease_id = \?9/);
  assert.match(endpoint, /takeoverToken: row\?\.lease_id \|\| null/);
});

test("every account-project mutation is fenced by the server lease", () => {
  const guard = read("functions/api/_projectEditLease.ts");
  const project = read("functions/api/project.ts");
  const restore = read("functions/api/project-restore.ts");
  const reset = read("functions/api/account-data-reset.ts");

  assert.match(guard, /row\.lease_id === leaseId/);
  assert.match(guard, /row\.device_id === deviceId/);
  assert.match(guard, /Number\(row\.expires_at\) > now/);
  assert.match(guard, /status: 423/);
  assert.match(guard, /buildProjectEditLeaseGuardStatement/);
  assert.match(guard, /user_project_write_guards/);
  assert.match(guard, /expires_at > CAST\(\(julianday\('now'\) - 2440587\.5\) \* 86400000 AS INTEGER\)/);
  assert.match(project, /await requireProjectEditLease\(context\.env, context\.request, userId\)/);
  assert.match(project, /buildProjectEditLeaseGuardStatement\(context\.env\.DB, editLease, leaseGuardId\)/);
  assert.match(restore, /await requireProjectEditLease\(context\.env, context\.request, userId\)/);
  assert.match(restore, /buildProjectEditLeaseGuardStatement\(context\.env\.DB, editLease, leaseGuardId\)/);
  assert.match(reset, /await requireProjectEditLease\(context\.env, context\.request, userId\)/);
  assert.match(reset, /buildProjectEditLeaseGuardStatement\(env\.DB, editLease, guardId\)/);
});

test("client writes and restores carry the server-issued lease token", () => {
  const adapter = read("sync/projectSyncAdapter.ts");
  const panel = read("node-workspace/components/SyncPanel.tsx");
  const hook = read("hooks/useProjectEditLease.ts");

  assert.match(adapter, /"x-project-edit-lease": leaseId/);
  assert.match(panel, /"x-project-edit-lease": projectEditLeaseId/);
  assert.match(hook, /const HEARTBEAT_MS = 12_000/);
  assert.match(hook, /const runtimeSessionIds = new Map<string, string>\(\)/);
  assert.match(hook, /keepalive: action === "release"/);
  assert.match(hook, /Do not release unconditionally from an effect cleanup/);
});

test("a blocked cloud project can be atomically handed over without a local-only fork", () => {
  const app = read("App.tsx");
  const modal = read("components/ProjectEditLeaseModal.tsx");
  const accountGate = read("components/CloudAccountGate.tsx");
  const cloudEndpoints = [
    "functions/api/project.ts",
    "functions/api/projects.ts",
    "functions/api/project-snapshots.ts",
    "functions/api/project-restore.ts",
    "functions/api/secrets.ts",
    "functions/api/sync-audit.ts",
  ].map(read).join("\n");

  assert.match(app, /enabled: isSyncFeatureEnabled && isCloudProjectCatalogReady/);
  assert.match(app, /const isSyncFeatureEnabled = !!authSignedIn/);
  assert.doesNotMatch(app, /VITE_SYNC_ROLLOUT|AccountMigrationGate|accountScope="guest"/);
  assert.match(app, /onTakeover=\{projectEditLease\.takeover\}/);
  assert.doesNotMatch(app, /isLocalOnlyProject|setIsLocalOnlyProject/);
  assert.match(modal, /在此设备继续编辑/);
  assert.match(modal, /接管云端会话/);
  assert.doesNotMatch(modal, /本地项目|不参与云同步/);
  assert.match(accountGate, /项目始终属于你的云账户/);
  assert.match(accountGate, /不会静默降级为仅本地项目/);
  assert.doesNotMatch(cloudEndpoints, /RolloutEnv|getSyncRolloutInfo|Sync disabled for this account/);
});

test("lease loss preserves a recovery draft before the old device becomes read-only", () => {
  const app = read("App.tsx");
  const adapter = read("sync/projectSyncAdapter.ts");
  assert.match(app, /backupData\(localBackupKey, projectDataRef\.current\)/);
  assert.match(app, /projectEditLease\.markLost\(detail\)/);
  assert.match(adapter, /response\.clone\(\)\.json\(\)/);
  assert.match(adapter, /onLeaseLost\?\.\(detail\)/);
});

test("equivalent conflict requests share one decision and stale-CAS equality converges", () => {
  const app = read("App.tsx");
  const engine = read("sync/versionedSyncEngine.ts");

  assert.match(app, /projectSyncCodec\.fingerprint\(remote\)/);
  assert.match(app, /active\.resolves\.push\(resolve\)/);
  assert.match(app, /queued\.resolves\.push\(resolve\)/);
  assert.match(engine, /if \(this\.isEqual\(value, remoteValue\)\)/);
  assert.match(engine, /This is convergence, not a user conflict/);
});
