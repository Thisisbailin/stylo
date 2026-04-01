import type { NodeFlowContextSnapshot, NodeFlowViewport } from "../types";

export type NodeFlowExecutionState = {
  isRunning: boolean;
  currentNodeId: string | null;
  pausedAtNodeId: string | null;
};

export type NodeFlowCanvasState = {
  viewport: NodeFlowViewport | null;
  activeView: string | null;
};

export const createEmptyNodeFlowContextSnapshot = (): NodeFlowContextSnapshot => ({
  rawScript: "",
  episodes: [],
  designAssets: [],
  globalStyleGuide: "",
  shotGuide: "",
  soraGuide: "",
  storyboardGuide: "",
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
});
