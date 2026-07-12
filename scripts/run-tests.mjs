import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(repoRoot, ".test-dist");
const tscBinary = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc"
);

const run = (command, args) =>
  spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
  });

let exitCode = 1;
rmSync(outputRoot, { recursive: true, force: true });

try {
  const compilation = run(tscBinary, ["--project", "tsconfig.tests.json"]);
  if (compilation.error) throw compilation.error;
  if (compilation.status !== 0) {
    exitCode = compilation.status ?? 1;
  } else {
    mkdirSync(outputRoot, { recursive: true });
    writeFileSync(path.join(outputRoot, "package.json"), '{"type":"commonjs"}\n', "utf8");

    const testRoot = path.join(outputRoot, "tests");
    const testFiles = readdirSync(testRoot)
      .filter((name) => name.endsWith(".test.js"))
      .sort()
      .map((name) => path.join(testRoot, name));
    if (testFiles.length === 0) throw new Error("No compiled test files were found.");

    const tests = run(process.execPath, ["--test", ...testFiles]);
    if (tests.error) throw tests.error;
    exitCode = tests.status ?? 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}

process.exitCode = exitCode;
