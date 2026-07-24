import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  FilePdf,
  HighlighterCircle,
  Minus,
  NotePencil,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import type {
  PdfHighlightAnnotation,
  PdfHighlightColor,
  PdfInputNodeData,
  TextNodeData,
} from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";

type Props = {
  nodeId: string;
  onClose: () => void;
};

type DraftHighlight = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const HIGHLIGHT_LABELS: Record<PdfHighlightColor, string> = {
  yellow: "黄色",
  green: "绿色",
  blue: "蓝色",
};

const textNodeTypes = new Set(["text", "mdText", "scriptPage"]);

const buildPdfViewerUrl = (source: string, page: number, zoom: number) => {
  const separator = source.includes("#") ? "&" : "#";
  return `${source}${separator}page=${page}&zoom=${zoom}&toolbar=0&navpanes=0`;
};

const rectFromDraft = (draft: DraftHighlight) => ({
  x: Math.min(draft.startX, draft.currentX),
  y: Math.min(draft.startY, draft.currentY),
  width: Math.abs(draft.currentX - draft.startX),
  height: Math.abs(draft.currentY - draft.startY),
});

export const PdfReaderOverlay: React.FC<Props> = ({ nodeId, onClose }) => {
  const node = useNodeFlowStore((state) => state.nodes.find((item) => item.id === nodeId));
  const nodes = useNodeFlowStore((state) => state.nodes);
  const links = useNodeFlowStore((state) => state.links);
  const updateNodeData = useNodeFlowStore((state) => state.updateNodeData);
  const data = node?.data as PdfInputNodeData | undefined;
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [highlightMode, setHighlightMode] = useState(false);
  const [highlightColor, setHighlightColor] = useState<PdfHighlightColor>("yellow");
  const [draft, setDraft] = useState<DraftHighlight | null>(null);
  const highlightLayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const highlights = Array.isArray(data?.highlights) ? data.highlights : [];
  const pageHighlights = useMemo(
    () => highlights.filter((highlight) => highlight.page === page),
    [highlights, page]
  );
  const linkedNotes = useMemo(() => {
    const nodeById = new Map(nodes.map((item) => [item.id, item]));
    return links
      .filter((link) => link.target === nodeId)
      .map((link) => nodeById.get(link.source))
      .filter((item) => item && textNodeTypes.has(item.type))
      .map((item) => ({
        id: item!.id,
        title: String((item!.data as TextNodeData).title || "Markdown 笔记"),
        text: String((item!.data as TextNodeData).text || ""),
      }));
  }, [links, nodeId, nodes]);

  const toNormalizedPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = highlightLayerRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return null;
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!highlightMode || event.button !== 0) return;
    const point = toNormalizedPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft({
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draft) return;
    const point = toNormalizedPoint(event);
    if (!point) return;
    setDraft((current) => current ? {
      ...current,
      currentX: point.x,
      currentY: point.y,
    } : current);
  };

  const commitDraft = () => {
    if (!draft || !data) {
      setDraft(null);
      return;
    }
    const rect = rectFromDraft(draft);
    setDraft(null);
    if (rect.width < 0.008 || rect.height < 0.008) return;
    const annotation: PdfHighlightAnnotation = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pdf-highlight-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      page,
      ...rect,
      color: highlightColor,
      createdAt: Date.now(),
    };
    updateNodeData(nodeId, { highlights: [...highlights, annotation] });
  };

  const removeHighlight = (highlightId: string) => {
    updateNodeData(nodeId, {
      highlights: highlights.filter((highlight) => highlight.id !== highlightId),
    });
  };

  if (typeof document === "undefined") return null;

  const content = (
    <section className="pdf-reader-overlay" role="dialog" aria-modal="true" aria-label="PDF 阅读器">
      <header className="pdf-reader-toolbar">
        <div className="pdf-reader-title">
          <span className="pdf-reader-title__icon"><FilePdf size={18} weight="duotone" /></span>
          <span>
            <strong>{data?.filename || data?.title || "PDF"}</strong>
            <small>{highlights.length} 条高亮 · {linkedNotes.length} 篇关联笔记</small>
          </span>
        </div>

        <div className="pdf-reader-page-controls" aria-label="PDF 页码">
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} aria-label="上一页">
            <ArrowLeft size={15} />
          </button>
          <label>
            <span>Page</span>
            <input
              type="number"
              min={1}
              value={page}
              onChange={(event) => setPage(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
          <button type="button" onClick={() => setPage((value) => value + 1)} aria-label="下一页">
            <ArrowRight size={15} />
          </button>
        </div>

        <div className="pdf-reader-tools">
          <div className="pdf-reader-zoom" aria-label="PDF 缩放">
            <button type="button" onClick={() => setZoom((value) => Math.max(50, value - 10))} aria-label="缩小">
              <Minus size={14} />
            </button>
            <span>{zoom}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(200, value + 10))} aria-label="放大">
              <Plus size={14} />
            </button>
          </div>
          <button
            type="button"
            className="pdf-reader-highlight-toggle"
            data-active={highlightMode}
            onClick={() => {
              setHighlightMode((value) => !value);
              setDraft(null);
            }}
            aria-pressed={highlightMode}
          >
            <HighlighterCircle size={16} weight={highlightMode ? "fill" : "regular"} />
            高亮
          </button>
          <button type="button" className="pdf-reader-close" onClick={onClose} aria-label="关闭 PDF 阅读器">
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="pdf-reader-body">
        <main className="pdf-reader-stage">
          {data?.pdf ? (
            <div className="pdf-reader-document">
              <iframe
                key={`${data.pdf}-${page}-${zoom}`}
                title={data.filename || "PDF 文档"}
                src={buildPdfViewerUrl(data.pdf, page, zoom)}
                className="pdf-reader-frame"
              />
              <div
                ref={highlightLayerRef}
                className="pdf-reader-highlight-layer"
                data-active={highlightMode}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={commitDraft}
                onPointerCancel={() => setDraft(null)}
              >
                {pageHighlights.map((highlight) => (
                  <span
                    key={highlight.id}
                    className="pdf-reader-highlight"
                    data-color={highlight.color}
                    style={{
                      left: `${highlight.x * 100}%`,
                      top: `${highlight.y * 100}%`,
                      width: `${highlight.width * 100}%`,
                      height: `${highlight.height * 100}%`,
                    }}
                  />
                ))}
                {draft ? (
                  <span
                    className="pdf-reader-highlight is-draft"
                    data-color={highlightColor}
                    style={{
                      left: `${rectFromDraft(draft).x * 100}%`,
                      top: `${rectFromDraft(draft).y * 100}%`,
                      width: `${rectFromDraft(draft).width * 100}%`,
                      height: `${rectFromDraft(draft).height * 100}%`,
                    }}
                  />
                ) : null}
              </div>
              {highlightMode ? (
                <div className="pdf-reader-highlight-hint">在页面上拖动以添加高亮</div>
              ) : null}
            </div>
          ) : (
            <div className="pdf-reader-empty">
              <FilePdf size={34} weight="duotone" />
              <strong>此节点还没有 PDF</strong>
              <span>返回画布并在节点中选择文件。</span>
            </div>
          )}
        </main>

        <aside className="pdf-reader-sidebar">
          <section className="pdf-reader-sidebar-section">
            <div className="pdf-reader-sidebar-heading">
              <span><HighlighterCircle size={15} /> 当前页高亮</span>
              <strong>{pageHighlights.length}</strong>
            </div>
            <div className="pdf-reader-color-row" aria-label="高亮颜色">
              {(Object.keys(HIGHLIGHT_LABELS) as PdfHighlightColor[]).map((color) => (
                <button
                  key={color}
                  type="button"
                  data-color={color}
                  data-active={highlightColor === color}
                  onClick={() => setHighlightColor(color)}
                  aria-label={`${HIGHLIGHT_LABELS[color]}高亮`}
                  title={`${HIGHLIGHT_LABELS[color]}高亮`}
                />
              ))}
            </div>
            {pageHighlights.length ? (
              <div className="pdf-reader-highlight-list">
                {pageHighlights.map((highlight, index) => (
                  <div key={highlight.id} className="pdf-reader-highlight-item">
                    <span data-color={highlight.color} />
                    <div>
                      <strong>高亮 {index + 1}</strong>
                      <small>第 {highlight.page} 页</small>
                    </div>
                    <button type="button" onClick={() => removeHighlight(highlight.id)} aria-label={`删除高亮 ${index + 1}`}>
                      <Trash size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pdf-reader-sidebar-empty">开启高亮模式，在当前页拖动标记。</div>
            )}
          </section>

          <section className="pdf-reader-sidebar-section is-notes">
            <div className="pdf-reader-sidebar-heading">
              <span><NotePencil size={15} /> Markdown 笔记</span>
              <strong>{linkedNotes.length}</strong>
            </div>
            {linkedNotes.length ? (
              <div className="pdf-reader-note-list">
                {linkedNotes.map((note) => (
                  <article key={note.id} className="pdf-reader-note">
                    <strong>{note.title}</strong>
                    <pre>{note.text || "空白笔记"}</pre>
                  </article>
                ))}
              </div>
            ) : (
              <div className="pdf-reader-sidebar-empty">
                将文本节点连接到此 PDF，文本内容会作为关联 Markdown 笔记显示。
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );

  return createPortal(content, document.body);
};
