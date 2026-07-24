-- Project content is exclusively stored as a realtime Yjs document.
-- Development-era snapshot/CAS tables contain test data and are intentionally
-- removed rather than migrated into the realtime authority.
DROP TABLE IF EXISTS user_project_write_guards;
DROP TABLE IF EXISTS user_project_snapshots;
DROP TABLE IF EXISTS user_project_flow_nodes;
DROP TABLE IF EXISTS user_project_flow_projects;
DROP TABLE IF EXISTS user_project_scenes;
DROP TABLE IF EXISTS user_project_episodes;
DROP TABLE IF EXISTS user_project_characters;
DROP TABLE IF EXISTS user_project_locations;
DROP TABLE IF EXISTS user_project_meta;

