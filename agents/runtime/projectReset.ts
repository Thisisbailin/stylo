import { clearAgentToolActivity } from "./activity";
import {
  buildStyloAccountStorageKeys,
  isStyloAccountSessionInProject,
} from "./projectScope";
import {
  clearPersistedAgentSessionsWhere,
  DEFAULT_AGENT_SESSION_STORAGE_KEY,
} from "./session";

export type StyloProjectAgentResetResult = {
  conversationStorageKey: string;
  activityStorageKey: string;
  clearedLocalSessions: number;
};

type StyloProjectResetStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Clears browser-owned Agent memory for one account/project pair. The mounted
 * conversation hook is reset separately through `conversationResetToken` so a
 * stale in-memory value cannot immediately recreate the deleted record.
 */
export const resetStyloProjectAgentStorage = (
  accountScope: string,
  projectId: string,
  storage?: StyloProjectResetStorage
): StyloProjectAgentResetResult => {
  const { conversationStorageKey, activityStorageKey } = buildStyloAccountStorageKeys(
    accountScope,
    projectId
  );
  const target = storage || (typeof window !== "undefined" ? window.localStorage : undefined);
  target?.removeItem(conversationStorageKey);
  clearAgentToolActivity(activityStorageKey, target);
  const clearedLocalSessions = clearPersistedAgentSessionsWhere(
    (sessionId) => isStyloAccountSessionInProject(sessionId, accountScope, projectId),
    DEFAULT_AGENT_SESSION_STORAGE_KEY,
    target
  );
  return {
    conversationStorageKey,
    activityStorageKey,
    clearedLocalSessions,
  };
};
