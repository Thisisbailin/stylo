import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

test("D1 schema is migration-owned rather than created in request handlers", async () => {
  const apiRoot = path.join(process.cwd(), "functions/api");
  const apiFiles = (await readdir(apiRoot, { recursive: true }))
    .filter((file) => file.endsWith(".ts"));
  for (const relativePath of apiFiles) {
    const source = await readFile(path.join(apiRoot, relativePath), "utf8");
    assert.doesNotMatch(source, /CREATE\s+TABLE|ALTER\s+TABLE|PRAGMA\s+table_info/i, relativePath);
  }

  const migration = await readFile(path.join(process.cwd(), "migrations/0004_realtime_collaboration.sql"), "utf8");
  for (const table of [
    "user_project_documents",
    "user_project_updates",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }

  const cleanup = await readFile(path.join(process.cwd(), "migrations/0007_remove_snapshot_sync.sql"), "utf8");
  assert.match(cleanup, /DROP TABLE IF EXISTS user_project_snapshots/);
  assert.match(cleanup, /DROP TABLE IF EXISTS user_project_meta/);

  const incrementalAuthority = await readFile(
    path.join(process.cwd(), "migrations/0008_incremental_realtime_authority.sql"),
    "utf8",
  );
  assert.match(incrementalAuthority, /DROP TABLE IF EXISTS user_project_updates/);
});
