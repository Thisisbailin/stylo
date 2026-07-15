import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BaseNode } from "./BaseNode";
import { ImageInputNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import {
  At,
  CheckCircle,
  CloudArrowUp,
  ImageSquare,
  ShieldCheck,
  ShieldWarning,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import * as SeedanceVideoService from "../../services/seedanceVideoService";
import {
  collectOwnedStorageObjects,
  deleteOwnedStorageObjects,
  resolvePrivateStorageUrl,
  uploadStorageFile,
  type OwnedStorageObject,
} from "../nodeflow/storageObjects";
import {
  buildMentionIndex,
  buildMentionTargets,
  computeMentionData,
  MentionTarget,
  resolveMentionTarget,
  toSearch,
} from "../utils/entityBindings";

type Props = {
  id: string;
  data: ImageInputNodeData;
  selected?: boolean;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeAttr = (value: string) => escapeHtml(value).replace(/\n/g, "&#10;");

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getPlainText = (el: HTMLElement) => (el.innerText || "").replace(/\u200B/g, "").replace(/\r/g, "");

const getRangeTextLength = (range: Range) => {
  const fragment = range.cloneContents();
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
  let length = 0;
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      length += (node.textContent || "").length;
    } else if ((node as HTMLElement).tagName === "BR") {
      length += 1;
    }
    node = walker.nextNode();
  }
  return length;
};

const getCaretOffset = (el: HTMLElement) => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  if (!el.contains(range.startContainer)) return 0;
  const preRange = range.cloneRange();
  preRange.selectNodeContents(el);
  preRange.setEnd(range.startContainer, range.startOffset);
  return getRangeTextLength(preRange);
};

const setCaretOffset = (el: HTMLElement, offset: number) => {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
  let current = 0;
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      const next = current + text.length;
      if (offset <= next) {
        range.setStart(node, Math.max(0, offset - current));
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      current = next;
    } else if ((node as HTMLElement).tagName === "BR") {
      const next = current + 1;
      if (offset <= next) {
        range.setStartAfter(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      current = next;
    }
    node = walker.nextNode();
  }
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
};

const getSelectionOffsets = (el: HTMLElement, fallback: number) => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return { start: fallback, end: fallback };
  const range = selection.getRangeAt(0);
  if (!el.contains(range.startContainer)) return { start: fallback, end: fallback };
  const preStart = range.cloneRange();
  preStart.selectNodeContents(el);
  preStart.setEnd(range.startContainer, range.startOffset);
  const start = getRangeTextLength(preStart);
  const preEnd = range.cloneRange();
  preEnd.selectNodeContents(el);
  preEnd.setEnd(range.endContainer, range.endOffset);
  const end = getRangeTextLength(preEnd);
  return { start, end };
};

const getCaretRect = (el: HTMLElement) => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!el.contains(range.startContainer)) return null;
  if (!range.collapsed) return range.getBoundingClientRect();
  const rects = range.getClientRects();
  if (rects.length > 0) return rects[0];
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  const clone = range.cloneRange();
  clone.insertNode(marker);
  const rect = marker.getBoundingClientRect();
  marker.parentNode?.removeChild(marker);
  return rect;
};

const isPublicHttpsUrl = (value?: string | null) => typeof value === "string" && /^https:\/\//i.test(value);

type UploadedImage = {
  url: string;
  object: OwnedStorageObject | null;
};

const buildStorageFileName = (directory: string, filename: string, contentType: string) => {
  const mimeExtension = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
  const originalExtension = filename.split(".").pop()?.replace(/[^a-z0-9]/gi, "");
  const extension = originalExtension || mimeExtension;
  const safeBase = filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 48) || "stylo-image";
  return `${directory}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBase}.${extension}`;
};

const readImageDimensions = (url: string) => new Promise<{ width: number; height: number }>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
  image.onerror = () => reject(new Error("无法读取图片尺寸。"));
  image.src = url;
});

const uploadImageFile = async (file: File): Promise<UploadedImage> => {
  const contentType = file.type || "image/png";
  const uploaded = await uploadStorageFile(file, {
    fileName: buildStorageFileName("image-inputs", file.name, contentType),
    bucket: "assets",
    contentType,
  });
  return { url: uploaded.url, object: uploaded.object };
};

const uploadImageForAssetReview = async (
  source: string,
  filename?: string | null,
  forcePublicCopy = false
): Promise<UploadedImage> => {
  if (isPublicHttpsUrl(source) && !forcePublicCopy) return { url: source, object: null };

  const response = await fetch(source);
  if (!response.ok) throw new Error(`读取审核图片失败 (${response.status})。`);
  const blob = await response.blob();
  const contentType = blob.type || "image/png";
  const uploaded = await uploadStorageFile(blob, {
    fileName: buildStorageFileName("seedance-assets", filename || "stylo-aigc-portrait", contentType),
    bucket: "public-assets",
    contentType,
  });
  if (!isPublicHttpsUrl(uploaded.url)) {
    throw new Error("仿真人审核需要 public-assets 返回稳定 HTTPS publicUrl。");
  }
  return { url: uploaded.url, object: uploaded.object };
};

export const ImageInputNode: React.FC<Props> = ({ id, data, selected }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const lastHtmlRef = useRef<string>("");
  const pendingSelectionRef = useRef<number | null>(null);
  const skipNextCursorUpdateRef = useRef(false);
  const isLocalUpdateRef = useRef(false);
  const { updateNodeData, updateNodeStyle, getNodeById, nodeFlowContext } = useNodeFlowStore();

  const [labelDraft, setLabelDraft] = useState(data.label || "");
  const [cursorPos, setCursorPos] = useState(labelDraft.length);
  const [isFocused, setIsFocused] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ left: number; top: number } | null>(null);
  const [isReviewingAsset, setIsReviewingAsset] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const dimensionLabel = useMemo(() => {
    if (!data.dimensions?.width || !data.dimensions?.height) return null;
    return `${data.dimensions.width} × ${data.dimensions.height}`;
  }, [data.dimensions?.height, data.dimensions?.width]);
  const nodeTitle = data.title && data.title !== "Visual Input" ? data.title : "image";
  const displayImage = pendingPreviewUrl || data.image;

  const mentionTargets = useMemo(() => {
    const roles = nodeFlowContext?.roles || [];
    const targets = buildMentionTargets(roles);
    return {
      persons: targets.persons,
      scenes: targets.scenes,
      identities: targets.identities,
      all: targets.all,
    };
  }, [nodeFlowContext?.roles]);

  const mentionIndex = useMemo(() => {
    return buildMentionIndex(mentionTargets.all);
  }, [mentionTargets]);

  const resolveMention = useCallback(
    (name: string) => {
      return resolveMentionTarget(name, mentionIndex);
    },
    [mentionIndex]
  );

  const computeMentionMeta = useCallback(
    (text: string) => {
      return computeMentionData(text, mentionIndex);
    },
    [mentionIndex]
  );

  const mentionState = useMemo(() => {
    const pos = Math.min(cursorPos, labelDraft.length);
    const textBefore = labelDraft.slice(0, pos);
    const match = textBefore.match(/@([\w\u4e00-\u9fa5\-\/]*)$/);
    if (!match) return null;
    const prevChar = textBefore.length > 1 ? textBefore[textBefore.length - match[0].length - 1] : "";
    if (prevChar && !/\s|[\(\[\{,，。:：;；"“”'‘’]/.test(prevChar)) return null;
    return {
      query: match[1] || "",
      start: textBefore.lastIndexOf("@"),
      end: pos,
    };
  }, [labelDraft, cursorPos]);

  const filteredMentions = useMemo(() => {
    if (!mentionState) return mentionTargets;
    const query = toSearch(mentionState.query.trim());
    if (!query) return mentionTargets;
    const filterList = (list: MentionTarget[]) => list.filter((item) => item.search.includes(query));
    return {
      persons: filterList(mentionTargets.persons),
      scenes: filterList(mentionTargets.scenes),
      identities: filterList(mentionTargets.identities),
      all: filterList(mentionTargets.all),
    };
  }, [mentionState, mentionTargets]);

  const showMentionPicker = isFocused && !!mentionState;

  const renderedHtml = useMemo(() => {
    if (!labelDraft) return "";
    const parts: string[] = [];
    let lastIndex = 0;
    const regex = /@([\w\u4e00-\u9fa5\-\/]+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(labelDraft))) {
      const start = match.index;
      const end = start + match[0].length;
      parts.push(escapeHtml(labelDraft.slice(lastIndex, start)));
      const name = match[1];
      const hit = resolveMention(name);
      const kind = hit?.kind || "unknown";
      const status = hit ? "match" : "missing";
      const tooltipRaw = (hit?.detail || hit?.summary || "").trim();
      const tooltip = tooltipRaw ? escapeAttr(tooltipRaw) : "";
      const tooltipAttr = tooltip ? ` data-tooltip="${tooltip}"` : "";
      parts.push(
        `<span class=\"text-mention\" data-kind=\"${kind}\" data-status=\"${status}\"${tooltipAttr}>${escapeHtml(match[0])}</span>`
      );
      lastIndex = end;
    }
    parts.push(escapeHtml(labelDraft.slice(lastIndex)));
    return parts.join("").replace(/\n/g, "<br />");
  }, [labelDraft, resolveMention]);

  const updateCursor = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const pos = getCaretOffset(el);
    setCursorPos(pos);
  }, []);

  const commitLabel = useCallback(
    (next: string) => {
      const mentions = computeMentionMeta(next);
      const match = mentions.atMentions.find((m) => m.status === "match" && m.kind === "identity");
      const identityBinding = mentions.entityBindings.find((binding) => binding.status === "resolved" && binding.entityType === "identity");
      updateNodeData(id, {
        label: next,
        atMentions: mentions.atMentions,
        entityBindings: mentions.entityBindings,
        identityTag: match?.mention || match?.name,
        identityId: identityBinding?.identityId,
      });
    },
    [computeMentionMeta, id, updateNodeData]
  );

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const value = getPlainText(el);
    const pos = getCaretOffset(el);
    setLabelDraft(value);
    setCursorPos(pos);
    pendingSelectionRef.current = pos;
    if (!isComposingRef.current) {
      isLocalUpdateRef.current = true;
      commitLabel(value);
    }
  }, [commitLabel]);

  const insertMention = (target: MentionTarget) => {
    const start = mentionState ? mentionState.start : cursorPos;
    const end = mentionState ? mentionState.end : cursorPos;
    const before = labelDraft.slice(0, start);
    const after = labelDraft.slice(end);
    const insertion = `@${target.name} `;
    const next = `${before}${insertion}${after}`;
    const nextPos = start + insertion.length;
    setLabelDraft(next);
    setCursorPos(nextPos);
    pendingSelectionRef.current = nextPos;
    isLocalUpdateRef.current = true;
    commitLabel(next);
    requestAnimationFrame(() => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      setCaretOffset(el, nextPos);
    });
  };

  const updatePickerPosition = useCallback(() => {
    if (!showMentionPicker) return;
    const shell = shellRef.current;
    const editor = editorRef.current;
    if (!shell || !editor) return;
    const caretRect = getCaretRect(editor);
    const shellRect = shell.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const anchorLeft = caretRect ? caretRect.left : editorRect.left + 12;
    const anchorBottom = caretRect ? caretRect.bottom : editorRect.top + 22;
    const pickerWidth = 260;
    const left = clamp(anchorLeft - shellRect.left, 10, Math.max(10, shellRect.width - pickerWidth - 10));
    const top = anchorBottom - shellRect.top + 8;
    setPickerPos({ left, top });
  }, [showMentionPicker]);

  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el || isComposingRef.current) return;
    const html = renderedHtml;
    if (html !== lastHtmlRef.current) {
      el.innerHTML = html;
      lastHtmlRef.current = html;
    }
    if (document.activeElement === el) {
      const targetPos = pendingSelectionRef.current ?? cursorPos;
      setCaretOffset(el, Math.min(targetPos, labelDraft.length));
      pendingSelectionRef.current = null;
    }
    updatePickerPosition();
  }, [renderedHtml, labelDraft, cursorPos, updatePickerPosition]);

  useLayoutEffect(() => {
    if (!data.image) return;
    const node = getNodeById(id);
    if (!node?.style || node.style.height === undefined) return;
    updateNodeStyle(id, { height: undefined });
  }, [data.image, getNodeById, id, updateNodeStyle]);

  React.useEffect(() => {
    if (isComposingRef.current) return;
    if (isLocalUpdateRef.current) {
      isLocalUpdateRef.current = false;
      return;
    }
    const next = data.label || "";
    if (next === labelDraft) return;
    setLabelDraft(next);
    setCursorPos(next.length);
    pendingSelectionRef.current = next.length;
  }, [data.label, labelDraft]);

  React.useEffect(() => {
    if (showMentionPicker) return;
    setPickerPos(null);
  }, [showMentionPicker]);

  React.useEffect(() => {
    if (!showMentionPicker) return;
    const handleScroll = () => updatePickerPosition();
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [showMentionPicker, updatePickerPosition]);

  React.useEffect(() => {
    if (!data.storagePath) return;
    let cancelled = false;
    resolvePrivateStorageUrl({
      bucket: data.storageBucket || "assets",
      path: data.storagePath,
    })
      .then((url) => {
        if (!cancelled && url && url !== data.image) updateNodeData(id, { image: url });
      })
      .catch((error) => {
        if (!cancelled) setStorageMessage(error instanceof Error ? error.message : "图片访问地址刷新失败。");
      });
    return () => {
      cancelled = true;
    };
  }, [data.storageBucket, data.storagePath, id, updateNodeData]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setPendingPreviewUrl(previewUrl);
    setIsUploadingImage(true);
    setStorageMessage("正在保存至云端…");
    try {
      const [dimensions, uploaded] = await Promise.all([
        readImageDimensions(previewUrl),
        uploadImageFile(file),
      ]);
      const previousObjects = collectOwnedStorageObjects([{ data }]);
      if (previousObjects.length > 0) {
        try {
          await deleteOwnedStorageObjects(previousObjects);
        } catch (error) {
          await deleteOwnedStorageObjects(uploaded.object ? [uploaded.object] : []).catch(() => undefined);
          throw error;
        }
      }

      const baseName = file.name.replace(/\.[^/.]+$/, "");
      updateNodeData(id, {
        image: uploaded.url,
        filename: file.name,
        mimeType: file.type || "image/png",
        storageBucket: uploaded.object?.bucket || "assets",
        storagePath: uploaded.object?.path || null,
        dimensions,
        assetAuditStatus: "idle",
        assetAuditMessage: null,
        assetAuditCheckedAt: null,
        assetId: null,
        assetUri: null,
        assetGroupId: null,
        assetSourceUrl: null,
        assetSourceBucket: null,
        assetSourcePath: null,
        label: data.label || baseName,
      });
      setStorageMessage("已保存至私有云端存储");
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "图片上传失败。");
    } finally {
      setIsUploadingImage(false);
      setPendingPreviewUrl(null);
      URL.revokeObjectURL(previewUrl);
      e.target.value = "";
    }
  };

  const runSyntheticPortraitReview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data.image || isReviewingAsset) return;
    setIsReviewingAsset(true);
    updateNodeData(id, {
      assetAuditStatus: "uploading",
      assetAuditMessage: "正在准备可供官方审核的素材 URL...",
      assetAuditCheckedAt: null,
      assetId: null,
      assetUri: null,
    });
    try {
      const uploadedSource = await uploadImageForAssetReview(data.image, data.filename, !!data.storagePath);
      const previousReviewObjects = collectOwnedStorageObjects([{
        data: {
          assetSourceBucket: data.assetSourceBucket,
          assetSourcePath: data.assetSourcePath,
        },
      }]);
      if (previousReviewObjects.length > 0) {
        try {
          await deleteOwnedStorageObjects(previousReviewObjects);
        } catch (error) {
          await deleteOwnedStorageObjects(uploadedSource.object ? [uploadedSource.object] : []).catch(() => undefined);
          throw error;
        }
      }
      updateNodeData(id, {
        assetAuditStatus: "submitting",
        assetAuditMessage: "正在提交仿真人审核入库...",
        assetSourceUrl: uploadedSource.url,
        assetSourceBucket: uploadedSource.object?.bucket || null,
        assetSourcePath: uploadedSource.object?.path || null,
      });
      const created = await SeedanceVideoService.createSeedanceAsset({
        url: uploadedSource.url,
        name: data.filename || data.label || `stylo-aigc-${Date.now()}`,
        groupId: data.assetGroupId || null,
      });
      updateNodeData(id, {
        assetAuditStatus: created.status === "Active" ? "active" : "processing",
        assetAuditMessage:
          created.status === "Active" ? "仿真人审核通过，素材已入库。" : "素材已提交，正在等待官方审核处理...",
        assetId: created.assetId,
        assetUri: created.assetUri,
        assetGroupId: created.groupId,
        assetAuditCheckedAt: Date.now(),
      });

      if (created.status === "Active") return;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const current = await SeedanceVideoService.getSeedanceAsset(created.assetId);
        if (current.status === "Active") {
          updateNodeData(id, {
            assetAuditStatus: "active",
            assetAuditMessage: "仿真人审核通过，素材已入库。",
            assetId: current.assetId,
            assetUri: current.assetUri,
            assetGroupId: current.groupId || created.groupId,
            assetAuditCheckedAt: Date.now(),
          });
          return;
        }
        if (current.status === "Failed") {
          updateNodeData(id, {
            assetAuditStatus: "failed",
            assetAuditMessage: current.failedReason || "素材未通过官方仿真人审核，无法入库。",
            assetId: current.assetId,
            assetUri: current.assetUri,
            assetGroupId: current.groupId || created.groupId,
            assetAuditCheckedAt: Date.now(),
          });
          return;
        }
        updateNodeData(id, {
          assetAuditStatus: "processing",
          assetAuditMessage: `官方审核处理中... (${attempt + 1}/60)`,
          assetAuditCheckedAt: Date.now(),
        });
      }
      updateNodeData(id, {
        assetAuditStatus: "processing",
        assetAuditMessage: "仿真人审核仍在处理中，可稍后重新点击查询或直接等待。",
        assetAuditCheckedAt: Date.now(),
      });
    } catch (error: any) {
      updateNodeData(id, {
        assetAuditStatus: "error",
        assetAuditMessage: error?.message || "仿真人审核提交失败。",
        assetAuditCheckedAt: Date.now(),
      });
    } finally {
      setIsReviewingAsset(false);
    }
  };

  const isAssetAuditBusy = ["uploading", "submitting", "processing"].includes(data.assetAuditStatus || "");
  const assetAuditTone = data.assetAuditStatus === "active"
    ? "success"
    : data.assetAuditStatus === "failed" || data.assetAuditStatus === "error"
      ? "danger"
      : isAssetAuditBusy
        ? "progress"
        : "neutral";
  const AssetAuditIcon =
    data.assetAuditStatus === "active"
      ? CheckCircle
      : data.assetAuditStatus === "failed" || data.assetAuditStatus === "error"
        ? ShieldWarning
        : ShieldCheck;
  const assetAuditLabel = data.assetAuditStatus === "active"
    ? "已入库"
    : data.assetAuditStatus === "failed"
      ? "审核未通过"
      : data.assetAuditStatus === "error"
        ? "审核异常"
        : data.assetAuditStatus === "uploading"
          ? "上传审核副本"
          : data.assetAuditStatus === "submitting"
            ? "正在提交"
            : "审核中";

  return (
    <BaseNode
      title={nodeTitle}
      onTitleChange={(title) => updateNodeData(id, { title })}
      outputs={["image"]}
      selected={selected}
      variant="media"
      nodeType="imageInput"
    >
      <div ref={shellRef} className="image-input-shell relative w-full h-full">
        {displayImage ? (
          <div className="image-input-frame media-input-frame">
            <div className="image-input-media media-input-asset">
              <img
                src={displayImage}
                alt={data.filename || data.label || "图片节点预览"}
                className="image-input-img"
                draggable={false}
              />
            </div>
            <div
              className="image-input-control-rail nodrag nowheel"
              aria-label="图片节点操作"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="image-input-floating-label image-input-meta-label">
                <ImageSquare size={15} weight="duotone" aria-hidden="true" />
                <div className="image-input-meta-copy">
                  <div
                    ref={editorRef}
                    className="image-input-editor nodrag"
                    contentEditable
                    suppressContentEditableWarning
                    data-placeholder={data.filename ? "Add a caption" : "Name"}
                    onInput={handleInput}
                    onBeforeInput={(e) => {
                      const native = e.nativeEvent as InputEvent;
                      if (!native || typeof native.inputType !== "string") return;
                      if (native.inputType === "insertParagraph" || native.inputType === "insertLineBreak") {
                        e.preventDefault();
                      }
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.currentTarget as HTMLDivElement).blur();
                      }
                    }}
                    onKeyUp={() => {
                      if (skipNextCursorUpdateRef.current) {
                        skipNextCursorUpdateRef.current = false;
                        return;
                      }
                      updateCursor();
                      updatePickerPosition();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateCursor();
                      updatePickerPosition();
                    }}
                    onFocus={() => {
                      setIsFocused(true);
                      updateCursor();
                      updatePickerPosition();
                    }}
                    onBlur={() => {
                      setIsFocused(false);
                      if (!isComposingRef.current && labelDraft !== data.label) {
                        isLocalUpdateRef.current = true;
                        commitLabel(labelDraft);
                      }
                    }}
                    onCompositionStart={() => {
                      isComposingRef.current = true;
                    }}
                    onCompositionEnd={() => {
                      isComposingRef.current = false;
                      handleInput();
                    }}
                  />
                  <div className="image-input-meta-secondary">
                    <span>{data.filename || "untitled-image"}</span>
                    {dimensionLabel ? <span>{dimensionLabel}</span> : null}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingImage}
                className="image-input-floating-label image-input-action-label"
              >
                {isUploadingImage
                  ? <CloudArrowUp size={15} weight="duotone" aria-hidden="true" />
                  : <UploadSimple size={15} weight="duotone" aria-hidden="true" />}
                <span>{isUploadingImage ? "正在上传" : "替换图片"}</span>
              </button>

              <button
                type="button"
                onClick={runSyntheticPortraitReview}
                disabled={!data.image || isReviewingAsset || isAssetAuditBusy || isUploadingImage}
                className="image-input-floating-label image-input-action-label"
                title="提交到 Seedance 仿真人素材审核；通过后保存 asset:// 引用。"
              >
                <ShieldCheck size={15} weight="duotone" aria-hidden="true" />
                <span>{isReviewingAsset || isAssetAuditBusy ? "审核处理中" : "仿真人审核"}</span>
              </button>

              {(storageMessage || data.storagePath) ? (
                <div className="image-input-floating-label image-input-status-label" data-tone={storageMessage?.includes("失败") ? "danger" : "neutral"}>
                  {storageMessage?.includes("失败")
                    ? <WarningCircle size={15} weight="duotone" aria-hidden="true" />
                    : <CloudArrowUp size={15} weight="duotone" aria-hidden="true" />}
                  <span>{storageMessage || "Supabase · private"}</span>
                </div>
              ) : null}

              {(data.assetAuditStatus && data.assetAuditStatus !== "idle") || data.assetAuditMessage ? (
                <div className="image-input-floating-label image-input-status-label" data-tone={assetAuditTone}>
                  <AssetAuditIcon size={15} weight="duotone" aria-hidden="true" />
                  <span>
                    <strong>{assetAuditLabel}</strong>
                    {data.assetAuditMessage ? <small>{data.assetAuditMessage}</small> : null}
                    {data.assetUri ? <small className="image-input-asset-uri">{data.assetUri}</small> : null}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="image-input-empty"
          >
            <div className="image-input-empty-icon">
              <ImageSquare size={22} weight="duotone" />
            </div>
            <div className="image-input-empty-copy">
              <div className="image-input-empty-kicker">Image Input</div>
              <div className="image-input-empty-title">Drop or choose image</div>
              <div className="image-input-empty-subtitle">JPG, PNG, WebP · click to upload</div>
            </div>
            <div className="image-input-empty-cta">Select File</div>
          </button>
        )}

        {showMentionPicker && pickerPos && (
          <div
            className="mention-picker animate-in fade-in slide-in-from-top-1 absolute z-30"
            style={{ left: pickerPos.left, top: pickerPos.top, width: 260 }}
          >
            <div className="mention-picker-header">
              <At size={10} /> 数据绑定
            </div>
            {filteredMentions.persons.length > 0 && (
              <div className="mention-picker-section">
                <div className="mention-picker-title">人物身份证</div>
                <div className="mention-picker-grid">
                  {filteredMentions.persons.map((f) => (
                    <button
                      key={`identity-person-${f.name}-${f.identityId}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertMention(f)}
                      className="mention-picker-item"
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filteredMentions.scenes.length > 0 && (
              <div className="mention-picker-section">
                <div className="mention-picker-title">场景身份证</div>
                <div className="mention-picker-grid">
                  {filteredMentions.scenes.map((z) => (
                    <button
                      key={`identity-scene-${z.name}-${z.identityId}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertMention(z)}
                      className="mention-picker-item"
                    >
                      {z.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filteredMentions.identities.length === 0 && (
              <div className="mention-picker-section">
                <div className="mention-picker-title">未找到可绑定身份证</div>
              </div>
            )}
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
    </BaseNode>
  );
};
