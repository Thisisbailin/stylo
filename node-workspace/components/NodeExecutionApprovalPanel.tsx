import React from "react";
import { Check, Clock3, X } from "lucide-react";
import type { NodeFlowExecutionApprovalProposal } from "../nodeflow/approvals";

type Props = {
  proposal: NodeFlowExecutionApprovalProposal;
  onApprove: () => Promise<void> | void;
  onDismiss: () => void;
  busy?: boolean;
};

export const NodeExecutionApprovalPanel: React.FC<Props> = ({
  proposal,
  onApprove,
  onDismiss,
  busy = false,
}) => {
  return (
    <div className="node-panel space-y-3 border border-amber-500/25 bg-amber-500/[0.05] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.2em] text-amber-300/80">
            <Clock3 size={11} />
            待审批执行
          </div>
          <div className="mt-1 text-[11px] font-semibold text-[var(--node-text-primary)]">
            {proposal.action === "video_generation" ? "准备启动视频生成任务" : "准备启动图片生成任务"}
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
          className="rounded-full border border-white/10 p-1 text-[var(--node-text-secondary)] hover:text-[var(--node-text-primary)]"
          title="取消提案"
        >
          <X size={12} />
        </button>
      </div>

      <div className="space-y-1 text-[10px] leading-5 text-[var(--node-text-secondary)]">
        <div>
          <span className="font-black uppercase tracking-[0.16em] text-[var(--node-text-secondary)]/70">节点</span>
          <span className="ml-2 text-[var(--node-text-primary)]">{proposal.nodeTitle}</span>
        </div>
        <div>
          <span className="font-black uppercase tracking-[0.16em] text-[var(--node-text-secondary)]/70">模型</span>
          <span className="ml-2 text-[var(--node-text-primary)]">{proposal.providerLabel} · {proposal.modelLabel}</span>
        </div>
        {proposal.promptPreview ? (
          <div>
            <span className="font-black uppercase tracking-[0.16em] text-[var(--node-text-secondary)]/70">提示</span>
            <div className="mt-1 rounded-[14px] border border-white/8 bg-black/15 px-2.5 py-2 text-[var(--node-text-primary)]">
              {proposal.promptPreview}
            </div>
          </div>
        ) : null}
        {proposal.inputSummary.length > 0 ? (
          <div>
            <span className="font-black uppercase tracking-[0.16em] text-[var(--node-text-secondary)]/70">输入</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {proposal.inputSummary.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-semibold text-[var(--node-text-primary)]"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void onApprove();
        }}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500/85 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Check size={12} />
        {busy ? "执行中..." : "批准并执行"}
      </button>
    </div>
  );
};
