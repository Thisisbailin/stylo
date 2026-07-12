import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildProjectWriteGuardCleanupStatement,
  buildProjectWriteGuardStatement,
  createProjectWriteGuardId,
  isProjectWriteGuardError,
} from "../functions/api/_projectWriteGuard";

type CapturedStatement = {
  sql: string;
  params: unknown[];
  bind: (...params: unknown[]) => CapturedStatement;
};

const createDatabaseRecorder = () => {
  const statements: CapturedStatement[] = [];
  const db = {
    prepare(sql: string) {
      const statement: CapturedStatement = {
        sql,
        params: [],
        bind(...params: unknown[]) {
          statement.params = params;
          return statement;
        },
      };
      statements.push(statement);
      return statement;
    },
  };
  return { db, statements };
};

test("existing-project guard compares both owner and expected version", () => {
  const { db, statements } = createDatabaseRecorder();
  buildProjectWriteGuardStatement(db as never, "user-1", "guard-1", true, 42);

  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /user_id\s*=\s*\?2/i);
  assert.match(statements[0].sql, /updated_at\s*=\s*\?3/i);
  assert.deepEqual(statements[0].params, ["guard-1", "user-1", 42]);
});

test("new-project guard only succeeds while the owner row is absent", () => {
  const { db, statements } = createDatabaseRecorder();
  buildProjectWriteGuardStatement(db as never, "user-2", "guard-2", false, 0);

  assert.match(statements[0].sql, /NOT EXISTS/i);
  assert.match(statements[0].sql, /user_id\s*=\s*\?2/i);
  assert.deepEqual(statements[0].params, ["guard-2", "user-2"]);
});

test("guard cleanup is scoped to one operation and known constraint errors are recognized", () => {
  const { db, statements } = createDatabaseRecorder();
  buildProjectWriteGuardCleanupStatement(db as never, "guard-cleanup");

  assert.match(statements[0].sql, /^DELETE FROM user_project_write_guards WHERE guard_id = \?1$/i);
  assert.deepEqual(statements[0].params, ["guard-cleanup"]);
  assert.equal(
    isProjectWriteGuardError(new Error("NOT NULL constraint failed: user_project_write_guards.ok")),
    true
  );
  assert.equal(isProjectWriteGuardError(new Error("NOT NULL constraint failed: other_table.value")), false);
  assert.equal(createProjectWriteGuardId("user-3", "op-3"), "user-3:op-3");
});
