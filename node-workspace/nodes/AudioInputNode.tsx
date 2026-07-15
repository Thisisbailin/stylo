import React, { useRef, useState } from "react";
import { BaseNode } from "./BaseNode";
import { AudioInputNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { UploadSimple, Waveform, X } from "@phosphor-icons/react";

type Props = {
  id: string;
  data: AudioInputNodeData;
  selected?: boolean;
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("无法读取音频文件。"));
    };
    reader.onerror = () => reject(reader.error || new Error("读取音频失败。"));
    reader.readAsDataURL(file);
  });

export const AudioInputNode: React.FC<Props> = ({ id, data, selected }) => {
  const { updateNodeData } = useNodeFlowStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const nodeTitle = data.title && data.title !== "Audio Input" ? data.title : "audio";

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setIsLoading(true);
    try {
      const src = await readFileAsDataUrl(file);
      updateNodeData(id, {
        audio: src,
        filename: file.name,
        mimeType: file.type || "audio/mpeg",
      });
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <BaseNode
      title={nodeTitle}
      onTitleChange={(title) => updateNodeData(id, { title })}
      outputs={["audio"]}
      selected={selected}
      variant="media"
      nodeType="audioInput"
    >
      <div className="media-input-frame flex-1">
        {data.audio ? (
          <>
            <div className="audio-input-media media-input-asset">
              <div className="audio-input-icon">
                <Waveform className="text-[var(--node-text-secondary)]" size={28} />
              </div>
              <div className="audio-input-kicker">Audio Reference</div>
            </div>
            <div className="media-input-info">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate text-[12px] font-semibold text-[var(--node-text-primary)]">
                  {data.filename || "untitled-audio"}
                </div>
                <button
                  type="button"
                  onClick={() => updateNodeData(id, { audio: null, filename: null, mimeType: null, durationMs: null })}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--node-border)] text-[var(--node-text-secondary)] transition hover:border-[var(--node-border-strong)] hover:text-[var(--node-text-primary)]"
                >
                  <X size={12} />
                </button>
              </div>
            <audio
              controls
              preload="metadata"
              className="w-full nodrag"
              onLoadedMetadata={(event) => {
                const duration = event.currentTarget.duration;
                if (Number.isFinite(duration)) {
                  updateNodeData(id, { durationMs: Math.round(duration * 1000) });
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <source src={data.audio} type={data.mimeType || undefined} />
            </audio>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="node-button h-9 px-3 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] nodrag"
                >
                  <UploadSimple size={12} />
                  Replace
                </button>
              </div>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="media-input-empty"
          >
            <div className="media-input-empty-icon">
              <Waveform size={22} weight="duotone" />
            </div>
            <div className="media-input-empty-copy">
              <div className="media-input-empty-kicker">Audio Input</div>
              <div className="media-input-empty-title">{isLoading ? "Reading audio…" : "Drop or choose audio"}</div>
              <div className="media-input-empty-subtitle">MP3, WAV · click to upload</div>
            </div>
            <div className="media-input-empty-cta">Select File</div>
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,.mp3,.wav"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </div>
    </BaseNode>
  );
};
