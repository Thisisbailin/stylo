import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ProjectData } from "../types";
import {
  hasInlineProjectMedia,
  restoreLocalProjectMedia,
  toCloudProjectData,
} from "../utils/cloudProjectData";
import { normalizeProjectData } from "../utils/projectData";
import { projectSyncCodec, readActiveFlowRevision } from "../sync/projectSyncAdapter";

const createProject = (): ProjectData => {
  const image = `data:image/png;base64,${"a".repeat(2_000_000)}`;
  const flow = {
    revision: 4,
    links: [],
    flowNodes: [
      {
        id: "image-1",
        type: "imageInput" as const,
        position: { x: 10, y: 20 },
        data: {
          image,
          filename: "portrait.png",
          dimensions: { width: 100, height: 120 },
          nested: { preview: image },
        },
      },
    ],
  };
  return {
    fileName: "Cloud media test",
    rawScript: "",
    episodes: [],
    roles: [],
    designAssets: [],
    canvas: {},
    flow,
    activeFlowProjectId: "flow-1",
    flowProjects: [
      {
        id: "flow-1",
        title: "Flow",
        color: "#000000",
        durationMin: 1,
        rootNodeId: "root",
        createdAt: 1,
        updatedAt: 1,
        flow,
      },
    ],
    stats: { context: { total: 0, success: 0, error: 0 } },
  };
};

test("cloud project projection excludes inline media and duplicate legacy flow", () => {
  const local = createProject();
  const cloud = toCloudProjectData(local);
  const cloudNode = cloud.flowProjects?.[0]?.flow.flowNodes?.[0];

  assert.equal(cloud.flow, undefined);
  assert.equal(cloudNode?.data.image, null);
  assert.equal((cloudNode?.data.nested as { preview?: unknown })?.preview, null);
  assert.deepEqual(
    (cloudNode?.data.localMediaRefs as Array<{ path: string }>).map((ref) => ref.path).sort(),
    ["/image", "/nested/preview"]
  );
  assert.equal(hasInlineProjectMedia(cloud), false);
  assert.equal(hasInlineProjectMedia(local), true);
  assert.ok(JSON.stringify(cloud).length < 20_000);
  assert.match(String(local.flowProjects?.[0]?.flow.flowNodes?.[0]?.data.image), /^data:image\/png/);
});

test("cloud projection round-trip preserves the active Flow and its revision", () => {
  const local = createProject();
  const wireProject = JSON.parse(JSON.stringify(toCloudProjectData(local))) as ProjectData;
  const normalized = normalizeProjectData(wireProject);
  const immutableSnapshot = projectSyncCodec.snapshot(local);

  assert.equal(normalized.flow?.revision, 4);
  assert.equal(normalized.flowProjects?.[0]?.flow.revision, 4);
  assert.equal(normalized.flow?.flowNodes?.[0]?.id, "image-1");
  assert.equal(readActiveFlowRevision(immutableSnapshot), 4);
  assert.equal(immutableSnapshot.flowProjects?.[0]?.flow.flowNodes?.[0]?.id, "image-1");
});

test("remote cloud metadata preserves matching local media by node id", () => {
  const local = createProject();
  const remote = toCloudProjectData(local);
  const restored = restoreLocalProjectMedia(remote, local);
  const restoredNode = restored.flowProjects?.[0]?.flow.flowNodes?.[0];

  assert.equal(restoredNode?.data.image, local.flowProjects?.[0]?.flow.flowNodes?.[0]?.data.image);
  assert.equal(
    (restoredNode?.data.nested as { preview?: unknown })?.preview,
    (local.flowProjects?.[0]?.flow.flowNodes?.[0]?.data.nested as { preview?: unknown })?.preview
  );
});

test("project API rejects inline media before binding idempotency to the sanitized write payload", () => {
  const source = readFileSync("functions/api/project.ts", "utf8");
  const inlineGuardIndex = source.indexOf("hasInlineProjectMedia(inlineMediaScope");
  const idempotencyIndex = source.indexOf('bindOperationId("project-put"');

  assert.ok(inlineGuardIndex >= 0);
  assert.ok(idempotencyIndex > inlineGuardIndex);
  assert.match(
    source.slice(idempotencyIndex, idempotencyIndex + 320),
    /payload:\s*delta\s*\|\|\s*projectData/
  );
});
