import type {
  GlobalAssetHistoryItem,
  NodeFlowContextSnapshot,
  NodeFlowFile,
  NodeFlowGraphLink,
  NodeFlowLink,
  NodeFlowNode,
  NodeFlowViewport,
} from "../types";
import { normalizeNodeFlowData } from "./state";

type NodeFlowLinkStyle = "angular" | "curved";

type BuildNodeFlowFileInput = {
  revision: number;
  nodes: NodeFlowNode[];
  links: NodeFlowLink[];
  graphLinks?: NodeFlowGraphLink[];
  linkStyle?: NodeFlowLinkStyle;
  globalAssetHistory?: GlobalAssetHistoryItem[];
  nodeFlowContext?: NodeFlowContextSnapshot;
  viewport?: NodeFlowViewport | null;
  activeView?: string | null;
  name?: string;
};

export const buildNodeFlowFile = ({
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
}: BuildNodeFlowFileInput): NodeFlowFile => ({
  version: 2,
  revision,
  name: name || `nodeflow-${new Date().toISOString().slice(0, 10)}`,
  nodes,
  links,
  graphLinks,
  linkStyle,
  globalAssetHistory,
  nodeFlowContext,
  viewport: viewport || undefined,
  activeView,
});

export const downloadNodeFlowFile = (nodeFlow: NodeFlowFile) => {
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
};

export const getMaxNodeFlowNodeSuffix = (nodes: NodeFlowNode[]) =>
  nodes.reduce((max, node) => {
    const match = node.id.match(/-(\d+)$/);
    if (match) return Math.max(max, parseInt(match[1], 10));
    return max;
  }, 0);

export const hydrateImportedNodeFlow = (
  nodeFlow: NodeFlowFile,
  fallbackContext: NodeFlowContextSnapshot
) => {
  const { nodes, links, graphLinks } = normalizeNodeFlowData(nodeFlow);
  return {
    revision: typeof nodeFlow.revision === "number" ? nodeFlow.revision : 1,
    nodes,
    links,
    graphLinks,
    linkStyle: nodeFlow.linkStyle || "angular",
    activeView: nodeFlow.activeView ?? null,
    globalAssetHistory: nodeFlow.globalAssetHistory ?? [],
    nodeFlowContext: nodeFlow.nodeFlowContext ?? fallbackContext,
    viewport: nodeFlow.viewport ?? null,
    maxId: getMaxNodeFlowNodeSuffix(nodes),
  };
};
