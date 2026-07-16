-- Development-only reset: all pre-project-scope cloud project data is test data.
DROP TABLE IF EXISTS agent_spans;
DROP TABLE IF EXISTS agent_traces;
DROP TABLE IF EXISTS agent_sessions;
DROP TABLE IF EXISTS user_seedance_assets;
DELETE FROM user_project_write_guards;

DROP TABLE IF EXISTS user_project_edit_leases;
DROP TABLE IF EXISTS user_project_snapshots;
DROP TABLE IF EXISTS user_project_flow_nodes;
DROP TABLE IF EXISTS user_project_flow_projects;
DROP TABLE IF EXISTS user_project_scenes;
DROP TABLE IF EXISTS user_project_episodes;
DROP TABLE IF EXISTS user_project_characters;
DROP TABLE IF EXISTS user_project_locations;
DROP TABLE IF EXISTS user_project_meta;

CREATE TABLE user_project_meta (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  last_op_id TEXT,
  PRIMARY KEY (user_id, project_id)
);
CREATE INDEX idx_project_meta_user_updated
  ON user_project_meta(user_id, updated_at DESC);

CREATE TABLE user_project_episodes (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  episode_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id, episode_id)
);

CREATE TABLE user_project_scenes (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  episode_id INTEGER NOT NULL,
  scene_id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id, episode_id, scene_id)
);

CREATE TABLE user_project_flow_projects (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id)
);

CREATE TABLE user_project_flow_nodes (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  node_index INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id, node_id)
);
CREATE INDEX idx_project_flow_nodes_order
  ON user_project_flow_nodes(user_id, project_id, node_index);

CREATE TABLE user_project_characters (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  char_id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id, char_id)
);

CREATE TABLE user_project_locations (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  loc_id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id, loc_id)
);

CREATE TABLE user_project_snapshots (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id, version)
);
CREATE INDEX idx_project_snapshots_scope_created
  ON user_project_snapshots(user_id, project_id, created_at DESC);

CREATE TABLE user_project_edit_leases (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  client_label TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  renewed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id)
);
CREATE INDEX idx_project_edit_leases_expires
  ON user_project_edit_leases(expires_at);

CREATE TABLE agent_sessions (
  session_key TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT,
  project_id TEXT NOT NULL,
  items TEXT NOT NULL,
  messages TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_agent_sessions_project
  ON agent_sessions(user_id, project_id, updated_at DESC);

CREATE TABLE agent_traces (
  trace_id TEXT PRIMARY KEY,
  session_key TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_id TEXT,
  project_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  group_id TEXT,
  metadata TEXT NOT NULL,
  trace_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_agent_traces_project
  ON agent_traces(user_id, project_id, updated_at DESC);

CREATE TABLE agent_spans (
  span_id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  user_id TEXT,
  project_id TEXT NOT NULL,
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
CREATE INDEX idx_agent_spans_project_trace
  ON agent_spans(user_id, project_id, trace_id, created_at);

CREATE TABLE user_seedance_assets (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  group_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id, asset_id)
);
CREATE INDEX idx_seedance_assets_project_group
  ON user_seedance_assets(user_id, project_id, group_id);
