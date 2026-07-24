import React, { useEffect, useRef, useState } from "react";
import { CloudArrowUp, FilePdf, UploadSimple, X } from "@phosphor-icons/react";
import { BaseNode } from "./BaseNode";
import type { PdfInputNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import {
  collectOwnedStorageObjects,
  deleteOwnedStorageObjects,
  resolvePrivateStorageUrl,
  uploadStorageFile,
} from "../nodeflow/storageObjects";

type Props = {
  id: string;
  data: PdfInputNodeData;
  selected?: boolean;
};

const MAX_PDF_BYTES = 64 * 1024 * 1024;

const formatBytes = (value?: number | null) => {
  if (!value || !Number.isFinite(value)) return null;
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
};

const buildPdfStorageName = (filename: string) => {
  const safeBase = filename
    .replace(/\.pdf$/i, "")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 64) || "document";
  return `pdf-inputs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBase}.pdf`;
};

const isPdfFile = (file: File) =>
  file.type === "application/pdf" || file.name.toLocaleLowerCase().endsWith(".pdf");

export const PdfInputNode: React.FC<Props> = ({ id, data, selected }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { updateNodeData, nodeFlowContext } = useNodeFlowStore();
  const projectId = nodeFlowContext.projectId || "";
  const [isUploading, setIsUploading] = useState(false);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const nodeTitle = data.title && data.title !== "PDF Input" ? data.title : "pdf";

  useEffect(() => {
    if (!data.storagePath || !projectId) return;
    let cancelled = false;
    setStorageMessage("正在刷新 PDF 访问地址…");
    resolvePrivateStorageUrl({
      bucket: data.storageBucket || "assets",
      path: data.storagePath,
    }, projectId)
      .then((url) => {
        if (!cancelled && url && url !== data.pdf) updateNodeData(id, { pdf: url });
        if (!cancelled) setStorageMessage(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setStorageMessage(error instanceof Error ? error.message.replaceAll("图片", "PDF") : "PDF 访问地址刷新失败。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [data.storageBucket, data.storagePath, id, projectId, updateNodeData]);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    if (!isPdfFile(file)) {
      setStorageMessage("请选择 PDF 文件。");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setStorageMessage("PDF 超过 64 MB 项目资源上限。");
      return;
    }
    if (!projectId) {
      setStorageMessage("当前项目缺少资源作用域，无法保存 PDF。");
      return;
    }

    setIsUploading(true);
    setStorageMessage("正在保存至项目资源…");
    try {
      const uploaded = await uploadStorageFile(file, {
        fileName: buildPdfStorageName(file.name),
        bucket: "assets",
        contentType: "application/pdf",
        projectId,
      });
      const previousObjects = collectOwnedStorageObjects([{ data }]);
      if (previousObjects.length) {
        try {
          await deleteOwnedStorageObjects(previousObjects, projectId);
        } catch (error) {
          await deleteOwnedStorageObjects([uploaded.object], projectId).catch(() => undefined);
          throw error;
        }
      }
      updateNodeData(id, {
        pdf: uploaded.url,
        filename: file.name,
        storageBucket: uploaded.object.bucket,
        storagePath: uploaded.object.path,
        mimeType: "application/pdf",
        fileSize: file.size,
        highlights: [],
        title: data.title && data.title !== "PDF Input"
          ? data.title
          : file.name.replace(/\.pdf$/i, "") || "pdf",
      });
      setStorageMessage(null);
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message.replaceAll("图片", "PDF") : "PDF 上传失败。");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClear = async () => {
    if (projectId) {
      const objects = collectOwnedStorageObjects([{ data }]);
      if (objects.length) {
        try {
          await deleteOwnedStorageObjects(objects, projectId);
        } catch (error) {
          setStorageMessage(error instanceof Error ? error.message.replaceAll("图片", "PDF") : "PDF 资源删除失败。");
          return;
        }
      }
    }
    updateNodeData(id, {
      pdf: null,
      filename: null,
      storageBucket: null,
      storagePath: null,
      mimeType: "application/pdf",
      fileSize: null,
      highlights: [],
    });
    setStorageMessage(null);
  };

  const details = [
    formatBytes(data.fileSize),
    data.highlights.length ? `${data.highlights.length} 条高亮` : null,
  ].filter(Boolean);

  return (
    <BaseNode
      title={nodeTitle}
      onTitleChange={(title) => updateNodeData(id, { title })}
      inputs={["text"]}
      selected={selected}
      variant="media"
      nodeType="pdfInput"
    >
      <div className="media-input-frame flex-1">
        {data.pdf ? (
          <div className="pdf-input-loaded">
            <div className="pdf-input-preview" aria-label={data.filename || "PDF 文档"}>
              <div className="pdf-input-sheet" aria-hidden="true">
                <FilePdf size={34} weight="duotone" />
                <span>PDF</span>
              </div>
              <div className="pdf-input-copy">
                <strong>{data.filename || "未命名 PDF"}</strong>
                <span>{details.join(" · ") || "项目 PDF 资源"}</span>
                <small>双击节点打开阅读与高亮标注</small>
              </div>
            </div>
            <div className="pdf-input-actions nodrag">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="node-button"
              >
                {isUploading ? <CloudArrowUp size={13} weight="duotone" /> : <UploadSimple size={13} />}
                {isUploading ? "上传中" : "替换"}
              </button>
              <button
                type="button"
                onClick={() => void handleClear()}
                className="pdf-input-remove"
                aria-label="移除 PDF"
                title="移除 PDF"
              >
                <X size={13} />
              </button>
            </div>
            {storageMessage ? <div className="pdf-input-message" role="status">{storageMessage}</div> : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="media-input-empty"
            disabled={isUploading}
          >
            <div className="media-input-empty-icon">
              {isUploading ? <CloudArrowUp size={22} weight="duotone" /> : <FilePdf size={22} weight="duotone" />}
            </div>
            <div className="media-input-empty-copy">
              <div className="media-input-empty-kicker">PDF Input</div>
              <div className="media-input-empty-title">{isUploading ? "Saving PDF…" : "Drop or choose PDF"}</div>
              <div className="media-input-empty-subtitle">{storageMessage || "PDF · up to 64 MB · double-click to read"}</div>
            </div>
            <div className="media-input-empty-cta">Select File</div>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </div>
    </BaseNode>
  );
};
