import type { XYPosition } from "@xyflow/react";
import type { Episode } from "../../types";
import type {
  GroupNodeData,
  ImageGenNodeData,
  ShotNodeData,
  TextNodeData,
  VideoGenNodeData,
  NodeFlowLink,
  NodeFlowNode,
} from "../types";
import { buildShotOverview } from "../../utils/shotSchema";
import { buildNodeFlowLinkId } from "../nodeflow/links";

const estimateTextNodeHeight = (text: string) => {
  const safe = (text || "").trim();
  const charsPerLine = 36;
  const lineHeight = 22;
  const baseHeight = 220;
  const lines = Math.max(3, Math.ceil(safe.length / charsPerLine));
  return baseHeight + lines * lineHeight;
};

export const getSuggestedCanvasOrigin = (nodes: NodeFlowNode[]): XYPosition => {
  const topLevelNodes = nodes.filter((node) => !node.parentId);
  if (topLevelNodes.length === 0) return { x: 50, y: 60 };
  const maxY = Math.max(
    ...topLevelNodes.map((node) => {
      const height = typeof node.style?.height === "number" ? node.style.height : 320;
      return node.position.y + height;
    })
  );
  return { x: 50, y: maxY + 160 };
};

export const buildEpisodeShotNodeFlow = ({
  episode,
  origin,
}: {
  episode: Episode;
  origin: XYPosition;
}): { nodes: NodeFlowNode[]; links: NodeFlowLink[] } => {
  const stamp = Date.now();
  const nodes: NodeFlowNode[] = [];
  const links: NodeFlowLink[] = [];
  const topPadding = 120;
  const bottomPadding = 180;
  const shotGap = 160;
  const promptGap = 100;
  const groupWidth = 1720;
  const estimatedShotHeight = 340;
  const estimatedWanHeight = 560;

  let yCursor = topPadding;
  const layouts = episode.shots.map((shot) => {
    const shotOverview = buildShotOverview(shot);
    const soraHeight = estimateTextNodeHeight(shot.soraPrompt || shotOverview);
    const storyboardHeight = estimateTextNodeHeight(shot.storyboardPrompt || shotOverview);
    const promptBlockHeight = soraHeight + promptGap + storyboardHeight;
    const wanBlockHeight = estimatedWanHeight * 2 + promptGap;
    const blockHeight = Math.max(estimatedShotHeight, promptBlockHeight, wanBlockHeight);
    const layout = { y: yCursor, soraHeight, storyboardHeight, blockHeight };
    yCursor += blockHeight + shotGap;
    return layout;
  });

  const groupId = `group-episode-${episode.id}-${stamp}`;
  const groupHeight = yCursor + bottomPadding;

  nodes.push({
    id: groupId,
    type: "group",
    position: { x: origin.x, y: origin.y },
    data: {
      title: `EPISODE ${episode.id}: ${episode.title.toUpperCase()}`,
    } as GroupNodeData,
    style: { width: groupWidth, height: groupHeight },
  });

  episode.shots.forEach((shot, index) => {
    const layout = layouts[index];
    const suffix = `${episode.id}-${shot.id}-${stamp}`;
    const shotNodeId = `shot-${suffix}`;
    const soraPromptNodeId = `text-sora-${suffix}`;
    const storyboardPromptNodeId = `text-storyboard-${suffix}`;
    const wanVideoNodeId = `wan-video-${suffix}`;
    const wanImageNodeId = `wan-image-${suffix}`;
    const yPos = layout?.y ?? topPadding + index * (estimatedShotHeight + shotGap);
    const soraY = yPos;
    const storyboardY = yPos + (layout?.soraHeight ?? estimateTextNodeHeight(shot.soraPrompt || "")) + promptGap;

    nodes.push({
      id: shotNodeId,
      type: "shot",
      position: { x: 40, y: yPos },
      parentId: groupId,
      extent: "parent",
      data: {
        shotId: shot.id,
        duration: shot.duration,
        shotType: shot.shotType,
        focalLength: shot.focalLength,
        movement: shot.movement,
        composition: shot.composition,
        blocking: shot.blocking,
        dialogue: shot.dialogue,
        sound: shot.sound,
        lightingVfx: shot.lightingVfx,
        editingNotes: shot.editingNotes,
        notes: shot.notes,
        soraPrompt: shot.soraPrompt,
        storyboardPrompt: shot.storyboardPrompt,
        viewMode: "card",
      } as ShotNodeData,
    });

    nodes.push({
      id: soraPromptNodeId,
      type: "text",
      position: { x: 420, y: soraY },
      parentId: groupId,
      extent: "parent",
      data: {
        title: `Sora Prompt: ${shot.id}`,
        text: shot.soraPrompt || "",
        refId: `${episode.id}|${shot.id}`,
      } as TextNodeData,
    });

    nodes.push({
      id: storyboardPromptNodeId,
      type: "text",
      position: { x: 420, y: storyboardY },
      parentId: groupId,
      extent: "parent",
      data: {
        title: `Storyboard Prompt: ${shot.id}`,
        text: shot.storyboardPrompt || "",
        refId: `${episode.id}|${shot.id}`,
      } as TextNodeData,
    });

    nodes.push({
      id: wanVideoNodeId,
      type: "wanVideoGen",
      position: { x: 940, y: soraY },
      parentId: groupId,
      extent: "parent",
      data: {
        title: `WAN Vid: ${shot.id}`,
        inputImages: [],
        status: "idle",
        error: null,
        aspectRatio: "16:9",
      } as VideoGenNodeData,
    });

    nodes.push({
      id: wanImageNodeId,
      type: "wanImageGen",
      position: { x: 940, y: storyboardY },
      parentId: groupId,
      extent: "parent",
      data: {
        title: `WAN Img: ${shot.id}`,
        inputImages: [],
        outputImage: null,
        status: "idle",
        error: null,
        aspectRatio: "16:9",
      } as ImageGenNodeData,
    });

    links.push(
      {
        id: buildNodeFlowLinkId(shotNodeId, soraPromptNodeId, "text", "text"),
        source: shotNodeId,
        target: soraPromptNodeId,
        sourceHandle: "text",
        targetHandle: "text",
      },
      {
        id: buildNodeFlowLinkId(shotNodeId, storyboardPromptNodeId, "text", "text"),
        source: shotNodeId,
        target: storyboardPromptNodeId,
        sourceHandle: "text",
        targetHandle: "text",
      },
      {
        id: buildNodeFlowLinkId(soraPromptNodeId, wanVideoNodeId, "text", "text"),
        source: soraPromptNodeId,
        target: wanVideoNodeId,
        sourceHandle: "text",
        targetHandle: "text",
      },
      {
        id: buildNodeFlowLinkId(storyboardPromptNodeId, wanImageNodeId, "text", "text"),
        source: storyboardPromptNodeId,
        target: wanImageNodeId,
        sourceHandle: "text",
        targetHandle: "text",
      }
    );
  });

  return { nodes, links };
};
