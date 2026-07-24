-- One-time development reset approved on 2026-07-17.
-- Account identity, profile, secrets, and account avatar objects are excluded.
DELETE FROM agent_spans;
DELETE FROM agent_traces;
DELETE FROM agent_sessions;
DELETE FROM user_project_flow_nodes;
DELETE FROM user_seedance_assets;
DELETE FROM user_project_scenes;
DELETE FROM user_project_episodes;
DELETE FROM user_project_snapshots;
DELETE FROM user_project_characters;
DELETE FROM user_project_locations;
DELETE FROM user_project_flow_projects;
DELETE FROM user_project_documents;
DELETE FROM user_project_write_guards;
DELETE FROM user_project_meta;
DELETE FROM user_sync_audit;
