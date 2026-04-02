import type {
  ImageGenNodeData,
  NodeFlowNode,
  NodeType,
  SeedanceVideoGenNodeData,
  ViduVideoGenNodeData,
  VideoGenNodeData,
} from "../types";
import type { NodeFlowConnectedInputs } from "./queries";
import { getNodeFlowRef } from "../../agents/runtime/nodeFlowRefs";
import { resolveNodeFlowNodeTitle } from "./titles";

export type NodeFlowExecutionApprovalAction = "image_generation" | "video_generation";

export type NodeFlowExecutionApprovalProposal = {
  id: string;
  nodeId: string;
  nodeRef?: string;
  nodeType: NodeType;
  nodeTitle: string;
  action: NodeFlowExecutionApprovalAction;
  providerLabel: string;
  modelLabel: string;
  promptPreview: string | null;
  inputSummary: string[];
  createdAt: number;
};

export type NodeFlowApprovalState = {
  pendingExecutionApprovals: Record<string, NodeFlowExecutionApprovalProposal>;
};

export const createEmptyNodeFlowApprovalState = (): NodeFlowApprovalState => ({
  pendingExecutionApprovals: {},
});

export const setNodeFlowExecutionApprovals = <T extends NodeFlowApprovalState>(
  state: T,
  proposals: NodeFlowExecutionApprovalProposal[]
): T => ({
  ...state,
  pendingExecutionApprovals: Object.fromEntries(
    proposals.map((proposal) => [proposal.nodeId, proposal])
  ),
});

export const upsertNodeFlowExecutionApproval = <T extends NodeFlowApprovalState>(
  state: T,
  proposal: NodeFlowExecutionApprovalProposal
): T => ({
  ...state,
  pendingExecutionApprovals: {
    ...state.pendingExecutionApprovals,
    [proposal.nodeId]: proposal,
  },
});

export const clearNodeFlowExecutionApproval = <T extends NodeFlowApprovalState>(
  state: T,
  nodeId: string
): T => {
  if (!state.pendingExecutionApprovals[nodeId]) return state;
  const next = { ...state.pendingExecutionApprovals };
  delete next[nodeId];
  return {
    ...state,
    pendingExecutionApprovals: next,
  };
};

const truncatePreview = (text?: string | null, maxLength = 160) => {
  const value = (text || "").replace(/\s+/g, " ").trim();
  if (!value) return null;
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
};

const summarizeInputs = (options: {
  connectedImages?: string[];
  connectedAudios?: string[];
  referenceImages?: string[];
  referenceVideos?: string[];
  projectReferenceTargets?: Array<{ category: "identity"; refId: string; label?: string }>;
}) => {
  const summary: string[] = [];
  if ((options.connectedImages?.length || 0) > 0) summary.push(`${options.connectedImages!.length} 张连线图片`);
  if ((options.connectedAudios?.length || 0) > 0) summary.push(`${options.connectedAudios!.length} 条连线音频`);
  if ((options.referenceImages?.length || 0) > 0) summary.push(`${options.referenceImages!.length} 张节点参考图`);
  if ((options.referenceVideos?.length || 0) > 0) summary.push(`${options.referenceVideos!.length} 条节点参考视频`);
  if ((options.projectReferenceTargets?.length || 0) > 0) summary.push(`${options.projectReferenceTargets!.length} 个项目卡片引用`);
  return summary;
};

const resolveImageProviderAndModel = (
  node: NodeFlowNode,
  runtimeDefaults?: { imageProviderLabel?: string; imageModelLabel?: string }
) => {
  const data = node.data as ImageGenNodeData;
  if (node.type === "nanoBananaImageGen") {
    return { providerLabel: "Nano Banana", modelLabel: data.model || "nanobanana-pro" };
  }
  if (node.type === "wanImageGen") {
    return { providerLabel: "WAN", modelLabel: data.model || "wan-image" };
  }
  return {
    providerLabel: runtimeDefaults?.imageProviderLabel || "Image",
    modelLabel: data.model || runtimeDefaults?.imageModelLabel || "global default",
  };
};

const resolveVideoProviderAndModel = (
  node: NodeFlowNode,
  runtimeDefaults?: { videoProviderLabel?: string; videoModelLabel?: string }
) => {
  const data = node.data as VideoGenNodeData | ViduVideoGenNodeData | SeedanceVideoGenNodeData;
  if (node.type === "seedanceVideoGen") {
    return { providerLabel: "Seedance", modelLabel: data.model || "seedance default" };
  }
  if (node.type === "viduVideoGen") {
    return { providerLabel: "Vidu", modelLabel: data.model || "viduq3" };
  }
  if (node.type === "wanVideoGen" || node.type === "wanReferenceVideoGen") {
    return { providerLabel: "WAN", modelLabel: data.model || "wan-video" };
  }
  if (node.type === "soraVideoGen") {
    return { providerLabel: "Sora", modelLabel: data.model || runtimeDefaults?.videoModelLabel || "global default" };
  }
  return {
    providerLabel: runtimeDefaults?.videoProviderLabel || "Video",
    modelLabel: data.model || runtimeDefaults?.videoModelLabel || "global default",
  };
};

export const isExecutionApprovalCapableNode = (nodeType: NodeType) =>
  [
    "imageGen",
    "nanoBananaImageGen",
    "wanImageGen",
    "soraVideoGen",
    "wanVideoGen",
    "wanReferenceVideoGen",
    "viduVideoGen",
    "seedanceVideoGen",
  ].includes(nodeType);

export const inferExecutionApprovalAction = (
  nodeType: NodeType
): NodeFlowExecutionApprovalAction | null => {
  if (["imageGen", "nanoBananaImageGen", "wanImageGen"].includes(nodeType)) return "image_generation";
  if (["soraVideoGen", "wanVideoGen", "wanReferenceVideoGen", "viduVideoGen", "seedanceVideoGen"].includes(nodeType)) {
    return "video_generation";
  }
  return null;
};

export const buildNodeFlowExecutionApprovalProposal = (options: {
  node: NodeFlowNode;
  connectedInputs: NodeFlowConnectedInputs;
  runtimeDefaults?: {
    imageProviderLabel?: string;
    imageModelLabel?: string;
    videoProviderLabel?: string;
    videoModelLabel?: string;
  };
}): NodeFlowExecutionApprovalProposal => {
  const { node, connectedInputs, runtimeDefaults } = options;
  const action = inferExecutionApprovalAction(node.type);
  if (!action) {
    throw new Error(`节点 ${node.type} 不支持生成审批。`);
  }
  const base = {
    id: `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nodeId: node.id,
    nodeRef: getNodeFlowRef(node),
    nodeType: node.type,
    nodeTitle: resolveNodeFlowNodeTitle(node),
    action,
    createdAt: Date.now(),
  };
  if (action === "image_generation") {
    const info = resolveImageProviderAndModel(node, runtimeDefaults);
    return {
      ...base,
      providerLabel: info.providerLabel,
      modelLabel: info.modelLabel,
      promptPreview: truncatePreview(connectedInputs.text),
      inputSummary: summarizeInputs({
        connectedImages: connectedInputs.images,
      }),
    };
  }
  const data = node.data as VideoGenNodeData;
  const info = resolveVideoProviderAndModel(node, runtimeDefaults);
  return {
    ...base,
    providerLabel: info.providerLabel,
    modelLabel: info.modelLabel,
    promptPreview: truncatePreview(connectedInputs.text),
    inputSummary: summarizeInputs({
      connectedImages: connectedInputs.images,
      connectedAudios: connectedInputs.audios,
      referenceImages: Array.isArray((data as VideoGenNodeData).referenceImages)
        ? ((data as VideoGenNodeData).referenceImages || []).filter(Boolean)
        : undefined,
      referenceVideos:
        Array.isArray((data as VideoGenNodeData).referenceVideos)
          ? ((data as VideoGenNodeData).referenceVideos || []).filter(Boolean)
          : Array.isArray((data as SeedanceVideoGenNodeData).referenceVideos)
            ? ((data as SeedanceVideoGenNodeData).referenceVideos || []).filter(Boolean)
            : undefined,
      projectReferenceTargets: Array.isArray((data as VideoGenNodeData).projectReferenceTargets)
        ? (data as VideoGenNodeData).projectReferenceTargets
        : undefined,
    }),
  };
};
