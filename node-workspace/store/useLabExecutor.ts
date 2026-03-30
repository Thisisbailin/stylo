import { useWorkflowStore } from "./workflowStore";
import * as MultimodalService from "../../services/multimodalService";
import * as SoraService from "../../services/soraService";
import * as SeedanceVideoService from "../../services/seedanceVideoService";
import * as ViduService from "../../services/viduService";
import * as WuyinkejiService from "../../services/wuyinkejiService";
import * as SeedreamService from "../../services/seedreamService";
import * as WanService from "../../services/wanService";
import {
  INITIAL_VIDU_CONFIG,
  QWEN_WAN_IMAGE_ENDPOINT,
  QWEN_WAN_IMAGE_MODEL,
  QWEN_WAN_VIDEO_ENDPOINT,
  QWEN_WAN_REFERENCE_VIDEO_FLASH_MODEL,
  QWEN_WAN_REFERENCE_VIDEO_MODEL,
  QWEN_WAN_VIDEO_MODEL,
  SEEDANCE_DEFAULT_BASE_URL,
  SEEDANCE_DEFAULT_MODEL,
} from "../../constants";
import { useCallback } from "react";
import { DesignAssetItem, ProjectRoleIdentity, SeedanceModel } from "../../types";
import { buildApiUrl } from "../../utils/api";
import type { EntityBinding } from "../types";

type MentionData = {
  name: string;
  status: "match" | "missing";
  kind?: "identity" | "unknown";
  identityId?: string;
  mention?: string;
  aliasValue?: string;
};

type ProjectReferenceTargetData = {
  category: "identity";
  refId: string;
  label?: string;
};

type ProjectReferenceAsset = {
  category: "identity";
  refId: string;
  label: string;
  url: string;
  createdAt: number;
};

type BoundIdentityRef = {
  rawText: string;
  identityId: string;
  mention: string;
};

const parseAtMentions = (text: string): string[] => {
  const matches = text.match(/@([\w\u4e00-\u9fa5\-\/]+)/g) || [];
  const names = matches.map((m) => m.slice(1));
  const unique: string[] = [];
  names.forEach((n) => {
    if (!unique.includes(n)) unique.push(n);
  });
  return unique;
};

const escapeRegex = (str: string) => str.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

const uploadReferenceFile = async (source: string, options?: { bucket?: string; prefix?: string }) => {
  const response = await fetch(source);
  const blob = await response.blob();
  const contentType = blob.type || "image/png";
  const ext = contentType.split("/")[1] || "png";
  const fileName = `${options?.prefix || "wan-inputs/"}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const bucket = options?.bucket || "assets";

  const signedRes = await fetch(buildApiUrl("/api/upload-url"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, bucket, contentType }),
  });
  if (!signedRes.ok) {
    const err = await signedRes.text();
    throw new Error(`Reference upload URL error (${signedRes.status}): ${err}`);
  }
  const signedData = await signedRes.json();
  if (!signedData?.signedUrl) {
    throw new Error("Reference upload failed: missing signedUrl.");
  }

  const uploadRes = await fetch(signedData.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Reference upload failed (${uploadRes.status}): ${err}`);
  }

  if (signedData.publicUrl) return signedData.publicUrl as string;
  if (signedData.path) {
    const downloadRes = await fetch(buildApiUrl("/api/download-url"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: signedData.path, bucket: signedData.bucket || bucket }),
    });
    if (!downloadRes.ok) {
      const err = await downloadRes.text();
      throw new Error(`Reference download URL error (${downloadRes.status}): ${err}`);
    }
    const downloadData = await downloadRes.json();
    if (downloadData?.signedUrl) return downloadData.signedUrl as string;
  }

  throw new Error("Reference upload failed: no accessible URL returned.");
};

const normalizeWanImages = async (sources: string[]) => {
  const results: string[] = [];
  for (const src of sources) {
    if (!src) continue;
    if (src.startsWith("http://") || src.startsWith("https://")) {
      results.push(src);
      continue;
    }
    if (src.startsWith("data:") || src.startsWith("blob:")) {
      const uploaded = await uploadReferenceFile(src, { bucket: "assets", prefix: "wan-inputs/" });
      results.push(uploaded);
      continue;
    }
    results.push(src);
  }
  return results;
};

const normalizeWanAudio = async (source?: string) => {
  if (!source) return undefined;
  if (source.startsWith("http://") || source.startsWith("https://")) return source;
  if (source.startsWith("data:") || source.startsWith("blob:")) {
    return uploadReferenceFile(source, { bucket: "assets", prefix: "wan-audio/" });
  }
  try {
    const downloadRes = await fetch(buildApiUrl("/api/download-url"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: source, bucket: "assets" }),
    });
    if (!downloadRes.ok) {
      const err = await downloadRes.text();
      throw new Error(err);
    }
    const data = await downloadRes.json();
    if (data?.signedUrl) return data.signedUrl as string;
  } catch (e) {
    console.warn("Failed to resolve audio URL", e);
  }
  return source;
};

const normalizeWanReferenceVideos = async (sources: string[]) => {
  const results: string[] = [];
  for (const src of sources) {
    if (!src) continue;
    if (src.startsWith("http://") || src.startsWith("https://")) {
      results.push(src);
      continue;
    }
    if (src.startsWith("data:") || src.startsWith("blob:")) {
      const uploaded = await uploadReferenceFile(src, { bucket: "assets", prefix: "wan-reference-video/" });
      results.push(uploaded);
      continue;
    }
    results.push(src);
  }
  return results;
};

const normalizeSeedanceVideos = async (sources: string[]) => {
  const results: string[] = [];
  for (const src of sources) {
    if (!src) continue;
    if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("asset://")) {
      results.push(src);
      continue;
    }
    if (src.startsWith("data:") || src.startsWith("blob:")) {
      results.push(await uploadReferenceFile(src, { bucket: "assets", prefix: "seedance-reference-video/" }));
      continue;
    }
    results.push(src);
  }
  return results;
};

const normalizeSeedanceImages = async (sources: string[]) => {
  const results: string[] = [];
  for (const src of sources) {
    if (!src) continue;
    if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("asset://")) {
      results.push(src);
      continue;
    }
    if (src.startsWith("data:") || src.startsWith("blob:")) {
      results.push(await uploadReferenceFile(src, { bucket: "assets", prefix: "seedance-reference-image/" }));
      continue;
    }
    try {
      const downloadRes = await fetch(buildApiUrl("/api/download-url"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: src, bucket: "assets" }),
      });
      if (downloadRes.ok) {
        const downloadData = await downloadRes.json();
        if (downloadData?.signedUrl) {
          results.push(downloadData.signedUrl as string);
          continue;
        }
      }
    } catch (e) {
      console.warn("Failed to resolve Seedance image URL", e);
    }
    results.push(src);
  }
  return results;
};

const normalizeSeedanceAudios = async (sources: string[]) => {
  const results: string[] = [];
  for (const src of sources) {
    if (!src) continue;
    if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("asset://")) {
      results.push(src);
      continue;
    }
    if (src.startsWith("data:audio/") || src.startsWith("blob:")) {
      results.push(await uploadReferenceFile(src, { bucket: "assets", prefix: "seedance-reference-audio/" }));
      continue;
    }
    try {
      const downloadRes = await fetch(buildApiUrl("/api/download-url"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: src, bucket: "assets" }),
      });
      if (downloadRes.ok) {
        const downloadData = await downloadRes.json();
        if (downloadData?.signedUrl) {
          results.push(downloadData.signedUrl as string);
          continue;
        }
      }
    } catch (e) {
      console.warn("Failed to resolve Seedance audio URL", e);
    }
    results.push(src);
  }
  return results;
};

const mapWanVideoSize = (aspectRatio?: string, resolution?: string) => {
  const ratio = (aspectRatio || "16:9").trim();
  const res = (resolution || "720P").toUpperCase();
  const sizeMap: Record<string, Record<string, string>> = {
    "480P": {
      "16:9": "832*480",
      "9:16": "480*832",
      "1:1": "624*624",
    },
    "720P": {
      "16:9": "1280*720",
      "9:16": "720*1280",
      "1:1": "960*960",
      "4:3": "1088*832",
      "3:4": "832*1088",
    },
    "1080P": {
      "16:9": "1920*1080",
      "9:16": "1080*1920",
      "1:1": "1440*1440",
      "4:3": "1632*1248",
      "3:4": "1248*1632",
    },
  };
  const normalizedRatio = ["16:9", "9:16", "1:1", "4:3", "3:4"].includes(ratio) ? ratio : "16:9";
  return sizeMap[res]?.[normalizedRatio] || "1280*720";
};

const makeProjectRefKey = (category: "identity", refId: string) => `${category}:${refId}`;

const buildProjectReferenceIndex = (designAssets: DesignAssetItem[]) => {
  const latestByKey = new Map<string, ProjectReferenceAsset>();
  designAssets.forEach((asset) => {
    if (!asset?.url || !asset?.refId) return;
    const key = makeProjectRefKey(asset.category, asset.refId);
    const current = latestByKey.get(key);
    if (!current || (asset.createdAt || 0) >= current.createdAt) {
      latestByKey.set(key, {
        category: asset.category,
        refId: asset.refId,
        label: asset.label || asset.refId,
        url: asset.url,
        createdAt: asset.createdAt || 0,
      });
    }
  });
  return latestByKey;
};

const resolveMentionReferenceAsset = (
  mention: MentionData | EntityBinding,
  roles: ProjectRoleIdentity[],
  latestByKey: Map<string, ProjectReferenceAsset>
) => {
  const identityId = "entityType" in mention ? mention.identityId : mention.identityId;
  if (identityId) {
    const exact = latestByKey.get(makeProjectRefKey("identity", identityId));
    if (exact) return exact;
  }

  const fallbackMention = (("mention" in mention ? mention.mention : undefined) || ("name" in mention ? mention.name : mention.rawText.replace(/^@/, "")) || "").replace(/^@/, "").toLowerCase();
  if (!fallbackMention) return undefined;
  const role = roles.find((item) => item.mention.toLowerCase() === fallbackMention || item.displayName.toLowerCase() === `@${fallbackMention}`);
  if (role) {
    const exact = latestByKey.get(makeProjectRefKey("identity", role.id));
    if (exact) return exact;
  }
  return Array.from(latestByKey.values()).find((asset) => asset.label.toLowerCase().includes(fallbackMention));
};

const resolvePromptProjectReferences = (
  prompt: string,
  atMentions: MentionData[] | undefined,
  entityBindings: EntityBinding[] | undefined,
  roles: ProjectRoleIdentity[],
  latestByKey: Map<string, ProjectReferenceAsset>
) => {
  const refs: ProjectReferenceAsset[] = [];
  const slotByKey = new Map<string, number>();
  let rewrittenPrompt = prompt;

  const candidates = (entityBindings?.length
    ? entityBindings.filter((binding) => binding.status === "resolved" && binding.entityType === "identity")
    : (atMentions || []).filter((mention) => mention.status === "match" && mention.kind === "identity")) as Array<MentionData | EntityBinding>;

  candidates
    .forEach((mention) => {
      const candidate = resolveMentionReferenceAsset(mention, roles, latestByKey);
      if (!candidate) return;
      const key = makeProjectRefKey(candidate.category, candidate.refId);
      let slot = slotByKey.get(key);
      if (!slot) {
        refs.push(candidate);
        slot = refs.length;
        slotByKey.set(key, slot);
      }
      const rawText = "rawText" in mention ? mention.rawText : `@${mention.name}`;
      rewrittenPrompt = rewrittenPrompt.replace(
        new RegExp(escapeRegex(rawText), "g"),
        `character${slot}`
      );
    });

  return { rewrittenPrompt, refs };
};

const resolveBoundIdentities = (
  entityBindings: EntityBinding[] | undefined,
  atMentions: MentionData[] | undefined
): BoundIdentityRef[] => {
  const resolved: BoundIdentityRef[] = [];
  const pushUnique = (item: BoundIdentityRef | null | undefined) => {
    if (!item) return;
    if (resolved.find((entry) => entry.identityId === item.identityId)) return;
    resolved.push(item);
  };

  (entityBindings || []).forEach((binding) => {
    if (binding.status !== "resolved") return;
    if (binding.entityType === "identity" && binding.identityId) {
      pushUnique({
        rawText: binding.rawText,
        identityId: binding.identityId,
        mention: binding.mention || binding.rawText.replace(/^@/, ""),
      });
    }
  });

  if (resolved.length) return resolved;

  (atMentions || []).forEach((mention) => {
    if (mention.status !== "match" || mention.kind !== "identity" || !mention.identityId) return;
    pushUnique({
      rawText: `@${mention.name}`,
      identityId: mention.identityId,
      mention: mention.mention || mention.name,
    });
  });

  return resolved;
};

export const useLabExecutor = () => {
  const store = useWorkflowStore();
  const config = store.appConfig;

  const extractImageUrl = (content: string): string | null => {
    const match = content.match(/!\[[^\]]*\]\(([^)]+)\)/);
    return match ? match[1] : null;
  };

  const runImageGen = useCallback(async (nodeId: string) => {
    const node = store.getNodeById(nodeId);
    if (!node) return;
    const { images, text: connectedText, atMentions, entityBindings, imageRefs } = store.getConnectedInputs(nodeId);
    const data = node.data as any; // Cast for easier access to new fields
    const text = (connectedText || "").trim();
    const isWanImageNode = node.type === "wanImageGen";

    if (!text && images.length === 0) {
      store.updateNodeData(nodeId, { status: "error", error: "Missing text input (connect a text node)." });
      return;
    }

    if (!config) {
      store.updateNodeData(nodeId, { status: "error", error: "Configuration not loaded." });
      return;
    }

    store.updateNodeData(nodeId, { status: "loading", error: null });
    try {
      const aspectRatio = data.aspectRatio || "1:1";
      const modelOverride = isWanImageNode ? QWEN_WAN_IMAGE_MODEL : data.model;

      // Use node-specific model or fallback to config
      const configToUse = {
        ...config.multimodalConfig,
        model: modelOverride || config.multimodalConfig.model
      };
      if (isWanImageNode) {
        configToUse.provider = "wan";
        configToUse.baseUrl = QWEN_WAN_IMAGE_ENDPOINT;
        configToUse.apiKey = "";
      }

      if (configToUse.provider === 'wuyinkeji') {
        // --- Asynchronous Flow (NanoBanana-pro) ---
        const refImage = images.find((src) => src.startsWith("http")) || undefined;
        const { id } = await WuyinkejiService.submitImageTask(text || "Generate an image", configToUse, {
          aspectRatio,
          inputImageUrl: refImage
        });

        store.updateNodeData(nodeId, { status: "loading", taskId: id, error: null });

        const maxAttempts = 60;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const result = await WuyinkejiService.checkImageTaskStatus(id, configToUse);
          if (result.status === "succeeded") {
            store.updateNodeData(nodeId, {
              status: "complete",
              outputImage: result.url,
              error: null,
              model: configToUse.model // store used model for reference
            });

            // Add to global history for reuse
            store.addToGlobalHistory({
              type: "image",
              src: result.url!,
              prompt: text || "Image Input",
              model: configToUse.model,
              aspectRatio
            });
            return;
          }
          if (result.status === "failed") {
            store.updateNodeData(nodeId, { status: "error", error: result.errorMsg || "Image generation failed." });
            return;
          }
          // Wait 5 seconds between polls
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        store.updateNodeData(nodeId, { status: "error", error: "Image generation timed out." });
        return;
      }

      if (configToUse.provider === 'seedream') {
        const refImage = images.find((src) => src.startsWith("http")) || undefined;
        store.updateNodeData(nodeId, { status: "loading", error: null });

        try {
          const url = await SeedreamService.generateSeedreamImage(text || "Generate an image", configToUse, {
            aspectRatio,
            inputImageUrl: refImage
          });

          store.updateNodeData(nodeId, {
            status: "complete",
            outputImage: url,
            error: null,
            model: configToUse.model
          });

          store.addToGlobalHistory({
            type: "image",
            src: url,
            prompt: text || "Image Input",
            model: configToUse.model,
            aspectRatio
          });
        } catch (e: any) {
          store.updateNodeData(nodeId, { status: "error", error: e.message || "Seedream generation failed." });
        }
        return;
      }

      if (configToUse.provider === 'wan') {
        if (!text) {
          store.updateNodeData(nodeId, { status: "error", error: "Wan 图片需要提示词。" });
          return;
        }
        const normalizedImages = await normalizeWanImages(images);
        const { id, url } = await WanService.submitWanImageTask(text || "Generate an image", configToUse, {
          aspectRatio,
          inputImages: normalizedImages,
          enableInterleave: data.enableInterleave,
          outputCount: data.outputCount,
          maxImages: data.maxImages,
          seed: data.seed,
          watermark: data.watermark,
          size: data.size,
        });

        if (url) {
          store.updateNodeData(nodeId, {
            status: "complete",
            outputImage: url,
            error: null,
            model: configToUse.model,
          });
          store.addToGlobalHistory({
            type: "image",
            src: url,
            prompt: text || "Image Input",
            model: configToUse.model,
            aspectRatio,
          });
          return;
        }

        if (!id) {
          store.updateNodeData(nodeId, { status: "error", error: "Wan 任务创建失败。" });
          return;
        }

        store.updateNodeData(nodeId, { status: "loading", taskId: id, error: null });

        const maxAttempts = 60;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const result = await WanService.checkWanTaskStatus(id);
          if (result.status === "succeeded") {
            store.updateNodeData(nodeId, {
              status: "complete",
              outputImage: result.url,
              error: null,
              model: configToUse.model,
            });
            if (result.url) {
              store.addToGlobalHistory({
                type: "image",
                src: result.url,
                prompt: text || "Image Input",
                model: configToUse.model,
                aspectRatio,
              });
            }
            return;
          }
          if (result.status === "failed") {
            store.updateNodeData(nodeId, { status: "error", error: result.errorMsg || "Wan 图像生成失败。" });
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        store.updateNodeData(nodeId, { status: "error", error: "Wan 图像生成超时。" });
        return;
      }

      // --- Standard Flow (OpenAI compatible) ---
      let promptContent = text || "Generate an image based on the input";

      // Removed Style Preset injection as per user request for clean multimodal prompts
      promptContent = `${promptContent}\n\n[Aspect Ratio]: ${aspectRatio}`;

      if (images.length > 0) {
        const refs = images.map((img: string, i: number) => `![ref ${i}](${img})`).join('\n');
        promptContent = `${promptContent}\n\n${refs}`;
      }

      const res = await MultimodalService.sendMessage(
        [{ role: "user", content: promptContent }],
        configToUse
      );

      console.log('--- AI Full Response ---');
      console.log(res);
      console.log('------------------------');

      const url = extractImageUrl(res.content) || res.content.trim();

      // Basic validation if it's a URL or base64
      if (!url || (!url.startsWith('http') && !url.startsWith('data:image'))) {
        throw new Error("No image URL could be extracted from response. Response was: " + res.content.substring(0, 100));
      }

      store.updateNodeData(nodeId, {
        status: "complete",
        outputImage: url,
        error: null,
        model: configToUse.model // store used model for reference
      });

      // Add to global history for reuse
      store.addToGlobalHistory({
        type: "image",
        src: url,
        prompt: text || "Image Input",
        model: configToUse.model,
        aspectRatio
      });

    } catch (e: any) {
      store.updateNodeData(nodeId, { status: "error", error: e.message || "Image gen failed" });
    }
  }, [config?.multimodalConfig, store]);

  const runViduVideoGen = useCallback(async (nodeId: string) => {
    const node = store.getNodeById(nodeId);
    if (!node || !config) return;
    const { images, text: connectedText, atMentions, entityBindings, imageRefs } = store.getConnectedInputs(nodeId);
    const data = node.data as any;
    const prompt = (connectedText || "").trim();

    if (!prompt) {
      store.updateNodeData(nodeId, { status: "error", error: "Missing text input (connect a text node)." });
      return;
    }

    const viduConfig = {
      baseUrl: INITIAL_VIDU_CONFIG.baseUrl,
      defaultModel: INITIAL_VIDU_CONFIG.defaultModel || "viduq2-pro",
    };
    const fixedModel = viduConfig.defaultModel;

    const mode = data.mode || "audioVideo";
    const useCharacters = data.useCharacters !== false;

    const labContext = store.labContext;
    const resolvedIdentities = resolveBoundIdentities(entityBindings, atMentions as MentionData[] | undefined);
    const mentions = resolvedIdentities.length ? resolvedIdentities.map((item) => item.mention) : parseAtMentions(prompt);
    const resolvedIdentityByMention = new Map(resolvedIdentities.map((item) => [item.mention.toLowerCase(), item]));

    const identityImageMap = new Map<string, string[]>();
    (imageRefs || []).forEach((ref) => {
      const key = ref.identityId || (ref.identityTag ? ref.identityTag.toLowerCase() : "");
      if (key) {
        const arr = identityImageMap.get(key) || [];
        arr.push(ref.src);
        identityImageMap.set(key, arr);
      }
    });

    const chunkImagesForSubjects = (count: number) => {
      if (!images.length || count === 0) return Array.from({ length: count }, () => [] as string[]);
      const chunkSize = Math.max(1, Math.ceil(images.length / count));
      const buckets: string[][] = [];
      for (let i = 0; i < count; i++) {
        buckets.push(images.slice(i * chunkSize, (i + 1) * chunkSize));
      }
      return buckets;
    };

    const defaultSubjectImages = [
      "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/image2video.png",
      "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png",
      "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-2.png",
    ];

    const resolvedSubjects =
      useCharacters && mentions.length > 0
        ? (() => {
          const buckets = chunkImagesForSubjects(mentions.length);
          return mentions.map((m, idx) => {
            const hit = resolvedIdentityByMention.get(m.toLowerCase());
            const mapped = identityImageMap.get(hit?.identityId || m.toLowerCase()) || [];
            return {
              id: hit?.identityId || m,
              images: (mapped.length ? mapped : buckets[idx]) || [],
              voiceId: data.voiceId || "professional_host",
            };
          });
        })()
        : (data.subjects && data.subjects.length > 0)
          ? data.subjects
          : (() => {
            const fallbackBuckets = chunkImagesForSubjects(3);
            const result: { id?: string; images: string[]; voiceId?: string }[] = [];
            for (let i = 0; i < fallbackBuckets.length; i++) {
              result.push({
                id: `subject${i + 1}`,
                images: fallbackBuckets[i],
                voiceId: data.voiceId || "professional_host",
              });
            }
            return result.length
              ? result
              : [
                {
                  id: "subject1",
                  images: [
                    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/image2video.png",
                    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png",
                    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-2.png",
                  ],
                  voiceId: data.voiceId || "professional_host",
                },
              ];
          })();

    // Guarantee each subject has at least one image (Vidu API rejects empty arrays)
    const hydratedSubjects = resolvedSubjects.map((s, idx) => {
      const imgs = (s.images || []).filter(Boolean);
      if (imgs.length) return s;
      const pool = images.length ? images : defaultSubjectImages;
      const fallbackImg = pool[idx % pool.length];
      return { ...s, images: fallbackImg ? [fallbackImg] : defaultSubjectImages };
    });

    const visualImages = images.length
      ? images
      : [
        "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png",
        "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-2.png",
        "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-3.png",
      ];

    if (mode === "videoOnly" && visualImages.length === 0) {
      store.updateNodeData(nodeId, { status: "error", error: "需要至少一张参考图" });
      return;
    }

    const promptForVidu =
      useCharacters && mentions.length > 0
        ? mentions.reduce((acc, name, idx) => {
          const reg = new RegExp(`@${escapeRegex(name)}`, "g");
          return acc.replace(reg, `@${idx + 1}`);
        }, prompt)
        : prompt;

    store.updateNodeData(nodeId, { status: "loading", error: null });

    try {
      const request = mode === "audioVideo"
        ? {
          mode: "audioVideo" as const,
          audioParams: {
            model: fixedModel,
            subjects: hydratedSubjects,
            prompt: promptForVidu,
            duration: data.duration ?? 10,
            audio: true,
            offPeak: data.offPeak !== false,
          },
        }
        : {
          mode: "videoOnly" as const,
          visualParams: {
            model: fixedModel,
            images: visualImages,
            prompt: promptForVidu,
            duration: data.duration ?? 10,
            aspectRatio: data.aspectRatio || "16:9",
            resolution: data.resolution || "1080p",
            movementAmplitude: data.movementAmplitude || "auto",
            seed: data.seed ?? 0,
            offPeak: data.offPeak !== false,
            audio: false,
          },
        };

      const { taskId } = await ViduService.createReferenceVideo(request as any, viduConfig);

      store.updateNodeData(nodeId, { status: "loading", videoId: taskId, videoUrl: undefined, error: null });

      const maxAttempts = 60;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const result = await ViduService.fetchTaskResult(taskId, viduConfig);
        if (result.state === "success") {
          const url = result.creations?.[0]?.url || result.creations?.[0]?.watermarked_url;
          store.updateNodeData(nodeId, { status: "complete", videoUrl: url, error: null });
          return;
        }
        if (result.state === "failed") {
          store.updateNodeData(nodeId, { status: "error", error: result.err_code || "Vidu 生成失败" });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      store.updateNodeData(nodeId, { status: "error", error: "Vidu 生成超时" });
    } catch (e: any) {
      store.updateNodeData(nodeId, { status: "error", error: e.message || "Vidu 提交失败" });
    }
  }, [config, store]);

  const runSeedanceVideoGen = useCallback(async (nodeId: string) => {
    const node = store.getNodeById(nodeId);
    if (!node || !config) return;

    const { images, audios, text: connectedText } = store.getConnectedInputs(nodeId);
    const data = node.data as any;
    const prompt = (connectedText || "").trim();
    const referenceVideos = Array.isArray(data.referenceVideos) ? data.referenceVideos.filter(Boolean) : [];

    if (images.length === 0 && referenceVideos.length === 0) {
      store.updateNodeData(nodeId, {
        status: "error",
        error: "Seedance 多模态参考生视频至少需要 1 个参考图片或参考视频。",
      });
      return;
    }

    store.updateNodeData(nodeId, { status: "loading", error: null });

    try {
      const normalizedVideos = await normalizeSeedanceVideos(referenceVideos.slice(0, 3));
      const normalizedAudios = await normalizeSeedanceAudios(audios.slice(0, 3));
      const normalizedImages = await normalizeSeedanceImages(images.filter(Boolean).slice(0, 9));

      const content: Array<Record<string, any>> = [];
      if (prompt) {
        content.push({ type: "text", text: prompt });
      }
      normalizedImages.forEach((url) => {
        content.push({
          type: "image_url",
          image_url: { url },
          role: "reference_image",
        });
      });
      normalizedVideos.forEach((url) => {
        content.push({
          type: "video_url",
          video_url: { url },
          role: "reference_video",
        });
      });
      normalizedAudios.forEach((url) => {
        content.push({
          type: "audio_url",
          audio_url: { url },
          role: "reference_audio",
        });
      });

      const configToUse = {
        ...config.videoConfig,
        baseUrl: SEEDANCE_DEFAULT_BASE_URL,
        model: (data.model || SEEDANCE_DEFAULT_MODEL) as SeedanceModel,
      };

      const task = await SeedanceVideoService.createSeedanceTask(
        {
          model: configToUse.model,
          content,
          generateAudio: data.generateAudio !== false,
          resolution: data.resolution || "720p",
          ratio: data.ratio || "adaptive",
          duration:
            typeof data.duration === "number" && Number.isFinite(data.duration)
              ? Math.max(4, Math.min(15, Math.round(data.duration)))
              : 5,
          watermark: data.watermark === true,
        },
        configToUse
      );

      store.updateNodeData(nodeId, {
        status: "loading",
        videoId: task.id,
        videoUrl: undefined,
        error: null,
      });

      const maxAttempts = 60;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const result = await SeedanceVideoService.getSeedanceTask(task.id, configToUse);
        if (result.status === "succeeded") {
          store.updateNodeData(nodeId, {
            status: "complete",
            videoUrl: result.url,
            error: null,
          });
          return;
        }
        if (result.status === "failed") {
          store.updateNodeData(nodeId, {
            status: "error",
            error: result.errorMsg || "Seedance 生成失败。",
          });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      store.updateNodeData(nodeId, { status: "error", error: "Seedance 生成超时。" });
    } catch (e: any) {
      store.updateNodeData(nodeId, {
        status: "error",
        error: e?.message || "Seedance 提交失败。",
      });
    }
  }, [config, store]);

  const runVideoGen = useCallback(async (nodeId: string) => {
    const node = store.getNodeById(nodeId);
    if (!node || !config) return;
    if (node.type === "viduVideoGen") {
      return runViduVideoGen(nodeId);
    }
    if (node.type === "seedanceVideoGen") {
      return runSeedanceVideoGen(nodeId);
    }
    const { images, text: connectedText, atMentions, entityBindings } = store.getConnectedInputs(nodeId);
    const data = node.data as any;
    const prompt = (connectedText || "").trim();
    const isWanReferenceVideoNode = node.type === "wanReferenceVideoGen";
    const referenceImages = Array.isArray(data.referenceImages) ? data.referenceImages.filter(Boolean) : [];
    const referenceVideos = Array.isArray(data.referenceVideos) ? data.referenceVideos.filter(Boolean) : [];
    const projectReferenceTargets = Array.isArray(data.projectReferenceTargets)
      ? (data.projectReferenceTargets as ProjectReferenceTargetData[])
      : [];
    const hasManualReferenceAssets = referenceImages.length > 0 || referenceVideos.length > 0 || projectReferenceTargets.length > 0;

    if (images.length === 0 && !prompt && !(isWanReferenceVideoNode && hasManualReferenceAssets)) {
      store.updateNodeData(nodeId, { status: "error", error: "Missing text input (prompt required)." });
      return;
    }

    const isWanVideo = (config.videoConfig.baseUrl || "").includes("/api/v1/services/aigc/video-generation/");
    const isWanVideoNode = node.type === "wanVideoGen";
    if (!config.videoConfig.baseUrl || (!config.videoConfig.apiKey && !isWanVideo && !isWanVideoNode && !isWanReferenceVideoNode)) {
      store.updateNodeData(nodeId, { status: "error", error: "Missing video API configuration." });
      return;
    }

    if ((isWanVideo || isWanVideoNode) && images.length === 0) {
      store.updateNodeData(nodeId, { status: "error", error: "Wan 视频需要至少一张参考图。" });
      return;
    }
    if ((isWanVideo || isWanVideoNode) && !prompt) {
      store.updateNodeData(nodeId, { status: "error", error: "Wan 视频需要提示词。" });
      return;
    }
    if (isWanReferenceVideoNode && referenceVideos.length === 0 && referenceImages.length === 0 && images.length === 0) {
      store.updateNodeData(nodeId, { status: "error", error: "Wan 参考生视频需要至少 1 个角色参考（图像或视频）。" });
      return;
    }
    if (isWanReferenceVideoNode && !prompt) {
      store.updateNodeData(nodeId, { status: "error", error: "Wan 参考生视频需要提示词。" });
      return;
    }

    store.updateNodeData(nodeId, { status: "loading", error: null });

    try {
      const normalizedImages = (isWanVideo || isWanVideoNode || isWanReferenceVideoNode) ? await normalizeWanImages(images) : images;
      const refImage =
        normalizedImages.find((src) => src.startsWith("http")) ||
        ((isWanVideo || isWanVideoNode) ? normalizedImages[0] : undefined);
      const params: any = {
        aspectRatio: data.aspectRatio || "16:9",
        duration: data.duration || "5s",
        quality: data.quality || "standard",
        inputImageUrl: refImage,
      };
      if (isWanVideo || isWanVideoNode) {
        const fallbackResolution = data.quality === "high" ? "1080P" : "720P";
        const resolution = data.resolution || fallbackResolution;
        params.size = mapWanVideoSize(data.aspectRatio, resolution);
        params.shotType = data.shotType;
        params.watermark = data.watermark;
        params.seed = data.seed;
        if (data.audioEnabled && data.audioUrl) {
          const audioUrl = data.audioUrl.trim();
          params.audioUrl = await normalizeWanAudio(audioUrl);
        }
      }
      let promptForRequest = prompt;
      if (isWanReferenceVideoNode) {
        const latestProjectRefs = buildProjectReferenceIndex(store.labContext.designAssets || []);
        const roles = store.labContext.context.roles || [];
        const { rewrittenPrompt, refs: promptDrivenRefs } = resolvePromptProjectReferences(
          prompt,
          atMentions as MentionData[] | undefined,
          entityBindings,
          roles,
          latestProjectRefs
        );
        promptForRequest = rewrittenPrompt;
        const normalizedVideos = await normalizeWanReferenceVideos(referenceVideos);
        const normalizedReferenceImages = await normalizeWanImages(referenceImages);
        const explicitProjectRefs = projectReferenceTargets
          .map((target) => latestProjectRefs.get(makeProjectRefKey(target.category, target.refId)))
          .filter((item): item is ProjectReferenceAsset => !!item);
        const dedupedProjectRefUrls = Array.from(
          new Set([
            ...promptDrivenRefs.map((item) => item.url),
            ...explicitProjectRefs.map((item) => item.url),
          ])
        );
        const cappedVideos = normalizedVideos.slice(0, 3);
        const imageSlotBudget = Math.max(0, 5 - cappedVideos.length);
        const combinedImageReferences = [
          ...dedupedProjectRefUrls,
          ...normalizedReferenceImages,
          ...normalizedImages,
        ];
        const cappedImageReferences = Array.from(new Set(combinedImageReferences)).slice(0, imageSlotBudget);
        params.size = mapWanVideoSize(data.aspectRatio, data.resolution || "720P");
        params.shotType = data.shotType;
        params.watermark = data.watermark;
        params.seed = data.seed;
        params.audioEnabled = data.model === QWEN_WAN_REFERENCE_VIDEO_FLASH_MODEL ? data.audioEnabled !== false : undefined;
        params.referenceUrls = [...cappedVideos, ...cappedImageReferences];
        if (params.referenceUrls.length === 0) {
          throw new Error("Wan 参考生视频未找到可用的项目卡片或引用素材。");
        }
      }

      // Use node-specific model or fallback to config
      const configToUse = {
        ...config.videoConfig,
        model: data.model || config.videoConfig.model
      };
      if (isWanVideoNode) {
        configToUse.baseUrl = QWEN_WAN_VIDEO_ENDPOINT;
        configToUse.model = QWEN_WAN_VIDEO_MODEL;
        configToUse.apiKey = "";
      }
      if (isWanReferenceVideoNode) {
        configToUse.baseUrl = QWEN_WAN_VIDEO_ENDPOINT;
        configToUse.model =
          data.model === QWEN_WAN_REFERENCE_VIDEO_FLASH_MODEL
            ? QWEN_WAN_REFERENCE_VIDEO_FLASH_MODEL
            : QWEN_WAN_REFERENCE_VIDEO_MODEL;
        configToUse.apiKey = "";
      }

      if (isWanVideo || isWanVideoNode) {
        const { id, url } = await WanService.submitWanVideoTask(prompt || "Animate this", configToUse, params);
        if (url) {
          store.updateNodeData(nodeId, { status: "complete", videoUrl: url, error: null });
          return;
        }
        if (!id) {
          store.updateNodeData(nodeId, { status: "error", error: "Wan 视频任务创建失败。" });
          return;
        }

        store.updateNodeData(nodeId, { status: "loading", videoId: id, videoUrl: undefined, error: null });

        const maxAttempts = 60;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const result = await WanService.checkWanTaskStatus(id);
          if (result.status === "succeeded") {
            store.updateNodeData(nodeId, { status: "complete", videoUrl: result.url, error: null });
            return;
          }
          if (result.status === "failed") {
            store.updateNodeData(nodeId, { status: "error", error: result.errorMsg || "Wan 视频生成失败。" });
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        store.updateNodeData(nodeId, { status: "error", error: "Wan 视频生成超时。" });
        return;
      }

      if (isWanReferenceVideoNode) {
        const { id, url } = await WanService.submitWanReferenceVideoTask(promptForRequest || "Animate this", configToUse, params);
        if (url) {
          store.updateNodeData(nodeId, { status: "complete", videoUrl: url, error: null });
          return;
        }
        if (!id) {
          store.updateNodeData(nodeId, { status: "error", error: "Wan 参考生视频任务创建失败。" });
          return;
        }

        store.updateNodeData(nodeId, { status: "loading", videoId: id, videoUrl: undefined, error: null });

        const maxAttempts = 60;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const result = await WanService.checkWanTaskStatus(id);
          if (result.status === "succeeded") {
            store.updateNodeData(nodeId, { status: "complete", videoUrl: result.url, error: null });
            return;
          }
          if (result.status === "failed") {
            store.updateNodeData(nodeId, { status: "error", error: result.errorMsg || "Wan 参考生视频生成失败。" });
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        store.updateNodeData(nodeId, { status: "error", error: "Wan 参考生视频生成超时。" });
        return;
      }

      const { id } = await SoraService.submitSoraTask(prompt || "Animate this", configToUse, params);

      store.updateNodeData(nodeId, { status: "loading", videoId: id, videoUrl: undefined, error: null });

      const maxAttempts = 60;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const result = await SoraService.checkSoraTaskStatus(id, configToUse);
        if (result.status === "succeeded") {
          store.updateNodeData(nodeId, { status: "complete", videoUrl: result.url, error: null });
          return;
        }
        if (result.status === "failed") {
          store.updateNodeData(nodeId, { status: "error", error: result.errorMsg || "Video generation failed." });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      store.updateNodeData(nodeId, { status: "error", error: "Video generation timed out." });
    } catch (e: any) {
      store.updateNodeData(nodeId, { status: "error", error: e.message || "Video submit failed" });
    }
  }, [config?.videoConfig, runSeedanceVideoGen, runViduVideoGen, store]);

  return {
    runImageGen,
    runVideoGen,
  };
};
