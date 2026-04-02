import { buildNodeFlowLinkId } from "./links";
import { appendNodesAndLinksToNodeFlow } from "./mutations";
import type { NodeFlowLink, NodeFlowNode } from "../types";

type BuildViduReferenceDemoInput = {
  offset: { x: number; y: number };
  activeView?: string | null;
  state: {
    revision: number;
    nodes: NodeFlowNode[];
    links: NodeFlowLink[];
  };
  allocateNodeId: (nodeType: NodeFlowNode["type"]) => string;
};

export const buildViduReferenceDemoState = ({
  offset,
  activeView,
  state,
  allocateNodeId,
}: BuildViduReferenceDemoInput) => {
  const deselectedNodes = state.nodes.map((n) => ({ ...n, selected: false }));
  const promptText = "@Chef 和 @Guest 在一起吃火锅，并且旁白音说火锅大家都爱吃。";
  const textNodeId = allocateNodeId("text");
  const textNode: NodeFlowNode = {
    id: textNodeId,
    type: "text",
    position: { x: offset.x + 80, y: offset.y + 120 },
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
    id: allocateNodeId("imageInput"),
    type: "imageInput",
    position: { x: offset.x + 80 + (idx % 3) * 180, y: offset.y + 260 + Math.floor(idx / 3) * 180 },
    data: {
      image: img.url,
      filename: `ref-${idx + 1}.png`,
      dimensions: null,
      identityTag: img.identityTag,
      view: activeView || undefined,
    } as any,
  }));

  const viduNodeId = allocateNodeId("viduVideoGen");
  const viduNode: NodeFlowNode = {
    id: viduNodeId,
    type: "viduVideoGen",
    position: { x: offset.x + 620, y: offset.y + 260 },
    data: {
      title: "Vidu",
      mode: "subject",
      aspectRatio: "16:9",
      resolution: "720p",
      duration: 5,
      audioEnabled: true,
      offPeak: false,
      watermark: false,
      bgm: false,
      model: "viduq3",
      subjects: [],
      status: "idle",
      error: null,
      progressPercent: null,
      progressLabel: null,
      progressHint: null,
      taskState: null,
      taskSubmittedAt: null,
      processingStartedAt: null,
      lastCreditsCost: null,
      authProbeStatus: "idle",
      authProbeSummary: null,
      authProbeDetail: null,
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

  return appendNodesAndLinksToNodeFlow(
    {
      ...state,
      nodes: deselectedNodes,
    },
    [textNode, ...imageNodes, viduNode],
    newLinks
  );
};
