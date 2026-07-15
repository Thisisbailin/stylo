import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectData } from "../types";
import {
  LOOKBOOK_MEMBERSHIP_RELATION,
  getLookbookMemberNodes,
  getFirstLookbookImageNode,
  getVisibleLookbookMemberNodes,
  parseFountainIdentityCandidates,
  removeLookbookIdentity,
  syncLookbookIdentitiesFromFountain,
} from "../utils/lookbookIdentities";

const makeProject = (): ProjectData => ({
  fileName: "Lookbook Test",
  rawScript: "",
  episodes: [],
  roles: [],
  designAssets: [],
  canvas: { viewport: null },
  flow: {
    flowNodes: [
      {
        id: "script-main",
        type: "scriptPage",
        position: { x: 100, y: 80 },
        data: { title: "正片", text: "", documentKind: "script", format: "fountain" },
      },
    ],
    links: [],
  },
  stats: { context: { total: 0, success: 0, error: 0 } },
});

test("Fountain identity parsing extracts people and scenes across editor formats", () => {
  const candidates = parseFountainIdentityCandidates([
    ".INT. 江边仓库 - NIGHT",
    "@林默",
    "@林默 (V.O.)",
    "【场景】外景｜旧码头｜黎明",
    "【角色】苏合",
    "@CHARACTER",
    ".EXT. LOCATION - DAY",
  ].join("\n"));

  assert.deepEqual(candidates, [
    { name: "江边仓库", kind: "scene" },
    { name: "林默", kind: "person" },
    { name: "旧码头", kind: "scene" },
    { name: "苏合", kind: "person" },
  ]);
});

test("Lookbook synchronization creates one wrapper, Markdown index, and boundary per identity", () => {
  const content = ".INT. 江边仓库 - NIGHT\n\n@林默\n别回头。";
  const first = syncLookbookIdentitiesFromFountain(makeProject(), {
    sourceNodeId: "script-main",
    content,
    now: 100,
  });
  const second = syncLookbookIdentitiesFromFountain(first, {
    sourceNodeId: "script-main",
    content,
    now: 200,
  });

  assert.equal(second.roles.length, 2);
  const lookbookNodes = second.flow?.flowNodes?.filter((node) => node.type === "lookbook") || [];
  assert.equal(lookbookNodes.length, 2);
  assert.ok(lookbookNodes.every((node) => node.style?.width === 286 && node.style?.height === 356));
  assert.equal(second.flow?.flowNodes?.filter((node) => node.data?.lookbookRole === "index").length, 2);
  assert.ok(second.flow?.flowNodes?.filter((node) => node.data?.lookbookRole === "index").every((node) => node.type === "text"));
  assert.equal(
    second.flow?.links.filter((link) => link.data?.relation === LOOKBOOK_MEMBERSHIP_RELATION).length,
    2
  );
  assert.ok(second.roles.every((role) => role.status === "draft"));
  assert.ok(second.roles.every((role) => role.sourceDocumentIds?.includes("script-main")));
});

test("Lookbook synchronization reuses an exact existing identity without overwriting user fields", () => {
  const project = makeProject();
  project.roles = [{
    id: "role-user-linmo",
    name: "林默",
    displayName: "林默",
    mention: "林默",
    kind: "person",
    tone: "emerald",
    summary: "用户确认的主角",
    description: "保留这段人工档案。",
    status: "verified",
    portraits: [],
  }];

  const result = syncLookbookIdentitiesFromFountain(project, {
    sourceNodeId: "script-main",
    content: "@林默\n出发。",
    now: 300,
  });

  assert.equal(result.roles.length, 1);
  assert.equal(result.roles[0].id, "role-user-linmo");
  assert.equal(result.roles[0].summary, "用户确认的主角");
  assert.equal(result.roles[0].description, "保留这段人工档案。");
  assert.equal(result.roles[0].status, "verified");
  assert.equal(result.roles[0].sourceKind, "manual");
  assert.equal(result.flow?.flowNodes?.filter((node) => node.type === "lookbook").length, 1);
});

test("Lookbook parsing binds an unforced alias to an existing role without inventing prose identities", () => {
  const project = makeProject();
  project.roles = [{
    id: "role-user-shenyi",
    name: "沈弋",
    displayName: "沈弋",
    mention: "沈弋",
    kind: "person",
    tone: "emerald",
    summary: "主角",
    description: "",
    aliases: [{ id: "alias-ayi", value: "阿弋" }],
    portraits: [],
  }];
  const content = [
    "暴雨如注。荒山深处，一座孤零零的古宅亮着微弱的烛火。",
    "动作继续。",
    "",
    "阿弋",
    "",
    "他不会再来了。",
  ].join("\n");

  assert.deepEqual(parseFountainIdentityCandidates(content, project.roles), [
    { name: "沈弋", kind: "person" },
  ]);
  const result = syncLookbookIdentitiesFromFountain(project, { sourceNodeId: "script-main", content, now: 400 });
  assert.equal(result.roles.length, 1);
  assert.equal(result.roles[0].id, "role-user-shenyi");
});

test("Lookbook synchronization repairs duplicate flow node ids", () => {
  const project = makeProject();
  project.flow!.flowNodes!.push({
    ...project.flow!.flowNodes![0],
    data: { ...project.flow!.flowNodes![0].data, title: "重复脚本节点" },
  });
  const result = syncLookbookIdentitiesFromFountain(project, {
    sourceNodeId: "script-main",
    content: "@林默\n出发。",
    now: 500,
  });
  const ids = result.flow?.flowNodes?.map((node) => node.id) || [];
  assert.equal(new Set(ids).size, ids.length);
});

test("Fountain synchronization withdraws only the source that no longer references an identity", () => {
  const project = makeProject();
  project.flow!.flowNodes!.push({
    id: "script-second",
    type: "scriptPage",
    position: { x: 600, y: 80 },
    data: { title: "第二页", text: "", documentKind: "script", format: "fountain" },
  });
  const first = syncLookbookIdentitiesFromFountain(project, {
    sourceNodeId: "script-main",
    content: "@林默\n出发。",
    now: 600,
  });
  const second = syncLookbookIdentitiesFromFountain(first, {
    sourceNodeId: "script-second",
    content: "@林默\n别回头。",
    now: 700,
  });
  const removedFromFirst = syncLookbookIdentitiesFromFountain(second, {
    sourceNodeId: "script-main",
    content: "只剩一段动作。",
    now: 800,
  });

  assert.deepEqual(removedFromFirst.roles[0].sourceDocumentIds, ["script-second"]);
  assert.equal(removedFromFirst.roles[0].sourceKind, "fountain");

  const orphaned = syncLookbookIdentitiesFromFountain(removedFromFirst, {
    sourceNodeId: "script-second",
    content: "第二页也不再出现角色。",
    now: 900,
  });
  assert.deepEqual(orphaned.roles[0].sourceDocumentIds, []);
  assert.equal(orphaned.roles[0].sourceKind, "fountain");
});

test("Removing an orphaned Lookbook identity preserves connected source media", () => {
  const synced = syncLookbookIdentitiesFromFountain(makeProject(), {
    sourceNodeId: "script-main",
    content: "@林默\n出发。",
    now: 1000,
  });
  const role = synced.roles[0];
  const identityNode = synced.flow!.flowNodes!.find((node) => node.data?.identityId === role.id)!;
  synced.flow!.flowNodes!.push({
    id: "portrait-source",
    type: "imageInput",
    position: { x: 900, y: 300 },
    data: { image: "image:data", filename: "portrait.png", dimensions: null },
  });
  synced.flow!.links.push({ id: "portrait-link", source: identityNode.id, target: "portrait-source" });
  synced.designAssets = [{
    id: "asset-role",
    category: "identity",
    refId: role.id,
    url: "image:data",
    createdAt: 1000,
  }];

  const removed = removeLookbookIdentity(synced, role.id);

  assert.equal(removed.roles.some((item) => item.id === role.id), false);
  assert.equal(removed.flow!.flowNodes!.some((node) => node.data?.identityId === role.id), false);
  assert.equal(removed.flow!.flowNodes!.some((node) => node.data?.lookbookIdentityId === role.id), false);
  assert.equal(removed.flow!.flowNodes!.some((node) => node.id === "portrait-source"), true);
  assert.equal(removed.flow!.links.some((link) => link.source === identityNode.id || link.target === identityNode.id), false);
  assert.equal(removed.designAssets!.some((asset) => asset.refId === role.id), false);
});

test("Lookbook projection includes only directly connected archive and media nodes", () => {
  const project = makeProject();
  project.flow!.flowNodes!.push(
    { id: "identity-1", type: "lookbook", position: { x: 0, y: 0 }, data: { title: "林默", identityId: "role-1" } },
    { id: "archive-1", type: "mdText", position: { x: 0, y: 0 }, data: { title: "档案", text: "记录" } },
    { id: "index-1", type: "mdText", position: { x: 0, y: 0 }, data: { title: "索引", text: "系统索引", lookbookRole: "index" } },
    { id: "image-1", type: "imageInput", position: { x: 0, y: 0 }, data: { image: "image:data", filename: "look.jpg", dimensions: null } },
    { id: "video-1", type: "videoInput", position: { x: 0, y: 0 }, data: { video: "video:data", filename: "look.mp4" } },
    { id: "generator-1", type: "imageGen", position: { x: 0, y: 0 }, data: { inputImages: [], outputImage: null, status: "idle", error: null, aspectRatio: "1:1" } }
  );
  project.flow!.links.push(
    { id: "index-link", source: "identity-1", target: "index-1" },
    { id: "image-link", source: "image-1", target: "identity-1" },
    { id: "archive-link", source: "identity-1", target: "archive-1" },
    { id: "video-link", source: "identity-1", target: "video-1" },
    { id: "generator-link", source: "identity-1", target: "generator-1" }
  );

  assert.deepEqual(
    getLookbookMemberNodes(project, "identity-1").map((node) => node.id),
    ["index-1", "image-1", "archive-1", "video-1"]
  );
  assert.deepEqual(
    getVisibleLookbookMemberNodes(project, "identity-1").map((node) => node.id),
    ["image-1", "archive-1", "video-1"]
  );
  assert.equal(getFirstLookbookImageNode(project, "identity-1")?.id, "image-1");
});
