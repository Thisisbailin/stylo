import type { SyncBaseline, SyncBaselineStore } from "./versionedSyncEngine";

const parseBaseline = (raw: string | null): SyncBaseline | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SyncBaseline>;
    if (
      typeof value.fingerprint !== "string" ||
      !value.fingerprint ||
      typeof value.version !== "number" ||
      !Number.isSafeInteger(value.version) ||
      value.version < 0
    ) {
      return null;
    }
    return { fingerprint: value.fingerprint, version: value.version };
  } catch {
    return null;
  }
};

export const createLocalStorageBaselineStore = (key: string): SyncBaselineStore => ({
  read() {
    if (typeof localStorage === "undefined") return null;
    try {
      return parseBaseline(localStorage.getItem(key));
    } catch {
      return null;
    }
  },
  write(value) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Local persistence failure must not corrupt the confirmed in-memory baseline.
    }
  },
  clear() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Best-effort cleanup.
    }
  },
});
