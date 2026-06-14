import type { NodeFlowContextSnapshot, NodeFlowViewport } from "../types";

export type NodeFlowReadingMode = "full" | "identity";

export type NodeFlowExecutionState = {
  isRunning: boolean;
  currentNodeId: string | null;
  pausedAtNodeId: string | null;
};

export type NodeFlowCanvasState = {
  viewport: NodeFlowViewport | null;
  activeView: string | null;
  readingMode: NodeFlowReadingMode;
};

export type NodeFlowContextState = {
  nodeFlowContext: NodeFlowContextSnapshot;
};

export const createEmptyNodeFlowContextSnapshot = (): NodeFlowContextSnapshot => ({
  rawScript: "",
  episodes: [],
  designAssets: [],
  globalStyleGuide: "",
  dramaGuide: "",
  context: {
    projectSummary: "",
    episodeSummaries: [],
    roles: [],
  },
});

export const createIdleNodeFlowExecutionState = (): NodeFlowExecutionState => ({
  isRunning: false,
  currentNodeId: null,
  pausedAtNodeId: null,
});

export const createEmptyNodeFlowCanvasState = (): NodeFlowCanvasState => ({
  viewport: null,
  activeView: null,
  readingMode: "full",
});

export const setNodeFlowContextState = <T extends NodeFlowContextState>(
  state: T,
  nodeFlowContext: NodeFlowContextSnapshot
): T => ({
  ...state,
  nodeFlowContext,
});

export const setNodeFlowViewportState = <T extends NodeFlowCanvasState>(
  state: T,
  viewport: NodeFlowViewport | null
): T => ({
  ...state,
  viewport,
});

export const setNodeFlowActiveViewState = <T extends NodeFlowCanvasState>(
  state: T,
  activeView: string | null
): T => ({
  ...state,
  activeView,
});

export const setNodeFlowReadingModeState = <T extends NodeFlowCanvasState>(
  state: T,
  readingMode: NodeFlowReadingMode
): T => ({
  ...state,
  readingMode,
});

export const setNodeFlowRunningState = <T extends NodeFlowExecutionState>(
  state: T,
  isRunning: boolean
): T => ({
  ...state,
  isRunning,
});

export const setNodeFlowCurrentNodeState = <T extends NodeFlowExecutionState>(
  state: T,
  currentNodeId: string | null
): T => ({
  ...state,
  currentNodeId,
});

export const setNodeFlowPausedNodeState = <T extends NodeFlowExecutionState>(
  state: T,
  pausedAtNodeId: string | null
): T => ({
  ...state,
  pausedAtNodeId,
});
