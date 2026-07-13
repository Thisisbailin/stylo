import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const exists = async (filePath: string) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

test("Stylo is the canonical package, desktop, metadata, and component identity", async () => {
  const root = process.cwd();
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const metadata = JSON.parse(await readFile(path.join(root, "metadata.json"), "utf8"));
  const environment = await readFile(path.join(root, ".codex/environments/environment.toml"), "utf8");

  assert.equal(packageJson.name, "stylo");
  assert.equal(packageJson.build.productName, "Stylo");
  assert.equal(packageJson.build.appId, "ai.stylo.desktop");
  assert.equal(metadata.name, "Stylo");
  assert.match(environment, /^name = "Stylo"$/m);
  assert.equal(await exists(path.join(root, "node-workspace/components/StyloAgent.tsx")), true);
  assert.equal(await exists(path.join(root, "node-workspace/components/QalamAgent.tsx")), false);
});

test("web and desktop surfaces use the supplied Stylo artwork", async () => {
  const root = process.cwd();
  const html = await readFile(path.join(root, "index.html"), "utf8");
  const landing = await readFile(path.join(root, "components/LandingPage.tsx"), "utf8");
  const manifest = JSON.parse(await readFile(path.join(root, "public/site.webmanifest"), "utf8"));

  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/);
  assert.match(html, /stylo-desktop-boot__icon/);
  assert.match(landing, /src="\/icon-128\.png"/);
  assert.equal(manifest.name, "Stylo");
  assert.equal(manifest.icons.length, 4);

  for (const size of [128, 256, 512] as const) {
    const png = await readFile(path.join(root, `public/icon-${size}.png`));
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  assert.equal(await exists(path.join(root, "electron/assets/icon.icns")), true);
  assert.equal(await exists(path.join(root, "electron/assets/icon.ico")), true);
  assert.equal(await exists(path.join(root, "electron/assets/icon.png")), true);
});
