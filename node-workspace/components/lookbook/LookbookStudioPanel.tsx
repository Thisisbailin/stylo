import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  GridFour,
  ImageSquare,
  Minus,
  NotePencil,
  Plus,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import type { ProjectData } from "../../../types";
import type { LookbookLayout } from "../../types";
import {
  addLookbookImageAssets,
  addLookbookTextCard,
  getLookbookWorldHeight,
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

const readString = (value: unknown) => typeof value === "string" ? value : "";

const createLocalNodeId = (prefix: string) => {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${suffix}`;
};

const formatNodeType = (type: string) => {
  if (type === "imageInput") return "图片素材";
  if (type === "text") return "文本卡片";
  if (type === "mdText") return "档案文档";
  if (type === "videoInput") return "视频素材";
  if (type === "audioInput") return "声音素材";
  return "LookBook 项目";
};

export const LookbookStudioPanel: React.FC<Props> = ({
  projectData,
  setProjectData,
  identityNodeId,
  onClose,
}) => {
  const boardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
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
  const worldHeight = useMemo(() => getLookbookWorldHeight(items), [items]);
  const selectedItem = useMemo(
    () => items.find((item) => item.node.id === selectedNodeId) || null,
    [items, selectedNodeId]
  );

  useEffect(() => {
    if (selectedNodeId && !items.some((item) => item.node.id === selectedNodeId)) setSelectedNodeId(null);
  }, [items, selectedNodeId]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectedNodeId) setSelectedNodeId(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, selectedNodeId]);

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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "图片导入失败");
    } finally {
      setIsImporting(false);
      setIsDraggingFiles(false);
    }
  }, [commitProjectMutation, identityNodeId, isImporting]);

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    void importFiles(Array.from(event.target.files || []));
    event.target.value = "";
  };

  const addTextCard = () => {
    const nodeId = createLocalNodeId("lookbook-note");
    commitProjectMutation((previous) => addLookbookTextCard(previous, identityNodeId, Date.now(), nodeId).projectData);
    setSelectedNodeId(nodeId);
  };

  const reflow = () => {
    commitProjectMutation((previous) => reflowLookbookLayouts(previous, identityNodeId));
  };

  const updateSelectedLayout = (patch: Partial<LookbookLayout>) => {
    if (!selectedItem) return;
    commitLayout(selectedItem.node.id, sanitizeLookbookLayout({ ...selectedItem.layout, ...patch }));
  };

  const scaleSelected = (factor: number) => {
    if (!selectedItem) return;
    const width = selectedItem.layout.width * factor;
    const height = selectedItem.layout.height * factor;
    updateSelectedLayout({
      x: selectedItem.layout.x - (width - selectedItem.layout.width) / 2,
      y: selectedItem.layout.y - (height - selectedItem.layout.height) / 2,
      width,
      height,
    });
  };

  const maxZIndex = items.reduce((maximum, item) => Math.max(maximum, item.layout.zIndex), 1);
  const name = identity?.displayName || identity?.name || readString(identityNode?.data.title) || "LookBook";
  const identityLabel = identity?.kind === "scene" ? "SCENE STUDY" : "CHARACTER STUDY";
  const selectedDimensions = selectedItem?.node.data.dimensions as { width?: number; height?: number } | undefined;

  if (!identityNode || !identity) {
    return (
      <section className="lookbook-studio" role="dialog" aria-modal="true" aria-label="LookBook 无法打开">
        <div className="lookbook-studio__missing">
          <WarningCircle size={28} weight="light" />
          <p>身份索引已失去绑定，无法打开 LookBook。</p>
          <button type="button" onClick={onClose}>返回 Flow</button>
        </div>
      </section>
    );
  }

  return (
    <section className="lookbook-studio" role="dialog" aria-modal="true" aria-label={`${name} LookBook 编辑器`}>
      <header className="lookbook-studio__header">
        <button type="button" className="lookbook-studio__back" onClick={onClose}>
          <ArrowLeft size={16} weight="bold" />
          <span>Flow</span>
        </button>
        <div className="lookbook-studio__identity">
          <span>LOOKBOOK / {identityLabel}</span>
          <strong>{name}</strong>
          <small>@{identity.mention}</small>
        </div>
        <div className="lookbook-studio__actions">
          <span className="lookbook-studio__count">{String(items.length).padStart(2, "0")} ITEMS</span>
          <button type="button" aria-label="自动编排 LookBook" title="自动编排" onClick={reflow} disabled={!items.length}>
            <GridFour size={15} />
            <span>自动编排</span>
          </button>
          <button type="button" aria-label="新增 LookBook 文本卡片" title="新增文本卡片" onClick={addTextCard}>
            <NotePencil size={15} />
            <span>文本</span>
          </button>
          <button
            type="button"
            className="is-primary"
            aria-label="导入 LookBook 图片"
            title="导入图片"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageSquare size={15} />
            <span>导入图片</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            aria-label="选择 LookBook 图片文件"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            onChange={handleFileInput}
          />
        </div>
      </header>

      <main className={`lookbook-studio__workspace ${selectedItem ? "has-inspector" : ""}`}>
        <div
          className={`lookbook-studio__viewport ${isDraggingFiles ? "is-dragging-files" : ""}`}
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
          <div className="lookbook-studio__mat">
            <div
              ref={boardRef}
              className="lookbook-studio__board"
              style={{ aspectRatio: `1 / ${worldHeight}` }}
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) setSelectedNodeId(null);
              }}
            >
              {items.map((item, index) => (
                <LookbookBoardItemView
                  key={item.node.id}
                  item={item}
                  boardRef={boardRef}
                  worldHeight={worldHeight}
                  selected={selectedNodeId === item.node.id}
                  index={index}
                  onSelect={setSelectedNodeId}
                  onCommitLayout={commitLayout}
                  onCommitText={commitText}
                />
              ))}

              {!items.length && !isImporting ? (
                <div className="lookbook-studio__empty">
                  <div><ImageSquare size={30} weight="light" /></div>
                  <span>EMPTY BOARD / 01</span>
                  <h2>把第一张视觉参考放进来</h2>
                  <p>拖入 PNG、JPEG、WebP 或 GIF；也可以先建立一张文本卡，记录造型和空间意图。</p>
                  <div>
                    <button type="button" onClick={() => fileInputRef.current?.click()}>选择图片</button>
                    <button type="button" onClick={addTextCard}>新增文本</button>
                  </div>
                </div>
              ) : null}

              {isImporting ? (
                <div className="lookbook-studio__processing" role="status">
                  <SpinnerGap size={20} />
                  <span>正在解析图片尺寸与透明通道</span>
                </div>
              ) : null}
            </div>
          </div>

          {isDraggingFiles ? (
            <div className="lookbook-studio__drop-target" role="status">
              <ImageSquare size={28} weight="light" />
              <strong>释放以创建并连接图片节点</strong>
              <span>透明 PNG 会保留 alpha 通道</span>
            </div>
          ) : null}
        </div>

        {selectedItem ? (
          <aside className="lookbook-inspector" aria-label="LookBook 项目检查器">
            <div className="lookbook-inspector__heading">
              <span>SELECTION</span>
              <strong>{readString(selectedItem.node.data.title) || readString(selectedItem.node.data.label) || readString(selectedItem.node.data.filename) || "未命名"}</strong>
              <small>{formatNodeType(selectedItem.node.type)}</small>
            </div>

            <section>
              <span className="lookbook-inspector__label">尺寸</span>
              <div className="lookbook-inspector__button-row">
                <button type="button" aria-label="缩小" onClick={() => scaleSelected(0.9)}><Minus size={14} /></button>
                <span>{Math.round(selectedItem.layout.width * 100)}%</span>
                <button type="button" aria-label="放大" onClick={() => scaleSelected(1.1)}><Plus size={14} /></button>
              </div>
              {selectedDimensions?.width && selectedDimensions.height ? (
                <small>{selectedDimensions.width} × {selectedDimensions.height}px</small>
              ) : null}
            </section>

            {selectedItem.node.type === "imageInput" || selectedItem.node.type === "videoInput" ? (
              <section>
                <span className="lookbook-inspector__label">画面适配</span>
                <div className="lookbook-inspector__segmented">
                  <button
                    type="button"
                    aria-pressed={selectedItem.layout.fit === "cover"}
                    data-active={selectedItem.layout.fit === "cover"}
                    onClick={() => updateSelectedLayout({ fit: "cover" })}
                  >填充</button>
                  <button
                    type="button"
                    aria-pressed={selectedItem.layout.fit === "contain"}
                    data-active={selectedItem.layout.fit === "contain"}
                    onClick={() => updateSelectedLayout({ fit: "contain" })}
                  >完整</button>
                </div>
                {selectedItem.node.data.hasAlpha === true ? <small>PNG ALPHA / TRANSPARENT</small> : null}
              </section>
            ) : null}

            <section>
              <span className="lookbook-inspector__label">旋转</span>
              <div className="lookbook-inspector__button-row">
                <button type="button" onClick={() => updateSelectedLayout({ rotation: selectedItem.layout.rotation - 1 })}>−1°</button>
                <button type="button" onClick={() => updateSelectedLayout({ rotation: 0 })}>{selectedItem.layout.rotation.toFixed(1)}°</button>
                <button type="button" onClick={() => updateSelectedLayout({ rotation: selectedItem.layout.rotation + 1 })}>+1°</button>
              </div>
            </section>

            <section>
              <span className="lookbook-inspector__label">层级</span>
              <div className="lookbook-inspector__button-row">
                <button type="button" onClick={() => updateSelectedLayout({ zIndex: Math.max(1, selectedItem.layout.zIndex - 1) })}><ArrowDown size={14} /><span>下移</span></button>
                <button type="button" onClick={() => updateSelectedLayout({ zIndex: maxZIndex + 1 })}><ArrowUp size={14} /><span>置顶</span></button>
              </div>
            </section>

            <p>拖动项目顶部的把手移动；选中后拖动右下角调整尺寸。</p>
          </aside>
        ) : null}
      </main>

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
