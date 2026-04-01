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
  NodeType,
  AudioInputNodeData,
  ImageInputNodeData,
  AnnotationNodeData,
  ScriptBoardNodeData,
  StoryboardBoardNodeData,
  IdentityCardNodeData,
  TextNodeData,
  ImageGenNodeData,
  NodeFlowNodeData,
  NodeFlowFile,
  VideoGenNodeData,
  GroupNodeData,
  ShotNodeData,
  GlobalAssetHistoryItem,
  GlobalAssetType,
  NodeFlowContextSnapshot,
  NodeFlowViewport,
  NodeFlowTemplate,
  NodeFlowNodeStyle,
} from "../types";
import type { Episode, ProjectRoleIdentity, Scene } from "../../types";
import { buildProjectIdentities, resolveLegacyIdentity } from "../../utils/identityCards";
import { resolveEdgeHandleType } from "../utils/handles";
import {
  applyNodeFlowLinkChanges,
  buildNodeFlowLinkId,
} from "../nodeflow/links";
import { applyNodeFlowNodeChanges, type NodeFlowCanvasLink, type NodeFlowCanvasNode } from "../nodeflow/reactflow";
import {
  getNodeFlowAbsolutePosition,
  getNodeFlowNodeDimensions,
  normalizeNodeFlowData,
  normalizeNodeFlowGroupBindings,
} from "../nodeflow/state";
import { createDefaultNodeFlowNodeData } from "../nodeflow/defaults";
import {
  appendNodeToNodeFlow,
  appendNodesAndLinksToNodeFlow,
  connectNodesInNodeFlow,
  patchNodeFlowNodeData,
  patchNodeFlowNodeStyle,
  removeLinkFromNodeFlow,
  removeNodeFromNodeFlow,
  toggleNodeFlowLinkPauseInState,
} from "../nodeflow/mutations";

export type { GlobalAssetHistoryItem, GlobalAssetType };

export type LinkStyle = "angular" | "curved";

interface ClipboardData {
  nodes: NodeFlowNode[];
  links: NodeFlowLink[];
}

const TEMPLATE_STORAGE_KEY = "qalam_group_templates_v1";

const loadTemplates = (): NodeFlowTemplate[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        item.nodeFlow &&
        typeof item.nodeFlow === "object" &&
        Array.isArray(item.nodeFlow.nodes) &&
        Array.isArray(item.nodeFlow.links)
    );
  } catch {
    return [];
  }
};

const persistTemplates = (templates: NodeFlowTemplate[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Ignore persistence failures.
  }
};

const truncateText = (value: string, limit: number) => {
  const normalized = value.trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit)}...`;
};

const findEpisodeBySceneId = (episodes: Episode[], sceneId?: string) =>
  episodes.find((episode) => episode.scenes.some((scene) => scene.id === sceneId));

const buildSceneLabel = (scene: Scene, index: number) =>
  `场景 ${index + 1} · ${scene.id}${scene.title ? ` · ${scene.title}` : ""}`;

const buildScriptBoardText = (data: ScriptBoardNodeData, episodes: Episode[]) => {
  if (!episodes.length) return null;
  const episode = episodes.find((item) => item.id === data.episodeId) ?? episodes[0];
  if (!episode) return null;
  const blocks = episode.scenes.map((scene, index) => {
    const header = buildSceneLabel(scene, index);
    return `${header}\n${scene.content?.trim() || "暂无场景正文"}`;
  });
  return [`剧本面板：第${episode.id}集`, ...blocks]
    .filter(Boolean)
    .join("\n\n");
};

const buildStoryboardBoardText = (data: StoryboardBoardNodeData, episodes: Episode[]) => {
  if (!episodes.length) return null;
  const episode =
    episodes.find((item) => item.id === data.episodeId) ??
    findEpisodeBySceneId(episodes, data.sceneId) ??
    episodes[0];
  if (!episode) return null;
  const sceneBlocks = episode.scenes.map((scene, index) => {
    const sceneShots = episode.shots.filter((shot) => shot.id.startsWith(`${scene.id}-`));
    const rows = sceneShots.map((shot, shotIndex) => {
      const parts = [
        `镜头 ${shotIndex + 1}（${shot.id}）`,
        shot.shotType ? `景别：${shot.shotType}` : "",
        shot.focalLength ? `焦段：${shot.focalLength}` : "",
        shot.movement ? `运镜：${shot.movement}` : "",
        shot.composition ? `构图：${truncateText(shot.composition, 80)}` : "",
        shot.blocking ? `调度：${truncateText(shot.blocking, 80)}` : "",
        shot.dialogue ? `台词：${truncateText(shot.dialogue, 60)}` : "",
        shot.sound ? `声音：${truncateText(shot.sound, 60)}` : "",
      ].filter(Boolean);
      return parts.join("｜");
    });
    return [
      buildSceneLabel(scene, index),
      scene.content ? `场景正文：${truncateText(scene.content, 220)}` : "",
      rows.length ? rows.join("\n") : "当前场景暂无分镜表数据。",
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [`分镜表面板：第${episode.id}集`, ...sceneBlocks]
    .filter(Boolean)
    .join("\n\n");
};

const buildIdentityCardText = (data: IdentityCardNodeData, nodeFlowContext: NodeFlowContextSnapshot) => {
  const { context, designAssets } = nodeFlowContext;
  const identities = buildProjectIdentities(context, designAssets);
  const identity = resolveLegacyIdentity(identities, {
    identityId: data.identityId,
  });
  if (!identity) return null;
  return [
    `身份证：${identity.displayName}`,
    ...identity.detailLines,
    identity.title ? `身份名：${identity.title}` : "",
    identity.subtitle ? `区间：${identity.subtitle}` : "",
    identity.description,
  ]
    .filter(Boolean)
    .join("\n\n");
};

interface NodeFlowStore {
  revision: number;
  nodes: NodeFlowNode[];
  links: NodeFlowLink[];
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
  addNode: (type: NodeType, position: XYPosition, parentId?: string, extraData?: Partial<NodeFlowNodeData>) => string;
  updateNodeData: (nodeId: string, data: Partial<NodeFlowNodeData>) => void;
  updateNodeStyle: (nodeId: string, style: Partial<NodeFlowNodeStyle>) => void;
  removeNode: (nodeId: string) => void;
  onNodesChange: (changes: NodeChange<NodeFlowCanvasNode>[]) => void;

  // Link operations
  onLinksChange: (changes: EdgeChange<NodeFlowCanvasLink>[]) => void;
  connectNodes: (connection: Connection) => void;
  removeLink: (linkId: string) => void;
  toggleLinkPause: (linkId: string) => void;

  // Copy/Paste operations
  copySelectedNodes: () => void;
  pasteNodes: (offset?: XYPosition) => void;
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
  applyGroupTemplate: (templateId: string, offset: XYPosition) => { ok: boolean; error?: string };
  createGroupFromSelection: () => { ok: boolean; error?: string };
  applyViduReferenceDemo: (offset?: XYPosition) => { ok: boolean; error?: string };

  // Helpers
  getNodeById: (id: string) => NodeFlowNode | undefined;
  getConnectedInputs: (nodeId: string) => {
    images: string[];
    audios: string[];
    text: string | null;
    atMentions?: TextNodeData['atMentions'];
    entityBindings?: TextNodeData["entityBindings"];
    imageRefs?: { src: string; identityTag?: string | null; identityId?: string | null }[];
    connectedIdentity?: {
      identityId: string;
      mention: string;
      name: string;
      description?: string;
      designPrompt?: string;
      primaryPortraitUrl?: string;
    };
  };
  validateNodeFlow: () => { valid: boolean; errors: string[] };
  addToGlobalHistory: (item: Omit<GlobalAssetHistoryItem, "id" | "timestamp">) => void;
  removeGlobalHistoryItem: (id: string) => void;
  clearGlobalHistory: (type?: GlobalAssetType) => void;

  // Batch operations
  addNodesAndLinks: (nodes: NodeFlowNode[], links: NodeFlowLink[]) => void;

  // View management
  activeView: string | null;
  setActiveView: (view: string | null) => void;

  // Global Config
  appConfig: any; // Using any to avoid circular dependencies if types are complex, but AppConfig is best
  setAppConfig: (config: any) => void;
  projectRoleUpdater: ((roleId: string, updater: (role: ProjectRoleIdentity) => ProjectRoleIdentity) => void) | null;
  setProjectRoleUpdater: (
    updater: ((roleId: string, updater: (role: ProjectRoleIdentity) => ProjectRoleIdentity) => void) | null
  ) => void;
  mutateProjectRole: (roleId: string, updater: (role: ProjectRoleIdentity) => ProjectRoleIdentity) => void;
}

let nodeIdCounter = 0;

export const useNodeFlowStore = create<NodeFlowStore>((set, get) => ({
  revision: 0,
  nodes: [],
  links: [],
  linkStyle: "curved" as LinkStyle,
  clipboard: null,
  isRunning: false,
  currentNodeId: null,
  pausedAtNodeId: null,
  globalAssetHistory: [],
  viewport: null,
  groupTemplates: loadTemplates(),
  activeView: null,
  globalStyleGuide: undefined,
  availableImageModels: [],
  availableVideoModels: [],
  nodeFlowContext: {
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
  },
  appConfig: null,
  projectRoleUpdater: null,

  setAvailableImageModels: (models) => set({ availableImageModels: models }),
  setAvailableVideoModels: (models) => set({ availableVideoModels: models }),
  setNodeFlowContext: (ctx) => set({ nodeFlowContext: ctx }),
  setViewportState: (viewport) => set({ viewport }),

  setActiveView: (view) => set({ activeView: view }),
  setAppConfig: (config) => set({ appConfig: config }),
  setProjectRoleUpdater: (updater) => set({ projectRoleUpdater: updater }),
  mutateProjectRole: (roleId, updater) => {
    const apply = get().projectRoleUpdater;
    if (!apply) return;
    apply(roleId, updater);
  },

  setLinkStyle: (style: LinkStyle) => set({ linkStyle: style }),
  setGlobalStyleGuide: (guide: string) => set({ globalStyleGuide: guide }),

  addNode: (type: NodeType, position: XYPosition, parentId?: string, extraData?: Partial<NodeFlowNodeData>) => {
    const { activeView, nodes } = get();
    const id = `${type}-${++nodeIdCounter}`;

    // Automatically determine parent and view if not explicitly provided
    let effectiveParentId = parentId;
    let effectiveExtraData = { ...extraData };

    if (activeView) {
      effectiveExtraData.view = activeView;

      // If no parentId provided, try to find a suitable group node in this view
      if (!effectiveParentId) {
        const matchingGroup = nodes.find(n => n.type === 'group' && (n.data as any).view === activeView);
        if (matchingGroup) {
          effectiveParentId = matchingGroup.id;
        }
      }
    }

    const defaultDimensions: Partial<Record<NodeType, { width: number; height?: number }>> = {
      group: { width: 1100, height: 900 },
      scriptBoard: { width: 920 },
      storyboardBoard: { width: 1080 },
      identityCard: { width: 760 },
      audioInput: { width: 340 },
      seedanceVideoGen: { width: 380 },
    };

    const dim = defaultDimensions[type];
    const newNode: NodeFlowNode = {
      id,
      type,
      position,
      parentId: effectiveParentId,
      extent: effectiveParentId ? 'parent' : undefined,
      data: { ...createDefaultNodeFlowNodeData(type), ...effectiveExtraData } as NodeFlowNodeData,
      style: dim ? { width: dim.width, height: dim.height } : undefined,
    };
    set((state) => appendNodeToNodeFlow(state, newNode));
    return id;
  },

  updateNodeData: (nodeId, data) => {
    set((state) => patchNodeFlowNodeData(state, nodeId, data));
  },

  updateNodeStyle: (nodeId, style) => {
    set((state) => patchNodeFlowNodeStyle(state, nodeId, style));
  },

  removeNode: (nodeId) => {
    set((state) => removeNodeFromNodeFlow(state, nodeId));
  },

  onNodesChange: (changes) =>
    set((state) => {
      const nextNodes = applyNodeFlowNodeChanges(changes, state.nodes);
      return {
        revision: state.revision + 1,
        nodes: normalizeNodeFlowGroupBindings(nextNodes, state.links),
      };
    }),

  onLinksChange: (changes) =>
    set((state) => {
      const nextLinks = applyNodeFlowLinkChanges(changes, state.links);
      return {
        revision: state.revision + 1,
        links: nextLinks,
        nodes: normalizeNodeFlowGroupBindings(state.nodes, nextLinks),
      };
    }),

  connectNodes: (connection) => {
    set((state) => connectNodesInNodeFlow(state, connection));
  },

  removeLink: (linkId) =>
    set((state) => removeLinkFromNodeFlow(state, linkId)),

  toggleLinkPause: (linkId) => {
    set((state) => toggleNodeFlowLinkPauseInState(state, linkId));
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

  pasteNodes: (offset: XYPosition = { x: 50, y: 50 }) => {
    const { clipboard, nodes, links, activeView } = get();
    if (!clipboard || clipboard.nodes.length === 0) return;

    const idMapping = new Map<string, string>();
    clipboard.nodes.forEach((node) => {
      const newId = `${node.type}-${++nodeIdCounter}`;
      idMapping.set(node.id, newId);
    });

    const matchingGroup = activeView ? nodes.find(n => n.type === 'group' && (n.data as any).view === activeView) : null;

    const newNodes: NodeFlowNode[] = clipboard.nodes.map((node) => {
      const newData = { ...node.data };
      if (activeView) {
        (newData as any).view = activeView;
      }

      return {
        ...node,
        id: idMapping.get(node.id)!,
        position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
        selected: true,
        parentId: node.parentId || (matchingGroup?.id),
        extent: (node.parentId || matchingGroup?.id) ? 'parent' : undefined,
        data: newData as NodeFlowNodeData,
      };
    });

    const newLinks: NodeFlowLink[] = clipboard.links.map((link) => ({
      ...link,
      id: buildNodeFlowLinkId(
        idMapping.get(link.source)!,
        idMapping.get(link.target)!,
        link.sourceHandle,
        link.targetHandle
      ),
      source: idMapping.get(link.source)!,
      target: idMapping.get(link.target)!,
    }));
    const updatedNodes = nodes.map((node) => ({ ...node, selected: false }));
    set((state) => ({
      revision: state.revision + 1,
      nodes: [...updatedNodes, ...newNodes],
      links: [...links, ...newLinks],
    }));
  },

  clearClipboard: () => set({ clipboard: null }),

  getNodeById: (id) => get().nodes.find((node) => node.id === id),

  getConnectedInputs: (nodeId) => {
    const { links, nodes, nodeFlowContext } = get();
    const images: string[] = [];
    const audios: string[] = [];
    const texts: string[] = [];
    const mentions: TextNodeData['atMentions'] = [];
    const entityBindings: TextNodeData["entityBindings"] = [];
    const imageRefs: { src: string; identityTag?: string | null; identityId?: string | null }[] = [];
    let connectedIdentity:
      | {
          identityId: string;
          mention: string;
          name: string;
          description?: string;
          designPrompt?: string;
          primaryPortraitUrl?: string;
        }
      | undefined;
    links
      .filter((edge) => edge.target === nodeId)
      .forEach((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        if (!sourceNode) return;
        const effectiveHandle = resolveEdgeHandleType({
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          sourceNodeType: sourceNode.type,
        });
        if (effectiveHandle === "image") {
          if (sourceNode.type === "imageInput") {
            const src = (sourceNode.data as ImageInputNodeData).image;
            if (src) images.push(src);
            if (src)
              imageRefs.push({
                src,
                identityTag: (sourceNode.data as ImageInputNodeData).identityTag,
                identityId: (sourceNode.data as ImageInputNodeData).identityId,
              });
          } else if (sourceNode.type === "annotation") {
            const src = (sourceNode.data as AnnotationNodeData).outputImage;
            if (src) images.push(src);
            if (src) imageRefs.push({ src });
          } else if (sourceNode.type === "imageGen" || sourceNode.type === "nanoBananaImageGen" || sourceNode.type === "wanImageGen") {
            const src = (sourceNode.data as ImageGenNodeData).outputImage;
            if (src) images.push(src);
            if (src) {
              imageRefs.push({
                src,
                identityTag: (sourceNode.data as ImageGenNodeData).identityTag,
                identityId: (sourceNode.data as ImageGenNodeData).identityId,
              });
            }
          }
        }
        if (effectiveHandle === "audio" && sourceNode.type === "audioInput") {
          const src = (sourceNode.data as AudioInputNodeData).audio;
          if (src) audios.push(src);
        }
        if (effectiveHandle === "text") {
          if (sourceNode.type === "text") {
            const value = (sourceNode.data as TextNodeData).text;
            if (value && value.trim()) texts.push(value.trim());
            const ats = (sourceNode.data as TextNodeData).atMentions;
            const bindings = (sourceNode.data as TextNodeData).entityBindings;
            if (ats && ats.length) {
              ats.forEach((m) => {
                if (!mentions.find((x) => x?.name === m.name)) mentions.push(m);
              });
            }
            if (bindings && bindings.length) {
              bindings.forEach((binding) => {
                if (!entityBindings.find((item) => item.id === binding.id)) entityBindings.push(binding);
              });
            }
          } else if (sourceNode.type === "scriptBoard") {
            const value = buildScriptBoardText(sourceNode.data as ScriptBoardNodeData, nodeFlowContext.episodes || []);
            if (value) texts.push(value);
          } else if (sourceNode.type === "storyboardBoard") {
            const value = buildStoryboardBoardText(sourceNode.data as StoryboardBoardNodeData, nodeFlowContext.episodes || []);
            if (value) texts.push(value);
          } else if (sourceNode.type === "identityCard") {
            const value = buildIdentityCardText(sourceNode.data as IdentityCardNodeData, nodeFlowContext);
            if (value) texts.push(value);
            const identities = buildProjectIdentities(nodeFlowContext.context, nodeFlowContext.designAssets || []);
            const identity = resolveLegacyIdentity(identities, {
              identityId: (sourceNode.data as IdentityCardNodeData).identityId,
            });
            if (identity && !connectedIdentity) {
              connectedIdentity = {
                identityId: identity.id,
                mention: identity.mention,
                name: identity.name,
                description: identity.description,
                designPrompt: identity.designPrompt,
                primaryPortraitUrl: identity.primaryPortraitUrl || identity.avatarUrl,
              };
            }
          }
        }
      });
    const text = texts.length ? texts.join("\n\n") : null;
    return {
      images,
      audios,
      text,
      atMentions: mentions.length ? mentions : undefined,
      entityBindings: entityBindings.length ? entityBindings : undefined,
      imageRefs: imageRefs.length ? imageRefs : undefined,
      connectedIdentity,
    };
  },

  validateNodeFlow: () => {
    const { nodes, links } = get();
    const errors: string[] = [];
    const hasIncomingHandleType = (nodeId: string, expectedHandle: "image" | "text" | "audio") =>
      links
        .filter((edge) => edge.target === nodeId)
        .some((edge) => {
          const sourceNode = nodes.find((node) => node.id === edge.source);
          return (
            resolveEdgeHandleType({
              sourceHandle: edge.sourceHandle,
              targetHandle: edge.targetHandle,
              sourceNodeType: sourceNode?.type,
            }) === expectedHandle
          );
        });

    if (nodes.length === 0) {
      errors.push("NodeFlow is empty");
      return { valid: false, errors };
    }
    nodes
      .filter((n) => n.type === "imageGen" || n.type === "nanoBananaImageGen" || n.type === "wanImageGen")
      .forEach((node) => {
        const textConnected = hasIncomingHandleType(node.id, "text");
        if (!textConnected) errors.push(`ImageGen node "${node.id}" missing text input`);
      });
    nodes
      .filter((n) => n.type === "soraVideoGen" || n.type === "wanVideoGen")
      .forEach((node) => {
        const imageConnected = hasIncomingHandleType(node.id, "image");
        const textConnected = hasIncomingHandleType(node.id, "text");
        if (!imageConnected) errors.push(`VideoGen node "${node.id}" missing image input`);
        if (!textConnected) errors.push(`VideoGen node "${node.id}" missing text input`);
      });
    nodes
      .filter((n) => n.type === "seedanceVideoGen")
      .forEach((node) => {
        const edgeInputTypes = links
          .filter((e) => e.target === node.id)
          .map((e) => {
            const sourceNode = nodes.find((n) => n.id === e.source);
            return resolveEdgeHandleType({
              sourceHandle: e.sourceHandle,
              targetHandle: e.targetHandle,
              sourceNodeType: sourceNode?.type,
            });
          });
        const imageConnected = edgeInputTypes.includes("image");
        const audioConnected = edgeInputTypes.includes("audio");
        const nodeData = node.data as any;
        const refs =
          (Array.isArray(nodeData.referenceVideos) ? nodeData.referenceVideos.length : 0) +
          (imageConnected ? 1 : 0);
        if (refs === 0) errors.push(`Seedance node "${node.id}" requires at least 1 reference image or video`);
        if (
          audioConnected &&
          refs === 0
        ) {
          errors.push(`Seedance node "${node.id}" cannot use audio alone without image/video references`);
        }
      });
    nodes
      .filter((n) => n.type === "wanReferenceVideoGen")
      .forEach((node) => {
        const textConnected = hasIncomingHandleType(node.id, "text");
        const nodeData = node.data as VideoGenNodeData;
        const refs = ((nodeData.referenceVideos || []).length + (nodeData.referenceImages || []).length);
        const imageConnected = hasIncomingHandleType(node.id, "image");
        if (!textConnected) errors.push(`Wan reference video node "${node.id}" missing text input`);
        if (refs === 0 && !imageConnected) errors.push(`Wan reference video node "${node.id}" missing reference assets`);
      });
    nodes
      .filter((n) => n.type === "annotation")
      .forEach((node) => {
        const imageConnected = links.some((e) => e.target === node.id);
        const hasManualImage = (node.data as AnnotationNodeData).sourceImage !== null;
        if (!imageConnected && !hasManualImage) {
          errors.push(`Annotation node "${node.id}" missing image input`);
        }
      });
    return { valid: errors.length === 0, errors };
  },

  exportNodeFlow: (name) => {
    const { revision, nodes, links, linkStyle, globalAssetHistory, nodeFlowContext, viewport, activeView } = get();
    const nodeFlow: NodeFlowFile = {
      version: 2,
      revision,
      name: name || `nodeflow-${new Date().toISOString().slice(0, 10)}`,
      nodes,
      links,
      linkStyle,
      globalAssetHistory,
      nodeFlowContext,
      viewport: viewport || undefined,
      activeView,
    };
    const json = JSON.stringify(nodeFlow, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${nodeFlow.name}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  importNodeFlow: (nodeFlow) => {
    const { nodes, links } = normalizeNodeFlowData(nodeFlow);
    const maxId = nodes.reduce((max, node) => {
      const match = node.id.match(/-(\d+)$/);
      if (match) return Math.max(max, parseInt(match[1], 10));
      return max;
    }, 0);
    nodeIdCounter = maxId;
    const current = get();
    set({
      revision: typeof nodeFlow.revision === "number" ? nodeFlow.revision : 1,
      nodes,
      links,
      linkStyle: nodeFlow.linkStyle || "angular",
      activeView: nodeFlow.activeView ?? null,
      globalAssetHistory: nodeFlow.globalAssetHistory ?? [],
      nodeFlowContext: nodeFlow.nodeFlowContext ?? current.nodeFlowContext,
      viewport: nodeFlow.viewport ?? null,
      isRunning: false,
      currentNodeId: null,
      pausedAtNodeId: null,
    });
  },

  saveGroupTemplate: (groupId, name) => {
    const { revision, nodes, links, linkStyle, groupTemplates } = get();
    const groupNode = nodes.find((node) => node.id === groupId && node.type === "group");
    if (!groupNode) {
      return { ok: false, error: "未找到可保存的 Group 节点。" };
    }
    const childNodes = nodes.filter((node) => node.parentId === groupId);
    const templateNodes = [groupNode, ...childNodes].map((node) => ({
      ...node,
      position: node.id === groupId ? { x: 0, y: 0 } : node.position,
      selected: false,
    }));
    const nodeIds = new Set(templateNodes.map((node) => node.id));
    const templateEdges = links
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => ({ ...edge }));
    const nodeFlow: NodeFlowFile = {
      version: 2,
      revision,
      name: name || groupNode.data?.title || "Group Template",
      nodes: templateNodes,
      links: templateEdges,
      linkStyle,
    };
    const template: NodeFlowTemplate = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: nodeFlow.name,
      createdAt: Date.now(),
      nodeFlow,
    };
    const nextTemplates = [...groupTemplates, template];
    persistTemplates(nextTemplates);
    set({ groupTemplates: nextTemplates });
    return { ok: true };
  },

  deleteGroupTemplate: (templateId) => {
    const { groupTemplates } = get();
    const nextTemplates = groupTemplates.filter((tpl) => tpl.id !== templateId);
    persistTemplates(nextTemplates);
    set({ groupTemplates: nextTemplates });
  },

  applyGroupTemplate: (templateId, offset) => {
    const { groupTemplates, nodes, links, activeView } = get();
    const template = groupTemplates.find((tpl) => tpl.id === templateId);
    if (!template) return { ok: false, error: "模板不存在或已被删除。" };
    if (!template.nodeFlow.nodes.length) return { ok: false, error: "模板内容为空。" };

    const normalizedTemplate = normalizeNodeFlowData(template.nodeFlow);
    const idMapping = new Map<string, string>();
    normalizedTemplate.nodes.forEach((node) => {
      const newId = `${node.type}-${++nodeIdCounter}`;
      idMapping.set(node.id, newId);
    });

    const newNodes: NodeFlowNode[] = normalizedTemplate.nodes.map((node) => {
      const parentId = node.parentId ? idMapping.get(node.parentId) : undefined;
      const position = parentId
        ? node.position
        : { x: node.position.x + offset.x, y: node.position.y + offset.y };
      const newData = { ...node.data };
      if (activeView) {
        (newData as any).view = activeView;
      }
      return {
        ...node,
        id: idMapping.get(node.id)!,
        position,
        parentId,
        extent: parentId ? "parent" : undefined,
        selected: true,
        data: newData as NodeFlowNodeData,
      };
    });

    const newLinks: NodeFlowLink[] = normalizedTemplate.links.map((link) => ({
      ...link,
      id: buildNodeFlowLinkId(
        idMapping.get(link.source)!,
        idMapping.get(link.target)!,
        link.sourceHandle,
        link.targetHandle
      ),
      source: idMapping.get(link.source)!,
      target: idMapping.get(link.target)!,
    }));

    const updatedNodes = nodes.map((node) => ({ ...node, selected: false }));
    set((state) => ({
      revision: state.revision + 1,
      nodes: [...updatedNodes, ...newNodes],
      links: [...links, ...newLinks],
    }));
    return { ok: true };
  },

  applyViduReferenceDemo: (offset = { x: 120, y: 120 }) => {
    const { nodes, links, activeView } = get();
    const deselected = nodes.map((n) => ({ ...n, selected: false }));

    const groupId = `group-${++nodeIdCounter}`;
    const groupNode: NodeFlowNode = {
      id: groupId,
      type: "group",
      position: offset,
      data: {
        title: "Vidu 参考生视频演示",
        description: "音视频直出默认启用，1080p，错峰开启，示例含 3 主体与场景参考。",
        view: activeView || undefined,
      } as GroupNodeData,
      style: { width: 1100, height: 900 },
    };

    const promptText = "@Chef 和 @Guest 在一起吃火锅，并且旁白音说火锅大家都爱吃。";
    const textNode: NodeFlowNode = {
      id: `text-${++nodeIdCounter}`,
      type: "text",
      position: { x: 80, y: 120 },
      parentId: groupId,
      extent: "parent",
      data: {
        title: "参考提示词",
        text: promptText,
        atMentions: [
          { name: "Chef", status: "match" },
          { name: "Guest", status: "match" },
          { name: "Narrator", status: "missing" },
        ],
        view: activeView || undefined,
      } as any,
    };

    const imageUrls = [
      { url: "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png", identityTag: "chef_normal" },
      { url: "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-2.png", identityTag: "chef_normal" },
      { url: "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-3.png", identityTag: "chef_normal" },
      { url: "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/startend2video-1.jpeg", identityTag: "guest_normal" },
      { url: "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/startend2video-2.jpeg", identityTag: "guest_normal" },
      { url: "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/scene-template/hug.jpeg", identityTag: "narrator_normal" },
      { url: "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/image2video.png", identityTag: "chef_normal" },
    ];

    const imageNodes: NodeFlowNode[] = imageUrls.map((img, idx) => ({
      id: `image-${++nodeIdCounter}`,
      type: "imageInput",
      position: { x: 80 + (idx % 3) * 180, y: 260 + Math.floor(idx / 3) * 180 },
      parentId: groupId,
      extent: "parent",
      data: { image: img.url, filename: `ref-${idx + 1}.png`, dimensions: null, identityTag: img.identityTag, view: activeView || undefined } as any,
    }));

    const viduNode: NodeFlowNode = {
      id: `vidu-${++nodeIdCounter}`,
      type: "viduVideoGen",
      position: { x: 620, y: 260 },
      parentId: groupId,
      extent: "parent",
      data: {
        title: "Vidu 参考生视频",
        mode: "audioVideo",
        aspectRatio: "16:9",
        resolution: "1080p",
        duration: 10,
        movementAmplitude: "auto",
        offPeak: true,
        model: "viduq2-pro",
        subjects: [],
        status: "idle",
        error: null,
        inputImages: imageUrls.map((i) => i.url),
        view: activeView || undefined,
      } as any,
      style: { width: 360 },
    };

    const newLinks: NodeFlowLink[] = [
      {
        id: buildNodeFlowLinkId(textNode.id, viduNode.id, undefined, "text"),
        source: textNode.id,
        target: viduNode.id,
        targetHandle: "text",
      },
      ...imageNodes.map((img) => ({
        id: buildNodeFlowLinkId(img.id, viduNode.id, undefined, "image"),
        source: img.id,
        target: viduNode.id,
        targetHandle: "image",
      })),
    ];

    set((state) => ({
      revision: state.revision + 1,
      nodes: [...deselected, groupNode, textNode, ...imageNodes, viduNode],
      links: [...links, ...newLinks],
    }));
    return { ok: true };
  },

  createGroupFromSelection: () => {
    const { nodes, links } = get();
    const selectedNodes = nodes.filter((node) => node.selected && node.type !== "group");
    if (selectedNodes.length === 0) {
      return { ok: false, error: "未选中可分组的节点。" };
    }

    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const bounds = selectedNodes.reduce(
      (acc, node) => {
        const abs = getNodeFlowAbsolutePosition(node, nodeMap);
        const size = getNodeFlowNodeDimensions(node);
        return {
          minX: Math.min(acc.minX, abs.x),
          minY: Math.min(acc.minY, abs.y),
          maxX: Math.max(acc.maxX, abs.x + size.width),
          maxY: Math.max(acc.maxY, abs.y + size.height),
        };
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );

    const paddingX = 80;
    const paddingY = 100;
    const groupPosition = { x: bounds.minX - paddingX, y: bounds.minY - paddingY };
    const groupSize = {
      width: bounds.maxX - bounds.minX + paddingX * 2,
      height: bounds.maxY - bounds.minY + paddingY * 2,
    };

    const groupId = `group-${++nodeIdCounter}`;
    const groupNode: NodeFlowNode = {
      id: groupId,
      type: "group",
      position: groupPosition,
      data: { title: "New Group" } as GroupNodeData,
      style: { width: groupSize.width, height: groupSize.height },
      selected: true,
    };

    const selectedIds = new Set(selectedNodes.map((node) => node.id));
    const nextNodes = nodes.map((node) => {
      if (!selectedIds.has(node.id)) {
        return { ...node, selected: false };
      }
      const abs = getNodeFlowAbsolutePosition(node, nodeMap);
      return {
        ...node,
        parentId: groupId,
        extent: "parent",
        position: { x: abs.x - groupPosition.x, y: abs.y - groupPosition.y },
        selected: true,
      };
    });

    const mergedNodes = normalizeNodeFlowGroupBindings([...nextNodes, groupNode], links);
    set((state) => ({
      revision: state.revision + 1,
      nodes: mergedNodes,
    }));
    return { ok: true };
  },

  clearNodeFlow: () =>
    set((state) => ({
      revision: state.revision + 1,
      nodes: [],
      links: [],
      isRunning: false,
      currentNodeId: null,
      pausedAtNodeId: null,
    })),

  setRunning: (running) => set({ isRunning: running }),
  setCurrentNode: (nodeId) => set({ currentNodeId: nodeId }),
  setPausedNode: (nodeId) => set({ pausedAtNodeId: nodeId }),

  addToGlobalHistory: (item) => {
    const newItem = { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: Date.now() };
    set((state) => {
      if (item.sourceId) {
        const existingIndex = state.globalAssetHistory.findIndex((entry) => entry.sourceId === item.sourceId && entry.type === item.type);
        if (existingIndex !== -1) {
          const updated = [...state.globalAssetHistory];
          updated[existingIndex] = { ...updated[existingIndex], ...newItem, id: updated[existingIndex].id };
          return { globalAssetHistory: updated };
        }
      }
      return { globalAssetHistory: [newItem, ...state.globalAssetHistory] };
    });
  },
  removeGlobalHistoryItem: (id) => set((state) => ({ globalAssetHistory: state.globalAssetHistory.filter((item) => item.id !== id) })),
  clearGlobalHistory: (type) =>
    set((state) => ({
      globalAssetHistory: type ? state.globalAssetHistory.filter((item) => item.type !== type) : [],
    })),

  addNodesAndLinks: (newNodes, newLinks) => {
    // Basic ID counter update logic
    const maxId = [...newNodes].reduce((max, node) => {
      const match = node.id.match(/-(\d+)$/);
      if (match) return Math.max(max, parseInt(match[1], 10));
      return max;
    }, nodeIdCounter);
    nodeIdCounter = maxId;

    set((state) => appendNodesAndLinksToNodeFlow(state, newNodes, newLinks));
  },
}));
