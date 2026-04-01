import { create } from "zustand";
import {
  Connection,
  EdgeChange,
  NodeChange,
  XYPosition,
} from "@xyflow/react";
import {
  NodeFlowNode,
  NodeFlowLink,
  NodeFlowGraphLink,
  NodeType,
  NodeFlowNodeData,
  NodeFlowFile,
  GlobalAssetHistoryItem,
  GlobalAssetType,
  NodeFlowContextSnapshot,
  NodeFlowViewport,
  NodeFlowTemplate,
  NodeFlowNodeStyle,
} from "../types";
import type { ProjectRoleIdentity } from "../../types";
import {
  patchNodeFlowNodeData,
  patchNodeFlowNodeStyle,
} from "../nodeflow/mutations";
import {
  applyNodeFlowCanvasLinkChangesCommand,
  applyNodeFlowCanvasNodeChangesCommand,
  appendExternalNodesAndLinksCommand,
  connectNodeFlowNodesCommand,
  createNodeFlowNodeCommand,
  pasteClipboardIntoNodeFlow,
  removeNodeFlowLinkCommand,
  removeNodeFlowNodeCommand,
  toggleNodeFlowLinkPauseCommand,
} from "../nodeflow/commands";
import { type NodeFlowCanvasLink, type NodeFlowCanvasNode } from "../nodeflow/reactflow";
import { loadNodeFlowTemplates, persistNodeFlowTemplates } from "../nodeflow/templates";
import {
  applyTemplateToNodeFlow,
  buildTemplateFromGroup,
  buildViduReferenceDemoState,
  createGroupFromSelectionState,
} from "../nodeflow/compositions";
import {
  buildNodeFlowFile,
  downloadNodeFlowFile,
  getMaxNodeFlowNodeSuffix,
  hydrateImportedNodeFlow,
} from "../nodeflow/serialization";
import { buildConnectedInputs, type NodeFlowConnectedInputs, validateNodeFlowState } from "../nodeflow/queries";
import {
  createEmptyNodeFlowCanvasState,
  createEmptyNodeFlowContextSnapshot,
  createIdleNodeFlowExecutionState,
  setNodeFlowActiveViewState,
  setNodeFlowContextState,
  setNodeFlowCurrentNodeState,
  setNodeFlowPausedNodeState,
  setNodeFlowRunningState,
  setNodeFlowViewportState,
} from "../nodeflow/sessionState";
import {
  appendGlobalAssetHistoryItem,
  clearGlobalAssetHistoryEntries,
  createEmptyNodeFlowAssetState,
  removeGlobalAssetHistoryEntry,
} from "../nodeflow/assets";
import { createNodeFlowGraphLink, removeNodeFlowGraphLink } from "../nodeflow/graphLinks";
import {
  createEmptyNodeFlowCollaborationState,
  mutateNodeFlowProjectRole,
  setNodeFlowAppConfigState,
  setNodeFlowProjectRoleUpdaterState,
  type NodeFlowRoleUpdater,
} from "../nodeflow/collaboration";

export type { GlobalAssetHistoryItem, GlobalAssetType };

export type LinkStyle = "angular" | "curved";

type RevisionGuardOptions = {
  expectedRevision?: number;
};

interface ClipboardData {
  nodes: NodeFlowNode[];
  links: NodeFlowLink[];
}

interface NodeFlowStore {
  revision: number;
  nodes: NodeFlowNode[];
  links: NodeFlowLink[];
  graphLinks: NodeFlowGraphLink[];
  linkStyle: LinkStyle;
  clipboard: ClipboardData | null;
  globalAssetHistory: GlobalAssetHistoryItem[];
  viewport: NodeFlowViewport | null;
  groupTemplates: NodeFlowTemplate[];
  globalStyleGuide?: string;
  availableImageModels: string[];
  availableVideoModels: string[];
  setAvailableImageModels: (models: string[]) => void;
  setAvailableVideoModels: (models: string[]) => void;
  nodeFlowContext: NodeFlowContextSnapshot;
  setNodeFlowContext: (ctx: NodeFlowContextSnapshot) => void;
  setViewportState: (viewport: NodeFlowViewport | null) => void;

  // Settings
  setLinkStyle: (style: LinkStyle) => void;
  setGlobalStyleGuide: (guide: string) => void;

  // Node operations
  addNode: (type: NodeType, position: XYPosition, parentId?: string, extraData?: Partial<NodeFlowNodeData>, options?: RevisionGuardOptions) => string;
  updateNodeData: (nodeId: string, data: Partial<NodeFlowNodeData>) => void;
  updateNodeStyle: (nodeId: string, style: Partial<NodeFlowNodeStyle>) => void;
  removeNode: (nodeId: string, options?: RevisionGuardOptions) => void;
  onNodesChange: (changes: NodeChange<NodeFlowCanvasNode>[]) => void;

  // Link operations
  onLinksChange: (changes: EdgeChange<NodeFlowCanvasLink>[]) => void;
  connectNodes: (connection: Connection, options?: RevisionGuardOptions) => void;
  removeLink: (linkId: string, options?: RevisionGuardOptions) => void;
  addGraphLink: (sourceRef: string, targetRef: string, options?: RevisionGuardOptions) => string;
  removeGraphLink: (linkId: string, options?: RevisionGuardOptions) => void;
  toggleLinkPause: (linkId: string, options?: RevisionGuardOptions) => void;

  // Copy/Paste operations
  copySelectedNodes: () => void;
  pasteNodes: (offset?: XYPosition, options?: RevisionGuardOptions) => void;
  clearClipboard: () => void;

  // Execution (placeholder for future integration)
  isRunning: boolean;
  currentNodeId: string | null;
  pausedAtNodeId: string | null;
  setRunning: (running: boolean) => void;
  setCurrentNode: (nodeId: string | null) => void;
  setPausedNode: (nodeId: string | null) => void;

  // Save/Load
  exportNodeFlow: (name?: string) => void;
  importNodeFlow: (nodeFlow: NodeFlowFile) => void;
  clearNodeFlow: () => void;
  saveGroupTemplate: (groupId: string, name?: string) => { ok: boolean; error?: string };
  deleteGroupTemplate: (templateId: string) => void;
  applyGroupTemplate: (templateId: string, offset: XYPosition, options?: RevisionGuardOptions) => { ok: boolean; error?: string };
  createGroupFromSelection: (options?: RevisionGuardOptions) => { ok: boolean; error?: string };
  applyViduReferenceDemo: (offset?: XYPosition, options?: RevisionGuardOptions) => { ok: boolean; error?: string };

  // Helpers
  getNodeById: (id: string) => NodeFlowNode | undefined;
  getConnectedInputs: (nodeId: string) => NodeFlowConnectedInputs;
  validateNodeFlow: () => { valid: boolean; errors: string[] };
  addToGlobalHistory: (item: Omit<GlobalAssetHistoryItem, "id" | "timestamp">) => void;
  removeGlobalHistoryItem: (id: string) => void;
  clearGlobalHistory: (type?: GlobalAssetType) => void;

  // Batch operations
  addNodesAndLinks: (nodes: NodeFlowNode[], links: NodeFlowLink[], options?: RevisionGuardOptions) => void;

  // View management
  activeView: string | null;
  setActiveView: (view: string | null) => void;

  // Global Config
  appConfig: any; // Using any to avoid circular dependencies if types are complex, but AppConfig is best
  setAppConfig: (config: any) => void;
  projectRoleUpdater: NodeFlowRoleUpdater | null;
  setProjectRoleUpdater: (
    updater: NodeFlowRoleUpdater | null
  ) => void;
  mutateProjectRole: (roleId: string, updater: (role: ProjectRoleIdentity) => ProjectRoleIdentity) => void;
}

let nodeIdCounter = 0;

const assertExpectedRevision = (currentRevision: number, expectedRevision?: number) => {
  if (typeof expectedRevision !== "number") return;
  if (currentRevision !== expectedRevision) {
    throw new Error(
      `NodeFlow revision mismatch: expected ${expectedRevision}, current ${currentRevision}. 请先重新读取最新 NodeFlow 再执行修改。`
    );
  }
};

export const useNodeFlowStore = create<NodeFlowStore>((set, get) => ({
  revision: 0,
  nodes: [],
  links: [],
  graphLinks: [],
  linkStyle: "curved" as LinkStyle,
  clipboard: null,
  ...createIdleNodeFlowExecutionState(),
  ...createEmptyNodeFlowAssetState(),
  ...createEmptyNodeFlowCanvasState(),
  ...createEmptyNodeFlowCollaborationState(),
  groupTemplates: loadNodeFlowTemplates(),
  globalStyleGuide: undefined,
  availableImageModels: [],
  availableVideoModels: [],
  nodeFlowContext: createEmptyNodeFlowContextSnapshot(),

  setAvailableImageModels: (models) => set({ availableImageModels: models }),
  setAvailableVideoModels: (models) => set({ availableVideoModels: models }),
  setNodeFlowContext: (ctx) => set((state) => setNodeFlowContextState(state, ctx)),
  setViewportState: (viewport) => set((state) => setNodeFlowViewportState(state, viewport)),

  setActiveView: (view) => set((state) => setNodeFlowActiveViewState(state, view)),
  setAppConfig: (config) => set((state) => setNodeFlowAppConfigState(state, config)),
  setProjectRoleUpdater: (updater) => set((state) => setNodeFlowProjectRoleUpdaterState(state, updater)),
  mutateProjectRole: (roleId, updater) => {
    mutateNodeFlowProjectRole(get(), roleId, updater);
  },

  setLinkStyle: (style: LinkStyle) => set({ linkStyle: style }),
  setGlobalStyleGuide: (guide: string) => set({ globalStyleGuide: guide }),

  addNode: (type: NodeType, position: XYPosition, parentId?: string, extraData?: Partial<NodeFlowNodeData>, options?: RevisionGuardOptions) => {
    const { revision } = get();
    assertExpectedRevision(revision, options?.expectedRevision);
    const result = createNodeFlowNodeCommand({
      state: get(),
      type,
      position,
      parentId,
      extraData,
      allocateNodeId: (nodeType) => `${nodeType}-${++nodeIdCounter}`,
    });
    set(result.state);
    return result.nodeId;
  },

  updateNodeData: (nodeId, data) => {
    set((state) => patchNodeFlowNodeData(state, nodeId, data));
  },

  updateNodeStyle: (nodeId, style) => {
    set((state) => patchNodeFlowNodeStyle(state, nodeId, style));
  },

  removeNode: (nodeId, options) => {
    assertExpectedRevision(get().revision, options?.expectedRevision);
    set((state) => removeNodeFlowNodeCommand({ state, nodeId }).state);
  },

  onNodesChange: (changes) =>
    set((state) => applyNodeFlowCanvasNodeChangesCommand({ state, changes }).state),

  onLinksChange: (changes) =>
    set((state) => applyNodeFlowCanvasLinkChangesCommand({ state, changes }).state),

  connectNodes: (connection, options) => {
    assertExpectedRevision(get().revision, options?.expectedRevision);
    set((state) => connectNodeFlowNodesCommand({ state, connection }).state);
  },

  removeLink: (linkId, options) => {
    assertExpectedRevision(get().revision, options?.expectedRevision);
    set((state) => removeNodeFlowLinkCommand({ state, linkId }).state);
  },

  addGraphLink: (sourceRef, targetRef, options) => {
    const { revision, graphLinks } = get();
    assertExpectedRevision(revision, options?.expectedRevision);
    const result = createNodeFlowGraphLink(graphLinks, sourceRef, targetRef);
    set((state) => ({
      ...state,
      revision: state.revision + 1,
      graphLinks: result.links,
    }));
    return result.linkId;
  },

  removeGraphLink: (linkId, options) => {
    const { revision } = get();
    assertExpectedRevision(revision, options?.expectedRevision);
    set((state) => ({
      ...state,
      revision: state.revision + 1,
      graphLinks: removeNodeFlowGraphLink(state.graphLinks, linkId),
    }));
  },

  toggleLinkPause: (linkId, options) => {
    assertExpectedRevision(get().revision, options?.expectedRevision);
    set((state) => toggleNodeFlowLinkPauseCommand({ state, linkId }).state);
  },

  copySelectedNodes: () => {
    const { nodes, links } = get();
    const selectedNodes = nodes.filter((node) => node.selected);
    if (selectedNodes.length === 0) return;
    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const connectedLinks = links.filter(
      (link) => selectedNodeIds.has(link.source) && selectedNodeIds.has(link.target)
    );
    const clonedNodes = JSON.parse(JSON.stringify(selectedNodes)) as NodeFlowNode[];
    const clonedLinks = JSON.parse(JSON.stringify(connectedLinks)) as NodeFlowLink[];
    set({ clipboard: { nodes: clonedNodes, links: clonedLinks } });
  },

  pasteNodes: (offset: XYPosition = { x: 50, y: 50 }, options?: RevisionGuardOptions) => {
    const { clipboard, revision } = get();
    assertExpectedRevision(revision, options?.expectedRevision);
    if (!clipboard || clipboard.nodes.length === 0) return;
    const result = pasteClipboardIntoNodeFlow({
      state: get(),
      clipboard,
      offset,
      allocateNodeId: (nodeType) => `${nodeType}-${++nodeIdCounter}`,
    });
    set(result.state);
  },

  clearClipboard: () => set({ clipboard: null }),

  getNodeById: (id) => get().nodes.find((node) => node.id === id),

  getConnectedInputs: (nodeId) => buildConnectedInputs({ nodeId, nodes: get().nodes, links: get().links, nodeFlowContext: get().nodeFlowContext }),

  validateNodeFlow: () => validateNodeFlowState({ nodes: get().nodes, links: get().links }),

  exportNodeFlow: (name) => {
    const { revision, nodes, links, graphLinks, linkStyle, globalAssetHistory, nodeFlowContext, viewport, activeView } = get();
    const nodeFlow = buildNodeFlowFile({
      revision,
      nodes,
      links,
      graphLinks,
      linkStyle,
      globalAssetHistory,
      nodeFlowContext,
      viewport,
      activeView,
      name,
    });
    downloadNodeFlowFile(nodeFlow);
  },

  importNodeFlow: (nodeFlow) => {
    const current = get();
    const hydrated = hydrateImportedNodeFlow(nodeFlow, current.nodeFlowContext);
    nodeIdCounter = hydrated.maxId;
    set({
      revision: hydrated.revision,
      nodes: hydrated.nodes,
      links: hydrated.links,
      graphLinks: hydrated.graphLinks,
      linkStyle: hydrated.linkStyle,
      activeView: hydrated.activeView,
      globalAssetHistory: hydrated.globalAssetHistory,
      nodeFlowContext: hydrated.nodeFlowContext,
      viewport: hydrated.viewport,
      ...createIdleNodeFlowExecutionState(),
    });
  },

  saveGroupTemplate: (groupId, name) => {
    const { revision, nodes, links, linkStyle, groupTemplates } = get();
    const template = buildTemplateFromGroup({
      groupId,
      revision,
      nodes,
      links,
      linkStyle,
      name,
    });
    if (!template) {
      return { ok: false, error: "未找到可保存的 Group 节点。" };
    }
    const nextTemplates = [...groupTemplates, template];
    persistNodeFlowTemplates(nextTemplates);
    set({ groupTemplates: nextTemplates });
    return { ok: true };
  },

  deleteGroupTemplate: (templateId) => {
    const { groupTemplates } = get();
    const nextTemplates = groupTemplates.filter((tpl) => tpl.id !== templateId);
    persistNodeFlowTemplates(nextTemplates);
    set({ groupTemplates: nextTemplates });
  },

  applyGroupTemplate: (templateId, offset, options) => {
    const { groupTemplates, nodes, links, activeView, revision } = get();
    assertExpectedRevision(revision, options?.expectedRevision);
    const template = groupTemplates.find((tpl) => tpl.id === templateId);
    if (!template) return { ok: false, error: "模板不存在或已被删除。" };
    if (!template.nodeFlow.nodes.length) return { ok: false, error: "模板内容为空。" };
    set((state) =>
      applyTemplateToNodeFlow({
        template,
        offset,
        activeView,
        state,
        allocateNodeId: (nodeType) => `${nodeType}-${++nodeIdCounter}`,
      })
    );
    return { ok: true };
  },

  applyViduReferenceDemo: (offset = { x: 120, y: 120 }, options) => {
    const { activeView, revision } = get();
    assertExpectedRevision(revision, options?.expectedRevision);
    set((state) =>
      buildViduReferenceDemoState({
        offset,
        activeView,
        state,
        allocateNodeId: (nodeType) => `${nodeType}-${++nodeIdCounter}`,
      })
    );
    return { ok: true };
  },

  createGroupFromSelection: (options) => {
    const { revision } = get();
    assertExpectedRevision(revision, options?.expectedRevision);
    const result = createGroupFromSelectionState({
      state: get(),
      allocateNodeId: (nodeType) => `${nodeType}-${++nodeIdCounter}`,
    });
    if (!result.ok) return result;
    set(result.state);
    return { ok: true };
  },

  clearNodeFlow: () =>
    set((state) => ({
      revision: state.revision + 1,
      nodes: [],
      links: [],
      graphLinks: [],
      ...createIdleNodeFlowExecutionState(),
    })),

  setRunning: (running) => set((state) => setNodeFlowRunningState(state, running)),
  setCurrentNode: (nodeId) => set((state) => setNodeFlowCurrentNodeState(state, nodeId)),
  setPausedNode: (nodeId) => set((state) => setNodeFlowPausedNodeState(state, nodeId)),

  addToGlobalHistory: (item) => {
    set((state) => appendGlobalAssetHistoryItem(state, item));
  },
  removeGlobalHistoryItem: (id) => set((state) => removeGlobalAssetHistoryEntry(state, id)),
  clearGlobalHistory: (type) =>
    set((state) => clearGlobalAssetHistoryEntries(state, type)),

  addNodesAndLinks: (newNodes, newLinks, options) => {
    assertExpectedRevision(get().revision, options?.expectedRevision);
    nodeIdCounter = getMaxNodeFlowNodeSuffix(newNodes.concat(get().nodes));
    set((state) => appendExternalNodesAndLinksCommand({ state, nodes: newNodes, links: newLinks }).state);
  },
}));
