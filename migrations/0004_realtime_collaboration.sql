-- Multi-writer project authority. Development data was reset before rollout.
DROP TABLE IF EXISTS user_project_edit_leases;

CREATE TABLE IF NOT EXISTS user_project_documents (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  y_state BLOB NOT NULL,
  project_data TEXT NOT NULL,
  server_seq INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_project_documents_user_updated
  ON user_project_documents(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_project_updates (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  server_seq INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  op_id TEXT NOT NULL,
  update_blob BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id, server_seq),
  UNIQUE (user_id, project_id, op_id)
);
CREATE INDEX IF NOT EXISTS idx_project_updates_replay
  ON user_project_updates(user_id, project_id, server_seq ASC);
