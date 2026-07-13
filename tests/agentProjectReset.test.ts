import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStyloAccountSessionId,
  buildStyloAccountStorageKeys,
} from "../agents/runtime/projectScope";
import { resetStyloProjectAgentStorage } from "../agents/runtime/projectReset";
import { DEFAULT_AGENT_SESSION_STORAGE_KEY } from "../agents/runtime/session";
import {
  resetNodeFlowProjectState,
  useNodeFlowStore,
} from "../node-workspace/store/nodeFlowStore";
import {
  DEFAULT_TIMELINE_DURATION,
  ensureFoundationGraphSkeleton,
} from "../node-workspace/foundation/scaffold";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

test("project reset returns the live Flow to revision zero and invalidates stale runs", () => {
  const generation = useNodeFlowStore.getState().accountGeneration;
  useNodeFlowStore.setState({
    revision: 42,
    nodes: [{ id: "text-1" } as any],
    links: [{ id: "link-1" } as any],
    graphLinks: [{ id: "graph-1" } as any],
    viewport: { x: 10, y: 20, zoom: 2 },
    appConfig: { textConfig: { model: "preserved" } },
    availableImageModels: ["image-model"],
  });

  resetNodeFlowProjectState();
  const reset = useNodeFlowStore.getState();
  assert.equal(reset.revision, 0);
  assert.equal(reset.accountGeneration, generation + 1);
  assert.deepEqual(reset.nodes, []);
  assert.deepEqual(reset.links, []);
  assert.deepEqual(reset.graphLinks, []);
  assert.equal(reset.viewport, null);
  assert.deepEqual(reset.appConfig, { textConfig: { model: "preserved" } });
  assert.deepEqual(reset.availableImageModels, ["image-model"]);
});

test("initializing the system Foundation scaffold does not consume a project revision", () => {
  const initialized = ensureFoundationGraphSkeleton({
    revision: 0,
    flowNodes: [],
    links: [],
    graphLinks: [],
    globalAssetHistory: [],
    linkStyle: "curved",
    activeView: null,
  }, {
    rootNodeId: "project-root-flow-project-main",
    title: "主项目",
    durationMin: DEFAULT_TIMELINE_DURATION,
  });
  assert.equal(initialized.revision, 0);
  assert.ok((initialized.flowNodes || []).length > 0);
});

test("project reset clears only the matching account and project Agent memory", () => {
  const storage = new MemoryStorage();
  const accountScope = "user:reset-owner";
  const projectId = "flow-project-main";
  const otherAccount = "user:other-owner";
  const keys = buildStyloAccountStorageKeys(accountScope, projectId);
  const otherKeys = buildStyloAccountStorageKeys(otherAccount, projectId);
  const matchingSession = buildStyloAccountSessionId(accountScope, projectId, "chat-1");
  const otherSession = buildStyloAccountSessionId(otherAccount, projectId, "chat-1");

  storage.setItem(keys.conversationStorageKey, "old conversation");
  storage.setItem(keys.activityStorageKey, "old activity");
  storage.setItem(otherKeys.conversationStorageKey, "other conversation");
  storage.setItem(DEFAULT_AGENT_SESSION_STORAGE_KEY, JSON.stringify({
    [matchingSession]: { id: matchingSession, items: [], messages: [], updatedAt: 1 },
    [otherSession]: { id: otherSession, items: [], messages: [], updatedAt: 1 },
  }));

  const result = resetStyloProjectAgentStorage(accountScope, projectId, storage);
  assert.equal(result.clearedLocalSessions, 1);
  assert.equal(storage.getItem(keys.conversationStorageKey), null);
  assert.equal(storage.getItem(keys.activityStorageKey), "{}");
  assert.equal(storage.getItem(otherKeys.conversationStorageKey), "other conversation");
  const remainingSessions = JSON.parse(storage.getItem(DEFAULT_AGENT_SESSION_STORAGE_KEY) || "{}");
  assert.equal(matchingSession in remainingSessions, false);
  assert.equal(otherSession in remainingSessions, true);
});
