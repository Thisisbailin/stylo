import React, { memo, useEffect, useRef, useState } from "react";
import { motion, useDragControls, type PanInfo } from "framer-motion";
import {
  ArrowsOutSimple,
  DotsSixVertical,
  FileText,
  Image as ImageIcon,
  MusicNotes,
  VideoCamera,
} from "@phosphor-icons/react";
import type { LookbookLayout } from "../../types";
import type { LookbookBoardItem } from "../../../utils/lookbookWorkspace";
import { sanitizeLookbookLayout } from "../../../utils/lookbookWorkspace";

type Props = {
  item: LookbookBoardItem;
  boardRef: React.RefObject<HTMLDivElement | null>;
  worldHeight: number;
  selected: boolean;
  index: number;
  onSelect: (nodeId: string) => void;
  onCommitLayout: (nodeId: string, layout: LookbookLayout) => void;
  onCommitText: (nodeId: string, patch: { title?: string; text?: string }) => void;
};

const readString = (value: unknown) => typeof value === "string" ? value : "";
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const nodeTitle = (item: LookbookBoardItem) =>
  readString(item.node.data.title) || readString(item.node.data.label) || readString(item.node.data.filename) || "未命名素材";

const itemKindLabel = (item: LookbookBoardItem) => {
  if (item.node.type === "imageInput") return "IMAGE";
  if (item.node.type === "videoInput") return "MOTION";
  if (item.node.type === "audioInput") return "AUDIO";
  return item.node.type === "text" ? "TEXT CARD" : "DOCUMENT";
};

const sameLayout = (left: LookbookLayout, right: LookbookLayout) =>
  left.x === right.x && left.y === right.y && left.width === right.width &&
  left.height === right.height && left.rotation === right.rotation &&
  left.zIndex === right.zIndex && left.fit === right.fit;

export const LookbookBoardItemView = memo(function LookbookBoardItemView({
  item,
  boardRef,
  worldHeight,
  selected,
  index,
  onSelect,
  onCommitLayout,
  onCommitText,
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
    onCommitLayout(item.node.id, sanitizeLookbookLayout({
      ...item.layout,
      x: clamp(item.layout.x + info.offset.x / boardWidth, 0, 1 - item.layout.width),
      y: Math.max(0, item.layout.y + info.offset.y / boardWidth),
    }));
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
      const width = clamp(startLayout.width + deltaWidth, 0.14, Math.min(0.72, 1 - startLayout.x));
      const height = item.node.type === "imageInput" || item.node.type === "videoInput"
        ? clamp(width / item.aspectRatio, 0.1, 1.2)
        : clamp(startLayout.height + deltaHeight, 0.12, 1.2);
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
  const isDocument = item.node.type === "mdText";
  const isAlpha = item.node.type === "imageInput" && item.node.data.hasAlpha === true;
  const imageSource = item.node.type === "imageInput" ? readString(item.node.data.image) : "";
  const videoSource = item.node.type === "videoInput" ? readString(item.node.data.video) : "";
  const audioSource = item.node.type === "audioInput" ? readString(item.node.data.audio) : "";

  return (
    <motion.article
      ref={itemRef}
      className={`lookbook-board-item is-${item.node.type} ${selected ? "is-selected" : ""} ${isAlpha ? "has-alpha" : ""}`}
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 190, damping: 25, delay: Math.min(index, 8) * 0.035 }}
      layout="position"
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={boardRef}
      whileDrag={{ scale: 1.012 }}
      onDragStart={() => onSelect(item.node.id)}
      onDragEnd={handleDragEnd}
      onPointerDown={() => onSelect(item.node.id)}
      aria-label={`${title}，${itemKindLabel(item)}`}
    >
      <div className="lookbook-board-item__chrome">
        <button
          type="button"
          className="lookbook-board-item__drag"
          aria-label={`移动 ${title}`}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelect(item.node.id);
            dragControls.start(event);
          }}
        >
          <DotsSixVertical size={15} weight="bold" />
        </button>
        <span>{itemKindLabel(item)}</span>
        {!isTextCard ? <strong>{title}</strong> : null}
      </div>

      {item.node.type === "imageInput" ? (
        <div className="lookbook-board-item__media">
          {imageSource ? (
            <img src={imageSource} alt={title} draggable={false} />
          ) : (
            <div className="lookbook-board-item__placeholder"><ImageIcon size={28} /><span>图片节点为空</span></div>
          )}
        </div>
      ) : item.node.type === "videoInput" ? (
        <div className="lookbook-board-item__media is-video">
          {videoSource ? <video src={videoSource} controls preload="metadata" /> : <div className="lookbook-board-item__placeholder"><VideoCamera size={28} /><span>视频节点为空</span></div>}
        </div>
      ) : item.node.type === "audioInput" ? (
        <div className="lookbook-board-item__audio">
          <MusicNotes size={24} weight="light" />
          <strong>{title}</strong>
          {audioSource ? <audio src={audioSource} controls preload="metadata" /> : <span>音频节点为空</span>}
        </div>
      ) : isTextCard ? (
        <div className="lookbook-board-item__text-card" onPointerDown={(event) => event.stopPropagation()}>
          <input
            value={titleDraft}
            aria-label="文本卡标题"
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={commitTextDraft}
          />
          <textarea
            value={textDraft}
            aria-label="文本卡正文"
            placeholder="写下造型、光线、材质或镜头意图…"
            onChange={(event) => setTextDraft(event.target.value)}
            onBlur={commitTextDraft}
          />
        </div>
      ) : (
        <div className="lookbook-board-item__document">
          <FileText size={20} weight="light" />
          <strong>{title}</strong>
          <pre>{readString(item.node.data.content || item.node.data.text) || "这份档案尚未写入内容。"}</pre>
        </div>
      )}

      {selected ? (
        <button
          type="button"
          className="lookbook-board-item__resize"
          aria-label={`调整 ${title} 大小`}
          onPointerDown={beginResize}
        >
          <ArrowsOutSimple size={13} weight="bold" />
        </button>
      ) : null}
    </motion.article>
  );
}, (previous, next) =>
  previous.item.node === next.item.node &&
  sameLayout(previous.item.layout, next.item.layout) &&
  previous.item.aspectRatio === next.item.aspectRatio &&
  previous.worldHeight === next.worldHeight &&
  previous.selected === next.selected &&
  previous.index === next.index &&
  previous.boardRef === next.boardRef &&
  previous.onSelect === next.onSelect &&
  previous.onCommitLayout === next.onCommitLayout &&
  previous.onCommitText === next.onCommitText
);
