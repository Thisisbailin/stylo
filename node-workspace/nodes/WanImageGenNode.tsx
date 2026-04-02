import React, { useEffect, useMemo, useState } from "react";
import { BaseNode } from "./BaseNode";
import { ImageGenNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { useNodeFlowExecutor } from "../store/useNodeFlowExecutor";
import { RefreshCw, Sparkles, AlertCircle, Download, X } from "lucide-react";
import { QWEN_WAN_IMAGE_MODEL } from "../../constants";
import { getRoleDisplayLabel } from "../../utils/characterIdentity";
import { NodeExecutionApprovalPanel } from "../components/NodeExecutionApprovalPanel";

type Props = {
  id: string;
  data: ImageGenNodeData;
};

export const WanImageGenNode: React.FC<Props & { selected?: boolean }> = ({ id, data, selected }) => {
  const { updateNodeData, getConnectedInputs, nodeFlowContext } = useNodeFlowStore();
  const approval = useNodeFlowStore((state) => state.pendingExecutionApprovals[id]);
  const { runImageGen, approveExecution, dismissExecutionApproval } = useNodeFlowExecutor();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const ensureSeed = () => Math.floor(Math.random() * 1_000_000_000);

  const handleGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await runImageGen(id);
  };

  const { images: connectedImages } = getConnectedInputs(id);
  const enableInterleave = data.enableInterleave ?? false;
  const effectiveInterleave = enableInterleave || connectedImages.length === 0;
  const outputCount = Math.max(1, Math.min(4, data.outputCount ?? 1));
  const isLoading = data.status === "loading";

  const identityOptions = useMemo(() => {
    const roles = nodeFlowContext?.context?.roles || [];
    return roles.map((role) => ({
      id: role.id,
      mention: role.mention,
      label: getRoleDisplayLabel(role),
    }));
  }, [nodeFlowContext?.context?.roles]);

  useEffect(() => {
    if (!isLoading) {
      setProgress(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const eased = 1 - Math.exp(-elapsed / 12000);
      const next = Math.min(95, Math.round(eased * 100));
      setProgress(next);
    }, 400);
    return () => clearInterval(timer);
  }, [isLoading]);

  useEffect(() => {
    if (!Number.isFinite(data.seed)) {
      updateNodeData(id, { seed: ensureSeed() });
    }
  }, [data.seed, id, updateNodeData]);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data.outputImage) return;
    const link = document.createElement("a");
    link.href = data.outputImage;
    link.download = "wan-image.png";
    link.rel = "noreferrer";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <BaseNode
      title={data.title || "WAN Image"}
      onTitleChange={(title) => updateNodeData(id, { title })}
      inputs={["image", "text"]}
      outputs={["image"]}
      selected={selected}
    >
      <div className="space-y-4 flex-1 flex flex-col">
        <div className={`relative group/img cursor-pointer ${data.outputImage ? "" : "h-[180px]"}`}>
          {data.outputImage ? (
            <div
              className="node-surface node-media-frame relative overflow-hidden rounded-[24px] shadow-[0_18px_40px_rgba(0,0,0,0.45)] group-hover/img:border-white/30 transition-all"
              onClick={(e) => {
                e.stopPropagation();
                setIsPreviewOpen(true);
              }}
            >
              <img
                src={data.outputImage}
                alt="generated"
                className="node-media-preview bg-black/40"
              />
            </div>
          ) : (
            <div
              onClick={handleGenerate}
              className={`node-surface node-surface--dashed w-full h-[180px] rounded-[24px] flex flex-col items-center justify-center transition-all duration-500 overflow-hidden relative ${data.status === "loading"
                ? "border-amber-500/40 bg-amber-500/[0.02]"
                : "hover:border-emerald-500/30 hover:bg-emerald-500/[0.02]"
                }`}
            >
              {data.status === "loading" ? (
                <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full border-2 border-amber-500/10 border-t-amber-500 animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto text-amber-500 animate-pulse" size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500/80">Imaging...</span>
                  <div className="w-full max-w-[180px] space-y-2">
                    <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-amber-400 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="text-[9px] font-semibold text-amber-300/80 text-center">{progress}%</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="h-14 w-14 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4 group-hover/img:scale-110 group-hover/img:bg-emerald-500/10 group-hover/img:border-emerald-500/20 transition-all duration-500 shadow-inner">
                    <Sparkles className="text-[var(--node-text-secondary)] group-hover/img:text-emerald-500 transition-colors" size={28} />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] opacity-40 uppercase tracking-[0.2em] font-black group-hover/img:opacity-100 transition-all duration-500 translate-y-2 group-hover/img:translate-y-0 text-white">GENERATE</span>
                    <span className="text-[8px] opacity-20 uppercase tracking-[0.1em] font-bold group-hover/img:opacity-40 transition-all duration-500">Click to run flow</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {data.outputImage && (
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
              >
                <RefreshCw size={12} />
                重试
              </button>
            )}
          </div>
        )}

        {approval ? (
          <NodeExecutionApprovalPanel
            proposal={approval}
            busy={isLoading}
            onApprove={() => approveExecution(id)}
            onDismiss={() => dismissExecutionApproval(id)}
          />
        ) : null}

        {identityOptions.length > 0 && (
          <div className="node-panel space-y-2 p-3">
            <label className="text-[8px] font-black uppercase tracking-widest text-[var(--node-text-secondary)] opacity-70">关联身份证</label>
            <select
              className="node-control node-control--tight w-full text-[9px] font-medium px-2 text-[var(--node-text-primary)] outline-none appearance-none cursor-pointer transition-colors"
              value={data.identityId || ""}
              onChange={(e) => {
                const nextIdentityId = e.target.value || undefined;
                const selected = identityOptions.find((item) => item.id === nextIdentityId);
                updateNodeData(id, {
                  identityId: nextIdentityId,
                  identityTag: selected?.mention,
                });
              }}
            >
              <option value="">未指定</option>
              {identityOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 rounded-full ${data.status === "complete" ? "bg-emerald-500 shadow-[0_0_8px_var(--accent-green)]" : data.status === "loading" ? "bg-amber-500 animate-pulse" : "bg-[var(--node-text-secondary)] opacity-30"}`} />
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--node-text-secondary)]">{data.status || "idle"}</span>
            </div>
            <div className="text-[9px] font-black uppercase tracking-widest text-[var(--node-text-secondary)]">
              WAN
            </div>
          </div>

          <div className="node-control node-control--tight w-full px-2 text-[var(--node-text-secondary)] text-[9px] font-bold text-center uppercase tracking-wide truncate">
            {QWEN_WAN_IMAGE_MODEL}
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <select
              className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full"
              value={data.aspectRatio || "1:1"}
              onChange={(e) => updateNodeData(id, { aspectRatio: e.target.value })}
            >
              <option value="1:1">1:1 Square</option>
              <option value="16:9">16:9 Landscape</option>
              <option value="9:16">9:16 Portrait</option>
              <option value="4:3">4:3 Standard</option>
              <option value="21:9">21:9 Ultrawide</option>
            </select>
          </div>
        </div>

        <div className="node-panel space-y-2 p-3">
          <label className="text-[8px] font-black uppercase tracking-widest text-[var(--node-text-secondary)] opacity-70">WAN 参数</label>
          <div className="flex items-center justify-between text-[9px] font-semibold text-[var(--node-text-secondary)]">
            <span>模式</span>
            <span className="text-[8px] uppercase tracking-widest opacity-70">
              {effectiveInterleave ? "图文理解/混排（含纯文本）" : "图像编辑"}
            </span>
            <button
              className={`h-5 w-9 rounded-full border transition-all ${enableInterleave ? "bg-emerald-500/20 border-emerald-400/40" : "bg-white/5 border-white/10"}`}
              onClick={() => updateNodeData(id, { enableInterleave: !enableInterleave })}
            >
              <span className={`block h-4 w-4 rounded-full bg-white/70 transition-all ${enableInterleave ? "translate-x-4" : "translate-x-1"}`} />
            </button>
          </div>
          <div className="text-[8px] text-[var(--node-text-secondary)]/70">
            {effectiveInterleave ? "支持纯文本或 0-1 张图" : "需要 1-4 张参考图"}
          </div>
          {!enableInterleave && connectedImages.length === 0 && (
            <div className="text-[8px] text-amber-300/80">
              当前无参考图，系统将按“图文理解/混排（文生图）”处理。
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[8px] uppercase tracking-widest text-[var(--node-text-secondary)]">输出张数</label>
              <input
                type="number"
                min={1}
                max={4}
                className="node-control node-control--tight w-full text-[9px] font-semibold px-2 text-[var(--node-text-primary)]"
                value={outputCount}
                onChange={(e) => updateNodeData(id, { outputCount: Number(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] uppercase tracking-widest text-[var(--node-text-secondary)]">随机种子</label>
              <input
                type="number"
                min={0}
                className="node-control node-control--tight w-full text-[9px] font-semibold px-2 text-[var(--node-text-primary)]"
                value={data.seed ?? ""}
                onChange={(e) => {
                  const next = e.target.value === "" ? undefined : Number(e.target.value);
                  updateNodeData(id, { seed: Number.isFinite(next) ? next : undefined });
                }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-[9px] font-semibold text-[var(--node-text-secondary)]">
            <span>添加水印</span>
            <button
              className={`h-5 w-9 rounded-full border transition-all ${data.watermark ? "bg-emerald-500/20 border-emerald-400/40" : "bg-white/5 border-white/10"}`}
              onClick={() => updateNodeData(id, { watermark: !data.watermark })}
            >
              <span className={`block h-4 w-4 rounded-full bg-white/70 transition-all ${data.watermark ? "translate-x-4" : "translate-x-1"}`} />
            </button>
          </div>
        </div>

        {data.error && (
          <div className="node-alert p-3 flex gap-2 items-start animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <span className="text-[10px] text-red-500/90 font-medium leading-tight">
              {data.error}
            </span>
          </div>
        )}
      </div>

      {isPreviewOpen && data.outputImage && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setIsPreviewOpen(false)}>
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <button
              className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center border border-white/10 shadow-lg"
              onClick={() => setIsPreviewOpen(false)}
            >
              <X size={18} />
            </button>
            <img src={data.outputImage} alt="Preview" className="max-h-[90vh] max-w-[90vw] rounded-2xl border border-white/10" />
          </div>
        </div>
      )}
    </BaseNode>
  );
};
