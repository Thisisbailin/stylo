import React, { useEffect, useMemo, useState } from "react";
import { BaseNode } from "./BaseNode";
import { ViduVideoGenNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { useNodeFlowExecutor } from "../store/useNodeFlowExecutor";
import { Settings2, RefreshCw, AlertCircle, Film, Download, Layers, Sparkles, ArrowRightLeft } from "lucide-react";
import * as ViduService from "../../services/viduService";
import { INITIAL_VIDU_CONFIG } from "../../constants";

type Props = {
  id: string;
  data: ViduVideoGenNodeData;
  selected?: boolean;
};

const formatElapsedMs = (ms?: number | null) => {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
};

const buildTimingRows = (data: ViduVideoGenNodeData, now: number) => {
  const requestedAt = typeof data.taskRequestedAt === "number" ? data.taskRequestedAt : null;
  const submittedAt = typeof data.taskSubmittedAt === "number" ? data.taskSubmittedAt : null;
  const processingStartedAt = typeof data.processingStartedAt === "number" ? data.processingStartedAt : null;
  const completedAt = typeof data.taskCompletedAt === "number" ? data.taskCompletedAt : null;
  const activeEnd = completedAt ?? now;

  if (!requestedAt) return null;

  const submitEnd = submittedAt ?? activeEnd;
  const queueEnd = processingStartedAt ?? (submittedAt ? activeEnd : null);
  const processingEnd = processingStartedAt ? activeEnd : null;

  return [
    {
      label: "提交",
      value: formatElapsedMs(submitEnd - requestedAt),
      muted: Boolean(submittedAt),
    },
    {
      label: "排队",
      value: submittedAt && queueEnd ? formatElapsedMs(queueEnd - submittedAt) : "—",
      muted: Boolean(processingStartedAt || completedAt),
    },
    {
      label: "生成",
      value: processingEnd ? formatElapsedMs(processingEnd - processingStartedAt!) : "—",
      muted: Boolean(completedAt),
    },
    {
      label: "总计",
      value: formatElapsedMs(activeEnd - requestedAt),
      muted: Boolean(completedAt),
    },
  ];
};

const normalizeMode = (mode?: string) => {
  if (mode === "audioVideo") return "subject";
  if (mode === "videoOnly") return "nonSubject";
  return mode === "nonSubject" ? "nonSubject" : "subject";
};

const estimateCredits = (model: string, resolution: string, duration: number, offPeak: boolean) => {
  const normalizedModel = (model || "").toLowerCase();
  const normalizedResolution = (resolution || "").toLowerCase();
  const pricing: Record<string, Record<string, number>> = {
    viduq3: {
      "540p": 10,
      "720p": 20,
      "1080p": 25,
    },
    "viduq3-mix": {
      "720p": 25,
      "1080p": 30,
    },
  };
  const rate = pricing[normalizedModel]?.[normalizedResolution];
  if (!rate || !Number.isFinite(duration)) return null;
  return {
    rate,
    total: rate * duration,
    offPeak,
  };
};

export const ViduVideoGenNode: React.FC<Props> = ({ id, data, selected }) => {
  const { updateNodeData, getConnectedInputs, convertNodeToVideoInput } = useNodeFlowStore();
  const nodeFlowContext = useNodeFlowStore((state) => state.nodeFlowContext);
  const appConfig = useNodeFlowStore((state) => state.appConfig);
  const { runVideoGen } = useNodeFlowExecutor();
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const { text: connectedText, images: connectedImages, atMentions, entityBindings, imageRefs } = getConnectedInputs(id);
  const isLoading = data.status === "loading";
  const normalizedTaskState = (data.taskState || "").toLowerCase();
  const isQueueing =
    isLoading &&
    (!!normalizedTaskState &&
      (normalizedTaskState.includes("queue") ||
        normalizedTaskState.includes("schedule") ||
        normalizedTaskState.includes("pending") ||
        normalizedTaskState.includes("wait"))) ||
    (isLoading && !data.progressLabel);
  const isProcessing =
    isLoading &&
    !!normalizedTaskState &&
    (normalizedTaskState.includes("process") || normalizedTaskState.includes("run") || normalizedTaskState.includes("generat"));
  const progress = isProcessing ? Math.max(0, Math.min(100, Number(data.progressPercent) || 0)) : 0;
  const model = data.model || "viduq3";
  const requestedMode = normalizeMode(data.mode);
  const effectiveMode = model === "viduq3-mix" ? "nonSubject" : requestedMode;
  const creditsEstimate = useMemo(
    () => estimateCredits(model, data.resolution || "720p", data.duration || 5, data.offPeak === true),
    [data.duration, data.offPeak, data.resolution, model]
  );
  const timingRows = useMemo(() => buildTimingRows(data, now), [data, now]);

  const resolvedIdentityMentions = useMemo(() => {
    const roles = nodeFlowContext?.roles || [];
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
  }, [atMentions, entityBindings, nodeFlowContext?.roles]);

  const derivedSubjects = useMemo(() => {
    if (data.subjects && data.subjects.length) {
      return data.subjects.map((subject) => ({
        name: subject.name,
        status: "manual" as const,
        images: subject.images?.length || 0,
        videos: subject.videos?.length || 0,
      }));
    }
    if (data.useCharacters !== false && resolvedIdentityMentions.length) {
      return resolvedIdentityMentions.map((mention) => ({
        name: mention.name,
        status: mention.status,
        images:
          (imageRefs || []).filter((ref) =>
            mention.identityId && ref.identityId ? ref.identityId === mention.identityId : !!ref.identityTag && ref.identityTag.toLowerCase() === mention.name.toLowerCase()
          ).length || 0,
        videos: 0,
      }));
    }
    return [];
  }, [data.subjects, data.useCharacters, resolvedIdentityMentions, imageRefs]);

  useEffect(() => {
    if (model === "viduq3-mix" && requestedMode === "subject") {
      updateNodeData(id, { mode: "nonSubject" });
    }
  }, [id, model, requestedMode, updateNodeData]);

  useEffect(() => {
    if (!data.taskRequestedAt || data.taskCompletedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [data.taskCompletedAt, data.taskRequestedAt]);

  const warnings = useMemo(() => {
    const msgs: string[] = [];
    if (model === "viduq3-mix") {
      msgs.push("viduq3-mix 暂不支持主体调用与主体库能力，已自动切换到非主体调用。");
    }
    if (effectiveMode === "subject") {
      if (!derivedSubjects.length) msgs.push("Q3 主体调用需要主体来源。请连接身份图，或切换到非主体调用。");
    } else if (connectedImages.length === 0) {
      msgs.push("Q3 非主体调用至少需要 1 张参考图。");
    }
    if (data.offPeak && model === "viduq3-mix") {
      msgs.push("viduq3-mix 不支持错峰模式。");
    }
    if (data.bgm && (model === "viduq3" || model === "viduq3-mix")) {
      msgs.push("Q3 系列模型当前不支持 BGM 参数。");
    }
    return msgs;
  }, [connectedImages.length, data.bgm, data.offPeak, derivedSubjects.length, effectiveMode, model]);

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

  const handleProbeCredits = async (e: React.MouseEvent) => {
    e.stopPropagation();
    updateNodeData(id, {
      authProbeStatus: "loading",
      authProbeSummary: "正在查询积分接口…",
      authProbeDetail: null,
    });
    try {
      const credits = await ViduService.fetchViduCredits({
        ...(appConfig?.viduConfig || INITIAL_VIDU_CONFIG),
        apiKey: "",
      });
      const remains = Array.isArray(credits.remains) ? credits.remains : [];
      const packages = Array.isArray(credits.packages) ? credits.packages : [];
      const totalCreditsFromPackages = packages.reduce((sum, item) => sum + (Number(item.credit_remain) || 0), 0);
      const totalCreditsFromRemains = remains.reduce((sum, item) => sum + (Number(item.credit_remain) || 0), 0);
      const totalCredits = totalCreditsFromPackages > 0 ? totalCreditsFromPackages : totalCreditsFromRemains;
      const currentConcurrency = remains.reduce((sum, item) => sum + (Number(item.current_concurrency) || 0), 0);
      const concurrencyLimit = remains.reduce((sum, item) => sum + (Number(item.concurrency_limit) || 0), 0);
      const queueCount = remains.reduce((sum, item) => sum + (Number(item.queue_count) || 0), 0);
      const summary =
        totalCredits > 0 || concurrencyLimit > 0
          ? `鉴权成功 · 总积分 ${totalCredits || 0} · 并发 ${currentConcurrency}/${concurrencyLimit || 0} · 排队 ${queueCount}`
          : `鉴权成功 · 已返回 ${packages.length} 个积分包`;
      const detail = JSON.stringify(
        {
          totalCredits,
          currentConcurrency,
          concurrencyLimit,
          queueCount,
          remains,
          packages: packages.map((item) => ({
            name: item.name,
            type: item.type,
            credit_remain: item.credit_remain,
            concurrency: item.concurrency,
            valid_to: item.valid_to,
          })),
          activeModel: model,
        },
        null,
        2
      );
      updateNodeData(id, {
        authProbeStatus: "complete",
        authProbeSummary: summary,
        authProbeDetail: detail,
      });
    } catch (err: any) {
      updateNodeData(id, {
        authProbeStatus: "error",
        authProbeSummary: "查询积分接口失败",
        authProbeDetail: err?.message || "Unknown Vidu credits probe error.",
      });
    }
  };

  return (
    <BaseNode
      title={data.title || "Vidu"}
      onTitleChange={(title) => updateNodeData(id, { title })}
      inputs={["image", "text"]}
      selected={selected}
      headerActions={
        data.videoUrl && !isLoading ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              convertNodeToVideoInput(id);
            }}
            title="转为 Video 节点"
            aria-label="转为 Video 节点"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--node-border)] text-[var(--node-text-secondary)] transition hover:border-[var(--node-border-strong)] hover:text-[var(--node-text-primary)] nodrag"
          >
            <ArrowRightLeft size={12} />
          </button>
        ) : null
      }
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
            className={`node-surface node-surface--dashed w-full aspect-video rounded-[20px] flex flex-col items-center justify-center transition-all duration-500 ${
              isLoading ? "border-amber-500/40 bg-amber-500/[0.02]" : "hover:border-emerald-500/30 hover:bg-emerald-500/[0.02]"
            }`}
          >
            {isLoading ? (
              <div className="flex flex-col items-center gap-3">
                <RefreshCw size={24} className="text-[var(--node-accent)] animate-spin" />
                <span className="text-[10px] opacity-50 uppercase tracking-[0.2em] font-black">
                  {isQueueing ? "排队中..." : data.progressLabel || "Generating..."}
                </span>
                {isProcessing && (
                  <div className="w-full max-w-[180px] space-y-2">
                    <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-amber-400 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="text-[9px] font-semibold text-amber-300/80 text-center">{progress}%</div>
                  </div>
                )}
                {(isQueueing || data.progressHint) && (
                  <div className="max-w-[220px] text-center text-[9px] leading-4 text-[var(--node-text-secondary)]">
                    {isQueueing ? "等待 Vidu 分配算力后开始生成，排队阶段不计入超时。" : data.progressHint}
                  </div>
                )}
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

        {effectiveMode === "nonSubject" && connectedImages.length > 0 && (
          <div className="node-panel space-y-2 p-3">
            <div className="text-[8px] font-black uppercase tracking-widest text-[var(--node-text-secondary)] opacity-70">
              参考图编号
            </div>
            <div className="flex flex-wrap gap-1.5">
              {connectedImages.map((_, index) => (
                <span
                  key={`vidu-non-subject-ref-${index}`}
                  className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-100"
                >
                  图{index + 1}
                </span>
              ))}
            </div>
            <div className="text-[9px] leading-5 text-[var(--node-text-secondary)]">
              非主体调用时，系统会按输入顺序为参考图附加“图1 / 图2 / 图3 …”说明，并自动拼到提交 prompt 前。
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="node-panel space-y-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[8px] font-black uppercase tracking-widest text-[var(--node-text-secondary)] opacity-70">
                任务进度
              </div>
              <div className="text-[9px] font-black uppercase tracking-widest text-amber-200">
                {data.taskState || "processing"}
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--node-text-secondary)]">
              <span>{data.progressLabel || "处理中"}</span>
              <span>{progress}%</span>
            </div>
            <div className="text-[9px] leading-5 text-[var(--node-text-secondary)]">
              {data.progressHint || "当前接口只返回任务状态，不返回精确百分比；这里按排队/处理中阶段估算。"}
            </div>
          </div>
        )}

        {isQueueing && (
          <div className="node-panel space-y-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[8px] font-black uppercase tracking-widest text-[var(--node-text-secondary)] opacity-70">
                任务状态
              </div>
              <div className="text-[9px] font-black uppercase tracking-widest text-amber-200">
                {data.taskState || "scheduled"}
              </div>
            </div>
            <div className="text-[10px] text-amber-100">排队中...</div>
            <div className="text-[9px] leading-5 text-[var(--node-text-secondary)]">
              当前没有官方百分比进度。错峰模式下会先排队，待算力空闲后再开始生成；排队阶段不计入超时。
            </div>
          </div>
        )}

        <div className="node-panel space-y-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[8px] font-black uppercase tracking-widest text-[var(--node-text-secondary)] opacity-70">
              预计消耗积分
            </div>
            <div className="text-[9px] font-black uppercase tracking-widest text-[var(--node-text-secondary)]">
              {creditsEstimate ? `${creditsEstimate.total}` : "N/A"}
            </div>
          </div>
          <div className="text-[10px] leading-5 text-[var(--node-text-secondary)]">
            {creditsEstimate
              ? `${model} · ${data.resolution || "720p"} · ${data.duration || 5}s = ${creditsEstimate.rate}/秒，共 ${creditsEstimate.total} 积分`
              : "当前只按 Q3 文档中的 viduq3 / viduq3-mix 定价表估算。"}
          </div>
          {creditsEstimate?.offPeak && (
            <div className="text-[9px] text-amber-200">
              错峰模式价格更低，但官方 Q3 PDF 未给出精确折扣，这里显示的是标准档估算。
            </div>
          )}
          {typeof data.lastCreditsCost === "number" && (
            <div className="rounded-[14px] border border-emerald-400/20 bg-emerald-500/8 px-3 py-2 text-[10px] text-emerald-100">
              上次提交返回积分：{data.lastCreditsCost}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-1.5 w-1.5 rounded-full ${data.status === "complete" ? "bg-emerald-500 shadow-[0_0_8px_var(--accent-green)]" : isLoading ? "bg-amber-500 animate-pulse" : "bg-[var(--node-text-secondary)] opacity-20"}`} />
            <span className="text-[9px] font-black uppercase tracking-widest text-[var(--node-text-secondary)]">{data.status}</span>
          </div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`p-1 rounded-full node-control hover:bg-white/10 transition-colors ${showAdvanced ? "text-[var(--node-accent)] bg-white/5" : "text-[var(--node-text-secondary)]"}`}
          >
            <Settings2 size={12} />
          </button>
        </div>

        {timingRows && (
          <div className="node-panel space-y-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[8px] font-black uppercase tracking-widest text-[var(--node-text-secondary)] opacity-70">
                本次用时
              </div>
              <div className="text-[9px] font-black uppercase tracking-widest text-[var(--node-text-secondary)]">
                {data.taskState || data.status}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {timingRows.map((row) => (
                <div key={row.label} className="rounded-[14px] border border-white/8 bg-black/15 px-3 py-2">
                  <div className="text-[8px] font-black uppercase tracking-widest text-[var(--node-text-secondary)] opacity-60">
                    {row.label}
                  </div>
                  <div className={`mt-1 text-[11px] font-semibold ${row.muted ? "text-[var(--node-text-secondary)]" : "text-[var(--node-text-primary)]"}`}>
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          <select
            className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full nodrag"
            value={model}
            onChange={(e) => updateNodeData(id, { model: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <option value="viduq3">viduq3</option>
            <option value="viduq3-mix">viduq3-mix</option>
          </select>
          <select
            className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full nodrag"
            value={requestedMode}
            onChange={(e) => updateNodeData(id, { mode: e.target.value as any })}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <option value="subject">主体调用</option>
            <option value="nonSubject">非主体调用</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <select
            className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full nodrag"
            value={data.aspectRatio || "16:9"}
            onChange={(e) => updateNodeData(id, { aspectRatio: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <option value="auto">auto</option>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
            <option value="4:3">4:3</option>
            <option value="3:4">3:4</option>
          </select>
          <select
            className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full nodrag"
            value={data.resolution || "720p"}
            onChange={(e) => updateNodeData(id, { resolution: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <option value="540p">540p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <select
            className="node-control node-control--tight text-[9px] font-bold px-2 text-[var(--node-text-secondary)] outline-none appearance-none cursor-pointer transition-colors w-full nodrag"
            value={String(data.duration || 5)}
            onChange={(e) => updateNodeData(id, { duration: parseInt(e.target.value, 10) })}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <option value="3">3s</option>
            <option value="5">5s</option>
            <option value="8">8s</option>
            <option value="10">10s</option>
            <option value="12">12s</option>
            <option value="16">16s</option>
          </select>
          <div className="node-control node-control--tight w-full px-2 text-[var(--node-text-secondary)] text-[9px] font-bold text-center uppercase tracking-wide truncate">
            {effectiveMode === "subject" ? "Subject Prompt" : "Image Prompt"}
          </div>
        </div>

        {showAdvanced && (
          <div className="node-panel space-y-3 p-3 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-2 text-[9px] text-[var(--node-text-secondary)]">
              <Sparkles size={12} className="text-amber-300" />
              Vidu · 国内区 Q3 参考生视频 · 当前模型 {model} · 实际模式 {effectiveMode === "subject" ? "主体调用" : "非主体调用"}
            </div>

            <div className="grid grid-cols-2 gap-2 text-[9px] text-[var(--node-text-secondary)]">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={data.audioEnabled !== false}
                  onChange={(e) => updateNodeData(id, { audioEnabled: e.target.checked })}
                  className="accent-[var(--node-accent)]"
                />
                音视频直出
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={data.offPeak === true}
                  onChange={(e) => updateNodeData(id, { offPeak: e.target.checked })}
                  className="accent-[var(--node-accent)]"
                />
                错峰模式
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={data.watermark === true}
                  onChange={(e) => updateNodeData(id, { watermark: e.target.checked })}
                  className="accent-[var(--node-accent)]"
                />
                水印
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={data.useCharacters !== false}
                  onChange={(e) => updateNodeData(id, { useCharacters: e.target.checked })}
                  className="accent-[var(--node-accent)]"
                />
                使用身份主体
              </label>
            </div>

            <div className="node-control node-control--tight w-full text-[9px] font-medium px-2 text-[var(--node-text-primary)] outline-none transition-colors">
              <div className="flex items-center gap-2">
                <Layers size={12} className="text-emerald-300" />
                主体候选：{derivedSubjects.length} 组 · 连接参考图 {connectedImages.length} 张
              </div>
            </div>

            {effectiveMode === "subject" && (
              <div className="space-y-1">
                <div className="text-[8px] font-black uppercase tracking-widest text-[var(--node-text-secondary)] opacity-70">
                  Prompt 占位规则
                </div>
                <div className="text-[10px] leading-5 text-[var(--node-text-secondary)]">
                  Q3 主体调用会把提示词中的 `@角色名` 自动改写成 `[@1] / [@2]` 这类主体槽位。
                </div>
              </div>
            )}

            {derivedSubjects.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {derivedSubjects.map((subject, idx) => (
                  <span
                    key={`${subject.name}-${idx}`}
                    className={`px-2 py-1 rounded-full text-[10px] border ${
                      subject.status === "match" || subject.status === "manual"
                        ? "bg-sky-500/15 border-sky-500/40 text-sky-100"
                        : "bg-amber-500/15 border-amber-500/40 text-amber-100"
                    }`}
                  >
                    @{subject.name} · 图 {subject.images}
                  </span>
                ))}
              </div>
            )}

            {warnings.length > 0 && (
              <div className="space-y-1">
                <div className="text-[8px] font-black uppercase tracking-widest text-amber-300">Warnings</div>
                <ul className="text-[10px] text-amber-200 list-disc list-inside space-y-0.5">
                  {warnings.map((warning, idx) => <li key={idx}>{warning}</li>)}
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

        <div className="node-panel space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[8px] font-black uppercase tracking-widest text-[var(--node-text-secondary)] opacity-70">
              查询剩余积分 / 并发
            </div>
            <button
              type="button"
              onClick={handleProbeCredits}
              className="inline-flex items-center justify-center px-3 py-1.5 rounded-full text-[9px] font-semibold uppercase tracking-widest text-[var(--node-text-secondary)] bg-white/5 hover:bg-white/10 transition"
            >
              {data.authProbeStatus === "loading" ? "查询中..." : "查询额度"}
            </button>
          </div>
          <div className="text-[9px] leading-5 text-[var(--node-text-secondary)]">
            按国内区官方文档调用 `GET /ent/v2/credits?show_detail`，查看当前总积分与并发额度。
          </div>
          {data.authProbeSummary && (
            <div
              className={`rounded-[16px] border px-3 py-2 text-[10px] leading-5 ${
                data.authProbeStatus === "complete"
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                  : data.authProbeStatus === "error"
                    ? "border-red-400/30 bg-red-500/10 text-red-100"
                    : "border-white/10 bg-white/5 text-[var(--node-text-secondary)]"
              }`}
            >
              {data.authProbeSummary}
            </div>
          )}
          {data.authProbeDetail && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-[16px] border border-[var(--node-border)] bg-black/20 p-3 text-[9px] leading-5 text-[var(--node-text-secondary)]">
              {data.authProbeDetail}
            </pre>
          )}
        </div>
      </div>
    </BaseNode>
  );
};
