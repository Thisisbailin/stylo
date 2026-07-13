import React, { useEffect, useMemo, useRef, useState } from "react";
import { Brain, CaretRight, Check, Checks, TerminalWindow, Wrench, X } from "@phosphor-icons/react";
import type { ApprovalChoice, ApprovalMessage, ChatMessage, Message, StatusMessage, ToolMessage, ToolPayload } from "./types";
import {
  buildStyloMessageTimeline,
  type StyloDisplayMessage as DisplayMessageItem,
  type StyloWorkStage,
  type ToolMessageThread as ToolThread,
} from "./messageTimeline";
import { renderStyloInlineMarkdown, renderStyloMarkdown } from "./StyloMarkdown";
import { renderStyloToolOutput } from "./StyloToolOutput";
import { findStyloToolDescriptor } from "../../../agents/runtime/toolCatalog";
import { resolveToolDisplayOutcome, type ToolDisplayOutcome } from "./toolDisplayOutcome";

type Props = {
  messages: Message[];
  isSending: boolean;
  onApprovalChoice?: (approval: ApprovalMessage["approval"], choice: ApprovalChoice) => void;
  className?: string;
  style?: React.CSSProperties;
  revealMode?: "scroll" | "latest";
  latestBlockMaxHeight?: number;
};

const toolStatusLabel: Record<ToolDisplayOutcome, string> = {
  queued: "等待中",
  running: "执行中",
  success: "成功",
  error: "失败",
  skipped: "已跳过",
  no_change: "未变更",
};

const toolStatusClass: Record<ToolDisplayOutcome, string> = {
  queued: "text-slate-400",
  running: "text-amber-300",
  success: "text-emerald-300",
  error: "text-rose-400",
  skipped: "text-amber-300",
  no_change: "text-[var(--app-text-muted)]",
};

const lineSummaryClass =
  "w-full px-1 py-1 text-[12px] text-[var(--app-text-muted)]";

const styloBodyTextClass =
  "text-[15px] leading-7 text-[var(--app-text-primary)] md:text-[13px] md:leading-relaxed";

const styloSecondaryTextClass =
  "text-[14px] leading-6 text-[var(--app-text-secondary)] md:text-[12px] md:leading-relaxed";

const renderFoldoutSurface = (title: string, children: React.ReactNode) => (
  <div className="ml-3 mt-2 border-l-2 border-[var(--app-border)] pl-4">
    <div className="text-[11px] font-medium text-[var(--app-text-muted)]">{title}</div>
    <div className="mt-2 space-y-2 text-[var(--app-text-secondary)]">{children}</div>
  </div>
);

const formatWorkedDuration = (durationMs: number) => {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${totalSeconds}s`;
};

const formatThoughtDuration = (durationMs: number) => {
  const totalSeconds = Math.max(0.1, durationMs / 1000);
  if (totalSeconds < 10) return `${totalSeconds.toFixed(1)} 秒`;
  if (totalSeconds < 60) return `${Math.round(totalSeconds)} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`;
};

const trimToolSummary = (summary?: string, fallback?: string) => {
  if (!summary?.trim()) return fallback || "工具";
  const cleaned = summary.replace(/^[^：:]+[：:]\s*/, "").trim();
  return cleaned || summary;
};

const buildToolActionLabel = (tool: ToolPayload) => {
  const descriptor = findStyloToolDescriptor(tool.name);
  if (!tool.summary?.trim()) return descriptor?.label || tool.name;
  const subject = trimToolSummary(tool.summary, descriptor?.label || tool.name);
  const interaction = descriptor?.interaction;
  if (interaction === "read") return `查阅 ${subject}`;
  if (interaction === "edit") return `编辑 ${subject}`;
  if (interaction === "approve") return `确认 ${subject}`;
  return `操作 ${subject}`;
};

const renderDisclosureHeader = ({
  icon,
  label,
  toneClass,
  meta,
  expandable,
  animate = false,
}: {
  icon: React.ReactNode;
  label: string;
  toneClass: string;
  meta?: React.ReactNode;
  expandable?: boolean;
  animate?: boolean;
}) => (
  <div className="inline-flex max-w-full items-center gap-2 align-top">
    <span className={`inline-flex shrink-0 items-center justify-center ${toneClass} ${animate ? "animate-pulse" : ""}`}>
      {icon}
    </span>
    <span className="shrink min-w-0 text-[13px] font-medium text-[var(--app-text-primary)]">{label}</span>
    {meta ? <span className="shrink-0 text-[11px] font-medium">{meta}</span> : null}
    {expandable ? (
      <CaretRight
        size={14}
        className="shrink-0 text-[var(--app-text-muted)] transition-transform duration-200 group-open:rotate-90"
        weight="bold"
      />
    ) : null}
  </div>
);

const buildToolDetailsText = (thread: ToolThread) => {
  const chunks: string[] = [];
  if (thread.request?.tool.summary?.trim()) {
    chunks.push(thread.request.tool.summary.trim());
  }
  if (
    thread.result?.tool.summary?.trim() &&
    thread.result.tool.summary.trim() !== thread.request?.tool.summary?.trim()
  ) {
    chunks.push(thread.result.tool.summary.trim());
  }
  if (thread.result?.tool.evidence?.length) {
    chunks.push(thread.result.tool.evidence.join("\n"));
  }
  if (thread.result?.tool.output?.trim()) {
    try {
      const parsed = JSON.parse(thread.result.tool.output);
      chunks.push(JSON.stringify(parsed, null, 2));
    } catch {
      chunks.push(thread.result.tool.output.trim());
    }
  }
  return chunks.join("\n\n").trim();
};

const renderThinkingExpansion = (status: StatusMessage["statusCard"]) => {
  const content = (status.summary || status.detail || "").trim();
  const stepDetails = status.steps
    .map((step) => [step.label, step.detail].filter(Boolean).join(" · ").trim())
    .filter(Boolean);
  const lines = [content, ...stepDetails].filter(Boolean);
  if (!lines.length) return null;
  return (
    <div className="mt-2 border-l-2 border-[var(--app-border)] pl-4">
      <div className={`space-y-2 ${styloSecondaryTextClass}`}>
        {lines.map((line, index) => (
          <div key={`${index}-${line.slice(0, 16)}`} className="whitespace-pre-wrap">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
};

const renderToolExpansion = (thread: ToolThread) => {
  const toolOutputView = thread.result?.tool ? renderStyloToolOutput(thread.result.tool) : null;
  const content = buildToolDetailsText(thread);
  if (!toolOutputView && !content) return null;
  return (
    <div className="mt-2 space-y-2">
      {toolOutputView ? (
        <div className="rounded-[16px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3.5 py-3">
          {toolOutputView}
        </div>
      ) : null}
      {content ? (
        <pre className="max-h-[280px] overflow-auto rounded-[16px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3.5 py-3 text-[11.5px] leading-6 text-[var(--app-text-secondary)] whitespace-pre-wrap">
          <code>{content}</code>
        </pre>
      ) : null}
    </div>
  );
};

const renderToolThread = (thread: ToolThread, options?: { expanded?: boolean }) => {
  const expanded = options?.expanded || false;
  const effectiveTool = thread.result?.tool || thread.request?.tool;
  if (!effectiveTool) return null;
  const hasDetails =
    !!thread.result?.tool.output ||
    !!thread.result?.tool.summary ||
    !!thread.result?.tool.evidence?.length;
  const actionLabel = buildToolActionLabel(effectiveTool);
  const status = resolveToolDisplayOutcome(thread.request?.tool, thread.result?.tool);
  const statusText = toolStatusLabel[status];

  if (!hasDetails && !thread.result) {
    return (
      <div className={lineSummaryClass}>
        <div className="inline-flex max-w-full items-center gap-2">
          {renderDisclosureHeader({
            icon: <Wrench size={12} weight="duotone" />,
            label: actionLabel,
            toneClass: "text-[var(--app-text-secondary)]",
            meta: <span className={toolStatusClass[status]}>{statusText}</span>,
          })}
        </div>
      </div>
    );
  }

  return (
    <details className={`${lineSummaryClass} group`} open={expanded || undefined}>
      <summary className="list-none cursor-pointer py-1 text-left [&::-webkit-details-marker]:hidden">
        {renderDisclosureHeader({
          icon: <Wrench size={12} weight="duotone" />,
          label: actionLabel,
          toneClass: "text-[var(--app-text-secondary)]",
          meta: <span className={toolStatusClass[status]}>{statusText}</span>,
          expandable: true,
        })}
      </summary>
      {renderToolExpansion(thread)}
    </details>
  );
};

const buildThinkingLabel = (status: StatusMessage["statusCard"]) => {
  if (!status.isThinking) return status.headline;
  const duration = Math.max(0, status.updatedAt - status.startedAt);
  if (status.status === "running") return "思考中";
  return `思考了 ${formatThoughtDuration(duration)}`;
};

const renderStatusLine = (message: StatusMessage, options?: { expanded?: boolean }) => {
  const expanded = options?.expanded || false;
  const status = message.statusCard;
  const iconToneClass =
    status.status === "error"
      ? "text-rose-300"
      : status.status === "success"
        ? "text-emerald-300"
        : "text-sky-300";

  if (!status.steps.length && !status.detail) {
    return (
      <div className={lineSummaryClass}>
        <div className="inline-flex max-w-full items-center gap-2">
          {renderDisclosureHeader({
            icon: <Brain size={12} weight="duotone" />,
            label: buildThinkingLabel(status),
            toneClass: iconToneClass,
            animate: status.isThinking && status.status === "running",
          })}
        </div>
      </div>
    );
  }

  return (
    <details className={`${lineSummaryClass} group`} open={expanded || undefined}>
      <summary className="list-none cursor-pointer py-1 text-left [&::-webkit-details-marker]:hidden">
        {renderDisclosureHeader({
          icon: <Brain size={12} weight="duotone" />,
          label: buildThinkingLabel(status),
          toneClass: iconToneClass,
          expandable: true,
          animate: status.isThinking && status.status === "running",
        })}
      </summary>
      {renderThinkingExpansion(status)}
    </details>
  );
};

const renderAssistantPanel = (message: ChatMessage) => {
  const planItems = message.meta?.planItems || [];
  const searchEnabled = message.meta?.searchEnabled;
  const searchUsed = message.meta?.searchUsed;
  const searchQueries = message.meta?.searchQueries || [];
  return (
    <div className="w-full space-y-3 px-1">
      {(searchEnabled || searchUsed) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--app-panel-muted)] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            {searchUsed ? "已搜索" : "搜索开启"}
          </span>
        </div>
      )}
      {searchQueries.length > 0 && (
        <details className={styloSecondaryTextClass}>
          <summary className="cursor-pointer marker:text-[var(--app-text-muted)]">
            搜索记录
          </summary>
          {renderFoldoutSurface(
            "搜索记录",
            <ul className={`list-disc space-y-1 pl-5 ${styloSecondaryTextClass}`}>
              {searchQueries.map((q, idx) => (
                <li key={`${idx}-${q.slice(0, 8)}`}>{q}</li>
              ))}
            </ul>
          )}
        </details>
      )}
      {planItems.length > 0 ? (
        <details className={styloSecondaryTextClass}>
          <summary className="cursor-pointer marker:text-[var(--app-text-muted)]">查看计划</summary>
          {renderFoldoutSurface(
            "计划",
            <ul className={`list-decimal space-y-1 pl-5 ${styloBodyTextClass}`}>
              {planItems.map((item, idx) => (
                <li key={`${idx}-${item.slice(0, 8)}`}>{renderStyloInlineMarkdown(item)}</li>
              ))}
            </ul>
          )}
        </details>
      ) : null}
      {message.text ? renderStyloMarkdown(message.text) : null}
      {message.meta?.isStreaming ? (
        <div className="inline-flex items-center gap-2 text-[11px] text-[var(--app-text-muted)]" role="status">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" aria-hidden="true" />
          正在生成
        </div>
      ) : null}
    </div>
  );
};

const renderApprovalPanel = (
  message: ApprovalMessage,
  onApprovalChoice?: (approval: ApprovalMessage["approval"], choice: ApprovalChoice) => void
) => {
  const { approval } = message;
  const pending = approval.status === "pending";
  const statusLabel =
    approval.status === "completed"
      ? "已完成"
      : approval.status === "failed"
        ? "已失败"
        : approval.status === "approved"
      ? "已批准"
      : approval.status === "rejected"
        ? "已拒绝"
        : approval.status === "executing"
          ? "执行中"
          : "待确认";
  const statusTone =
    approval.status === "completed"
      ? "text-emerald-200/90"
      : approval.status === "failed"
        ? "text-rose-200/90"
        : approval.status === "rejected"
          ? "text-white/70"
          : approval.status === "executing"
            ? "text-sky-200/90"
            : approval.status === "approved"
              ? "text-emerald-200/90"
              : "text-amber-200/80";
  return (
    <div className="w-full space-y-3 rounded-[18px] border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-amber-300/80">询问</div>
          <div className="mt-1 text-[13px] font-semibold text-[var(--app-text-primary)]">
            {approval.action === "video_generation" ? "是否批准启动视频生成任务？" : "是否批准启动图片生成任务？"}
          </div>
        </div>
        <div className={`text-[10px] font-black uppercase tracking-[0.16em] ${statusTone}`}>{statusLabel}</div>
      </div>
      <div className="space-y-1 text-[12px] text-[var(--app-text-secondary)]">
        <div><span className="text-[var(--app-text-muted)]">节点：</span>{approval.nodeTitle}</div>
        <div><span className="text-[var(--app-text-muted)]">模型：</span>{approval.providerLabel} · {approval.modelLabel}</div>
        {approval.promptPreview ? (
          <div className="rounded-[14px] border border-white/8 bg-black/15 px-3 py-2 text-[var(--app-text-primary)]">
            {approval.promptPreview}
          </div>
        ) : null}
        {approval.inputSummary?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {approval.inputSummary.map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-[var(--app-text-primary)]"
              >
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {approval.summary ? (
        <div className="rounded-[14px] border border-white/8 bg-black/15 px-3 py-2 text-[12px] leading-relaxed text-[var(--app-text-primary)]">
          {approval.summary}
        </div>
      ) : null}
      {approval.steps?.length ? (
        <div className="space-y-2 rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-3">
          {approval.steps.map((step, index) => (
            <div key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`mt-0.5 h-2.5 w-2.5 rounded-full ${
                    step.status === "success"
                      ? "bg-emerald-400"
                      : step.status === "error"
                        ? "bg-rose-400"
                        : step.status === "running"
                          ? "bg-sky-400"
                          : "bg-white/30"
                  }`}
                />
                {index < approval.steps.length - 1 ? <span className="mt-1 h-full w-px bg-white/10" /> : null}
              </div>
              <div className="min-w-0 flex-1 pb-2">
                <div className="text-[11px] font-semibold text-[var(--app-text-primary)]">{step.label}</div>
                {step.detail ? (
                  <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--app-text-secondary)]">{step.detail}</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {pending ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onApprovalChoice?.(approval, "approve_once")}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/85 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white"
          >
            <Check size={12} />
            同意一次
          </button>
          <button
            type="button"
            onClick={() => onApprovalChoice?.(approval, "approve_always")}
            className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-sky-200"
          >
            <Checks size={12} />
            以后都同意
          </button>
          <button
            type="button"
            onClick={() => onApprovalChoice?.(approval, "reject_once")}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--app-text-secondary)]"
          >
            <X size={12} />
            拒绝本次
          </button>
        </div>
      ) : null}
    </div>
  );
};

const WorkStageView: React.FC<{ stage: StyloWorkStage }> = ({ stage }) => {
  const [expanded, setExpanded] = useState(!stage.hasFinalAnswer);

  useEffect(() => {
    if (stage.hasFinalAnswer) setExpanded(false);
  }, [stage.hasFinalAnswer]);

  const durationLabel = stage.durationMs > 0 ? formatWorkedDuration(stage.durationMs) : null;
  const headline = stage.hasFinalAnswer
    ? `已处理${durationLabel ? ` ${durationLabel}` : ""}`
    : stage.hasError && !stage.isRunning
      ? "处理未完成"
      : "正在处理";
  const itemLabel = stage.toolCount > 0
    ? `${stage.toolCount} 项工具操作`
    : `${stage.items.length} 个工作阶段`;
  const toneClass = stage.hasError
    ? "text-rose-400"
    : stage.isRunning
      ? "text-[var(--accent-strong)]"
      : "text-[var(--app-text-muted)]";
  const panelId = `${stage.key}-content`;

  return (
    <details
      className="stylo-work-stage group w-full"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary
        className="flex cursor-pointer list-none items-center gap-2.5 px-1 py-2 text-left [&::-webkit-details-marker]:hidden"
        aria-controls={panelId}
      >
        <TerminalWindow size={15} weight="regular" className={`shrink-0 ${toneClass}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--app-text-secondary)]">
          {headline}
          <span className="ml-1.5 font-normal text-[var(--app-text-muted)]">· {itemLabel}</span>
        </span>
        <CaretRight
          size={14}
          weight="bold"
          className="shrink-0 text-[var(--app-text-muted)] transition-transform duration-200 group-open:rotate-90"
          aria-hidden="true"
        />
      </summary>
      <div id={panelId} className="ml-[7px] border-l border-[var(--app-border)] pb-1 pl-4 pt-1">
        <div className="space-y-1.5">
          {stage.items.map((item) => (
            <div key={item.key} className="min-w-0">
              {item.kind === "status"
                ? renderStatusLine(item.message, { expanded: false })
                : item.kind === "tool"
                  ? renderToolThread(item.thread, { expanded: false })
                  : (
                    <div className="px-1 py-2 text-[var(--app-text-secondary)]">
                      {renderAssistantPanel(item.message)}
                    </div>
                  )}
            </div>
          ))}
        </div>
      </div>
    </details>
  );
};

export const StyloChatContent: React.FC<Props> = ({
  messages,
  isSending,
  onApprovalChoice,
  className = "",
  style,
  revealMode = "scroll",
  latestBlockMaxHeight,
}) => {
  const messagesRef = useRef<HTMLDivElement>(null);
  const currentItemRef = useRef<HTMLDivElement | null>(null);
  const previousItemCountRef = useRef(0);
  const previousCurrentKeyRef = useRef<string | null>(null);
  const [isPinnedToCurrent, setIsPinnedToCurrent] = useState(true);
  const [currentShiftTick, setCurrentShiftTick] = useState(0);
  const displayMessages = useMemo(() => buildStyloMessageTimeline(messages), [messages]);

  const latestRevealItem = useMemo(() => {
    if (!displayMessages.length) return null;
    return displayMessages[displayMessages.length - 1];
  }, [displayMessages]);

  const getCurrentAnchorScrollTop = useMemo(
    () => (node: HTMLDivElement, currentNode: HTMLDivElement) => {
      const topInset = revealMode === "latest" ? 2 : 6;
      const headerTarget = Math.max(0, currentNode.offsetTop - topInset);
      const bottomTarget = Math.max(0, currentNode.offsetTop + currentNode.offsetHeight - node.clientHeight);
      return currentNode.offsetHeight + topInset <= node.clientHeight ? headerTarget : bottomTarget;
    },
    [revealMode]
  );

  const isPinnedToCurrentAnchor = useMemo(
    () => (node: HTMLDivElement, currentNode: HTMLDivElement) => {
      const topInset = revealMode === "latest" ? 2 : 6;
      const headerTarget = Math.max(0, currentNode.offsetTop - topInset);
      const bottomTarget = Math.max(0, currentNode.offsetTop + currentNode.offsetHeight - node.clientHeight);
      const tolerance = 10;
      if (currentNode.offsetHeight + topInset <= node.clientHeight) {
        return Math.abs(node.scrollTop - headerTarget) <= tolerance;
      }
      return Math.abs(node.scrollTop - bottomTarget) <= tolerance;
    },
    [revealMode]
  );

  useEffect(() => {
    const nextKey = latestRevealItem?.key ?? null;
    if (!nextKey) {
      previousCurrentKeyRef.current = null;
      return;
    }
    if (previousCurrentKeyRef.current !== nextKey) {
      previousCurrentKeyRef.current = nextKey;
      setIsPinnedToCurrent(true);
      setCurrentShiftTick((value) => value + 1);
    }
  }, [latestRevealItem?.key]);

  useEffect(() => {
    if (revealMode !== "scroll" && revealMode !== "latest") return;
    const node = messagesRef.current;
    const currentNode = currentItemRef.current;
    if (!node || !currentNode || !isPinnedToCurrent) return;
    const nextCount = displayMessages.length;
    const behavior: ScrollBehavior = nextCount > previousItemCountRef.current ? "smooth" : "auto";
    previousItemCountRef.current = nextCount;
    requestAnimationFrame(() => {
      const targetTop = getCurrentAnchorScrollTop(node, currentNode);
      node.scrollTo({ top: targetTop, behavior });
    });
  }, [messages, currentShiftTick, displayMessages.length, getCurrentAnchorScrollTop, isPinnedToCurrent, isSending, revealMode]);

  useEffect(() => {
    if (revealMode !== "scroll" && revealMode !== "latest") return;
    if (!messagesRef.current) return;
    const node = messagesRef.current;
    const handleScroll = () => {
      const currentNode = currentItemRef.current;
      if (!currentNode) return;
      setIsPinnedToCurrent(isPinnedToCurrentAnchor(node, currentNode));
    };
    node.addEventListener("scroll", handleScroll, { passive: true });
    return () => node.removeEventListener("scroll", handleScroll);
  }, [displayMessages.length, isPinnedToCurrentAnchor, revealMode]);

  useEffect(() => {
    if (revealMode !== "latest" && revealMode !== "scroll") return;
    previousItemCountRef.current = displayMessages.length;
  }, [displayMessages.length, revealMode]);

  const renderMessageItem = (
    item: DisplayMessageItem,
    expanded: boolean,
    attachRef: boolean
  ) => {
    const isUser = item.kind === "chat" && item.message.role === "user";
    const isAssistantPanel = item.kind === "chat" && !isUser;

    return (
      <div
        key={item.key}
        ref={attachRef ? currentItemRef : null}
        className={`flex ${isUser ? "justify-end" : "justify-start"} ${isAssistantPanel ? "w-full" : ""}`}
      >
        {item.kind === "work" ? (
          <WorkStageView stage={item} />
        ) : item.kind === "status" ? (
          renderStatusLine(item.message, { expanded })
        ) : item.kind === "tool" ? (
          renderToolThread(item.thread, { expanded })
        ) : item.kind === "approval" ? (
          renderApprovalPanel(item.message, onApprovalChoice)
        ) : isUser ? (
          <div className="max-w-[88%] rounded-[22px] bg-[var(--app-panel-soft)] px-4 py-3.5 text-[15px] leading-7 text-[var(--app-text-primary)] shadow-[0_10px_24px_-20px_rgba(0,0,0,0.18)] md:max-w-[82%] md:py-3 md:text-[13px] md:leading-relaxed">
            {item.message.text}
          </div>
        ) : (
          <div className="w-full space-y-3">
            {renderAssistantPanel(item.message)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={messagesRef}
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-busy={isSending}
      aria-label="Stylo Agent 对话"
      className={`stylo-scrollbar stylo-scroll-fade min-h-0 overflow-y-auto ${revealMode === "latest" ? "px-4 pt-2 pb-5 md:pt-1 md:pb-4" : "px-4 py-5 md:py-4"} ${className}`}
      style={{
        ...style,
        maxHeight: revealMode === "latest" && latestBlockMaxHeight ? `${latestBlockMaxHeight}px` : style?.maxHeight,
      }}
    >
      <div className="space-y-3">
        {displayMessages.length === 0 ? (
          <div className="rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-[12px] leading-6 text-[var(--app-text-secondary)]">
            Stylo 已准备好。你可以直接描述目标，Agent 会在需要时查阅或操作当前 Flow。
          </div>
        ) : displayMessages.map((item) => {
          const isCurrentReveal = revealMode === "latest" && latestRevealItem ? item.key === latestRevealItem.key : false;
          const isLatestListItem = item === displayMessages[displayMessages.length - 1];
          return renderMessageItem(item, isCurrentReveal, revealMode === "latest" ? isCurrentReveal : isLatestListItem);
        })}
      </div>
    </div>
  );
};
