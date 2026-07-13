import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { PRODUCT_REPOSITORIES } from "../constants/productRepositories";

test("Manus, LookBook, and Cinewor repository identities stay canonical", () => {
  assert.deepEqual(PRODUCT_REPOSITORIES, {
    stylo: "https://github.com/Thisisbailin/qalam",
    manus: "https://github.com/Thisisbailin/Manus",
    lookbook: "https://github.com/Thisisbailin/LookBook",
    cinewor: "https://github.com/Thisisbailin/cinewor",
  });
});

test("landing and Lab surfaces expose Manus as an active repository wrapper", async () => {
  const [landing, settings, workspace] = await Promise.all([
    readFile(path.join(process.cwd(), "components/LandingPage.tsx"), "utf8"),
    readFile(path.join(process.cwd(), "node-workspace/components/ProjectSettingsPanel.tsx"), "utf8"),
    readFile(path.join(process.cwd(), "node-workspace/components/CreativeWorkspace.tsx"), "utf8"),
  ]);
  assert.match(landing, /name: "Manus"/);
  assert.doesNotMatch(landing, /name: "稿纸"/);
  assert.match(settings, /PRODUCT_REPOSITORIES\.manus/);
  assert.match(settings, /PRODUCT_REPOSITORIES\.lookbook/);
  assert.match(settings, /PRODUCT_REPOSITORIES\.cinewor/);
  assert.match(workspace, /<ManusPanel/);
});
