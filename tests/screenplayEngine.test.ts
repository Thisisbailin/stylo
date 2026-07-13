import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeFountainLines,
  analyzeScreenplay,
  getNextScreenplayLineKind,
  insertScreenplayLine,
  normalizeFountainDocument,
  parseSceneHeading,
  removeScreenplayLine,
  replaceScreenplayLine,
  serializeSceneHeading,
  serializeScreenplayLine,
} from "../node-workspace/screenplay/fountainEngine";
import {
  buildScriptLinePatch,
  deriveReviewedScriptBody,
  hasPendingPatchLines,
  type PendingScriptPatch,
} from "../node-workspace/screenplay/scriptPatch";
import { toNodeFlowNodeRecord } from "../node-workspace/nodeflow/model";

test("screenplay engine normalizes Chinese and standard scene headings into canonical Fountain", () => {
  assert.deepEqual(parseSceneHeading("【场景】内景｜旧码头｜黎明"), {
    boundary: "INT.",
    location: "旧码头",
    time: "DAWN",
  });
  assert.equal(
    serializeSceneHeading({ boundary: "EXT.", location: "RIVER BANK", time: "NIGHT" }),
    ".EXT. RIVER BANK - NIGHT"
  );
  assert.equal(
    normalizeFountainDocument("【场景】外景｜旧码头｜夜\n【角色】林默\n【对白】别回头。"),
    ".EXT. 旧码头 - NIGHT\n@林默\n别回头。"
  );
});

test("visual screenplay block operations preserve canonical line structure", () => {
  let body = serializeSceneHeading({ boundary: "INT.", location: "EDIT ROOM", time: "NIGHT" });
  body = insertScreenplayLine(body, 0, serializeScreenplayLine("林默", "character"));
  body = insertScreenplayLine(body, 1, serializeScreenplayLine("停在最后一帧。", "dialogue"));
  body = replaceScreenplayLine(body, 2, serializeScreenplayLine("画面冻结。", "action"));

  assert.deepEqual(
    analyzeFountainLines(body).map(({ kind, content }) => ({ kind, content })),
    [
      { kind: "scene_heading", content: "INT. EDIT ROOM - NIGHT" },
      { kind: "character", content: "林默" },
      { kind: "action", content: "画面冻结。" },
    ]
  );
  assert.equal(removeScreenplayLine(body, 1), ".INT. EDIT ROOM - NIGHT\n!画面冻结。");
  assert.equal(getNextScreenplayLineKind("character"), "dialogue");
  assert.equal(getNextScreenplayLineKind("dialogue"), "action");
});

test("screenplay analysis builds navigation, production metrics, and continuity diagnostics", () => {
  const analysis = analyzeScreenplay(
    [
      ".EXT. OLD PIER - DAWN",
      "海雾漫过断裂的栈桥。",
      "@林默",
      "别回头。",
      "",
      ".INT. CONTROL ROOM - NIGHT",
      "@陌生人",
      "时间到了。",
    ].join("\n"),
    ["林默"]
  );

  assert.equal(analysis.scenes.length, 2);
  assert.equal(analysis.scenes[0].location, "OLD PIER");
  assert.deepEqual(analysis.scenes[0].characterNames, ["林默"]);
  assert.deepEqual(analysis.locations, ["OLD PIER", "CONTROL ROOM"]);
  assert.equal(analysis.stats.characters, 2);
  assert.ok(analysis.stats.dialoguePercent > 0);
  assert.ok(analysis.diagnostics.some((issue) => issue.message.includes("陌生人")));
});

test("agent screenplay patches remain reviewable and deterministic", () => {
  const base = ".INT. ROOM - DAY\n@林默\n别动。";
  const next = ".INT. ROOM - NIGHT\n@林默\n别回头。";
  const lines = buildScriptLinePatch(base, next);
  const patch: PendingScriptPatch = {
    id: "proposal-1",
    baseTitle: "第一场",
    nextTitle: "第一场修订",
    baseBody: base,
    nextBody: next,
    lines,
  };

  assert.equal(hasPendingPatchLines(patch), true);
  const accepted = {
    ...patch,
    lines: patch.lines.map((line) => line.kind === "equal" ? line : { ...line, status: "accepted" as const }),
  };
  assert.equal(hasPendingPatchLines(accepted), false);
  assert.equal(deriveReviewedScriptBody(accepted), next);
});

test("screenplay revision metadata reaches the bounded NodeFlow projection", () => {
  const record = toNodeFlowNodeRecord({
    id: "script-main",
    type: "scriptPage",
    position: { x: 0, y: 0 },
    data: {
      title: "潮汐线",
      content: ".EXT. OLD PIER - DAWN",
      revision: 7,
      screenplayStats: {
        lines: 83,
        scenes: 6,
        characters: 4,
        locations: 3,
        words: 412,
        glyphs: 1267,
        estimatedPages: 3,
        estimatedMinutes: 3,
        dialoguePercent: 42,
        ignored: "must not cross the projection boundary",
      },
    },
  });

  assert.equal(record.body.revision, 7);
  assert.deepEqual(record.body.screenplayStats, {
    lines: 83,
    scenes: 6,
    characters: 4,
    locations: 3,
    words: 412,
    glyphs: 1267,
    estimatedPages: 3,
    estimatedMinutes: 3,
    dialoguePercent: 42,
  });
});
