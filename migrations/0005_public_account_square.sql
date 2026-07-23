ALTER TABLE user_profile ADD COLUMN username TEXT;
ALTER TABLE user_profile ADD COLUMN normalized_username TEXT;
ALTER TABLE user_profile ADD COLUMN display_name TEXT;
ALTER TABLE user_profile ADD COLUMN bio TEXT NOT NULL DEFAULT '';
ALTER TABLE user_profile ADD COLUMN account_visibility TEXT NOT NULL DEFAULT 'private';
ALTER TABLE user_profile ADD COLUMN searchable INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_profile ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_profile ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profile_normalized_username
  ON user_profile(normalized_username)
  WHERE normalized_username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_profile_directory
  ON user_profile(searchable, account_visibility, normalized_username);

CREATE TABLE IF NOT EXISTS user_project_visibility (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'inherit'
    CHECK (visibility IN ('inherit', 'public', 'private')),
  published_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_project_visibility_public
  ON user_project_visibility(visibility, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_profile_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  viewer_user_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  project_id TEXT,
  scope_key TEXT NOT NULL,
  visit_session_id TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 1 CHECK (view_count >= 1),
  UNIQUE (viewer_user_id, owner_user_id, scope_key, visit_session_id),
  CHECK (viewer_user_id <> owner_user_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_visits_owner_recent
  ON user_profile_visits(owner_user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_visits_viewer_recent
  ON user_profile_visits(viewer_user_id, last_seen_at DESC);
