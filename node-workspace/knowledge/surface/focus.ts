import type { NodeFlowNode } from "../../types";

export type KnowledgeSurfaceFocusRequest = {
  section: "overview" | "nodes" | "links" | "maps";
  nodeRef?: string;
  anchorRef?: string;
  nonce: number;
};

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const deriveKnowledgeSurfaceFocusFromFlowNode = (
  node: NodeFlowNode | null | undefined
): Omit<KnowledgeSurfaceFocusRequest, "nonce"> | null => {
  if (!node) return null;
  const data = (node.data || {}) as Record<string, unknown>;

  if (node.type === "scriptBoard" || node.type === "storyboardBoard") {
    const sceneId = trim(data.sceneId);
    const episodeId =
      typeof data.episodeId === "number"
        ? data.episodeId
        : typeof data.episodeId === "string" && data.episodeId.trim()
          ? Number(data.episodeId)
          : null;

    if (sceneId) {
      return {
        section: "maps",
        anchorRef: `scene:${sceneId}`,
      };
    }

    if (episodeId && Number.isFinite(episodeId)) {
      return {
        section: "maps",
        anchorRef: `episode:${episodeId}`,
      };
    }

    return {
      section: "overview",
      anchorRef: "script:raw",
    };
  }

  const qalamNodeRef = trim(data.qalamNodeRef);
  if (qalamNodeRef) {
    return {
      section: "nodes",
      nodeRef: qalamNodeRef,
    };
  }

  return null;
};
