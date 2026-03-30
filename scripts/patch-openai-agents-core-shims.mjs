import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const patches = [
  {
    file: "node_modules/@openai/agents-core/dist/shims/shims.mjs",
    transform: (source) =>
      source.replace('export * from "./shims-node.mjs";', 'export * from "./shims-workerd.mjs";'),
  },
  {
    file: "node_modules/@openai/agents-core/dist/shims/shims.js",
    transform: (source) =>
      source.replace('__exportStar(require("./shims-node.js"), exports);', '__exportStar(require("./shims-workerd.js"), exports);'),
  },
  {
    file: "node_modules/@openai/agents-core/dist/shims/shims-workerd.mjs",
    transform: (source) =>
      source
        .replace(
          "import { AsyncLocalStorage as BuiltinAsyncLocalStorage } from 'node:async_hooks';\n",
          "",
        )
        .replace(
          /export class AsyncLocalStorage extends BuiltinAsyncLocalStorage \{[\s\S]*?\n\}/,
          `export class AsyncLocalStorage {
    context = undefined;
    constructor() { }
    run(context, fn) {
        const previous = this.context;
        this.context = context;
        try {
            return fn();
        }
        finally {
            this.context = previous;
        }
    }
    getStore() {
        return this.context;
    }
    enterWith(context) {
        this.context = context;
    }
}`,
        )
        .replaceAll("./mcp-server/node.mjs", "./mcp-server/browser.mjs")
        .replace(
          'export { NodeMCPServerStdio as MCPServerStdio, NodeMCPServerStreamableHttp as MCPServerStreamableHttp, NodeMCPServerSSE as MCPServerSSE, } from "./mcp-server/browser.mjs";',
          'export { MCPServerStdio, MCPServerStreamableHttp, MCPServerSSE } from "./mcp-server/browser.mjs";',
        ),
  },
  {
    file: "node_modules/@openai/agents-core/dist/shims/shims-workerd.js",
    transform: (source) =>
      source
        .replace('const node_async_hooks_1 = require("node:async_hooks");\n', "")
        .replace(
          /class AsyncLocalStorage extends node_async_hooks_1\.AsyncLocalStorage \{[\s\S]*?\n\}/,
          `class AsyncLocalStorage {
    constructor() {
        this.context = undefined;
    }
    run(context, fn) {
        const previous = this.context;
        this.context = context;
        try {
            return fn();
        }
        finally {
            this.context = previous;
        }
    }
    getStore() {
        return this.context;
    }
    enterWith(context) {
        this.context = context;
    }
}`,
        )
        .replaceAll('./mcp-server/node.js', './mcp-server/browser.js')
        .replace("var node_1 = require(\"./mcp-server/browser.js\");", "var browser_1 = require(\"./mcp-server/browser.js\");")
        .replaceAll("node_1.NodeMCPServerStdio", "browser_1.MCPServerStdio")
        .replaceAll("node_1.NodeMCPServerStreamableHttp", "browser_1.MCPServerStreamableHttp")
        .replaceAll("node_1.NodeMCPServerSSE", "browser_1.MCPServerSSE"),
  },
];

const applyPatch = async ({ file, transform }) => {
  const target = path.join(root, file);
  const source = await readFile(target, "utf8");
  const patched = transform(source);

  if (patched === source) {
    return false;
  }

  await writeFile(target, patched, "utf8");
  return true;
};

const run = async () => {
  const results = await Promise.all(patches.map(applyPatch));
  const changedCount = results.filter(Boolean).length;
  console.log(`[patch-openai-agents-core-shims] ${changedCount > 0 ? `patched ${changedCount} file(s)` : "already patched"}`);
};

run().catch((error) => {
  console.error("[patch-openai-agents-core-shims] failed:", error);
  process.exitCode = 1;
});
