import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CaretLeft,
  CaretRight,
  GridFour,
  ImageSquare,
  NotePencil,
  Plus,
  SpinnerGap,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type { ProjectData } from "../../../types";
import type { LookbookLayout } from "../../types";
import {
  LOOKBOOK_SPREAD_HEIGHT,
  addLookbookPage,
  addLookbookImageAssets,
  addLookbookTextCard,
  getLookbookPageCount,
  getLookbookSpreadCount,
  moveLookbookNodeToSpread,
  projectLookbookBoardItems,
  reflowLookbookLayouts,
  sanitizeLookbookLayout,
  updateLookbookNodeLayout,
  updateLookbookTextCard,
} from "../../../utils/lookbookWorkspace";
import { isLookbookNodeType } from "../../../utils/lookbookIdentities";
import { inspectLookbookImageFiles } from "../../lookbook/imageFiles";
import { saveActiveFlowIntoProjects } from "../../foundation/scaffold";
import { LookbookBoardItemView } from "./LookbookBoardItem";
import "../../styles/lookbook-studio.css";

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  identityNodeId: string;
  onClose: () => void;
};

type ContextMenuState = {
  x: number;
  y: number;
  nodeId: string | null;
};

type BookView =
  | { kind: "front" }
  | { kind: "spread"; index: number }
  | { kind: "back" };

const readString = (value: unknown) => typeof value === "string" ? value : "";

const createLocalNodeId = (prefix: string) => {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${suffix}`;
};

export const LookbookStudioPanel: React.FC<Props> = ({
  projectData,
  setProjectData,
  identityNodeId,
  onClose,
}) => {
  const spreadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [bookView, setBookView] = useState<BookView>({ kind: "front" });
  const [turnDirection, setTurnDirection] = useState<-1 | 0 | 1>(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const identityNode = useMemo(
    () => projectData.flow?.flowNodes?.find((node) => node.id === identityNodeId && isLookbookNodeType(node.type)),
    [identityNodeId, projectData.flow?.flowNodes]
  );
  const identityId = readString(identityNode?.data.identityId);
  const identity = useMemo(
    () => (projectData.roles || []).find((role) => role.id === identityId),
    [identityId, projectData.roles]
  );
  const items = useMemo(
    () => projectLookbookBoardItems(projectData, identityNodeId),
    [identityNodeId, projectData]
  );
  const pageCount = useMemo(
    () => getLookbookPageCount(projectData, identityNodeId),
    [identityNodeId, projectData]
  );
  const spreadCount = useMemo(() => getLookbookSpreadCount(items, pageCount), [items, pageCount]);
  const spreadIndex = bookView.kind === "spread"
    ? Math.max(0, Math.min(spreadCount - 1, bookView.index))
    : bookView.kind === "back"
      ? Math.max(0, spreadCount - 1)
      : 0;
  const visibleItems = useMemo(
    () => items.filter((item) => item.spreadIndex === spreadIndex),
    [items, spreadIndex]
  );
  const selectedItem = useMemo(
    () => items.find((item) => item.node.id === selectedNodeId) || null,
    [items, selectedNodeId]
  );
  const contextItem = useMemo(
    () => items.find((item) => item.node.id === contextMenu?.nodeId) || null,
    [contextMenu?.nodeId, items]
  );

  useEffect(() => {
    if (selectedNodeId && !items.some((item) => item.node.id === selectedNodeId)) setSelectedNodeId(null);
  }, [items, selectedNodeId]);

  useEffect(() => {
    if (bookView.kind !== "spread" || bookView.index < spreadCount) return;
    setBookView({ kind: "spread", index: Math.max(0, spreadCount - 1) });
  }, [bookView, spreadCount]);

  const commitProjectMutation = useCallback((mutation: (previous: ProjectData) => ProjectData) => {
    setProjectData((previous) => {
      const next = mutation(previous);
      if (next === previous) return previous;
      return { ...next, flowProjects: saveActiveFlowIntoProjects(next) };
    });
  }, [setProjectData]);

  const commitLayout = useCallback((nodeId: string, layout: LookbookLayout) => {
    commitProjectMutation((previous) => updateLookbookNodeLayout(previous, nodeId, layout));
  }, [commitProjectMutation]);

  const commitText = useCallback((nodeId: string, patch: { title?: string; text?: string }) => {
    commitProjectMutation((previous) => updateLookbookTextCard(previous, nodeId, patch));
  }, [commitProjectMutation]);

  const importFiles = useCallback(async (files: File[]) => {
    if (!files.length || isImporting) return;
    setIsImporting(true);
    setErrorMessage("");
    try {
      const inspected = await inspectLookbookImageFiles(files);
      const assets = inspected.map((asset) => ({ ...asset, id: createLocalNodeId("lookbook-image") }));
      commitProjectMutation((previous) => addLookbookImageAssets(previous, identityNodeId, assets));
      setSelectedNodeId(assets.at(-1)?.id || null);
      setBookView({ kind: "spread", index: Math.floor((items.length + assets.length - 1) / 6) });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "图片导入失败");
    } finally {
      setIsImporting(false);
      setIsDraggingFiles(false);
    }
  }, [commitProjectMutation, identityNodeId, isImporting, items.length]);

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    void importFiles(Array.from(event.target.files || []));
    event.target.value = "";
  };

  const addTextCard = useCallback(() => {
    const nodeId = createLocalNodeId("lookbook-note");
    commitProjectMutation((previous) => addLookbookTextCard(previous, identityNodeId, Date.now(), nodeId).projectData);
    setSelectedNodeId(nodeId);
    setBookView({ kind: "spread", index: Math.floor(items.length / 6) });
  }, [commitProjectMutation, identityNodeId, items.length]);

  const addPage = useCallback(() => {
    const nextPageCount = pageCount + 1;
    commitProjectMutation((previous) => addLookbookPage(previous, identityNodeId));
    setBookView({ kind: "spread", index: Math.max(0, Math.ceil(nextPageCount / 2) - 1) });
    setSelectedNodeId(null);
  }, [commitProjectMutation, identityNodeId, pageCount]);

  const currentPosition = bookView.kind === "front" ? -1 : bookView.kind === "back" ? spreadCount : spreadIndex;
  const turnTo = useCallback((nextPosition: number) => {
    const bounded = Math.max(-1, Math.min(spreadCount, nextPosition));
    if (bounded === currentPosition || turnDirection !== 0) return;
    setTurnDirection(bounded > currentPosition ? 1 : -1);
    setBookView(
      bounded < 0
        ? { kind: "front" }
        : bounded >= spreadCount
          ? { kind: "back" }
          : { kind: "spread", index: bounded }
    );
    setSelectedNodeId(null);
  }, [currentPosition, spreadCount, turnDirection]);

  useEffect(() => {
    if (turnDirection === 0) return;
    const timer = window.setTimeout(() => setTurnDirection(0), 360);
    return () => window.clearTimeout(timer);
  }, [turnDirection]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      const eventTarget = event.target as HTMLElement | null;
      const isEditingText = eventTarget?.matches("input, textarea, [contenteditable='true']") === true;
      if (event.key === "Escape") {
        if (contextMenu) setContextMenu(null);
        else if (selectedNodeId) setSelectedNodeId(null);
        else onClose();
      }
      if (event.key === "ArrowRight" && !isEditingText) turnTo(currentPosition + 1);
      if (event.key === "ArrowLeft" && !isEditingText) turnTo(currentPosition - 1);
    };
    const dismissMenu = () => setContextMenu(null);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", dismissMenu);
    window.addEventListener("blur", dismissMenu);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", dismissMenu);
      window.removeEventListener("blur", dismissMenu);
    };
  }, [contextMenu, currentPosition, onClose, selectedNodeId, turnTo]);

  const updateContextLayout = (patch: Partial<LookbookLayout>) => {
    if (!contextItem) return;
    commitLayout(contextItem.node.id, sanitizeLookbookLayout({ ...contextItem.layout, ...patch }));
    setContextMenu(null);
  };

  const maxZIndex = items.reduce((maximum, item) => Math.max(maximum, item.layout.zIndex), 1);
  const name = identity?.displayName || identity?.name || readString(identityNode?.data.title) || "Lookbook";
  const mention = identity?.mention || name;
  const identityLabel = identity?.kind === "scene" ? "SCENE STUDY" : "CHARACTER STUDY";
  const issue = String(Math.max(1, (projectData.roles || []).findIndex((role) => role.id === identityId) + 1)).padStart(2, "0");
  const coverImageUrls = items
    .filter((item) => item.node.type === "imageInput")
    .map((item) => readString(item.node.data.image))
    .filter(Boolean)
    .slice(0, 2);
  const leftPageIndex = spreadIndex * 2;
  const rightPageIndex = leftPageIndex + 1;
  const hasLeftPage = leftPageIndex < pageCount;
  const hasRightPage = rightPageIndex < pageCount;

  if (!identityNode || !identity) {
    return (
      <section className="lookbook-studio" role="dialog" aria-modal="true" aria-label="Lookbook 无法打开">
        <div className="lookbook-studio__missing">
          <WarningCircle size={28} weight="light" />
          <p>身份索引已失去绑定，无法打开 Lookbook。</p>
          <button type="button" onClick={onClose}>返回 Flow</button>
        </div>
      </section>
    );
  }

  return (
    <section className="lookbook-studio" role="dialog" aria-modal="true" aria-label={`${name} Lookbook 编辑器`}>
      <button type="button" className="lookbook-studio__close" onClick={onClose} aria-label="关闭 Lookbook">
        <X size={18} weight="bold" />
      </button>

      <main
        className={`lookbook-studio__stage ${isDraggingFiles ? "is-dragging-files" : ""}`}
        onContextMenu={(event) => {
          const eventTarget = event.target as HTMLElement;
          if (eventTarget.closest("input, textarea, [contenteditable='true']")) return;
          event.preventDefault();
          const nodeElement = eventTarget.closest<HTMLElement>("[data-node-id]");
          const width = 220;
          const height = nodeElement ? 360 : 264;
          setContextMenu({
            x: Math.max(10, Math.min(window.innerWidth - width - 10, event.clientX)),
            y: Math.max(56, Math.min(window.innerHeight - height - 10, event.clientY)),
            nodeId: nodeElement?.dataset.nodeId || null,
          });
          if (nodeElement?.dataset.nodeId) setSelectedNodeId(nodeElement.dataset.nodeId);
        }}
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setIsDraggingFiles(true);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setIsDraggingFiles(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          void importFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <AnimatePresence initial={false}>
          {bookView.kind === "front" ? (
            <motion.button
              key="front-cover"
              type="button"
              className="lookbook-book-cover"
              onClick={() => turnTo(0)}
              initial={{ opacity: 0, x: -24, scale: 0.985 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -20, scale: 0.99 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              aria-label={`打开 ${name} Lookbook`}
            >
              <span className="lookbook-book-cover__issue">({issue})</span>
              <span className="lookbook-book-cover__title">{name}</span>
              <span className="lookbook-book-cover__images" data-count={coverImageUrls.length || 0}>
                {coverImageUrls.length
                  ? coverImageUrls.map((imageUrl, index) => <img key={`${imageUrl}-${index}`} src={imageUrl} alt="" draggable={false} />)
                  : <><span className="lookbook-book-cover__empty" /><span className="lookbook-book-cover__empty" /></>}
              </span>
              <span className="lookbook-book-cover__meta"><b>@{mention}</b><b>{identityLabel}</b><b>STYLO ARCHIVE</b></span>
            </motion.button>
          ) : bookView.kind === "back" ? (
            <motion.button
              key="back-cover"
              type="button"
              className="lookbook-book-cover lookbook-book-cover--back"
              onClick={() => turnTo(spreadCount - 1)}
              initial={{ opacity: 0, x: 24, scale: 0.985 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.99 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              aria-label={`返回 ${name} Lookbook 最后一页`}
            >
              <span className="lookbook-book-cover__issue">END / {issue}</span>
              <span className="lookbook-book-cover__back-mark">{name}</span>
              <span className="lookbook-book-cover__meta"><b>STYLO LOOKBOOK</b><b>@{mention}</b></span>
            </motion.button>
          ) : (
            <motion.div
              key={`spread-${spreadIndex}`}
              className="lookbook-book-shell"
              initial={{ opacity: 0, x: turnDirection >= 0 ? 28 : -28, scale: 0.992 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: turnDirection >= 0 ? -22 : 22, scale: 0.994 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                type="button"
                className="lookbook-book-shell__turn is-previous"
                aria-label={spreadIndex === 0 ? "合上为 Lookbook 封面" : "上一跨页"}
                disabled={turnDirection !== 0}
                onClick={() => turnTo(spreadIndex - 1)}
              ><CaretLeft size={20} /></button>

              <div
                ref={spreadRef}
                className="lookbook-book-spread"
                style={{ aspectRatio: `1 / ${LOOKBOOK_SPREAD_HEIGHT}` }}
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) setSelectedNodeId(null);
                }}
              >
                <div className={["lookbook-book-spread__page is-left", hasLeftPage ? "" : "is-uncreated"].join(" ")} aria-hidden="true" />
                <div className={["lookbook-book-spread__page is-right", hasRightPage ? "" : "is-uncreated"].join(" ")} aria-hidden="true" />
                <div className="lookbook-book-spread__gutter" aria-hidden="true" />
                <div className="lookbook-book-spread__running-head is-left">{name} / {identityLabel}</div>
                <div className="lookbook-book-spread__running-head is-right">STYLO LOOKBOOK / {issue}</div>

                {visibleItems.map((item, index) => (
                  <LookbookBoardItemView
                    key={item.node.id}
                    item={item}
                    boardRef={spreadRef}
                    worldHeight={LOOKBOOK_SPREAD_HEIGHT}
                    selected={selectedNodeId === item.node.id}
                    index={index}
                    onSelect={setSelectedNodeId}
                    onCommitLayout={commitLayout}
                    onCommitText={commitText}
                  />
                ))}

                {!visibleItems.length && !isImporting ? (
                  <div className="lookbook-book-spread__empty">
                    <span>{pageCount ? "EMPTY PAGES / " + String(spreadIndex + 1).padStart(2, "0") : "NO INNER PAGES"}</span>
                    <strong>{pageCount ? "在纸面右键添加内容" : "这本 Lookbook 目前只有封面"}</strong>
                    <small>{pageCount ? "也可以把 PNG、JPEG 或 WebP 直接拖进书册" : "点击下方“新增页”开始编排"}</small>
                  </div>
                ) : null}

                {hasLeftPage ? <span className="lookbook-book-spread__page-number is-left">{leftPageIndex + 1}</span> : null}
                {hasRightPage ? <span className="lookbook-book-spread__page-number is-right">{rightPageIndex + 1}</span> : null}

              </div>

              <button
                type="button"
                className="lookbook-book-shell__turn is-next"
                aria-label={spreadIndex >= spreadCount - 1 ? "合上为 Lookbook 封底" : "下一跨页"}
                disabled={turnDirection !== 0}
                onClick={() => turnTo(spreadIndex + 1)}
              ><CaretRight size={20} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="lookbook-studio__hint">
          <span>{bookView.kind === "front"
            ? "FRONT COVER"
            : bookView.kind === "back"
              ? "BACK COVER"
              : pageCount + " PAGES · " + String(spreadIndex + 1).padStart(2, "0") + " / " + String(spreadCount).padStart(2, "0")}</span>
          <button type="button" className="lookbook-studio__add-page" onClick={addPage}>
            <Plus size={13} weight="bold" />
            <span>新增页</span>
          </button>
          <span>{bookView.kind === "front"
            ? "单击封面打开"
            : bookView.kind === "back"
              ? "单击封底返回最后一页"
              : "右键添加与编排 · 拖动移动 · 选中后拖拽边角缩放"}</span>
        </div>

        <input
          ref={fileInputRef}
          className="lookbook-studio__file-input"
          type="file"
          aria-label="选择 Lookbook 图片文件"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          onChange={handleFileInput}
        />

        {isImporting ? (
          <div className="lookbook-studio__processing" role="status">
            <SpinnerGap size={18} />
            <span>正在解析图片尺寸与透明通道</span>
          </div>
        ) : null}

        {isDraggingFiles ? (
          <div className="lookbook-studio__drop-target" role="status">
            <ImageSquare size={26} weight="light" />
            <strong>释放以创建并连接图片节点</strong>
            <span>透明 PNG 将作为无底色贴纸保留</span>
          </div>
        ) : null}
      </main>

      {contextMenu ? (
        <div
          className="lookbook-context-menu"
          role="menu"
          aria-label="Lookbook 操作"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {contextItem ? (
            <>
              <span className="lookbook-context-menu__label">所选内容</span>
              <button type="button" role="menuitem" onClick={() => updateContextLayout({ fit: contextItem.layout.fit === "contain" ? "cover" : "contain" })}>
                <GridFour size={15} /><span>{contextItem.layout.fit === "contain" ? "填充裁切" : "完整显示"}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => updateContextLayout({ rotation: contextItem.layout.rotation - 1 })}>
                <CaretLeft size={15} /><span>逆时针旋转 1°</span>
              </button>
              <button type="button" role="menuitem" onClick={() => updateContextLayout({ rotation: contextItem.layout.rotation + 1 })}>
                <CaretRight size={15} /><span>顺时针旋转 1°</span>
              </button>
              <button type="button" role="menuitem" onClick={() => updateContextLayout({ zIndex: maxZIndex + 1 })}>
                <ArrowRight size={15} /><span>移到最上层</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={contextItem.spreadIndex === 0}
                onClick={() => {
                  commitProjectMutation((previous) => moveLookbookNodeToSpread(previous, identityNodeId, contextItem.node.id, contextItem.spreadIndex - 1));
                  setContextMenu(null);
                }}
              ><ArrowLeft size={15} /><span>移至前一跨页</span></button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  commitProjectMutation((previous) => moveLookbookNodeToSpread(previous, identityNodeId, contextItem.node.id, contextItem.spreadIndex + 1));
                  setContextMenu(null);
                }}
              ><ArrowRight size={15} /><span>移至后一跨页</span></button>
              <div className="lookbook-context-menu__separator" />
            </>
          ) : null}

          <button type="button" role="menuitem" onClick={() => { fileInputRef.current?.click(); setContextMenu(null); }}>
            <ImageSquare size={15} /><span>导入图片</span>
          </button>
          <button type="button" role="menuitem" onClick={() => { addTextCard(); setContextMenu(null); }}>
            <NotePencil size={15} /><span>添加文本</span>
          </button>
          <button type="button" role="menuitem" onClick={() => { addPage(); setContextMenu(null); }}>
            <Plus size={15} /><span>新增一页</span>
          </button>
          <button type="button" role="menuitem" disabled={!items.length} onClick={() => {
            commitProjectMutation((previous) => reflowLookbookLayouts(previous, identityNodeId));
            setContextMenu(null);
          }}>
            <GridFour size={15} /><span>自动编排整本</span>
          </button>
          <div className="lookbook-context-menu__separator" />
          <button type="button" role="menuitem" onClick={() => {
            turnTo(bookView.kind === "spread" ? -1 : bookView.kind === "back" ? spreadCount - 1 : 0);
            setContextMenu(null);
          }}>
            {bookView.kind === "spread" ? <CaretLeft size={15} /> : <CaretRight size={15} />}
            <span>{bookView.kind === "spread" ? "合上为封面" : "打开书册"}</span>
          </button>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="lookbook-studio__error" role="alert">
          <WarningCircle size={16} />
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage("")}>关闭</button>
        </div>
      ) : null}
    </section>
  );
};
