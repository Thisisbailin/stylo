import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

test("restore keeps the CAS guard and cleanup inside one ordered D1 batch", async () => {
  const source = await readFile(
    path.join(process.cwd(), "functions/api/project-restore.ts"),
    "utf8"
  );
  const transactionStart = source.indexOf("const statements = [");
  const batchCall = source.indexOf("await context.env.DB.batch(statements)", transactionStart);
  assert.notEqual(transactionStart, -1, "restore must construct one statement list");
  assert.notEqual(batchCall, -1, "restore must commit through D1 batch");

  const transaction = source.slice(transactionStart, batchCall);
  const guard = transaction.indexOf("buildProjectWriteGuardStatement(");
  const firstDestructiveWrite = transaction.indexOf('DELETE FROM user_project_episodes');
  const metaWrite = transaction.indexOf('INSERT INTO user_project_meta');
  const cleanup = transaction.lastIndexOf("buildProjectWriteGuardCleanupStatement(");

  assert.ok(guard >= 0 && guard < firstDestructiveWrite, "CAS guard must be the first project write");
  assert.ok(metaWrite > firstDestructiveWrite, "version/meta update must follow project row mutations");
  assert.ok(cleanup > metaWrite, "guard cleanup must be the final transaction statement");
});
