type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem"> &
  Partial<Pick<Storage, "length" | "key">>;

const LEGACY_PRODUCT_PREFIX = "qalam";
const CURRENT_PRODUCT_PREFIX = "stylo";

export const LEGACY_PRODUCT_STORAGE = {
  project: `${LEGACY_PRODUCT_PREFIX}_project_v1`,
  config: `${LEGACY_PRODUCT_PREFIX}_config_v1`,
  theme: `${LEGACY_PRODUCT_PREFIX}_theme_v1`,
  localBackup: `${LEGACY_PRODUCT_PREFIX}_local_backup`,
  remoteBackup: `${LEGACY_PRODUCT_PREFIX}_remote_backup`,
  avatar: `${LEGACY_PRODUCT_PREFIX}_avatar_url`,
  forceCloudClear: `${LEGACY_PRODUCT_PREFIX}_force_cloud_clear`,
  conversationsV1: `${LEGACY_PRODUCT_PREFIX}_conversations_v1`,
  messagesV1: `${LEGACY_PRODUCT_PREFIX}_messages_v1`,
  conversationsV2Prefix: `${LEGACY_PRODUCT_PREFIX}_conversations_v2`,
  activityV1: `${LEGACY_PRODUCT_PREFIX}_agent_tool_activity_v1`,
  activityV2Prefix: `${LEGACY_PRODUCT_PREFIX}_agent_tool_activity_v2`,
  sessionsV1: `${LEGACY_PRODUCT_PREFIX}_agent_sessions_v1`,
  executionApprovalPrefs: `${LEGACY_PRODUCT_PREFIX}_execution_approval_prefs_v1`,
  debug: `${LEGACY_PRODUCT_PREFIX}:agent-debug`,
  sessionPrefix: `${LEGACY_PRODUCT_PREFIX}:`,
} as const;

export const CURRENT_PRODUCT_STORAGE = {
  project: `${CURRENT_PRODUCT_PREFIX}_project_v1`,
  config: `${CURRENT_PRODUCT_PREFIX}_config_v1`,
  theme: `${CURRENT_PRODUCT_PREFIX}_theme_v1`,
  localBackup: `${CURRENT_PRODUCT_PREFIX}_local_backup`,
  remoteBackup: `${CURRENT_PRODUCT_PREFIX}_remote_backup`,
  avatar: `${CURRENT_PRODUCT_PREFIX}_avatar_url`,
  forceCloudClear: `${CURRENT_PRODUCT_PREFIX}_force_cloud_clear`,
  conversationsV1: `${CURRENT_PRODUCT_PREFIX}_conversations_v1`,
  messagesV1: `${CURRENT_PRODUCT_PREFIX}_messages_v1`,
  conversationsV2Prefix: `${CURRENT_PRODUCT_PREFIX}_conversations_v2`,
  activityV1: `${CURRENT_PRODUCT_PREFIX}_agent_tool_activity_v1`,
  activityV2Prefix: `${CURRENT_PRODUCT_PREFIX}_agent_tool_activity_v2`,
  sessionsV1: `${CURRENT_PRODUCT_PREFIX}_agent_sessions_v1`,
  executionApprovalPrefs: `${CURRENT_PRODUCT_PREFIX}_execution_approval_prefs_v1`,
  debug: `${CURRENT_PRODUCT_PREFIX}:agent-debug`,
  sessionPrefix: `${CURRENT_PRODUCT_PREFIX}:`,
} as const;

const listStorageKeys = (storage: StorageLike) => {
  if (typeof storage.length !== "number" || typeof storage.key !== "function") return [];
  return Array.from({ length: storage.length }, (_, index) => storage.key?.(index) || null)
    .filter((key): key is string => Boolean(key));
};

const copyIfCurrentMissing = (storage: StorageLike, legacyKey: string, currentKey: string) => {
  const legacyValue = storage.getItem(legacyKey);
  if (legacyValue === null) return false;
  if (storage.getItem(currentKey) === null) {
    storage.setItem(currentKey, legacyValue);
    storage.removeItem(legacyKey);
    return true;
  }
  return false;
};

const migrateSessionRecords = (storage: StorageLike) => {
  const legacyRaw = storage.getItem(LEGACY_PRODUCT_STORAGE.sessionsV1);
  if (!legacyRaw) return false;
  try {
    const legacyRecords = JSON.parse(legacyRaw) as Record<string, Record<string, unknown>>;
    const currentRaw = storage.getItem(CURRENT_PRODUCT_STORAGE.sessionsV1);
    const currentRecords = currentRaw
      ? JSON.parse(currentRaw) as Record<string, Record<string, unknown>>
      : {};
    for (const [legacySessionId, record] of Object.entries(legacyRecords || {})) {
      const currentSessionId = legacySessionId.startsWith(LEGACY_PRODUCT_STORAGE.sessionPrefix)
        ? `${CURRENT_PRODUCT_STORAGE.sessionPrefix}${legacySessionId.slice(LEGACY_PRODUCT_STORAGE.sessionPrefix.length)}`
        : legacySessionId;
      if (currentRecords[currentSessionId]) continue;
      currentRecords[currentSessionId] = {
        ...record,
        id: currentSessionId,
      };
    }
    storage.setItem(CURRENT_PRODUCT_STORAGE.sessionsV1, JSON.stringify(currentRecords));
    storage.removeItem(LEGACY_PRODUCT_STORAGE.sessionsV1);
    return true;
  } catch {
    // Malformed legacy state remains isolated instead of replacing valid Stylo sessions.
    return false;
  }
};

export type StyloStorageMigrationResult = {
  migratedKeys: number;
  migratedSessions: boolean;
};

/**
 * Moves browser-owned data from the internal pre-release namespace into Stylo.
 * Account-scoped data is safe to migrate automatically. Unscoped project data
 * is moved only after the account migration gate has obtained user consent.
 */
export const migrateLegacyProductStorage = (
  storage: StorageLike,
  accountScope: string,
  options: { includeUnscoped?: boolean } = {}
): StyloStorageMigrationResult => {
  let migratedKeys = 0;
  const encodedScope = encodeURIComponent(accountScope);
  const scopedPairs = [
    [LEGACY_PRODUCT_STORAGE.project, CURRENT_PRODUCT_STORAGE.project],
    [LEGACY_PRODUCT_STORAGE.config, CURRENT_PRODUCT_STORAGE.config],
    [LEGACY_PRODUCT_STORAGE.localBackup, CURRENT_PRODUCT_STORAGE.localBackup],
    [LEGACY_PRODUCT_STORAGE.remoteBackup, CURRENT_PRODUCT_STORAGE.remoteBackup],
    [LEGACY_PRODUCT_STORAGE.avatar, CURRENT_PRODUCT_STORAGE.avatar],
    [LEGACY_PRODUCT_STORAGE.forceCloudClear, CURRENT_PRODUCT_STORAGE.forceCloudClear],
    [LEGACY_PRODUCT_STORAGE.executionApprovalPrefs, CURRENT_PRODUCT_STORAGE.executionApprovalPrefs],
  ] as const;

  for (const [legacyBase, currentBase] of scopedPairs) {
    if (copyIfCurrentMissing(storage, `${legacyBase}:${encodedScope}`, `${currentBase}:${encodedScope}`)) {
      migratedKeys += 1;
    }
    if (copyIfCurrentMissing(storage, `${legacyBase}:${encodedScope}_last_synced`, `${currentBase}:${encodedScope}_last_synced`)) {
      migratedKeys += 1;
    }
    if (options.includeUnscoped && copyIfCurrentMissing(storage, legacyBase, currentBase)) {
      migratedKeys += 1;
    }
  }

  const exactPairs = [
    [LEGACY_PRODUCT_STORAGE.theme, CURRENT_PRODUCT_STORAGE.theme],
    [LEGACY_PRODUCT_STORAGE.activityV1, CURRENT_PRODUCT_STORAGE.activityV1],
    [LEGACY_PRODUCT_STORAGE.executionApprovalPrefs, CURRENT_PRODUCT_STORAGE.executionApprovalPrefs],
    [LEGACY_PRODUCT_STORAGE.debug, CURRENT_PRODUCT_STORAGE.debug],
  ] as const;
  for (const [legacyKey, currentKey] of exactPairs) {
    if (copyIfCurrentMissing(storage, legacyKey, currentKey)) migratedKeys += 1;
  }
  if (options.includeUnscoped) {
    for (const [legacyKey, currentKey] of [
      [LEGACY_PRODUCT_STORAGE.conversationsV1, CURRENT_PRODUCT_STORAGE.conversationsV1],
      [LEGACY_PRODUCT_STORAGE.messagesV1, CURRENT_PRODUCT_STORAGE.messagesV1],
    ] as const) {
      if (copyIfCurrentMissing(storage, legacyKey, currentKey)) migratedKeys += 1;
    }
  }

  for (const legacyKey of listStorageKeys(storage)) {
    const prefixPair = legacyKey.startsWith(`${LEGACY_PRODUCT_STORAGE.conversationsV2Prefix}:`)
      ? [LEGACY_PRODUCT_STORAGE.conversationsV2Prefix, CURRENT_PRODUCT_STORAGE.conversationsV2Prefix]
      : legacyKey.startsWith(`${LEGACY_PRODUCT_STORAGE.activityV2Prefix}:`)
        ? [LEGACY_PRODUCT_STORAGE.activityV2Prefix, CURRENT_PRODUCT_STORAGE.activityV2Prefix]
        : null;
    if (!prefixPair) continue;
    const currentKey = `${prefixPair[1]}${legacyKey.slice(prefixPair[0].length)}`;
    if (copyIfCurrentMissing(storage, legacyKey, currentKey)) migratedKeys += 1;
  }

  return {
    migratedKeys,
    migratedSessions: migrateSessionRecords(storage),
  };
};
