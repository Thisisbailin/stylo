import assert from "node:assert/strict";
import test from "node:test";
import {
  CURRENT_PRODUCT_STORAGE,
  LEGACY_PRODUCT_STORAGE,
  migrateLegacyProductStorage,
} from "../utils/styloMigration";
import { getNodeFlowRef } from "../node-workspace/nodeflow/refs";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

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

test("pre-release account data and Agent sessions migrate into Stylo without overwriting current state", () => {
  const storage = new MemoryStorage();
  const accountScope = "user:stylo-owner";
  const encodedScope = encodeURIComponent(accountScope);
  const legacyProjectKey = `${LEGACY_PRODUCT_STORAGE.project}:${encodedScope}`;
  const currentProjectKey = `${CURRENT_PRODUCT_STORAGE.project}:${encodedScope}`;
  const conversationSuffix = encodeURIComponent(`${accountScope}:flow-project-main`);
  const legacyConversationKey = `${LEGACY_PRODUCT_STORAGE.conversationsV2Prefix}:${conversationSuffix}`;
  const currentConversationKey = `${CURRENT_PRODUCT_STORAGE.conversationsV2Prefix}:${conversationSuffix}`;
  const legacySessionId = "qalam:flow-project-main:user%3Astylo-owner%3Achat-1";
  const currentSessionId = "stylo:flow-project-main:user%3Astylo-owner%3Achat-1";
  const legacyApprovalPrefsKey = `${LEGACY_PRODUCT_STORAGE.executionApprovalPrefs}:${encodedScope}`;
  const currentApprovalPrefsKey = `${CURRENT_PRODUCT_STORAGE.executionApprovalPrefs}:${encodedScope}`;

  storage.setItem(legacyProjectKey, "legacy project");
  storage.setItem(legacyConversationKey, "legacy conversation");
  storage.setItem(legacyApprovalPrefsKey, JSON.stringify({ image: "always" }));
  storage.setItem(LEGACY_PRODUCT_STORAGE.sessionsV1, JSON.stringify({
    [legacySessionId]: { id: legacySessionId, items: [{ role: "user" }], messages: [], updatedAt: 1 },
  }));

  const result = migrateLegacyProductStorage(storage, accountScope);

  assert.equal(storage.getItem(currentProjectKey), "legacy project");
  assert.equal(storage.getItem(currentConversationKey), "legacy conversation");
  assert.equal(storage.getItem(currentApprovalPrefsKey), JSON.stringify({ image: "always" }));
  const sessions = JSON.parse(storage.getItem(CURRENT_PRODUCT_STORAGE.sessionsV1) || "{}");
  assert.equal(sessions[currentSessionId].id, currentSessionId);
  assert.equal(legacySessionId in sessions, false);
  assert.equal(storage.getItem(legacyProjectKey), null);
  assert.equal(result.migratedSessions, true);

  storage.setItem(legacyProjectKey, "must not win");
  migrateLegacyProductStorage(storage, accountScope);
  assert.equal(storage.getItem(currentProjectKey), "legacy project");
});

test("unscoped pre-release project data waits for explicit migration consent", () => {
  const storage = new MemoryStorage();
  storage.setItem(LEGACY_PRODUCT_STORAGE.project, "unscoped project");
  storage.setItem(LEGACY_PRODUCT_STORAGE.executionApprovalPrefs, JSON.stringify({ video: "ask" }));

  migrateLegacyProductStorage(storage, "guest");
  assert.equal(storage.getItem(CURRENT_PRODUCT_STORAGE.project), null);
  assert.equal(
    storage.getItem(CURRENT_PRODUCT_STORAGE.executionApprovalPrefs),
    JSON.stringify({ video: "ask" }),
    "non-project preferences are safe to migrate without claiming unscoped project ownership"
  );

  migrateLegacyProductStorage(storage, "guest", { includeUnscoped: true });
  assert.equal(storage.getItem(CURRENT_PRODUCT_STORAGE.project), "unscoped project");
  assert.equal(storage.getItem(LEGACY_PRODUCT_STORAGE.project), null);
});

test("legacy node references remain addressable while new writes use styloNodeRef", () => {
  assert.equal(getNodeFlowRef({
    id: "legacy-node",
    type: "text",
    position: { x: 0, y: 0 },
    data: { qalamNodeRef: "archive:legacy" },
  } as never), "archive:legacy");
});
