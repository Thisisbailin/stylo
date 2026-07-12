import type { D1DatabaseLike } from "./_types";
import { jsonResponse } from "./_auth";

const nextCleanupByDatabase = new WeakMap<object, number>();

const cleanExpiredWindows = async (db: D1DatabaseLike, nowSeconds: number) => {
  const nextCleanup = nextCleanupByDatabase.get(db) || 0;
  if (nowSeconds < nextCleanup) return;
  nextCleanupByDatabase.set(db, nowSeconds + 3_600);
  try {
    await db
      .prepare("DELETE FROM api_rate_limits WHERE window_start < ?1")
      .bind(nowSeconds - 86_400)
      .run();
  } catch (error) {
    nextCleanupByDatabase.delete(db);
    console.warn("Failed to prune expired API rate-limit windows", error);
  }
};

export const enforceRateLimit = async ({
  db,
  namespace,
  subject,
  limit,
  windowSeconds,
}: {
  db: D1DatabaseLike;
  namespace: string;
  subject: string;
  limit: number;
  windowSeconds: number;
}) => {
  const nowSeconds = Math.floor(Date.now() / 1_000);
  await cleanExpiredWindows(db, nowSeconds);
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  const row = await db
    .prepare(
      `INSERT INTO api_rate_limits (namespace, subject, window_start, request_count)
       VALUES (?1, ?2, ?3, 1)
       ON CONFLICT(namespace, subject, window_start)
       DO UPDATE SET request_count = request_count + 1
       RETURNING request_count`
    )
    .bind(namespace, subject, windowStart)
    .first<{ request_count: number }>();
  const count = Number(row?.request_count || 0);
  if (count > limit) {
    const retryAfter = Math.max(1, windowStart + windowSeconds - nowSeconds);
    throw jsonResponse(
      { error: "Rate limit exceeded", retryAfterSeconds: retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }
};
