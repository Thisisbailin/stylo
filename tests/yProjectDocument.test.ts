import assert from "node:assert/strict";
import { test } from "node:test";
import * as Y from "yjs";
import {
  applyProjectSnapshot,
  readProjectSnapshot,
} from "../collaboration/yProjectDocument";

const baseProject = (): any => ({
  fileName: "Project",
  rawScript: "OPEN",
  episodes: [],
  roles: [],
  designAssets: [],
  canvas: {},
  activeFlowProjectId: "project-main",
  flow: {
    revision: 0,
    flowNodes: [],
    links: [],
    graphLinks: [],
    globalAssetHistory: [],
  },
  flowProjects: [],
  stats: { context: { total: 0, success: 0, error: 0 } },
});

const createPeers = () => {
  const left = new Y.Doc();
  const right = new Y.Doc();
  applyProjectSnapshot(left, baseProject(), "seed");
  Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
  return { left, right, baseVector: Y.encodeStateVector(left) };
};

test("staging a semantically unchanged project emits no Yjs update", () => {
  const doc = new Y.Doc();
  const project = baseProject();
  applyProjectSnapshot(doc, project, "seed");
  let updates = 0;
  doc.on("update", () => {
    updates += 1;
  });

  applyProjectSnapshot(doc, structuredClone(project), "same-value-render");

  assert.equal(updates, 0);
  assert.equal(Y.encodeStateAsUpdate(doc, Y.encodeStateVector(doc)).byteLength, 2);
});

test("concurrent first nodes in an initially empty graph both survive", () => {
  const { left, right, baseVector } = createPeers();
  const leftProject = baseProject();
  const rightProject = baseProject();
  leftProject.flow.flowNodes = [{
    id: "node-left",
    type: "text",
    position: { x: 10, y: 20 },
    data: { title: "Left", markdown: "A" },
  }];
  rightProject.flow.flowNodes = [{
    id: "node-right",
    type: "text",
    position: { x: 30, y: 40 },
    data: { title: "Right", markdown: "B" },
  }];

  applyProjectSnapshot(left, leftProject, "left");
  applyProjectSnapshot(right, rightProject, "right");
  const leftUpdate = Y.encodeStateAsUpdate(left, baseVector);
  const rightUpdate = Y.encodeStateAsUpdate(right, baseVector);
  Y.applyUpdate(left, rightUpdate);
  Y.applyUpdate(right, leftUpdate);

  const leftSnapshot = readProjectSnapshot<typeof leftProject>(left);
  const rightSnapshot = readProjectSnapshot<typeof rightProject>(right);
  assert.deepEqual(leftSnapshot, rightSnapshot);
  assert.deepEqual(
    leftSnapshot.flow.flowNodes.map((node: { id: string }) => node.id).sort(),
    ["node-left", "node-right"],
  );
});

test("concurrent text edits converge without a whole-project conflict choice", () => {
  const { left, right, baseVector } = createPeers();
  const leftProject = baseProject();
  const rightProject = baseProject();
  leftProject.rawScript = "OPEN LEFT";
  rightProject.rawScript = "OPEN RIGHT";

  applyProjectSnapshot(left, leftProject, "left");
  applyProjectSnapshot(right, rightProject, "right");
  const leftUpdate = Y.encodeStateAsUpdate(left, baseVector);
  const rightUpdate = Y.encodeStateAsUpdate(right, baseVector);
  Y.applyUpdate(left, rightUpdate);
  Y.applyUpdate(right, leftUpdate);

  const leftText = readProjectSnapshot<ReturnType<typeof baseProject>>(left).rawScript;
  const rightText = readProjectSnapshot<ReturnType<typeof baseProject>>(right).rawScript;
  assert.equal(leftText, rightText);
  assert.match(leftText, /LEFT/);
  assert.match(leftText, /RIGHT/);
});
