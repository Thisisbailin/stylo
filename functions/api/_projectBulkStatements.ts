import type { D1DatabaseLike, D1PreparedStatementLike } from "./_types";

const MAX_D1_JSON_PARAMETER_BYTES = 1_750_000;
const encoder = new TextEncoder();

type EpisodeRow = { id: number; data: unknown };
type SceneRow = { episodeId: number; sceneId: string; data: unknown };
type FlowProjectRow = { projectId: string; data: unknown };
type FlowNodeRow = { projectId: string; nodeId: string; nodeIndex: number; data: unknown };

const chunkRows = <T>(rows: T[]): string[] => {
  const chunks: string[] = [];
  let parts: string[] = [];
  let bytes = 2;

  const flush = () => {
    if (!parts.length) return;
    chunks.push(`[${parts.join(",")}]`);
    parts = [];
    bytes = 2;
  };

  for (const row of rows) {
    const serialized = JSON.stringify(row);
    const rowBytes = encoder.encode(serialized).byteLength;
    if (rowBytes + 2 > MAX_D1_JSON_PARAMETER_BYTES) {
      throw new Error("A project row exceeds the D1 JSON parameter limit");
    }
    const delimiterBytes = parts.length ? 1 : 0;
    if (bytes + delimiterBytes + rowBytes > MAX_D1_JSON_PARAMETER_BYTES) flush();
    parts.push(serialized);
    bytes += (parts.length > 1 ? 1 : 0) + rowBytes;
  }
  flush();
  return chunks;
};

export const buildBulkProjectInsertStatements = (
  db: D1DatabaseLike,
  userId: string,
  updatedAt: number,
  rows: {
    episodes: EpisodeRow[];
    scenes: SceneRow[];
    flowProjects: FlowProjectRow[];
    flowNodes: FlowNodeRow[];
  },
  options: { upsertEpisodesAndScenes?: boolean } = {}
): D1PreparedStatementLike[] => {
  const statements: D1PreparedStatementLike[] = [];

  chunkRows(rows.episodes).forEach((jsonRows) => {
    const upsert = options.upsertEpisodesAndScenes
      ? " WHERE true ON CONFLICT(user_id, episode_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at"
      : "";
    statements.push(db.prepare(
      `INSERT INTO user_project_episodes (user_id, episode_id, data, updated_at)
       SELECT ?1, CAST(json_extract(value, '$.id') AS INTEGER), json_extract(value, '$.data'), ?3
       FROM json_each(?2)${upsert}`
    ).bind(userId, jsonRows, updatedAt));
  });
  chunkRows(rows.scenes).forEach((jsonRows) => {
    const upsert = options.upsertEpisodesAndScenes
      ? " WHERE true ON CONFLICT(user_id, episode_id, scene_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at"
      : "";
    statements.push(db.prepare(
      `INSERT INTO user_project_scenes (user_id, episode_id, scene_id, data, updated_at)
       SELECT ?1,
              CAST(json_extract(value, '$.episodeId') AS INTEGER),
              json_extract(value, '$.sceneId'),
              json_extract(value, '$.data'),
              ?3
       FROM json_each(?2)${upsert}`
    ).bind(userId, jsonRows, updatedAt));
  });
  chunkRows(rows.flowProjects).forEach((jsonRows) => {
    statements.push(db.prepare(
      `INSERT INTO user_project_flow_projects (user_id, project_id, data, updated_at)
       SELECT ?1, json_extract(value, '$.projectId'), json_extract(value, '$.data'), ?3
       FROM json_each(?2)`
    ).bind(userId, jsonRows, updatedAt));
  });
  chunkRows(rows.flowNodes).forEach((jsonRows) => {
    statements.push(db.prepare(
      `INSERT INTO user_project_flow_nodes (user_id, project_id, node_id, node_index, data, updated_at)
       SELECT ?1,
              json_extract(value, '$.projectId'),
              json_extract(value, '$.nodeId'),
              CAST(json_extract(value, '$.nodeIndex') AS INTEGER),
              json_extract(value, '$.data'),
              ?3
       FROM json_each(?2)`
    ).bind(userId, jsonRows, updatedAt));
  });

  return statements;
};
