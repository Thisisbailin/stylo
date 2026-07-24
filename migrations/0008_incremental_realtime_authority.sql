-- Per-action Yjs updates are now authoritative inside each project's
-- SQLite-backed Durable Object. D1 retains only the compacted read projection.
DROP TABLE IF EXISTS user_project_updates;
