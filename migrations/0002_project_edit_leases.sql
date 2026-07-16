CREATE TABLE IF NOT EXISTS user_project_edit_leases (
  user_id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  client_label TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  renewed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_edit_leases_expires
  ON user_project_edit_leases(expires_at);
