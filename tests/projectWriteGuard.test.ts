import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildProjectWriteGuardCleanupStatement,
  buildProjectWriteGuardStatement,
  createProjectWriteGuardId,
  isProjectWriteGuardError,
} from "../functions/api/_projectWriteGuard";
import { buildProjectEditLeaseTakeoverStatement } from "../functions/api/_projectEditLease";

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
  buildProjectWriteGuardStatement(db as never, "user-1", "project-a", "guard-1", true, 42);

  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /user_id\s*=\s*\?2/i);
  assert.match(statements[0].sql, /project_id\s*=\s*\?3/i);
  assert.match(statements[0].sql, /updated_at\s*=\s*\?4/i);
  assert.deepEqual(statements[0].params, ["guard-1", "user-1", "project-a", 42]);
});

test("new-project guard only succeeds while the owner row is absent", () => {
  const { db, statements } = createDatabaseRecorder();
  buildProjectWriteGuardStatement(db as never, "user-2", "project-b", "guard-2", false, 0);

  assert.match(statements[0].sql, /NOT EXISTS/i);
  assert.match(statements[0].sql, /user_id\s*=\s*\?2/i);
  assert.match(statements[0].sql, /project_id\s*=\s*\?3/i);
  assert.deepEqual(statements[0].params, ["guard-2", "user-2", "project-b"]);
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

test("device takeover is compare-and-swap fenced by user, project, and observed lease", () => {
  const { db, statements } = createDatabaseRecorder();
  buildProjectEditLeaseTakeoverStatement(db as never, {
    userId: "user-1",
    projectId: "project-a",
    candidateLeaseId: "lease-new",
    deviceId: "device-phone",
    sessionId: "session-phone",
    clientLabel: "Stylo 手机端",
    now: 100,
    expiresAt: 145,
    takeoverToken: "lease-observed",
  });

  assert.match(statements[0].sql, /WHERE user_id = \?1 AND project_id = \?2 AND lease_id = \?9/);
  assert.deepEqual(statements[0].params, [
    "user-1",
    "project-a",
    "lease-new",
    "device-phone",
    "session-phone",
    "Stylo 手机端",
    100,
    145,
    "lease-observed",
  ]);
});
