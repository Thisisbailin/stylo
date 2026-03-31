import React, { useRef, useState } from "react";
import { BaseNode } from "./BaseNode";
import { AudioInputNodeData } from "../types";
import { useWorkflowStore } from "../store/workflowStore";
import { AudioLines, Upload, X } from "lucide-react";

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
  const { updateNodeData } = useWorkflowStore();
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
    >
      <div className="space-y-4 flex-1 flex flex-col">
        {data.audio ? (
          <div className="node-panel p-3 space-y-3">
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
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="node-surface node-surface--dashed w-full min-h-[180px] rounded-[20px] flex flex-col items-center justify-center gap-3 transition hover:border-emerald-500/30 hover:bg-emerald-500/[0.02]"
          >
            <div className="h-14 w-14 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center shadow-inner">
              <AudioLines className="text-[var(--node-text-secondary)]" size={28} />
            </div>
            <div className="text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80">
                {isLoading ? "Reading..." : "Upload Audio"}
              </div>
              <div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-[var(--node-text-secondary)]">
                MP3 / WAV reference
              </div>
            </div>
          </button>
        )}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="node-button h-9 px-3 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] nodrag"
          >
            <Upload size={12} />
            {data.audio ? "Replace" : "Select"}
          </button>
        </div>

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
