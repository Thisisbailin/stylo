-- A deleted project ID must never be recreated by a stale or offline client.
CREATE TABLE IF NOT EXISTS user_project_deletions (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_deletions_user_recent
  ON user_project_deletions(user_id, deleted_at DESC);

-- The tombstone is enforced at the database boundary so a request that was
-- already in flight on another device cannot repopulate a deleted project
-- after cleanup has committed.
CREATE TRIGGER IF NOT EXISTS deny_deleted_project_document_insert
BEFORE INSERT ON user_project_documents
WHEN EXISTS (
  SELECT 1 FROM user_project_deletions
  WHERE user_id = NEW.user_id AND project_id = NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'PROJECT_DELETED');
END;

CREATE TRIGGER IF NOT EXISTS deny_deleted_project_document_update
BEFORE UPDATE ON user_project_documents
WHEN EXISTS (
  SELECT 1 FROM user_project_deletions
  WHERE user_id = NEW.user_id AND project_id = NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'PROJECT_DELETED');
END;

CREATE TRIGGER IF NOT EXISTS deny_deleted_project_update_insert
BEFORE INSERT ON user_project_updates
WHEN EXISTS (
  SELECT 1 FROM user_project_deletions
  WHERE user_id = NEW.user_id AND project_id = NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'PROJECT_DELETED');
END;

CREATE TRIGGER IF NOT EXISTS deny_deleted_agent_session_insert
BEFORE INSERT ON agent_sessions
WHEN EXISTS (
  SELECT 1 FROM user_project_deletions
  WHERE user_id = NEW.user_id AND project_id = NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'PROJECT_DELETED');
END;

CREATE TRIGGER IF NOT EXISTS deny_deleted_agent_session_update
BEFORE UPDATE ON agent_sessions
WHEN EXISTS (
  SELECT 1 FROM user_project_deletions
  WHERE user_id = NEW.user_id AND project_id = NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'PROJECT_DELETED');
END;

CREATE TRIGGER IF NOT EXISTS deny_deleted_agent_trace_insert
BEFORE INSERT ON agent_traces
WHEN EXISTS (
  SELECT 1 FROM user_project_deletions
  WHERE user_id = NEW.user_id AND project_id = NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'PROJECT_DELETED');
END;

CREATE TRIGGER IF NOT EXISTS deny_deleted_agent_span_insert
BEFORE INSERT ON agent_spans
WHEN EXISTS (
  SELECT 1 FROM user_project_deletions
  WHERE user_id = NEW.user_id AND project_id = NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'PROJECT_DELETED');
END;

CREATE TRIGGER IF NOT EXISTS deny_deleted_seedance_asset_insert
BEFORE INSERT ON user_seedance_assets
WHEN EXISTS (
  SELECT 1 FROM user_project_deletions
  WHERE user_id = NEW.user_id AND project_id = NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'PROJECT_DELETED');
END;

CREATE TRIGGER IF NOT EXISTS deny_deleted_project_visibility_insert
BEFORE INSERT ON user_project_visibility
WHEN EXISTS (
  SELECT 1 FROM user_project_deletions
  WHERE user_id = NEW.user_id AND project_id = NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'PROJECT_DELETED');
END;

CREATE TRIGGER IF NOT EXISTS deny_deleted_project_visit_insert
BEFORE INSERT ON user_profile_visits
WHEN NEW.project_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM user_project_deletions
  WHERE user_id = NEW.owner_user_id AND project_id = NEW.project_id
)
BEGIN
  SELECT RAISE(ABORT, 'PROJECT_DELETED');
END;
