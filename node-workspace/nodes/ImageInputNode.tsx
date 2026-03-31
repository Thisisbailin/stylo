import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BaseNode } from "./BaseNode";
import { ImageInputNodeData } from "../types";
import { useWorkflowStore } from "../store/workflowStore";
import { AtSign, ImagePlus, Upload } from "lucide-react";
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

export const ImageInputNode: React.FC<Props> = ({ id, data, selected }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const lastHtmlRef = useRef<string>("");
  const pendingSelectionRef = useRef<number | null>(null);
  const skipNextCursorUpdateRef = useRef(false);
  const isLocalUpdateRef = useRef(false);
  const { updateNodeData, updateNodeStyle, getNodeById, labContext } = useWorkflowStore();

  const [labelDraft, setLabelDraft] = useState(data.label || "");
  const [cursorPos, setCursorPos] = useState(labelDraft.length);
  const [isFocused, setIsFocused] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ left: number; top: number } | null>(null);
  const dimensionLabel = useMemo(() => {
    if (!data.dimensions?.width || !data.dimensions?.height) return null;
    return `${data.dimensions.width} × ${data.dimensions.height}`;
  }, [data.dimensions?.height, data.dimensions?.width]);
  const nodeTitle = data.title && data.title !== "Visual Input" ? data.title : "image";

  const mentionTargets = useMemo(() => {
    const roles = labContext?.context?.roles || [];
    const targets = buildMentionTargets(roles);
    return {
      persons: targets.persons,
      scenes: targets.scenes,
      identities: targets.identities,
      all: targets.all,
    };
  }, [labContext?.context?.roles]);

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

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        updateNodeData(id, {
          image: result,
          filename: file.name,
          dimensions: { width: img.width, height: img.height },
          label: data.label || baseName,
        });
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <BaseNode title={nodeTitle} onTitleChange={(title) => updateNodeData(id, { title })} outputs={["image"]} selected={selected} variant="media">
      <div ref={shellRef} className="image-input-shell relative w-full h-full">
        {data.image ? (
          <div className="image-input-frame">
            <div className="image-input-media" onClick={() => fileInputRef.current?.click()}>
              <img src={data.image} alt="preview" className="image-input-img" />
            </div>
            <div className="image-input-caption">
              <div className="image-input-label">
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
              </div>
              {dimensionLabel ? <div className="image-input-dimension">{dimensionLabel}</div> : null}
            </div>
            <div className="image-input-actions">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="node-button h-9 px-3 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] nodrag"
              >
                <Upload size={12} />
                Replace
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="image-input-empty"
          >
            <div className="image-input-empty-icon">
              <ImagePlus size={22} />
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
              <AtSign size={10} /> 数据绑定
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
