import React, { useEffect, useState } from "react";
import { BaseNode } from "./BaseNode";
import { VideoGenNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { useNodeFlowExecutor } from "../store/useNodeFlowExecutor";
import { Settings2, Film, RefreshCw, AlertCircle, Download } from "lucide-react";

type Props = {
  id: string;
  data: VideoGenNodeData;
};

export const SoraVideoGenNode: React.FC<Props & { selected?: boolean }> = ({ id, data, selected }) => {
  const { updateNodeData, availableVideoModels, getConnectedInputs } = useNodeFlowStore();
  const { runVideoGen } = useNodeFlowExecutor();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [progress, setProgress] = useState(0);

  const { images: connectedImages } = getConnectedInputs(id);
  const hasConnectedImages = connectedImages.length > 0;
  const isLoading = data.status === "loading";

  const handleGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await runVideoGen(id);
  };

  useEffect(() => {
    if (!isLoading) {
      setProgress(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const eased = 1 - Math.exp(-elapsed / 14000);
      const next = Math.min(95, Math.round(eased * 100));
      setProgress(next);
    }, 500);
    return () => clearInterval(timer);
  }, [isLoading]);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data.videoUrl) return;
    const link = document.createElement("a");
    link.href = data.videoUrl;
    link.download = "video.mp4";
    link.rel = "noreferrer";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <BaseNode
      title={data.title || "Sora Video"}
      onTitleChange={(title) => updateNodeData(id, { title })}
      inputs={["image", "text"]}
      selected={selected}
    >
      <div className="space-y-4 flex-1 flex flex-col">
        {data.videoUrl ? (
            <div className="node-surface relative overflow-hidden rounded-[20px] shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <video
              controls
              className="w-full aspect-video transition-transform duration-700 bg-black/40 nodrag"
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
                <source src={data.videoUrl} />
              </video>
            </div>
          ) : (
          <div
            onClick={handleGenerate}
            className={`node-surface node-surface--dashed w-full aspect-video rounded-[20px] flex flex-col items-center justify-center transition-all duration-500 ${data.status === 'loading'
              ? 'border-amber-500/40 bg-amber-500/[0.02]'
              : 'hover:border-emerald-500/30 hover:bg-emerald-500/[0.02]'
              }`}
          >
            {data.status === 'loading' ? (
              <div className="flex flex-col items-center gap-3">
                <RefreshCw size={24} className="text-[var(--node-accent)] animate-spin" />
                <span className="text-[10px] opacity-50 uppercase tracking-[0.2em] font-black">Generating...</span>
                <div className="w-full max-w-[180px] space-y-2">
                  <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-amber-400 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="text-[9px] font-semibold text-amber-300/80 text-center">{progress}%</div>
                </div>
              </div>
            ) : (
              <>
                <div className="h-14 w-14 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4 transition-all duration-500 shadow-inner">
                  <Film className="text-[var(--node-text-secondary)]" size={28} />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] opacity-40 uppercase tracking-[0.2em] font-black transition-all duration-500 text-white">GENERATE</span>
                  <span className="text-[8px] opacity-20 uppercase tracking-[0.1em] font-bold transition-all duration-500">Click to run flow</span>
                </div>
              </>
            )}
          </div>
        )}

        {data.videoUrl && (
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-2 rounded-full text-[10px] font-semibold uppercase tracking-widest text-[var(--node-text-secondary)] bg-white/5 hover:bg-white/10 transition"
            >
              <Download size={12} />
              下载
            </button>
            <div className="flex-1" />
            {isLoading ? (
              <div className="flex items-center gap-2 text-[9px] font-semibold text-amber-300/90">
                <div className="h-1 w-24 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-amber-400 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span>{progress}%</span>
              </div>
            ) : (
              <button
                onClick={handleGenerate}
                className="flex items-center gap-2 px-3 py-2 rounded-full text-[10px] font-semibold uppercase tracking-widest text-white bg-emerald-500/80 hover:bg-emerald-500 transition"
                title="Regenerate"
              >
                <RefreshCw size={12} />
                重试
              </button>
            )}
          </div>
        )}

        {hasConnectedImages && (
          <div className="text-[10px] uppercase tracking-[0.2em] font-black text-[var(--node-text-secondary)]/70">
            {connectedImages.length} image reference{connectedImages.length > 1 ? "s" : ""} connected
          </div>
        )}

        {/* Controls Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 rounded-full ${data.status === 'complete' ? 'bg-emerald-500 shadow-[0_0_8px_var(--accent-green)]' : data.status === 'loading' ? 'bg-amber-500 animate-pulse' : 'bg-[var(--node-text-secondary)] opacity-20'}`} />
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--node-text-secondary)]">{data.status}</span>
            </div>

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`p-1 rounded-full node-control hover:bg-white/10 transition-colors ${showAdvanced ? 'text-[var(--node-accent)] bg-white/5' : 'text-[var(--node-text-secondary)]'}`}
            >
              <Settings2 size={12} />
            </button>
          </div>

          <div className="node-control node-control--tight w-full px-2 text-[var(--node-text-secondary)] text-[9px] font-bold text-center uppercase tracking-wide truncate">
            {data.model ? data.model.split('/').pop() : "Default Model"}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {/* Aspect Ratio */}
            <select
              className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full nodrag"
              value={data.aspectRatio || "16:9"}
              onChange={(e) => updateNodeData(id, { aspectRatio: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <option value="16:9">16:9 Landscape</option>
              <option value="9:16">9:16 Portrait</option>
              <option value="1:1">1:1 Square</option>
              <option value="21:9">21:9 Cinema</option>
            </select>

            {/* Duration */}
            <select
              className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full nodrag"
              value={data.duration || "5s"}
              onChange={(e) => updateNodeData(id, { duration: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <option value="5s">5 Seconds</option>
              <option value="10s">10 Seconds</option>
            </select>
          </div>
        </div>

        {/* Advanced Controls */}
        {showAdvanced && (
          <div className="node-panel space-y-3 p-3 animate-in fade-in slide-in-from-top-1">
            {/* Model Selector */}
            <div className="space-y-1">
              <label className="text-[8px] font-black uppercase tracking-widest text-[var(--node-text-secondary)] opacity-70">Model Override</label>
              <select
                className="node-control node-control--tight w-full text-[9px] font-medium px-2 text-[var(--node-text-primary)] outline-none appearance-none cursor-pointer transition-colors nodrag"
                value={data.model || ""}
                onChange={(e) => updateNodeData(id, { model: e.target.value || undefined })}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <option value="">Default (Global)</option>
                {availableVideoModels.map(m => (
                  <option key={m} value={m}>{m.split('/').pop()}</option>
                ))}
              </select>
            </div>

            {/* Quality */}
            <div className="space-y-1">
              <label className="text-[8px] font-black uppercase tracking-widest text-[var(--node-text-secondary)] opacity-70">Quality</label>
              <select
                className="node-control node-control--tight w-full text-[9px] font-medium px-2 text-[var(--node-text-primary)] outline-none appearance-none cursor-pointer transition-colors nodrag"
                value={data.quality || "standard"}
                onChange={(e) => updateNodeData(id, { quality: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <option value="standard">Standard</option>
                <option value="high">High Quality</option>
              </select>
            </div>
          </div>
        )}

        {data.error && (
          <div className="node-alert p-3 flex gap-2 items-start animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <span className="text-[10px] text-red-500/90 font-bold uppercase tracking-tight leading-tight">
              {data.error}
            </span>
          </div>
        )}
      </div>
    </BaseNode>
  );
};
