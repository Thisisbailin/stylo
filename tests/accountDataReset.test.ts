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

test("project reset deletes all project authority rows in one D1 batch", async () => {
  const database = createDatabase();
  const result = await resetD1UserData({ DB: database.DB } as any, "user-1", false);

  assert.equal(database.batches.length, 1);
  assert.equal(database.getDirectRuns(), 0);
  const sql = database.batches[0].map((statement) => statement.sql).join("\n");
  assert.match(sql, /DELETE FROM user_project_write_guards/);
  assert.match(sql, /DELETE FROM user_seedance_assets/);
  assert.doesNotMatch(sql, /DELETE FROM user_profile/);
  assert.doesNotMatch(sql, /DELETE FROM user_secrets/);
  assert.ok(database.batches[0].every((statement) => statement.bindings[0] === "user-1"));
  assert.equal(result.user_project_write_guards, 1);
});

test("account reset extends the same transaction to profile and secrets", async () => {
  const database = createDatabase();
  await resetD1UserData({ DB: database.DB } as any, "user-2", true);

  assert.equal(database.batches.length, 1);
  const sql = database.batches[0].map((statement) => statement.sql).join("\n");
  assert.match(sql, /DELETE FROM user_profile/);
  assert.match(sql, /DELETE FROM user_secrets/);
});
