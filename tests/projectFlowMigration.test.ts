import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeFlowProjectsForStorage } from "../functions/api/_projectFlowMigration";

test("legacy top-level flow is migrated before metadata compaction", () => {
  const legacyFlow = { flowNodes: [{ id: "text-1" }], links: [] };
  const projects = normalizeFlowProjectsForStorage({
    flowProjects: undefined,
    legacyFlow,
    activeFlowProjectId: undefined,
    fileName: "Legacy",
    roles: [],
    designAssets: [],
    timestamp: 42,
  });

  assert.equal(projects.length, 1);
  assert.equal(projects[0].id, "flow-project-main");
  assert.equal(projects[0].flow, legacyFlow);
});

test("current flow projects remain authoritative", () => {
  const current = [{ id: "project-a", flow: { flowNodes: [], links: [] } }];
  const projects = normalizeFlowProjectsForStorage({
    flowProjects: current,
    legacyFlow: { flowNodes: [{ id: "legacy" }], links: [] },
    activeFlowProjectId: "project-a",
    fileName: "Current",
    roles: [],
    designAssets: [],
    timestamp: 42,
  });
  assert.deepEqual(projects, current);
});
