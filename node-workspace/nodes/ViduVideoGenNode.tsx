import React, { useEffect, useMemo, useState } from "react";
import { BaseNode } from "./BaseNode";
import { ViduVideoGenNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { useNodeFlowExecutor } from "../store/useNodeFlowExecutor";
import { Settings2, RefreshCw, AlertCircle, Film, Sparkles, ShieldCheck, Download } from "lucide-react";

type Props = {
  id: string;
  data: ViduVideoGenNodeData;
  selected?: boolean;
};

export const ViduVideoGenNode: React.FC<Props> = ({ id, data, selected }) => {
  const { updateNodeData, getConnectedInputs } = useNodeFlowStore();
  const nodeFlowContext = useNodeFlowStore((state) => state.nodeFlowContext);
  const { runVideoGen } = useNodeFlowExecutor();
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [progress, setProgress] = useState(0);

  const { text: connectedText, images: connectedImages, atMentions, entityBindings, imageRefs } = getConnectedInputs(id);
  const isLoading = data.status === "loading";
  const resolvedIdentityMentions = useMemo(() => {
    const roles = nodeFlowContext?.context?.roles || [];
    const results: Array<{ name: string; status: "match" | "missing"; identityId?: string }> = [];
    const pushUnique = (item: { name: string; status: "match" | "missing"; identityId?: string }) => {
      if (results.find((entry) => entry.name === item.name && entry.identityId === item.identityId)) return;
      results.push(item);
    };
    (entityBindings || []).forEach((binding) => {
      if (binding.status !== "resolved") return;
      if (binding.entityType !== "identity" || !binding.identityId) return;
      const role = roles.find((entry) => entry.id === binding.identityId);
      if (!role) return;
      pushUnique({ name: role.mention, status: "match", identityId: role.id });
    });
    if (results.length) return results;
    return (atMentions || [])
      .filter((m) => !m.kind || m.kind === "identity")
      .map((m) => ({ name: m.mention || m.name, status: m.status, identityId: m.identityId }));
  }, [atMentions, entityBindings, nodeFlowContext?.context?.roles]);

  const derivedSubjects = useMemo(() => {
    if (data.subjects && data.subjects.length) return data.subjects.map(s => ({ name: s.id || "subject", status: 'manual', images: s.images?.length || 0 }));
    if (data.useCharacters !== false && resolvedIdentityMentions.length) {
      return resolvedIdentityMentions.map((m, idx) => ({
        name: m.name,
        status: m.status,
        images: (imageRefs || []).filter((r) => (m.identityId && r.identityId ? r.identityId === m.identityId : !!r.identityTag && r.identityTag.toLowerCase() === m.name.toLowerCase())).length
          || (connectedImages.length ? Math.ceil(connectedImages.length / resolvedIdentityMentions.length) : 0),
        order: idx + 1,
      }));
    }
    return [];
  }, [data.subjects, data.useCharacters, resolvedIdentityMentions, connectedImages.length, imageRefs]);

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

  const warnings = useMemo(() => {
    const msgs: string[] = [];
    if (data.mode !== "videoOnly") {
      if (!derivedSubjects.length) msgs.push("未检测到主体引用：请在提示词中添加 @身份证 或手动配置 subjects。");
      derivedSubjects.forEach((s) => {
        if ((s.images || 0) === 0) msgs.push(`主体 @${s.name} 缺少参考图，将影响生成质量。`);
        if (s.status === "missing") msgs.push(`主体 @${s.name} 未匹配身份证，请检查名称或创建身份。`);
      });
    } else if (data.mode === "videoOnly" && connectedImages.length === 0) {
      msgs.push("纯视频模式至少需要一张参考图。");
    }
    return msgs;
  }, [data.mode, derivedSubjects, connectedImages.length]);

  const handleGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await runVideoGen(id);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data.videoUrl) return;
    const link = document.createElement("a");
    link.href = data.videoUrl;
    link.download = "vidu-video.mp4";
    link.rel = "noreferrer";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <BaseNode
      title={data.title || "Vidu Reference2Video"}
      onTitleChange={(title) => updateNodeData(id, { title })}
      inputs={["image", "text"]}
      selected={selected}
    >
      <div className="space-y-4 flex-1 flex flex-col">
        {data.videoUrl ? (
          <div className="node-surface relative group/vid overflow-hidden rounded-[20px] shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
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
                  <span className="text-[8px] opacity-20 uppercase tracking-[0.1em] font-bold transition-all duration-500">Vidu reference2video</span>
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

        <div className="text-[10px] uppercase tracking-[0.2em] font-black text-[var(--node-text-secondary)]/70">
          {connectedImages.length} refs · {connectedText ? "Text in" : "Prompt needed"}
        </div>

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

        <div className="grid grid-cols-2 gap-1.5">
          <select
            className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full nodrag"
            value={data.mode || "audioVideo"}
            onChange={(e) => updateNodeData(id, { mode: e.target.value as any })}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <option value="audioVideo">音视频直出</option>
            <option value="videoOnly">纯视频直出</option>
          </select>
          <select
            className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full nodrag"
            value={data.resolution || "1080p"}
            onChange={(e) => updateNodeData(id, { resolution: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <option value="1080p">1080p</option>
            <option value="720p">720p</option>
            <option value="540p">540p</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <select
            className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full nodrag"
            value={data.aspectRatio || "16:9"}
            onChange={(e) => updateNodeData(id, { aspectRatio: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="4:3">4:3</option>
            <option value="3:4">3:4</option>
          </select>

          <select
            className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full nodrag"
            value={data.duration?.toString() || "10"}
            onChange={(e) => updateNodeData(id, { duration: parseInt(e.target.value, 10) })}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <option value="5">5s</option>
            <option value="8">8s</option>
            <option value="10">10s</option>
          </select>
        </div>

        {showAdvanced && (
          <div className="node-panel space-y-3 p-3 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-2 text-[9px] text-[var(--node-text-secondary)]">
              <Sparkles size={12} className="text-amber-300" />
              固定模型：viduq2-pro · 动效 {data.movementAmplitude || "auto"} · 错峰 {data.offPeak !== false ? "On" : "Off"}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[9px] text-[var(--node-text-secondary)]">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={data.offPeak !== false}
                  onChange={(e) => updateNodeData(id, { offPeak: e.target.checked })}
                  className="accent-[var(--node-accent)]"
                />
                错峰模式
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={data.mode === "audioVideo"}
                  onChange={(e) => updateNodeData(id, { mode: e.target.checked ? "audioVideo" : "videoOnly" })}
                  className="accent-[var(--node-accent)]"
                />
                音视频直出
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={data.useCharacters !== false}
                  onChange={(e) => updateNodeData(id, { useCharacters: e.target.checked })}
                  className="accent-[var(--node-accent)]"
                />
                使用身份定妆照主体
              </label>
            </div>
            <div className="node-control node-control--tight w-full text-[9px] font-medium px-2 text-[var(--node-text-primary)] outline-none appearance-none cursor-pointer transition-colors">
              <div className="flex items-center gap-2">
                <ShieldCheck size={12} className="text-emerald-300" />
                主体参考：{data.subjects?.length || 0} 组 · {connectedImages.length} 参考图连接
              </div>
            </div>
            {data.mode !== "videoOnly" && data.useCharacters !== false && (
              <div className="space-y-1">
                <div className="text-[8px] font-black uppercase tracking-widest text-[var(--node-text-secondary)] opacity-70">
                  解析到的主体（@引用）
                </div>
                {derivedSubjects.length === 0 ? (
                  <div className="text-[10px] text-amber-200">未检测到 @ 身份引用，建议在提示词中插入 @角色名 或 @角色名_槽位名。</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {derivedSubjects.map((s, idx) => (
                      <span
                        key={`${s.name}-${idx}`}
                        className={`px-2 py-1 rounded-full text-[10px] border ${
                          s.status === 'match'
                            ? 'bg-sky-500/15 border-sky-500/40 text-sky-100'
                            : 'bg-amber-500/15 border-amber-500/40 text-amber-100'
                        }`}
                      >
                        @{s.name} · 图 {s.images}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {warnings.length > 0 && (
              <div className="space-y-1">
                <div className="text-[8px] font-black uppercase tracking-widest text-amber-300">Warnings</div>
                <ul className="text-[10px] text-amber-200 list-disc list-inside space-y-0.5">
                  {warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                </ul>
              </div>
            )}
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
