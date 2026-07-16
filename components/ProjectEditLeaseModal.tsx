import React from "react";
import { ArrowRightLeft, Cloud, DoorOpen, LoaderCircle, RefreshCw } from "lucide-react";
import type { ProjectEditLeaseState } from "../hooks/useProjectEditLease";

type Props = {
  state: Exclude<ProjectEditLeaseState, { status: "disabled" } | { status: "owned" }>;
  onTakeover: () => void;
  onExit: () => void;
  onRetry: () => void;
};

export const ProjectEditLeaseModal: React.FC<Props> = ({
  state,
  onTakeover,
  onExit,
  onRetry,
}) => {
  const isAcquiring = state.status === "acquiring";
  const ownerLabel = state.status === "blocked" ? state.owner?.clientLabel : null;
  const expiresAt = state.status === "blocked" ? state.owner?.expiresAt : null;

  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center bg-[rgba(246,245,241,0.86)] px-5 backdrop-blur-md dark:bg-[rgba(13,14,16,0.88)]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-edit-lease-title"
        className="w-full max-w-[520px] overflow-hidden rounded-[28px] border border-black/10 bg-[#f7f6f2] text-[#171816] shadow-[0_28px_90px_rgba(0,0,0,0.18)] dark:border-white/10 dark:bg-[#1b1d1c] dark:text-[#f3f3ef]"
      >
        <div className="p-7 sm:p-9">
          <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-full border border-current/10 bg-current/[0.04]">
            {isAcquiring ? (
              <LoaderCircle className="animate-spin" size={21} strokeWidth={1.7} />
            ) : (
              <Cloud size={21} strokeWidth={1.7} />
            )}
          </div>

          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.24em] opacity-45">
            Cloud editing session
          </p>
          <h2 id="project-edit-lease-title" className="text-[27px] font-medium leading-tight tracking-[-0.035em]">
            {isAcquiring
              ? "正在确认项目编辑权"
              : state.status === "error"
                ? "暂时无法确认编辑权"
                : "这个项目正在另一台设备上编辑"}
          </h2>
          <p className="mt-4 max-w-[43ch] text-[14px] leading-6 opacity-60">
            {isAcquiring
              ? "Stylo 正在建立一个有时限的独占编辑会话，完成后会自动进入项目。"
              : state.status === "error"
                ? state.message
                : `${ownerLabel || "另一台设备"} 当前拥有编辑权。你可以在这里接着编辑；完成接管后，原设备会自动转为只读，不会把项目永久锁住。`}
          </p>

          {expiresAt && state.status === "blocked" ? (
            <p className="mt-3 text-[12px] opacity-40">
              如果另一端已经离线，编辑权会在 {new Date(expiresAt).toLocaleTimeString()} 后自动释放；也可以立即接管。
            </p>
          ) : null}

          {!isAcquiring ? (
            <div className="mt-8 grid gap-2.5">
              {state.status === "blocked" ? (
                <button
                  type="button"
                  onClick={state.takeoverToken ? onTakeover : onRetry}
                  className="flex min-h-12 items-center justify-between rounded-2xl bg-[#171816] px-4 text-left text-[13px] font-medium text-white transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 dark:bg-[#f3f3ef] dark:text-[#171816]"
                >
                  <span className="flex items-center gap-3"><ArrowRightLeft size={17} />在此设备继续编辑</span>
                  <span className="text-[10px] font-normal uppercase tracking-[0.16em] opacity-55">接管云端会话</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={onRetry}
                className="flex min-h-11 items-center gap-3 rounded-2xl border border-current/10 px-4 text-left text-[13px] transition-colors hover:bg-current/[0.04]"
              >
                <RefreshCw size={16} />重新检查编辑权
              </button>
              <button
                type="button"
                onClick={onExit}
                className="flex min-h-11 items-center gap-3 rounded-2xl px-4 text-left text-[13px] opacity-55 transition-opacity hover:opacity-90"
              >
                <DoorOpen size={16} />退出账户
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
};
