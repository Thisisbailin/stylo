import { useEffect, useRef, useState, Dispatch, SetStateAction } from "react";

type Options<T> = {
  key: string;
  initialValue: T;
  serialize?: (value: T) => string;
  deserialize?: (value: string) => T;
  debounceMs?: number;
};

const PERSISTED_STATE_SYNC_EVENT = "qalam:persisted-state-sync";

/**
 * usePersistedState
 * Thin wrapper around useState + localStorage with optional debounce and custom (de)serializers.
 */
export function usePersistedState<T>(options: Options<T>): [T, Dispatch<SetStateAction<T>>] {
  const { key, initialValue, serialize = JSON.stringify, deserialize = JSON.parse, debounceMs = 0 } = options;
  const serializeRef = useRef(serialize);
  const deserializeRef = useRef(deserialize);
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) return deserializeRef.current(stored);
    } catch (e) {
      console.warn(`usePersistedState: failed to read ${key}`, e);
    }
    return initialValue;
  });

  const timeoutRef = useRef<number | null>(null);
  const skipNextSaveRef = useRef(false); // Prevent re-saving after storage-driven state sync
  const lastSerializedRef = useRef<string | null>(null); // Track last serialized value to short-circuit repeats
  const instanceIdRef = useRef(`persisted-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    serializeRef.current = serialize;
    deserializeRef.current = deserialize;
  }, [serialize, deserialize]);

  // Sync state between multiple hook instances using same key
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue === null) return;
      if (e.newValue === lastSerializedRef.current) return;
      try {
        const newValue = deserializeRef.current(e.newValue);
        // Mark to skip the immediate save triggered by this state update
        skipNextSaveRef.current = true;
        lastSerializedRef.current = e.newValue;
        setState(newValue);
      } catch (err) {
        console.warn(`usePersistedState sync error for ${key}`, err);
      }
    };
    const handleLocalSync = (e: Event) => {
      const detail = (e as CustomEvent<{ key?: string; newValue?: string; sourceId?: string }>).detail;
      if (!detail || detail.key !== key || typeof detail.newValue !== "string") return;
      if (detail.sourceId === instanceIdRef.current) return;
      if (detail.newValue === lastSerializedRef.current) return;
      try {
        const newValue = deserializeRef.current(detail.newValue);
        skipNextSaveRef.current = true;
        lastSerializedRef.current = detail.newValue;
        setState(newValue);
      } catch (err) {
        console.warn(`usePersistedState local sync error for ${key}`, err);
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(PERSISTED_STATE_SYNC_EVENT, handleLocalSync as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(PERSISTED_STATE_SYNC_EVENT, handleLocalSync as EventListener);
    };
  }, [key]);

  useEffect(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    const save = () => {
      try {
        const serialized = serializeRef.current(state);
        lastSerializedRef.current = serialized;
        const current = localStorage.getItem(key);
        if (current !== serialized) {
          localStorage.setItem(key, serialized);
          window.dispatchEvent(
            new CustomEvent(PERSISTED_STATE_SYNC_EVENT, {
              detail: {
                key,
                newValue: serialized,
                sourceId: instanceIdRef.current,
              },
            })
          );
        }
      } catch (e) {
        console.warn(`usePersistedState: failed to write ${key}`, e);
      }
    };

    if (debounceMs > 0) {
      timeoutRef.current = window.setTimeout(save, debounceMs);
      return () => {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      };
    }

    save();
  }, [state, key, debounceMs]);

  return [state, setState];
}
