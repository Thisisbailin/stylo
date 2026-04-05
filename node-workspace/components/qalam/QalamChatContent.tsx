import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, Globe, X } from "lucide-react";
import { Brain, CaretRight, Wrench } from "@phosphor-icons/react";
import type { ApprovalChoice, ApprovalMessage, ChatMessage, Message, StatusMessage, ToolMessage, ToolPayload, ToolStatus } from "./types";
import { isApprovalMessage, isStatusMessage, isToolMessage } from "./types";

type Props = {
  messages: Message[];
  isSending: boolean;
  onApprovalChoice?: (approval: ApprovalMessage["approval"], choice: ApprovalChoice) => void;
  className?: string;
  style?: React.CSSProperties;
  revealMode?: "scroll" | "latest";
  latestBlockMaxHeight?: number;
};

const toolStatusLabel: Record<ToolStatus, string> = {
  queued: "等待中",
  running: "执行中",
  success: "成功",
  error: "失败",
};

const toolStatusClass: Record<ToolStatus, string> = {
  queued: "text-slate-400",
  running: "text-amber-300",
  success: "text-emerald-300",
  error: "text-rose-400",
};

const lineSummaryClass =
  "w-full px-1 py-1 text-[12px] text-[var(--app-text-muted)]";

const qalamBodyTextClass =
  "text-[15px] leading-7 text-[var(--app-text-primary)] md:text-[13px] md:leading-relaxed";

const qalamSecondaryTextClass =
  "text-[14px] leading-6 text-[var(--app-text-secondary)] md:text-[12px] md:leading-relaxed";

const qalamMetaTextClass =
  "text-[13px] leading-6 text-[var(--app-text-muted)] md:text-[11px] md:leading-relaxed";

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

const sanitizeUrl = (value: string) => {
  let url = value.trim();
  while (url && /[)\],.;:!?]$/.test(url)) {
    url = url.slice(0, -1);
  }
  return url;
};

const extractUrls = (text: string) => {
  const matches = text.match(/https?:\/\/[^\s)]+/g);
  if (!matches) return [];
  const cleaned = matches.map((m) => sanitizeUrl(m)).filter(Boolean);
  return Array.from(new Set(cleaned));
};

const stripUrls = (text: string) =>
  text.replace(/https?:\/\/[^\s)]+/g, "").replace(/\s{2,}/g, " ").trim();

const renderInlineMarkdown = (text: string) => {
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("http://", i) || text.startsWith("https://", i)) {
      let end = i;
      while (end < text.length && !/\s/.test(text[end])) end += 1;
      const raw = text.slice(i, end);
      const clean = sanitizeUrl(raw);
      const tail = raw.slice(clean.length);
      nodes.push(
        <a
          key={`u-${i}`}
          href={clean}
          target="_blank"
          rel="noreferrer"
          className="text-sky-300 underline underline-offset-2"
        >
          {clean}
        </a>
      );
      if (tail) nodes.push(tail);
      i = end;
      continue;
    }
    if (text.startsWith("[", i)) {
      const close = text.indexOf("](", i);
      const end = text.indexOf(")", close + 2);
      if (close !== -1 && end !== -1) {
        const label = text.slice(i + 1, close);
        const url = text.slice(close + 2, end);
        nodes.push(
          <a
            key={`a-${i}`}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-sky-300 underline underline-offset-2"
          >
            {label}
          </a>
        );
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        nodes.push(<strong key={`b-${i}`}>{text.slice(i + 2, end)}</strong>);
        i = end + 2;
        continue;
      }
    }
    if (text.startsWith("`", i)) {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        nodes.push(
          <code
            key={`c-${i}`}
            className="rounded border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-1.5 py-0.5 text-[13px] md:text-[12px]"
          >
            {text.slice(i + 1, end)}
          </code>
        );
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith("*", i)) {
      const end = text.indexOf("*", i + 1);
      if (end !== -1) {
        nodes.push(<em key={`i-${i}`}>{text.slice(i + 1, end)}</em>);
        i = end + 1;
        continue;
      }
    }
    const next = Math.min(
      ...["[", "**", "`", "*"].map((token) => {
        const idx = text.indexOf(token, i + 1);
        return idx === -1 ? text.length : idx;
      })
    );
    nodes.push(text.slice(i, next));
    i = next;
  }
  return nodes;
};

const renderLinkCard = (url: string, idx: number) => {
  let host = url;
  let path = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname.replace(/^www\./, "");
    path = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
  } catch {}
  return (
    <a
      key={`${idx}-${url}`}
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-2 hover:border-[var(--app-border-strong)] transition"
    >
      <div className="flex items-center gap-2 text-[12px] uppercase tracking-widest text-[var(--app-text-secondary)] md:text-[11px]">
        <Globe size={12} className="text-sky-300" />
        Link
      </div>
      <div className="mt-1 text-[15px] text-[var(--app-text-primary)] md:text-[13px]">{host}{path ? ` · ${path}` : ""}</div>
      <div className="mt-1 truncate text-[12px] text-[var(--app-text-secondary)] md:text-[11px]">{url}</div>
    </a>
  );
};

const renderMarkdownLite = (text: string) => {
  const lines = (text || "").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^\s*[-*_]{3,}\s*$/.test(line)) {
      blocks.push(<div key={`hr-${i}`} className="h-px bg-[var(--app-border)]" />);
      i += 1;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const fenceLang = line.trim().slice(3).trim();
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre
          key={`code-${i}`}
          className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-2 text-[13px] leading-6 md:text-[12px] md:leading-relaxed"
        >
          {fenceLang ? <div className="mb-1 text-[11px] text-[var(--app-text-secondary)]">{fenceLang}</div> : null}
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2];
      const size =
        level === 1
          ? "text-[19px] md:text-[16px]"
          : level === 2
            ? "text-[17px] md:text-[14px]"
            : level === 3
              ? "text-[16px] md:text-[13px]"
              : "text-[15px] md:text-[12px]";
      blocks.push(
        <div key={`h-${i}`} className={`font-semibold ${size} text-[var(--app-text-primary)]`}>
          {renderInlineMarkdown(title)}
        </div>
      );
      i += 1;
      continue;
    }

    if (line.trim().startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`q-${i}`}
          className={`whitespace-pre-wrap border-l-2 border-[var(--app-border-strong)] pl-3 ${qalamSecondaryTextClass}`}
        >
          {renderInlineMarkdown(quoteLines.join("\n"))}
        </blockquote>
      );
      continue;
    }

    const taskMatch = line.match(/^\s*[-*•]\s+\[(\s|x|X)\]\s+(.+)$/);
    if (taskMatch) {
      const tasks: Array<{ text: string; checked: boolean }> = [];
      while (i < lines.length) {
        const current = lines[i];
        const match = current.match(/^\s*[-*•]\s+\[(\s|x|X)\]\s+(.+)$/);
        if (!match) break;
        tasks.push({ text: match[2].trim(), checked: match[1].toLowerCase() === "x" });
        i += 1;
      }
      blocks.push(
        <ul key={`t-${i}`} className="space-y-1">
          {tasks.map((task, idx) => (
            <li key={`${idx}-${task.text.slice(0, 8)}`} className={`flex items-start gap-2 ${qalamSecondaryTextClass}`}>
              <span
                className={`mt-0.5 h-3.5 w-3.5 rounded border ${
                  task.checked ? "bg-emerald-500/70 border-emerald-400" : "border-[var(--app-border)]"
                }`}
              />
              <span
                className={`text-[var(--app-text-primary)] ${task.checked ? "line-through opacity-70" : ""}`}
              >
                {renderInlineMarkdown(task.text)}
              </span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const separatorMatch = nextLine.match(/^\s*\|?\s*[-:]+(\s*\|\s*[-:]+)+\s*\|?\s*$/);
      if (separatorMatch) {
        const parseRow = (row: string) =>
          row
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((cell) => cell.trim());
        const headers = parseRow(line);
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
          rows.push(parseRow(lines[i]));
          i += 1;
        }
        blocks.push(
          <div key={`tbl-${i}`} className="overflow-x-auto">
            <table className="min-w-full border-collapse text-[14px] md:text-[12px]">
              <thead>
                <tr>
                  {headers.map((h, idx) => (
                    <th
                      key={`${idx}-${h}`}
                      className="text-left font-semibold text-[var(--app-text-primary)] border-b border-[var(--app-border)] pb-1 pr-4"
                    >
                      {renderInlineMarkdown(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr key={`r-${rIdx}`}>
                    {row.map((cell, cIdx) => (
                      <td key={`${rIdx}-${cIdx}`} className="py-1 pr-4 text-[var(--app-text-secondary)]">
                        {renderInlineMarkdown(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    const listMatch = line.match(/^\s*(?:[-*•]|\d+\.|\d+、)\s+/);
    if (listMatch) {
      const items: string[] = [];
      let ordered = false;
      while (i < lines.length) {
        const current = lines[i];
        const bulletMatch = current.match(/^\s*([-*•])\s+(.+)$/);
        const orderedMatch = current.match(/^\s*(\d+\.|\d+、)\s+(.+)$/);
        if (!bulletMatch && !orderedMatch) break;
        if (orderedMatch) ordered = true;
        items.push((orderedMatch?.[2] || bulletMatch?.[2] || "").trim());
        i += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={`l-${i}`} className={`space-y-1 pl-5 text-[14px] leading-6 md:text-[12px] md:leading-relaxed ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((item, idx) => (
            <li key={`${idx}-${item.slice(0, 8)}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ListTag>
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length && lines[i].trim()) {
      const nextLine = lines[i];
      if (nextLine.trim().startsWith("```")) break;
      if (nextLine.match(/^(#{1,4})\s+/)) break;
      if (nextLine.trim().startsWith(">")) break;
      if (nextLine.match(/^\s*(?:[-*•]|\d+\.|\d+、)\s+/)) break;
      paragraphLines.push(nextLine);
      i += 1;
    }
    const paragraphText = paragraphLines.join("\n").trim();
    const urls = extractUrls(paragraphText);
    const stripped = stripUrls(paragraphText);
    if (stripped) {
      blocks.push(
        <div key={`p-${i}`} className={`whitespace-pre-wrap ${qalamBodyTextClass}`}>
          {renderInlineMarkdown(paragraphText)}
        </div>
      );
    }
    if (urls.length > 0) {
      blocks.push(
        <div key={`p-links-${i}`} className="space-y-2">
          {urls.map((url, idx) => renderLinkCard(url, idx))}
        </div>
      );
    }
  }

  return <div className="space-y-2">{blocks}</div>;
};

const renderToolOutput = (tool: ToolPayload) => {
  if (!tool.output) return null;
  let parsed: any = null;
  try {
    parsed = JSON.parse(tool.output);
  } catch {
    parsed = tool.output;
  }

  if (!parsed || typeof parsed === "string") {
    return (
      <div className={`whitespace-pre-wrap ${qalamSecondaryTextClass}`}>
        {String(parsed || "")}
      </div>
    );
  }

  const payload =
    parsed && typeof parsed === "object" && parsed.output && typeof parsed.output === "object"
      ? parsed.output
      : parsed;

  const simpleFields: Array<{ label: string; value: string }> = [];
  if (typeof payload.resource_type === "string") simpleFields.push({ label: "资源类型", value: payload.resource_type });
  if (typeof payload.action_type === "string") simpleFields.push({ label: "操作类型", value: payload.action_type });
  if (typeof payload.created === "boolean") simpleFields.push({ label: "写入动作", value: payload.created ? "已创建" : "已更新" });
  if (typeof payload.name === "string") simpleFields.push({ label: "名称", value: payload.name });
  if (typeof payload.workflow_title === "string") simpleFields.push({ label: "工作流", value: payload.workflow_title });
  if (typeof payload.episode_label === "string") simpleFields.push({ label: "剧集", value: payload.episode_label });
  if (typeof payload.episode_id === "number") simpleFields.push({ label: "集数", value: `第${payload.episode_id}集` });
  if (typeof payload.scene_id === "string") simpleFields.push({ label: "场景", value: payload.scene_id });
  if (typeof payload.scene_title === "string") simpleFields.push({ label: "场景标题", value: payload.scene_title });
  if (typeof payload.field === "string") simpleFields.push({ label: "写入字段", value: payload.field });
  if (typeof payload.chars === "number") simpleFields.push({ label: "字数", value: String(payload.chars) });
  if (typeof payload.nodeId === "string") simpleFields.push({ label: "节点 ID", value: payload.nodeId });
  if (typeof payload.nodeType === "string") simpleFields.push({ label: "节点类型", value: payload.nodeType });
  if (typeof payload.nodeRef === "string") simpleFields.push({ label: "节点引用", value: payload.nodeRef });
  if (typeof payload.defaultOutputHandle === "string") simpleFields.push({ label: "默认尾端端口", value: payload.defaultOutputHandle });
  if (Array.isArray(payload.defaultInputHandles) && payload.defaultInputHandles.length > 0) {
    simpleFields.push({ label: "默认首端端口", value: payload.defaultInputHandles.join(", ") });
  }
  if (typeof payload.node_id === "string") simpleFields.push({ label: "节点 ID", value: payload.node_id });
  if (typeof payload.node_type === "string") simpleFields.push({ label: "节点类型", value: payload.node_type });
  if (typeof payload.node_ref === "string") simpleFields.push({ label: "节点引用", value: payload.node_ref });
  if (typeof payload.default_output_handle === "string") simpleFields.push({ label: "默认尾端端口", value: payload.default_output_handle });
  if (Array.isArray(payload.default_input_handles) && payload.default_input_handles.length > 0) {
    simpleFields.push({ label: "默认首端端口", value: payload.default_input_handles.join(", ") });
  }
  if (typeof payload.linkId === "string") simpleFields.push({ label: "连线 ID", value: payload.linkId });
  if (typeof payload.sourceNodeId === "string") simpleFields.push({ label: "尾端节点", value: payload.sourceNodeId });
  if (typeof payload.targetNodeId === "string") simpleFields.push({ label: "首端节点", value: payload.targetNodeId });
  if (typeof payload.sourceRef === "string") simpleFields.push({ label: "尾端引用", value: payload.sourceRef });
  if (typeof payload.targetRef === "string") simpleFields.push({ label: "首端引用", value: payload.targetRef });
  if (typeof payload.sourceHandle === "string") simpleFields.push({ label: "尾端端口", value: payload.sourceHandle });
  if (typeof payload.targetHandle === "string") simpleFields.push({ label: "首端端口", value: payload.targetHandle });
  if (typeof payload.group_id === "string") simpleFields.push({ label: "分组节点", value: payload.group_id });
  if (typeof payload.text_node_id === "string") simpleFields.push({ label: "文本节点", value: payload.text_node_id });
  if (typeof payload.image_node_id === "string") simpleFields.push({ label: "图像节点", value: payload.image_node_id });
  if (typeof payload.edge_id === "string") simpleFields.push({ label: "连线 ID", value: payload.edge_id });
  if (typeof payload.source_node_id === "string") simpleFields.push({ label: "尾端节点", value: payload.source_node_id });
  if (typeof payload.target_node_id === "string") simpleFields.push({ label: "首端节点", value: payload.target_node_id });
  if (typeof payload.source_ref === "string") simpleFields.push({ label: "尾端引用", value: payload.source_ref });
  if (typeof payload.target_ref === "string") simpleFields.push({ label: "首端引用", value: payload.target_ref });
  if (typeof payload.source_handle === "string") simpleFields.push({ label: "尾端端口", value: payload.source_handle });
  if (typeof payload.target_handle === "string") simpleFields.push({ label: "首端端口", value: payload.target_handle });
  if (typeof payload.edge_count === "number") simpleFields.push({ label: "连线数", value: String(payload.edge_count) });
  if (typeof payload.aspect_ratio === "string") simpleFields.push({ label: "画幅", value: payload.aspect_ratio });

  if (
    typeof payload.content === "string" ||
    typeof payload.summary === "string" ||
    typeof payload.bio === "string" ||
    typeof payload.description === "string" ||
    typeof payload.visuals === "string" ||
    simpleFields.length > 0
  ) {
    return (
      <div className="space-y-2">
        {simpleFields.length > 0 ? (
          <dl className="grid gap-x-4 gap-y-1 text-[12px] text-[var(--app-text-secondary)] sm:grid-cols-2">
            {simpleFields.map((item) => (
              <div key={`${item.label}-${item.value}`} className="min-w-0">
                <dt className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">{item.label}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-[var(--app-text-primary)]">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {typeof payload.summary === "string" ? (
          <div className="border-l border-[var(--app-border)] pl-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">摘要</div>
            <div className="mt-1 text-[12px] text-[var(--app-text-primary)] whitespace-pre-wrap">{payload.summary}</div>
          </div>
        ) : null}
        {typeof payload.bio === "string" ? (
          <div className="border-l border-[var(--app-border)] pl-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">角色分析</div>
            <div className="mt-1 text-[12px] text-[var(--app-text-primary)] whitespace-pre-wrap">{payload.bio}</div>
          </div>
        ) : null}
        {typeof payload.description === "string" ? (
          <div className="border-l border-[var(--app-border)] pl-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">场景描述</div>
            <div className="mt-1 text-[12px] text-[var(--app-text-primary)] whitespace-pre-wrap">{payload.description}</div>
          </div>
        ) : null}
        {typeof payload.visuals === "string" ? (
          <div className="border-l border-[var(--app-border)] pl-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">视觉说明</div>
            <div className="mt-1 text-[12px] text-[var(--app-text-primary)] whitespace-pre-wrap">{payload.visuals}</div>
          </div>
        ) : null}
        {typeof payload.content === "string" ? (
          <div className="border-l border-[var(--app-border)] pl-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">正文</div>
            <div className="mt-1 text-[12px] text-[var(--app-text-primary)] whitespace-pre-wrap">{payload.content}</div>
          </div>
        ) : null}
      </div>
    );
  }

  const data = payload.data || {};
  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
  const matches = Array.isArray(data.matches) ? data.matches : [];
  const sceneList = Array.isArray(data.sceneList) ? data.sceneList : [];
  const episodeCharacters = Array.isArray(data.episodeCharacters) ? data.episodeCharacters : [];
  const episodeSummaries = Array.isArray(data.episodeSummaries) ? data.episodeSummaries : [];
  const characterList = Array.isArray(data.characters) ? data.characters : [];
  const locationList = Array.isArray(data.locations) ? data.locations : [];

  const renderSection = (title: string, content: React.ReactNode) => (
    <div className="border-l border-[var(--app-border)] pl-3 space-y-1">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-muted)]">{title}</div>
      {content}
    </div>
  );

  const blocks: React.ReactNode[] = [];

  if (warnings.length > 0) {
    blocks.push(
      renderSection(
        "Warnings",
        <ul className="text-[11px] text-[var(--app-text-secondary)] list-disc pl-4 space-y-1">
          {warnings.map((w: string, idx: number) => (
            <li key={`${idx}-${w}`}>{w}</li>
          ))}
        </ul>
      )
    );
  }

  if (matches.length > 0) {
    blocks.push(
      renderSection(
        "Matches",
        <ul className="text-[12px] text-[var(--app-text-secondary)] space-y-2">
          {matches.map((m: any, idx: number) => (
            <li key={`${idx}-${m.sceneId || m.episodeId || "m"}`} className="space-y-1">
              <div className="text-[11px] text-[var(--app-text-muted)]">
                {m.episodeId ? `Ep ${m.episodeId}` : ""}
                {m.episodeTitle ? ` · ${m.episodeTitle}` : ""}
                {m.sceneId ? ` · Scene ${m.sceneId}` : ""}
                {m.sceneTitle ? ` · ${m.sceneTitle}` : ""}
                {m.characterName ? ` · ${m.characterName}` : ""}
                {m.locationName ? ` · ${m.locationName}` : ""}
                {m.scope ? ` · ${m.scope}` : ""}
              </div>
              {m.snippet ? (
                <div className="text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap">{m.snippet}</div>
              ) : null}
            </li>
          ))}
        </ul>
      )
    );
  }

  if (data.sceneContent) {
    blocks.push(
      renderSection(
        "Scene Content",
        <div className="text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap">{data.sceneContent}</div>
      )
    );
  }
  if (data.episodeContent) {
    blocks.push(
      renderSection(
        "Episode Content",
        <div className="text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap">{data.episodeContent}</div>
      )
    );
  }
  if (data.projectSummary) {
    blocks.push(
      renderSection(
        "Project Summary",
        <div className="text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap">{data.projectSummary}</div>
      )
    );
  }
  if (data.episodeSummary) {
    blocks.push(
      renderSection(
        "Episode Summary",
        <div className="text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap">{data.episodeSummary}</div>
      )
    );
  }
  if (payload.resource_type === "project_summary") {
    blocks.push(
      renderSection(
        "Project Summary",
        <div className="text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap">
          {payload.summary || (payload.exists ? "Summary exists." : "No summary yet.")}
        </div>
      )
    );
  }
  if (payload.resource_type === "episode_summary") {
    blocks.push(
      renderSection(
        "Episode Summary",
        <div className="text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap">
          <div className="text-[11px] text-[var(--app-text-muted)]">Ep {payload.episode_id}</div>
          <div>{payload.summary || (payload.exists ? "Summary exists." : "No summary yet.")}</div>
        </div>
      )
    );
  }
  if (payload.resource_type === "character_profile") {
    blocks.push(
      renderSection(
        "Character Profile",
        <div className="text-[12px] text-[var(--app-text-secondary)] space-y-1">
          <div className="font-semibold text-[var(--app-text-primary)]">{payload.name || "Unknown Character"}</div>
          {payload.role ? <div>Role: {payload.role}</div> : null}
          {typeof payload.is_main === "boolean" ? <div>Main: {payload.is_main ? "Yes" : "No"}</div> : null}
          {payload.bio ? <div className="whitespace-pre-wrap">{payload.bio}</div> : null}
          {typeof payload.portraits_count === "number" ? (
            <div className="text-[11px] text-[var(--app-text-muted)]">Portraits: {payload.portraits_count}</div>
          ) : null}
        </div>
      )
    );
  }
  if (payload.resource_type === "scene_profile") {
    blocks.push(
      renderSection(
        "Scene Profile",
        <div className="text-[12px] text-[var(--app-text-secondary)] space-y-1">
          <div className="font-semibold text-[var(--app-text-primary)]">{payload.name || "Unknown Scene"}</div>
          {payload.type ? <div>Type: {payload.type}</div> : null}
          {payload.description ? <div className="whitespace-pre-wrap">{payload.description}</div> : null}
          {payload.visuals ? <div className="whitespace-pre-wrap">Visuals: {payload.visuals}</div> : null}
          {typeof payload.portraits_count === "number" ? (
            <div className="text-[11px] text-[var(--app-text-muted)]">Portraits: {payload.portraits_count}</div>
          ) : null}
        </div>
      )
    );
  }
  if (payload.resource_type === "guide_document") {
    blocks.push(
      renderSection(
        "Guide Document",
        <div className="text-[12px] text-[var(--app-text-secondary)] space-y-1">
          <div className="font-semibold text-[var(--app-text-primary)]">{payload.title || "Unknown Guide"}</div>
          {payload.content ? <div className="whitespace-pre-wrap">{payload.content}</div> : null}
        </div>
      )
    );
  }
  if (episodeSummaries.length > 0) {
    blocks.push(
      renderSection(
        "Episode Summaries",
        <ul className="text-[12px] text-[var(--app-text-secondary)] space-y-1">
          {episodeSummaries.map((s: any, idx: number) => (
            <li key={`${idx}-${s.episodeId}`}>
              <span className="text-[11px] text-[var(--app-text-muted)]">Ep {s.episodeId}: </span>
              {s.summary}
            </li>
          ))}
        </ul>
      )
    );
  }
  if (episodeCharacters.length > 0) {
    blocks.push(
      renderSection(
        "Episode Characters",
        <div className="text-[12px] text-[var(--app-text-secondary)]">{episodeCharacters.join(", ")}</div>
      )
    );
  }
  if (sceneList.length > 0) {
    blocks.push(
      renderSection(
        "Scene List",
        <ul className="text-[12px] text-[var(--app-text-secondary)] space-y-1">
          {sceneList.map((sc: any) => (
            <li key={`${sc.id}-${sc.title}`}>
              <span className="text-[11px] text-[var(--app-text-muted)]">{sc.id}</span> {sc.title}
            </li>
          ))}
        </ul>
      )
    );
  }
  if (characterList.length > 0) {
    blocks.push(
      renderSection(
        "Characters",
        <ul className="text-[12px] text-[var(--app-text-secondary)] space-y-1">
          {characterList.map((c: any) => (
            <li key={`${c.id || c.name}-${c.name}`}>
              <span className="text-[11px] text-[var(--app-text-muted)]">{c.name}</span>
              {c.role ? ` · ${c.role}` : ""}
              {typeof c.isMain === "boolean" ? ` · ${c.isMain ? "Main" : "Side"}` : ""}
            </li>
          ))}
        </ul>
      )
    );
  }
  if (locationList.length > 0) {
    blocks.push(
      renderSection(
        "Locations",
        <ul className="text-[12px] text-[var(--app-text-secondary)] space-y-1">
          {locationList.map((loc: any) => (
            <li key={`${loc.id || loc.name}-${loc.name}`}>
              <span className="text-[11px] text-[var(--app-text-muted)]">{loc.name}</span>
              {loc.type ? ` · ${loc.type}` : ""}
            </li>
          ))}
        </ul>
      )
    );
  }
  if (data.character) {
    const c = data.character;
    blocks.push(
      renderSection(
        "Character",
        <div className="text-[12px] text-[var(--app-text-secondary)] space-y-1">
          <div className="font-semibold text-[var(--app-text-primary)]">{c.name}</div>
          {c.role ? <div>Role: {c.role}</div> : null}
          {typeof c.isMain === "boolean" ? <div>Main: {c.isMain ? "Yes" : "No"}</div> : null}
          {c.tags?.length ? <div>Tags: {c.tags.join(", ")}</div> : null}
          {c.bio ? <div className="whitespace-pre-wrap">{c.bio}</div> : null}
          {Array.isArray(c.forms) && c.forms.length > 0 ? (
            <div className="text-[11px] text-[var(--app-text-muted)]">Portrait Slots: {c.forms.length}</div>
          ) : null}
        </div>
      )
    );
  }
  if (data.location) {
    const loc = data.location;
    blocks.push(
      renderSection(
        "Location",
        <div className="text-[12px] text-[var(--app-text-secondary)] space-y-1">
          <div className="font-semibold text-[var(--app-text-primary)]">{loc.name}</div>
          {loc.type ? <div>Type: {loc.type}</div> : null}
          {loc.description ? <div className="whitespace-pre-wrap">{loc.description}</div> : null}
          {Array.isArray(loc.zones) && loc.zones.length > 0 ? (
            <div className="text-[11px] text-[var(--app-text-muted)]">Portrait Slots: {loc.zones.length}</div>
          ) : null}
        </div>
      )
    );
  }

  if (blocks.length === 0) {
    return (
      <pre className="text-[11px] text-[var(--app-text-secondary)] whitespace-pre-wrap">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  }

  return <div className="space-y-2">{blocks}</div>;
};

const READ_TOOL_NAMES = new Set(["list_project_resources", "read_project_resource", "search_project_resource"]);
const WRITE_TOOL_NAMES = new Set(["edit_project_resource"]);
const OPERATE_TOOL_NAMES = new Set(["operate_project_resource"]);

const trimToolSummary = (summary?: string, fallback?: string) => {
  if (!summary?.trim()) return fallback || "工具";
  const cleaned = summary.replace(/^[^：:]+[：:]\s*/, "").trim();
  return cleaned || summary;
};

const buildToolActionLabel = (tool: ToolPayload) => {
  const subject = trimToolSummary(tool.summary, tool.name);
  if (READ_TOOL_NAMES.has(tool.name)) return `查阅 ${subject}`;
  if (WRITE_TOOL_NAMES.has(tool.name)) return `编辑 ${subject}`;
  if (OPERATE_TOOL_NAMES.has(tool.name)) return `操作 ${subject}`;
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
      <div className={`space-y-2 ${qalamSecondaryTextClass}`}>
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
  const content = buildToolDetailsText(thread);
  if (!content) return null;
  return (
    <pre className="mt-2 max-h-[280px] overflow-auto rounded-[16px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3.5 py-3 text-[11.5px] leading-6 text-[var(--app-text-secondary)] whitespace-pre-wrap">
      <code>{content}</code>
    </pre>
  );
};

type ToolThread = {
  key: string;
  request?: ToolMessage;
  result?: ToolMessage;
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
  const status = thread.result?.tool.status || thread.request?.tool.status || "queued";
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
    <details className={`${lineSummaryClass} group`} open={expanded}>
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
  const toneClass =
    status.status === "error"
      ? "text-rose-400"
      : status.status === "success"
        ? "text-emerald-400"
        : "text-sky-400";
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
    <details className={`${lineSummaryClass} group`} open={expanded}>
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
        <details className={qalamSecondaryTextClass}>
          <summary className="cursor-pointer marker:text-[var(--app-text-muted)]">
            搜索记录
          </summary>
          {renderFoldoutSurface(
            "搜索记录",
            <ul className={`list-disc space-y-1 pl-5 ${qalamSecondaryTextClass}`}>
              {searchQueries.map((q, idx) => (
                <li key={`${idx}-${q.slice(0, 8)}`}>{q}</li>
              ))}
            </ul>
          )}
        </details>
      )}
      {planItems.length > 0 ? (
        <details className={qalamSecondaryTextClass}>
          <summary className="cursor-pointer marker:text-[var(--app-text-muted)]">查看计划</summary>
          {renderFoldoutSurface(
            "计划",
            <ul className={`list-decimal space-y-1 pl-5 ${qalamBodyTextClass}`}>
              {planItems.map((item, idx) => (
                <li key={`${idx}-${item.slice(0, 8)}`}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          )}
        </details>
      ) : null}
      {message.text ? renderMarkdownLite(message.text) : null}
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
            <CheckCheck size={12} />
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

export const QalamChatContent: React.FC<Props> = ({
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
  const displayMessages = useMemo(() => {
    const consumed = new Set<number>();
    const items: Array<
      | { kind: "status"; key: string; order: number; message: StatusMessage }
      | { kind: "tool"; key: string; order: number; thread: ToolThread }
      | { kind: "approval"; key: string; order: number; message: ApprovalMessage }
      | { kind: "chat"; key: string; order: number; message: ChatMessage }
    > = [];

    for (let i = 0; i < messages.length; i += 1) {
      if (consumed.has(i)) continue;
      const message = messages[i];

      if (isToolMessage(message)) {
        if (message.kind === "tool") {
          const resultIndex = messages.findIndex(
            (candidate, idx) =>
              idx > i &&
              isToolMessage(candidate) &&
              candidate.kind === "tool_result" &&
              candidate.tool.callId &&
              candidate.tool.callId === message.tool.callId
          );
          const result =
            resultIndex >= 0 && isToolMessage(messages[resultIndex]) ? (messages[resultIndex] as ToolMessage) : undefined;
          if (resultIndex >= 0) consumed.add(resultIndex);
          items.push({
            kind: "tool",
            key: message.tool.callId || `tool-${i}`,
            order: message.order || i,
            thread: {
              key: message.tool.callId || `tool-${i}`,
              request: message,
              result,
            },
          });
          continue;
        }

        items.push({
          kind: "tool",
          key: message.tool.callId || `tool-result-${i}`,
          order: message.order || i,
          thread: {
            key: message.tool.callId || `tool-result-${i}`,
            result: message,
          },
        });
        continue;
      }

      if (isStatusMessage(message)) {
        items.push({ kind: "status", key: message.statusCard.id || `${message.statusCard.runId}-${i}`, order: message.order || i, message });
        continue;
      }

      if (isApprovalMessage(message)) {
        items.push({ kind: "approval", key: message.approval.id || `${message.approval.nodeId}-${i}`, order: message.order || i, message });
        continue;
      }

      items.push({ kind: "chat", key: `chat-${i}`, order: message.order || i, message });
    }

    return [...items].sort((a, b) => a.order - b.order);
  }, [messages]);

  const runDurationMap = useMemo(() => {
    const durations = new Map<string, number>();
    displayMessages.forEach((item) => {
      if (item.kind !== "status") return;
      const { runId, startedAt, updatedAt } = item.message.statusCard;
      const existing = durations.get(runId) ?? 0;
      durations.set(runId, Math.max(existing, updatedAt - startedAt));
    });
    return durations;
  }, [displayMessages]);

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
    item:
      | { kind: "status"; key: string; order: number; message: StatusMessage }
      | { kind: "tool"; key: string; order: number; thread: ToolThread }
      | { kind: "approval"; key: string; order: number; message: ApprovalMessage }
      | { kind: "chat"; key: string; order: number; message: ChatMessage },
    expanded: boolean,
    attachRef: boolean
  ) => {
    const isUser = item.kind === "chat" && item.message.role === "user";
    const isAssistantPanel = item.kind === "chat" && !isUser;
    const workedDuration =
      isAssistantPanel && item.message.meta?.runId
        ? runDurationMap.get(item.message.meta.runId)
        : undefined;

    return (
      <div
        key={item.key}
        ref={attachRef ? currentItemRef : null}
        className={`flex ${isUser ? "justify-end" : "justify-start"} ${isAssistantPanel ? "w-full" : ""}`}
      >
        {item.kind === "status" ? (
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
            {workedDuration ? (
              <div className={`flex items-center gap-4 px-1 ${qalamMetaTextClass}`}>
                <div className="h-px flex-1 bg-[var(--app-border)]" />
                <span>{`Worked for ${formatWorkedDuration(workedDuration)}`}</span>
                <div className="h-px flex-1 bg-[var(--app-border)]" />
              </div>
            ) : null}
            {renderAssistantPanel(item.message)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={messagesRef}
      className={`qalam-scrollbar qalam-scroll-fade min-h-0 overflow-y-auto ${revealMode === "latest" ? "px-4 pt-2 pb-5 md:pt-1 md:pb-4" : "px-4 py-5 md:py-4"} ${className}`}
      style={{
        ...style,
        maxHeight: revealMode === "latest" && latestBlockMaxHeight ? `${latestBlockMaxHeight}px` : style?.maxHeight,
      }}
    >
      <div className="space-y-3">
        {displayMessages.map((item) => {
          const isCurrentReveal = revealMode === "latest" && latestRevealItem ? item.key === latestRevealItem.key : false;
          const isLatestListItem = item === displayMessages[displayMessages.length - 1];
          return renderMessageItem(item, isCurrentReveal, revealMode === "latest" ? isCurrentReveal : isLatestListItem);
        })}
      </div>
    </div>
  );
};
