const BROWSER_DEBUG_STORAGE_KEY = "stylo:agent-debug";
const FORCE_BROWSER_AGENT_DEBUG = false;

const isTruthy = (value?: string | null) => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
};

export const isBrowserAgentDebugEnabled = () => {
  if (FORCE_BROWSER_AGENT_DEBUG) return true;
  if (typeof window === "undefined") return false;
  try {
    if (isTruthy(window.localStorage.getItem(BROWSER_DEBUG_STORAGE_KEY))) return true;
  } catch {
    // Ignore localStorage access failures.
  }
  const env = typeof import.meta !== "undefined" ? (import.meta as any).env : undefined;
  return isTruthy(env?.VITE_AGENT_DEBUG);
};

export const browserAgentDebug = (label: string, payload?: unknown) => {
  if (!isBrowserAgentDebugEnabled() || typeof console === "undefined") return;
  const prefix = `[Stylo][agent-debug] ${label}`;
  if (payload === undefined) {
    console.debug(prefix);
    return;
  }
  console.debug(prefix, payload);
};

export const browserAgentDebugError = (label: string, payload?: unknown) => {
  if (!isBrowserAgentDebugEnabled() || typeof console === "undefined") return;
  const prefix = `[Stylo][agent-debug] ${label}`;
  if (payload === undefined) {
    console.error(prefix);
    return;
  }
  console.error(prefix, payload);
};

export const AGENT_DEBUG_STORAGE_KEY = BROWSER_DEBUG_STORAGE_KEY;
