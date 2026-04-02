import React, { useEffect, useRef, useState } from "react";
import { BaseNode } from "./BaseNode";
import { VideoGenNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { useNodeFlowExecutor } from "../store/useNodeFlowExecutor";
import { RefreshCw, Film, AlertCircle, Download } from "lucide-react";
import { QWEN_WAN_VIDEO_MODEL } from "../../constants";
import { buildApiUrl } from "../../utils/api";

type Props = {
  id: string;
  data: VideoGenNodeData;
};

export const WanVideoGenNode: React.FC<Props & { selected?: boolean }> = ({ id, data, selected }) => {
  const { updateNodeData, getConnectedInputs } = useNodeFlowStore();
  const { runVideoGen } = useNodeFlowExecutor();
  const [progress, setProgress] = useState(0);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const ensureSeed = () => Math.floor(Math.random() * 1_000_000_000);

  const { images: connectedImages } = getConnectedInputs(id);
  const hasConnectedImages = connectedImages.length > 0;
  const isLoading = data.status === "loading";
  const currentResolution = (data.resolution || "720P").toUpperCase();
  const aspectRatioOptions: Record<string, { value: string; label: string }[]> = {
    "480P": [
      { value: "16:9", label: "16:9 Landscape" },
      { value: "9:16", label: "9:16 Portrait" },
      { value: "1:1", label: "1:1 Square" },
    ],
    "720P": [
      { value: "16:9", label: "16:9 Landscape" },
      { value: "9:16", label: "9:16 Portrait" },
      { value: "1:1", label: "1:1 Square" },
      { value: "4:3", label: "4:3 Standard" },
      { value: "3:4", label: "3:4 Portrait" },
    ],
    "1080P": [
      { value: "16:9", label: "16:9 Landscape" },
      { value: "9:16", label: "9:16 Portrait" },
      { value: "1:1", label: "1:1 Square" },
      { value: "4:3", label: "4:3 Standard" },
      { value: "3:4", label: "3:4 Portrait" },
    ],
  };
  const allowedAspectOptions = aspectRatioOptions[currentResolution] || aspectRatioOptions["720P"];
  const currentAspect =
    allowedAspectOptions.find((opt) => opt.value === data.aspectRatio)?.value || allowedAspectOptions[0].value;

  const handleGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await runVideoGen(id);
  };

  useEffect(() => {
    const next: Partial<VideoGenNodeData> = {};
    if (data.resolution && data.resolution !== currentResolution) {
      next.resolution = currentResolution;
    }
    if (!allowedAspectOptions.some((opt) => opt.value === data.aspectRatio)) {
      next.aspectRatio = currentAspect;
    }
    if (Object.keys(next).length > 0) {
      updateNodeData(id, next);
    }
  }, [allowedAspectOptions, currentAspect, currentResolution, data.aspectRatio, data.resolution, id, updateNodeData]);

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

  useEffect(() => {
    if (!Number.isFinite(data.seed)) {
      updateNodeData(id, { seed: ensureSeed() });
    }
  }, [data.seed, id, updateNodeData]);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data.videoUrl) return;
    const link = document.createElement("a");
    link.href = data.videoUrl;
    link.download = "wan-video.mp4";
    link.rel = "noreferrer";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleAudioFile = async (file?: File | null) => {
    if (!file) return;
    setIsUploadingAudio(true);
    try {
      const safeName = file.name
        .normalize("NFKD")
        .replace(/[^\w.\-]+/g, "_")
        .toLowerCase();
      const payload = {
        fileName: `wan-audio/${Date.now()}-${safeName}`,
        bucket: "assets",
        contentType: file.type || "audio/mpeg",
      };
      const res = await fetch(buildApiUrl("/api/upload-url"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Upload URL error ${res.status}`);
      const dataRes = await res.json();
      if (!dataRes?.signedUrl) throw new Error("Missing signedUrl");

      const uploadRes = await fetch(dataRes.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": payload.contentType },
        body: file,
      });
      if (!uploadRes.ok) {
        const txt = await uploadRes.text();
        throw new Error(`Upload failed ${uploadRes.status}: ${txt}`);
      }
      let url = dataRes.publicUrl || "";
      if (!url && dataRes.path) {
        const signedRes = await fetch(buildApiUrl("/api/download-url"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: dataRes.path, bucket: dataRes.bucket || "assets" }),
        });
        if (signedRes.ok) {
          const signedData = await signedRes.json();
          url = signedData.signedUrl || "";
        }
      }
      if (!url) throw new Error("Missing audio URL");
      updateNodeData(id, { audioUrl: url, audioEnabled: true });
    } catch (e) {
      console.error(e);
    } finally {
      setIsUploadingAudio(false);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  };

  return (
    <BaseNode
      title={data.title || "WAN Video"}
      onTitleChange={(title) => updateNodeData(id, { title })}
      inputs={["image", "text"]}
      selected={selected}
    >
      <div className="space-y-4 flex-1 flex flex-col">
        {data.videoUrl ? (
          <div className="node-surface relative overflow-hidden rounded-[20px] shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <video
              controls
              playsInline
              disablePictureInPicture
              disableRemotePlayback
              controlsList="nodownload noplaybackrate noremoteplayback"
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
            className={`node-surface node-surface--dashed w-full aspect-video rounded-[20px] flex flex-col items-center justify-center transition-all duration-500 ${data.status === "loading"
              ? "border-amber-500/40 bg-amber-500/[0.02]"
              : "hover:border-emerald-500/30 hover:bg-emerald-500/[0.02]"
              }`}
          >
          {data.status === "loading" ? (
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

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 rounded-full ${data.status === "complete" ? "bg-emerald-500 shadow-[0_0_8px_var(--accent-green)]" : data.status === "loading" ? "bg-amber-500 animate-pulse" : "bg-[var(--node-text-secondary)] opacity-20"}`} />
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--node-text-secondary)]">{data.status}</span>
            </div>
            <div className="text-[9px] font-black uppercase tracking-widest text-[var(--node-text-secondary)]">
              WAN
            </div>
          </div>

          <div className="node-control node-control--tight w-full px-2 text-[var(--node-text-secondary)] text-[9px] font-bold text-center uppercase tracking-wide truncate">
            {QWEN_WAN_VIDEO_MODEL}
          </div>

          <div className="grid grid-cols-2 gap-1.5 nodrag">
            <select
              className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full nodrag"
              value={currentAspect}
              onChange={(e) => updateNodeData(id, { aspectRatio: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {allowedAspectOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full nodrag"
              value={data.duration || "10s"}
              onChange={(e) => updateNodeData(id, { duration: e.target.value })}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <option value="5s">5 Seconds</option>
              <option value="10s">10 Seconds</option>
              <option value="15s">15 Seconds</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-1.5 nodrag">
            <select
              className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full nodrag"
              value={currentResolution}
              onChange={(e) => {
                const nextResolution = e.target.value.toUpperCase();
                const nextOptions = aspectRatioOptions[nextResolution] || allowedAspectOptions;
                const nextAspect = nextOptions.some((opt) => opt.value === data.aspectRatio)
                  ? data.aspectRatio
                  : nextOptions[0].value;
                updateNodeData(id, { resolution: nextResolution, aspectRatio: nextAspect });
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <option value="480P">480P</option>
              <option value="720P">720P</option>
              <option value="1080P">1080P</option>
            </select>

            <select
              className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full nodrag"
              value={data.shotType || "multi"}
              onChange={(e) => updateNodeData(id, { shotType: e.target.value as "single" | "multi" })}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <option value="single">Single Shot</option>
              <option value="multi">Multi Shot</option>
            </select>
          </div>
        </div>

        <div className="node-panel space-y-2 p-3 nodrag">
          <label className="text-[8px] font-black uppercase tracking-widest text-[var(--node-text-secondary)] opacity-70">WAN 参数</label>
          <div className="flex items-center justify-between text-[9px] font-semibold text-[var(--node-text-secondary)]">
            <span>添加水印</span>
            <button
              className={`h-5 w-9 rounded-full border transition-all ${data.watermark ? "bg-emerald-500/20 border-emerald-400/40" : "bg-white/5 border-white/10"}`}
              onClick={() => updateNodeData(id, { watermark: !data.watermark })}
            >
              <span className={`block h-4 w-4 rounded-full bg-white/70 transition-all ${data.watermark ? "translate-x-4" : "translate-x-1"}`} />
            </button>
          </div>
          <div className="space-y-1">
            <label className="text-[8px] uppercase tracking-widest text-[var(--node-text-secondary)]">随机种子</label>
            <input
              type="number"
              min={0}
              className="node-control node-control--tight w-full text-[9px] font-semibold px-2 text-[var(--node-text-primary)] nodrag"
              value={data.seed ?? ""}
              onChange={(e) => {
                const next = e.target.value === "" ? undefined : Number(e.target.value);
                updateNodeData(id, { seed: Number.isFinite(next) ? next : undefined });
              }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
          <div className="flex items-center justify-between text-[9px] font-semibold text-[var(--node-text-secondary)]">
            <span>音频驱动</span>
            <button
              className={`h-5 w-9 rounded-full border transition-all ${data.audioEnabled ? "bg-emerald-500/20 border-emerald-400/40" : "bg-white/5 border-white/10"}`}
              onClick={() => updateNodeData(id, { audioEnabled: !data.audioEnabled })}
            >
              <span className={`block h-4 w-4 rounded-full bg-white/70 transition-all ${data.audioEnabled ? "translate-x-4" : "translate-x-1"}`} />
            </button>
          </div>
          {data.audioEnabled && (
            <div className="space-y-2">
              <input
                type="text"
                className="node-control node-control--tight w-full text-[9px] font-medium px-2 text-[var(--node-text-primary)] nodrag"
                placeholder="Audio URL (http/https)"
                value={data.audioUrl || ""}
                onChange={(e) => updateNodeData(id, { audioUrl: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                disabled={isUploadingAudio}
                className="node-button node-button-primary w-full h-9 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] disabled:opacity-60 nodrag"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {isUploadingAudio ? "Uploading..." : "上传音频"}
              </button>
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => handleAudioFile(e.target.files?.[0])}
              />
            </div>
          )}
        </div>

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
