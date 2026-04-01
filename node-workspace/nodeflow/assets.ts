import type { GlobalAssetHistoryItem, GlobalAssetType } from "../types";

export type NodeFlowAssetState = {
  globalAssetHistory: GlobalAssetHistoryItem[];
};

export const createEmptyNodeFlowAssetState = (): NodeFlowAssetState => ({
  globalAssetHistory: [],
});

export const buildGlobalAssetHistoryItem = (
  item: Omit<GlobalAssetHistoryItem, "id" | "timestamp">
): GlobalAssetHistoryItem => ({
  ...item,
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  timestamp: Date.now(),
});

export const appendGlobalAssetHistoryItem = (
  state: NodeFlowAssetState,
  item: Omit<GlobalAssetHistoryItem, "id" | "timestamp">
): NodeFlowAssetState => {
  const nextItem = buildGlobalAssetHistoryItem(item);

  if (item.sourceId) {
    const existingIndex = state.globalAssetHistory.findIndex(
      (entry) => entry.sourceId === item.sourceId && entry.type === item.type
    );
    if (existingIndex !== -1) {
      const updated = [...state.globalAssetHistory];
      updated[existingIndex] = {
        ...updated[existingIndex],
        ...nextItem,
        id: updated[existingIndex].id,
      };
      return { globalAssetHistory: updated };
    }
  }

  return {
    globalAssetHistory: [nextItem, ...state.globalAssetHistory],
  };
};

export const removeGlobalAssetHistoryEntry = (
  state: NodeFlowAssetState,
  id: string
): NodeFlowAssetState => ({
  globalAssetHistory: state.globalAssetHistory.filter((item) => item.id !== id),
});

export const clearGlobalAssetHistoryEntries = (
  state: NodeFlowAssetState,
  type?: GlobalAssetType
): NodeFlowAssetState => ({
  globalAssetHistory: type
    ? state.globalAssetHistory.filter((item) => item.type !== type)
    : [],
});
