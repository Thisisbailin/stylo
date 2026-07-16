import type { D1DatabaseLike, D1PreparedStatementLike } from "./_types";

export const createProjectWriteGuardId = (userId: string, opId?: string) =>
  `${userId}:${opId || crypto.randomUUID()}`;

/**
 * Produces a statement that deliberately violates the guard table's NOT NULL
 * constraint when the project version changes before the surrounding D1 batch
 * starts. Because D1 batch is transactional, that failure rolls back every
 * project mutation in the batch.
 */
export const buildProjectWriteGuardStatement = (
  db: D1DatabaseLike,
  userId: string,
  projectId: string,
  guardId: string,
  existing: boolean,
  expectedUpdatedAt?: number
): D1PreparedStatementLike => {
  if (existing) {
    return db.prepare(
      `INSERT INTO user_project_write_guards (guard_id, ok)
       VALUES (?1, (
         SELECT CASE
           WHEN EXISTS (
             SELECT 1 FROM user_project_meta
             WHERE user_id = ?2 AND project_id = ?3 AND updated_at = ?4
           )
           THEN 1 ELSE NULL
         END
       ))`
    ).bind(guardId, userId, projectId, expectedUpdatedAt);
  }

  return db.prepare(
    `INSERT INTO user_project_write_guards (guard_id, ok)
     VALUES (?1, (
       SELECT CASE
         WHEN NOT EXISTS (
           SELECT 1 FROM user_project_meta
           WHERE user_id = ?2 AND project_id = ?3
         )
         THEN 1 ELSE NULL
       END
     ))`
  ).bind(guardId, userId, projectId);
};

export const buildProjectWriteGuardCleanupStatement = (
  db: D1DatabaseLike,
  guardId: string
): D1PreparedStatementLike =>
  db.prepare("DELETE FROM user_project_write_guards WHERE guard_id = ?1").bind(guardId);

export const isProjectWriteGuardError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "");
  return /NOT NULL constraint failed:\s*user_project_write_guards\.ok/i.test(message);
};
