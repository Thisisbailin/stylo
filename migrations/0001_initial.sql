CREATE TABLE IF NOT EXISTS user_project_meta (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  last_op_id TEXT
);
CREATE TABLE IF NOT EXISTS user_project_episodes (
  user_id TEXT NOT NULL,
  episode_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, episode_id)
);
CREATE TABLE IF NOT EXISTS user_project_scenes (
  user_id TEXT NOT NULL,
  episode_id INTEGER NOT NULL,
  scene_id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, episode_id, scene_id)
);
CREATE TABLE IF NOT EXISTS user_project_flow_projects (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id)
);
CREATE TABLE IF NOT EXISTS user_project_flow_nodes (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  node_index INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_project_flow_nodes_order
  ON user_project_flow_nodes(user_id, project_id, node_index);
CREATE TABLE IF NOT EXISTS user_project_characters (
  user_id TEXT NOT NULL,
  char_id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, char_id)
);
CREATE TABLE IF NOT EXISTS user_project_locations (
  user_id TEXT NOT NULL,
  loc_id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, loc_id)
);
CREATE TABLE IF NOT EXISTS user_project_snapshots (
  user_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, version)
);
CREATE TABLE IF NOT EXISTS user_project_write_guards (
  guard_id TEXT PRIMARY KEY,
  ok INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_secrets (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_profile (
  user_id TEXT PRIMARY KEY,
  avatar_url TEXT
);
CREATE TABLE IF NOT EXISTS user_sync_audit (
  user_id TEXT NOT NULL,
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_audit_user_created
  ON user_sync_audit(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  namespace TEXT NOT NULL,
  subject TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (namespace, subject, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON api_rate_limits(window_start);

CREATE TABLE IF NOT EXISTS agent_sessions (
  session_key TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT,
  items TEXT NOT NULL,
  messages TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_session
  ON agent_sessions(user_id, session_id);
CREATE TABLE IF NOT EXISTS agent_traces (
  trace_id TEXT PRIMARY KEY,
  session_key TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  group_id TEXT,
  metadata TEXT NOT NULL,
  trace_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_traces_user_session
  ON agent_traces(user_id, session_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS agent_spans (
  span_id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  parent_id TEXT,
  span_type TEXT NOT NULL,
  span_name TEXT,
  started_at TEXT,
  ended_at TEXT,
  error TEXT,
  span_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_spans_trace ON agent_spans(trace_id, created_at);

CREATE TABLE IF NOT EXISTS user_seedance_assets (
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  group_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, asset_id)
);
CREATE INDEX IF NOT EXISTS idx_seedance_assets_user_group
  ON user_seedance_assets(user_id, group_id);
