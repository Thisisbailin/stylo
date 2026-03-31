import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Sparkles, AlertCircle, Download, X } from "lucide-react";
import { BaseNode } from "./BaseNode";
import { ImageGenNodeData } from "../types";
import { useWorkflowStore } from "../store/workflowStore";
import { useLabExecutor } from "../store/useLabExecutor";
import { NANOBANANA_IDENTITY_PROMPT, NANOBANANA_PRO_MODEL } from "../../constants";
import { getRoleDisplayLabel } from "../../utils/characterIdentity";

type Props = {
  id: string;
  data: ImageGenNodeData;
};

export const NanoBananaImageGenNode: React.FC<Props & { selected?: boolean }> = ({ id, data, selected }) => {
  const { updateNodeData, labContext, getConnectedInputs } = useWorkflowStore();
  const { runImageGen } = useLabExecutor();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const isLoading = data.status === "loading";
  const { connectedIdentity } = getConnectedInputs(id);

  const identityOptions = useMemo(() => {
    const roles = labContext?.context?.roles || [];
    return roles.map((role) => ({
      id: role.id,
      mention: role.mention,
      label: getRoleDisplayLabel(role),
    }));
  }, [labContext?.context?.roles]);

  const activeIdentityId = connectedIdentity?.identityId || data.identityId;
  const activeIdentity = useMemo(
    () => (labContext?.context?.roles || []).find((role) => role.id === activeIdentityId),
    [activeIdentityId, labContext?.context?.roles]
  );

  useEffect(() => {
    if (!isLoading) {
      setProgress(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const eased = 1 - Math.exp(-elapsed / 12000);
      setProgress(Math.min(95, Math.round(eased * 100)));
    }, 400);
    return () => clearInterval(timer);
  }, [isLoading]);

  useEffect(() => {
    if (!connectedIdentity) return;
    if (
      data.identityId === connectedIdentity.identityId &&
      data.identityTag === connectedIdentity.mention &&
      data.designCategory === "identity" &&
      data.designRefId === connectedIdentity.identityId
    ) {
      return;
    }
    updateNodeData(id, {
      identityId: connectedIdentity.identityId,
      identityTag: connectedIdentity.mention,
      designCategory: "identity",
      designRefId: connectedIdentity.identityId,
    });
  }, [connectedIdentity, data.designCategory, data.designRefId, data.identityId, data.identityTag, id, updateNodeData]);

  const handleGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await runImageGen(id);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data.outputImage) return;
    const link = document.createElement("a");
    link.href = data.outputImage;
    link.download = "nano-banana-image.png";
    link.rel = "noreferrer";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <BaseNode
      title={data.title || "Nano Banana"}
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
              <img src={data.outputImage} alt="generated" className="node-media-preview bg-black/40" />
            </div>
          ) : (
            <div
              onClick={handleGenerate}
              className={`node-surface node-surface--dashed w-full h-[180px] rounded-[24px] flex flex-col items-center justify-center transition-all duration-500 overflow-hidden relative ${
                isLoading
                  ? "border-amber-500/40 bg-amber-500/[0.02]"
                  : "hover:border-emerald-500/30 hover:bg-emerald-500/[0.02]"
              }`}
            >
              {isLoading ? (
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

        <div className="node-panel space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[8px] font-black uppercase tracking-widest text-[var(--node-text-secondary)] opacity-70">身份绑定</label>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsPromptOpen(true);
              }}
              className="rounded-full border border-[var(--node-border)] px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-[var(--node-text-secondary)] hover:text-[var(--node-text-primary)]"
            >
              查看固定提示词
            </button>
          </div>
          {connectedIdentity ? (
            <div className="space-y-2">
              <div className="rounded-[16px] border border-emerald-400/20 bg-emerald-500/8 px-3 py-2">
                <div className="text-[10px] font-semibold text-emerald-200">{activeIdentity?.name || connectedIdentity.name}</div>
                <div className="text-[9px] text-emerald-100/75">@{connectedIdentity.mention}</div>
              </div>
              <div className="text-[8px] leading-relaxed text-[var(--node-text-secondary)]/75">
                已通过身份卡片自动绑定。生成结果会直接写回该身份的主定妆照槽位。
              </div>
            </div>
          ) : identityOptions.length > 0 ? (
            <>
              <select
                className="node-control node-control--tight w-full text-[9px] font-medium px-2 text-[var(--node-text-primary)] outline-none appearance-none cursor-pointer transition-colors"
                value={data.identityId || ""}
                onChange={(e) => {
                  const nextIdentityId = e.target.value || undefined;
                  const selectedIdentity = identityOptions.find((item) => item.id === nextIdentityId);
                  updateNodeData(id, {
                    identityId: nextIdentityId,
                    identityTag: selectedIdentity?.mention,
                    designCategory: nextIdentityId ? "identity" : undefined,
                    designRefId: nextIdentityId,
                  });
                }}
              >
                <option value="">未指定</option>
                {identityOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              <div className="text-[8px] leading-relaxed text-[var(--node-text-secondary)]/75">
                如果连接了身份卡片，这里会自动切换为卡片里的身份，并启用固定三视图提示词。
              </div>
            </>
          ) : (
            <div className="text-[8px] leading-relaxed text-[var(--node-text-secondary)]/75">
              当前项目没有可绑定的身份。
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 rounded-full ${data.status === "complete" ? "bg-emerald-500 shadow-[0_0_8px_var(--accent-green)]" : isLoading ? "bg-amber-500 animate-pulse" : "bg-[var(--node-text-secondary)] opacity-30"}`} />
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--node-text-secondary)]">{data.status || "idle"}</span>
            </div>
            <div className="text-[9px] font-black uppercase tracking-widest text-[var(--node-text-secondary)]">
              Nano Banana
            </div>
          </div>

          <div className="node-control node-control--tight w-full px-2 text-[var(--node-text-secondary)] text-[9px] font-bold text-center uppercase tracking-wide truncate">
            {NANOBANANA_PRO_MODEL}
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <select
              className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full"
              value={data.aspectRatio || "1:1"}
              onChange={(e) => updateNodeData(id, { aspectRatio: e.target.value })}
            >
              <option value="auto">auto</option>
              <option value="1:1">1:1 Square</option>
              <option value="16:9">16:9 Landscape</option>
              <option value="9:16">9:16 Portrait</option>
              <option value="4:3">4:3 Standard</option>
              <option value="3:4">3:4 Portrait</option>
              <option value="3:2">3:2</option>
              <option value="2:3">2:3</option>
              <option value="5:4">5:4</option>
              <option value="4:5">4:5</option>
              <option value="21:9">21:9 Ultrawide</option>
            </select>
          </div>
        </div>

        {data.error && (
          <div className="node-alert p-3 flex gap-2 items-start animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <span className="text-[10px] text-red-500/90 font-medium leading-tight">{data.error}</span>
          </div>
        )}
      </div>

      {isPreviewOpen && data.outputImage && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setIsPreviewOpen(false)}>
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <button
              className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center border border-white/10 shadow-lg"
              onClick={(e) => {
                e.stopPropagation();
                setIsPreviewOpen(false);
              }}
              aria-label="Close preview"
            >
              <X size={18} />
            </button>
            <img src={data.outputImage} alt="generated preview" className="max-h-[90vh] max-w-[90vw] rounded-2xl border border-white/10 shadow-2xl" />
          </div>
        </div>
      )}

      {isPromptOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setIsPromptOpen(false)}>
          <div
            className="relative w-full max-w-xl rounded-[28px] border border-[var(--node-border)] bg-[rgba(12,16,14,0.96)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute right-4 top-4 h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              onClick={() => setIsPromptOpen(false)}
              aria-label="Close prompt preview"
            >
              <X size={16} />
            </button>
            <div className="pr-10">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--node-text-secondary)]">Fixed Prompt</div>
              <div className="mt-2 text-sm font-semibold text-[var(--node-text-primary)]">身份卡片直连时自动附加</div>
            </div>
            <pre className="mt-4 whitespace-pre-wrap rounded-[20px] border border-[var(--node-border)] bg-black/20 p-4 text-[12px] leading-6 text-[var(--node-text-secondary)]">
              {NANOBANANA_IDENTITY_PROMPT}
            </pre>
          </div>
        </div>
      )}
    </BaseNode>
  );
};
