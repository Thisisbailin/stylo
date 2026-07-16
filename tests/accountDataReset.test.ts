import assert from "node:assert/strict";
import { test } from "node:test";
import { resetD1UserData } from "../functions/api/account-data-reset";

const TABLES = [
  "agent_spans",
  "agent_traces",
  "agent_sessions",
  "user_project_flow_nodes",
  "user_seedance_assets",
  "user_project_scenes",
  "user_project_episodes",
  "user_project_snapshots",
  "user_project_characters",
  "user_project_locations",
  "user_project_flow_projects",
  "user_project_write_guards",
  "user_project_edit_leases",
  "user_project_meta",
  "user_sync_audit",
  "user_profile",
  "user_secrets",
];

const createDatabase = () => {
  const batches: Array<Array<{ sql: string; bindings: unknown[] }>> = [];
  let directRuns = 0;
  const prepare = (sql: string) => {
    const statement = {
      sql,
      bindings: [] as unknown[],
      bind(...bindings: unknown[]) {
        this.bindings = bindings;
        return this;
      },
      async all() {
        return { results: TABLES.map((name) => ({ name })) };
      },
      async run() {
        directRuns += 1;
        return { meta: { changes: 1 } };
      },
    };
    return statement;
  };
  const DB = {
    prepare,
    async batch(statements: Array<{ sql: string; bindings: unknown[] }>) {
      batches.push(statements);
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
  return { DB, batches, getDirectRuns: () => directRuns };
};

const editLease = (userId: string) => ({
  user_id: userId,
  project_id: "project-a",
  lease_id: "lease-12345678",
  device_id: "device-12345678",
  session_id: "session-12345678",
  client_label: "Test client",
  acquired_at: 1,
  renewed_at: 1,
  expires_at: Date.now() + 45_000,
});

test("project reset deletes all project authority rows in one D1 batch", async () => {
  const database = createDatabase();
  const result = await resetD1UserData({ DB: database.DB } as any, "user-1", false, editLease("user-1"));

  assert.equal(database.batches.length, 1);
  assert.equal(database.getDirectRuns(), 0);
  const sql = database.batches[0].map((statement) => statement.sql).join("\n");
  assert.match(sql, /INSERT INTO user_project_write_guards/);
  assert.doesNotMatch(sql, /DELETE FROM user_project_write_guards WHERE user_id/);
  assert.match(sql, /DELETE FROM user_seedance_assets/);
  assert.match(sql, /DELETE FROM agent_sessions/);
  assert.doesNotMatch(sql, /DELETE FROM user_profile/);
  assert.doesNotMatch(sql, /DELETE FROM user_secrets/);
  const projectDeletes = database.batches[0].filter((statement) => /DELETE FROM (?!user_project_write_guards)/.test(statement.sql));
  assert.ok(projectDeletes.every((statement) => statement.bindings[0] === "user-1"));
  assert.ok(projectDeletes.every((statement) => statement.bindings[1] === "project-a"));
  assert.ok(projectDeletes.every((statement) => /project_id = \?2/.test(statement.sql)));
  assert.equal(result.user_project_meta, 1);
});

test("account reset extends the same transaction to profile and secrets", async () => {
  const database = createDatabase();
  await resetD1UserData({ DB: database.DB } as any, "user-2", true, editLease("user-2"));

  assert.equal(database.batches.length, 1);
  const sql = database.batches[0].map((statement) => statement.sql).join("\n");
  assert.match(sql, /DELETE FROM user_profile/);
  assert.match(sql, /DELETE FROM user_secrets/);
  assert.match(sql, /DELETE FROM user_project_edit_leases/);
});
