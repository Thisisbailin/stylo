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
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import type { ProjectData } from "../../../types";
import type { LookbookLayout } from "../../types";
import {
  LOOKBOOK_SPREAD_HEIGHT,
  addLookbookImageAssets,
  addLookbookTextCard,
  getLookbookSpreadCount,
  moveLookbookNodeToSpread,
  projectLookbookBoardItems,
  reflowLookbookLayouts,
  sanitizeLookbookLayout,
  updateLookbookNodeLayout,
  updateLookbookTextCard,
} from "../../../utils/lookbookWorkspace";
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
  const [isOpen, setIsOpen] = useState(true);
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [turnDirection, setTurnDirection] = useState<-1 | 0 | 1>(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const identityNode = useMemo(
    () => projectData.flow?.flowNodes?.find((node) => node.id === identityNodeId && node.type === "identityCard"),
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
  const spreadCount = useMemo(() => getLookbookSpreadCount(items), [items]);
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
    if (spreadIndex < spreadCount) return;
    setSpreadIndex(Math.max(0, spreadCount - 1));
  }, [spreadCount, spreadIndex]);

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
      if (event.key === "ArrowRight" && isOpen && !isEditingText) setSpreadIndex((current) => Math.min(spreadCount - 1, current + 1));
      if (event.key === "ArrowLeft" && isOpen && !isEditingText) setSpreadIndex((current) => Math.max(0, current - 1));
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
  }, [contextMenu, isOpen, onClose, selectedNodeId, spreadCount]);

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
      setSpreadIndex(Math.floor((items.length + assets.length - 1) / 6));
      setIsOpen(true);
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
    setSpreadIndex(Math.floor(items.length / 6));
    setIsOpen(true);
  }, [commitProjectMutation, identityNodeId, items.length]);

  const turnTo = useCallback((next: number) => {
    const bounded = Math.max(0, Math.min(spreadCount - 1, next));
    if (bounded === spreadIndex || turnDirection !== 0) return;
    setTurnDirection(bounded > spreadIndex ? 1 : -1);
    setSpreadIndex(bounded);
    setSelectedNodeId(null);
  }, [spreadCount, spreadIndex, turnDirection]);

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
  const coverImage = items.find((item) => item.node.type === "imageInput");
  const coverImageUrl = coverImage ? readString(coverImage.node.data.image) : "";

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
      <header className="lookbook-studio__header">
        <strong>Stylo</strong>
        <button type="button" className="lookbook-studio__back" onClick={onClose}>
          <ArrowLeft size={14} weight="bold" />
          <span>返回 Flow</span>
        </button>
      </header>

      <main
        className={`lookbook-studio__stage ${isDraggingFiles ? "is-dragging-files" : ""}`}
        onContextMenu={(event) => {
          const eventTarget = event.target as HTMLElement;
          if (eventTarget.closest("input, textarea, [contenteditable='true']")) return;
          event.preventDefault();
          const nodeElement = eventTarget.closest<HTMLElement>("[data-node-id]");
          const width = 220;
          const height = nodeElement ? 326 : 228;
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
        <div className="lookbook-studio__folio-label" aria-hidden="true">
          <span>LOOKBOOK / {identityLabel}</span>
          <strong>{name}</strong>
          <small>@{mention}</small>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {!isOpen ? (
            <motion.button
              key="cover"
              type="button"
              className="lookbook-book-cover"
              onClick={() => setIsOpen(true)}
              initial={{ opacity: 0, rotateY: -10, scale: 0.98 }}
              animate={{ opacity: 1, rotateY: 0, scale: 1 }}
              exit={{ opacity: 0, rotateY: 8, scale: 0.985 }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
              aria-label={`打开 ${name} Lookbook`}
            >
              <span className="lookbook-book-cover__issue">({issue})</span>
              <span className="lookbook-book-cover__title">{name}</span>
              {coverImageUrl ? <img src={coverImageUrl} alt="" draggable={false} /> : <span className="lookbook-book-cover__empty" />}
              <span className="lookbook-book-cover__meta"><b>@{mention}</b><b>{identityLabel}</b><b>STYLO ARCHIVE</b></span>
            </motion.button>
          ) : (
            <motion.div
              key="spread"
              className="lookbook-book-shell"
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.985 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                type="button"
                className="lookbook-book-shell__turn is-previous"
                aria-label="上一跨页"
                disabled={spreadIndex === 0 || turnDirection !== 0}
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
                <div className="lookbook-book-spread__page is-left" aria-hidden="true" />
                <div className="lookbook-book-spread__page is-right" aria-hidden="true" />
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
                    <span>EMPTY SPREAD / {String(spreadIndex + 1).padStart(2, "0")}</span>
                    <strong>在纸面右键添加内容</strong>
                    <small>也可以把 PNG、JPEG 或 WebP 直接拖进书册</small>
                  </div>
                ) : null}

                <span className="lookbook-book-spread__page-number is-left">{spreadIndex * 2 + 2}</span>
                <span className="lookbook-book-spread__page-number is-right">{spreadIndex * 2 + 3}</span>

                {turnDirection !== 0 ? (
                  <motion.div
                    className={`lookbook-book-spread__turning-page ${turnDirection > 0 ? "is-forward" : "is-backward"}`}
                    initial={{ rotateY: turnDirection > 0 ? 0 : -180 }}
                    animate={{ rotateY: turnDirection > 0 ? -180 : 0 }}
                    transition={{ duration: 0.46, ease: [0.22, 1, 0.36, 1] }}
                    onAnimationComplete={() => setTurnDirection(0)}
                  />
                ) : null}
              </div>

              <button
                type="button"
                className="lookbook-book-shell__turn is-next"
                aria-label="下一跨页"
                disabled={spreadIndex >= spreadCount - 1 || turnDirection !== 0}
                onClick={() => turnTo(spreadIndex + 1)}
              ><CaretRight size={20} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="lookbook-studio__hint">
          <span>{isOpen ? `${String(spreadIndex + 1).padStart(2, "0")} / ${String(spreadCount).padStart(2, "0")}` : "COVER"}</span>
          <span>右键添加与编排 · 拖动移动 · 选中后拖拽边角缩放</span>
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
          <button type="button" role="menuitem" disabled={!items.length} onClick={() => {
            commitProjectMutation((previous) => reflowLookbookLayouts(previous, identityNodeId));
            setContextMenu(null);
          }}>
            <GridFour size={15} /><span>自动编排整本</span>
          </button>
          <div className="lookbook-context-menu__separator" />
          <button type="button" role="menuitem" onClick={() => { setIsOpen((current) => !current); setContextMenu(null); }}>
            {isOpen ? <CaretLeft size={15} /> : <CaretRight size={15} />}
            <span>{isOpen ? "合上书册" : "打开书册"}</span>
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
