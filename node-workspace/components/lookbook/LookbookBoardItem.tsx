import React, { memo, useEffect, useRef, useState } from "react";
import { motion, useDragControls, type PanInfo } from "framer-motion";
import {
  ArrowsOutSimple,
  DotsSix,
  FileText,
  Image as ImageIcon,
  MusicNotes,
  VideoCamera,
} from "@phosphor-icons/react";
import type { LookbookLayout } from "../../types";
import type { LookbookBoardItem } from "../../../utils/lookbookWorkspace";
import {
  fitLookbookLayoutToPage,
  getLookbookPageIndexForLayout,
  sanitizeLookbookLayout,
} from "../../../utils/lookbookWorkspace";

type Props = {
  item: LookbookBoardItem;
  boardRef: React.RefObject<HTMLDivElement | null>;
  worldHeight: number;
  pageCount: number;
  selected: boolean;
  index: number;
  onSelect: (nodeId: string) => void;
  onCommitLayout: (nodeId: string, layout: LookbookLayout) => void;
  onCommitText: (nodeId: string, patch: { title?: string; text?: string }) => void;
  onItemDragStart: (nodeId: string) => void;
  onItemDragMove: (nodeId: string, point: { x: number; y: number }) => void;
  onItemDragEnd: (nodeId: string, layout: LookbookLayout) => void;
};

const readString = (value: unknown) => typeof value === "string" ? value : "";
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const nodeTitle = (item: LookbookBoardItem) =>
  readString(item.node.data.title) || readString(item.node.data.label) || readString(item.node.data.filename) || "未命名素材";

const sameLayout = (left: LookbookLayout, right: LookbookLayout) =>
  left.x === right.x && left.y === right.y && left.width === right.width &&
  left.height === right.height && left.rotation === right.rotation &&
  left.zIndex === right.zIndex && left.fit === right.fit;

export const LookbookBoardItemView = memo(function LookbookBoardItemView({
  item,
  boardRef,
  worldHeight,
  pageCount,
  selected,
  index,
  onSelect,
  onCommitLayout,
  onCommitText,
  onItemDragStart,
  onItemDragMove,
  onItemDragEnd,
}: Props) {
  const itemRef = useRef<HTMLElement | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const dragControls = useDragControls();
  const title = nodeTitle(item);
  const [titleDraft, setTitleDraft] = useState(title);
  const [textDraft, setTextDraft] = useState(readString(item.node.data.text || item.node.data.content));

  useEffect(() => setTitleDraft(title), [title]);
  useEffect(() => setTextDraft(readString(item.node.data.text || item.node.data.content)), [item.node.data.content, item.node.data.text]);
  useEffect(() => () => {
    resizeCleanupRef.current?.();
    if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
  }, []);

  const commitTextDraft = () => {
    const currentTitle = nodeTitle(item);
    const currentText = readString(item.node.data.text || item.node.data.content);
    if (titleDraft === currentTitle && textDraft === currentText) return;
    onCommitText(item.node.id, {
      ...(titleDraft !== currentTitle ? { title: titleDraft.trim() || "视觉笔记" } : {}),
      ...(textDraft !== currentText ? { text: textDraft } : {}),
    });
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const boardWidth = boardRef.current?.getBoundingClientRect().width || 1;
    const proposed = sanitizeLookbookLayout({
      ...item.layout,
      x: clamp(item.layout.x + info.offset.x / boardWidth, 0, 1 - item.layout.width),
      y: clamp(item.layout.y + info.offset.y / boardWidth, 0, worldHeight - item.layout.height),
    });
    const inferredPage = Math.min(
      Math.max(0, pageCount - 1),
      getLookbookPageIndexForLayout(item.spreadIndex, proposed)
    );
    onItemDragEnd(item.node.id, fitLookbookLayoutToPage(proposed, inferredPage));
  };

  const beginResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(item.node.id);
    resizeCleanupRef.current?.();
    const boardWidth = boardRef.current?.getBoundingClientRect().width || 1;
    const startX = event.clientX;
    const startY = event.clientY;
    const startLayout = item.layout;
    let nextLayout = startLayout;

    const applyPreview = () => {
      resizeFrameRef.current = null;
      if (!itemRef.current) return;
      itemRef.current.style.width = `${nextLayout.width * 100}%`;
      itemRef.current.style.height = `${(nextLayout.height / worldHeight) * 100}%`;
    };
    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const deltaWidth = (pointerEvent.clientX - startX) / boardWidth;
      const deltaHeight = (pointerEvent.clientY - startY) / boardWidth;
      const width = clamp(startLayout.width + deltaWidth, 0.1, Math.min(0.72, 1 - startLayout.x));
      const naturalHeight = width / item.aspectRatio;
      const height = item.node.type === "imageInput" || item.node.type === "videoInput"
        ? clamp(naturalHeight, 0.08, Math.max(0.08, worldHeight - startLayout.y))
        : clamp(startLayout.height + deltaHeight, 0.1, Math.max(0.1, worldHeight - startLayout.y));
      nextLayout = sanitizeLookbookLayout({ ...startLayout, width, height });
      if (resizeFrameRef.current === null) resizeFrameRef.current = requestAnimationFrame(applyPreview);
    };
    const finishResize = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      resizeCleanupRef.current = null;
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      onCommitLayout(item.node.id, nextLayout);
    };

    resizeCleanupRef.current = finishResize;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize, { once: true });
    window.addEventListener("pointercancel", finishResize, { once: true });
  };

  const isTextCard = item.node.type === "text";
  const isSticker = item.node.type === "imageInput" && item.node.data.hasAlpha === true;
  const imageSource = item.node.type === "imageInput" ? readString(item.node.data.image) : "";
  const videoSource = item.node.type === "videoInput" ? readString(item.node.data.video) : "";
  const audioSource = item.node.type === "audioInput" ? readString(item.node.data.audio) : "";

  return (
    <motion.article
      ref={itemRef}
      className={`lookbook-spread-item is-${item.node.type} ${selected ? "is-selected" : ""} ${isSticker ? "is-sticker" : ""}`}
      data-node-id={item.node.id}
      data-fit={item.layout.fit}
      style={{
        left: `${item.layout.x * 100}%`,
        top: `${(item.layout.y / worldHeight) * 100}%`,
        width: `${item.layout.width * 100}%`,
        height: `${(item.layout.height / worldHeight) * 100}%`,
        zIndex: item.layout.zIndex,
        rotate: item.layout.rotation,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ type: "spring", stiffness: 190, damping: 25, delay: Math.min(index, 6) * 0.025 }}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={boardRef}
      whileDrag={{ scale: 1.01 }}
      onDragStart={() => {
        onSelect(item.node.id);
        onItemDragStart(item.node.id);
      }}
      onDrag={(_event, info) => onItemDragMove(item.node.id, info.point)}
      onDragEnd={handleDragEnd}
      onPointerDown={() => onSelect(item.node.id)}
      aria-label={title}
    >
      <button
        type="button"
        className="lookbook-spread-item__grab"
        aria-label={`移动 ${title}`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelect(item.node.id);
          dragControls.start(event);
        }}
      ><DotsSix size={14} weight="bold" /></button>

      {item.node.type === "imageInput" ? (
        <figure className="lookbook-spread-item__figure">
          <div className="lookbook-spread-item__media">
            {imageSource ? <img src={imageSource} alt={title} draggable={false} /> : <div className="lookbook-spread-item__placeholder"><ImageIcon size={25} /><span>图片节点为空</span></div>}
          </div>
          {!isSticker ? <figcaption>{title}</figcaption> : null}
        </figure>
      ) : item.node.type === "videoInput" ? (
        <figure className="lookbook-spread-item__figure">
          <div className="lookbook-spread-item__media is-video">
            {videoSource ? <video src={videoSource} controls preload="metadata" /> : <div className="lookbook-spread-item__placeholder"><VideoCamera size={25} /><span>视频节点为空</span></div>}
          </div>
          <figcaption>{title}</figcaption>
        </figure>
      ) : item.node.type === "audioInput" ? (
        <div className="lookbook-spread-item__audio">
          <MusicNotes size={21} weight="light" />
          <strong>{title}</strong>
          {audioSource ? <audio src={audioSource} controls preload="metadata" /> : <span>音频节点为空</span>}
        </div>
      ) : isTextCard ? (
        <div className="lookbook-spread-item__text" onPointerDown={(event) => event.stopPropagation()}>
          <input value={titleDraft} aria-label="文本标题" onChange={(event) => setTitleDraft(event.target.value)} onBlur={commitTextDraft} />
          <textarea
            value={textDraft}
            aria-label="文本正文"
            placeholder="写下造型、材质、光线或镜头意图…"
            onChange={(event) => setTextDraft(event.target.value)}
            onBlur={commitTextDraft}
          />
        </div>
      ) : (
        <div className="lookbook-spread-item__document">
          <FileText size={18} weight="light" />
          <strong>{title}</strong>
          <p>{readString(item.node.data.content || item.node.data.text) || "这份档案尚未写入内容。"}</p>
        </div>
      )}

      {selected ? (
        <button type="button" className="lookbook-spread-item__resize" aria-label={`调整 ${title} 大小`} onPointerDown={beginResize}>
          <ArrowsOutSimple size={12} weight="bold" />
        </button>
      ) : null}
    </motion.article>
  );
}, (previous, next) =>
  previous.item.node === next.item.node &&
  previous.item.spreadIndex === next.item.spreadIndex &&
  sameLayout(previous.item.layout, next.item.layout) &&
  previous.item.aspectRatio === next.item.aspectRatio &&
  previous.worldHeight === next.worldHeight &&
  previous.pageCount === next.pageCount &&
  previous.selected === next.selected &&
  previous.index === next.index &&
  previous.boardRef === next.boardRef &&
  previous.onSelect === next.onSelect &&
  previous.onCommitLayout === next.onCommitLayout &&
  previous.onCommitText === next.onCommitText &&
  previous.onItemDragStart === next.onItemDragStart &&
  previous.onItemDragMove === next.onItemDragMove &&
  previous.onItemDragEnd === next.onItemDragEnd
);
