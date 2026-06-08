import React from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { KnowledgeLink, KnowledgeNode } from "../types";
import { formatKnowledgeKindLabel, formatKnowledgeOriginLabel } from "./labels";

type Props = {
  title?: string;
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
  selectedNodeRef?: string | null;
  onSelectNodeRef?: (nodeRef: string) => void;
  variant?: "panel" | "canvas";
  layoutMode?: "backbone" | "focus" | "revisions" | "anchor" | "full";
};

const CARD_WIDTH = 356;
const CARD_HEIGHT = 258;
const COLUMN_GAP = 460;
const ROW_GAP = 320;

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const extractUrls = (text: string) => text.match(/https?:\/\/[^\s)]+/g) || [];

const renderInlineMarkdown = (text: string) => {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)]+)\)|https?:\/\/[^\s)]+)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={`${match.index}-b`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={`${match.index}-c`}
          className="rounded bg-white/8 px-1 py-0.5 text-[11px] text-[var(--app-text-primary)]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("[") && match[2]) {
      const labelEnd = token.indexOf("]");
      const label = token.slice(1, labelEnd);
      const href = match[2];
      nodes.push(
        <a
          key={`${match.index}-l`}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-sky-300 underline underline-offset-2"
        >
          {label}
        </a>
      );
    } else {
      nodes.push(
        <a
          key={`${match.index}-u`}
          href={token}
          target="_blank"
          rel="noreferrer"
          className="text-sky-300 underline underline-offset-2"
        >
          {token}
        </a>
      );
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
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

    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
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
          className="overflow-x-auto rounded-2xl border border-white/8 bg-black/24 px-3 py-2 text-[11px] leading-5 text-[var(--app-text-secondary)]"
        >
          {lang ? <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-muted)]">{lang}</div> : null}
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title =
        level === 1
          ? "text-[16px] font-semibold"
          : level === 2
            ? "text-[14px] font-semibold"
            : "text-[12px] font-semibold uppercase tracking-[0.12em]";
      blocks.push(
        <div key={`h-${i}`} className={`${title} text-[var(--app-text-primary)]`}>
          {renderInlineMarkdown(headingMatch[2])}
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
          key={`quote-${i}`}
          className="border-l-2 border-[var(--app-border-strong)] pl-3 text-[12px] leading-6 text-[var(--app-text-secondary)]"
        >
          {renderInlineMarkdown(quoteLines.join("\n"))}
        </blockquote>
      );
      continue;
    }

    const listMatch = line.match(/^\s*(?:[-*•]|\d+\.|\d+、)\s+/);
    if (listMatch) {
      const items: string[] = [];
      let ordered = false;
      while (i < lines.length) {
        const current = lines[i];
        const bulletMatch = current.match(/^\s*[-*•]\s+(.+)$/);
        const orderedMatch = current.match(/^\s*(?:\d+\.|\d+、)\s+(.+)$/);
        if (!bulletMatch && !orderedMatch) break;
        if (orderedMatch) ordered = true;
        items.push((orderedMatch?.[1] || bulletMatch?.[1] || "").trim());
        i += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag
          key={`list-${i}`}
          className={`space-y-1 pl-5 text-[12px] leading-6 text-[var(--app-text-secondary)] ${
            ordered ? "list-decimal" : "list-disc"
          }`}
        >
          {items.map((item, index) => (
            <li key={`${index}-${item.slice(0, 8)}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ListTag>
      );
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length) {
      const separator = lines[i + 1];
      if (/^\s*\|?\s*[-:]+(\s*\|\s*[-:]+)+\s*\|?\s*$/.test(separator)) {
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
        while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
          rows.push(parseRow(lines[i]));
          i += 1;
        }
        blocks.push(
          <div key={`table-${i}`} className="overflow-x-auto rounded-2xl border border-white/8 bg-white/4 px-2 py-2">
            <table className="min-w-full border-collapse text-[11px] text-[var(--app-text-secondary)]">
              <thead>
                <tr>
                  {headers.map((header, index) => (
                    <th
                      key={`${header}-${index}`}
                      className="border-b border-white/8 px-2 pb-1 text-left font-semibold text-[var(--app-text-primary)]"
                    >
                      {renderInlineMarkdown(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${rowIndex}-${cellIndex}`} className="px-2 py-1.5 align-top">
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

    const paragraphLines: string[] = [];
    while (i < lines.length && lines[i].trim()) {
      const current = lines[i];
      if (
        current.trim().startsWith("```") ||
        /^(#{1,4})\s+/.test(current) ||
        current.trim().startsWith(">") ||
        /^\s*(?:[-*•]|\d+\.|\d+、)\s+/.test(current)
      ) {
        break;
      }
      paragraphLines.push(current);
      i += 1;
    }
    blocks.push(
      <div key={`p-${i}`} className="whitespace-pre-wrap text-[12px] leading-6 text-[var(--app-text-secondary)]">
        {renderInlineMarkdown(paragraphLines.join("\n").trim())}
      </div>
    );
  }

  return <div className="space-y-3">{blocks}</div>;
};

const stringifyValue = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const items = value
      .map((item) => stringifyValue(item))
      .filter(Boolean);
    return items.length ? items.map((item) => `- ${item}`).join("\n") : "";
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const rendered = stringifyValue(item);
        if (!rendered) return "";
        if (rendered.includes("\n")) return `## ${key}\n${rendered}`;
        return `- **${key}**: ${rendered}`;
      })
      .filter(Boolean);
    return entries.join("\n\n");
  }
  return String(value);
};

const buildKnowledgeMarkdown = (node: KnowledgeNode) => {
  const primaryContent = trim(node.content?.content);
  if (primaryContent) return primaryContent;

  const sections = Object.entries(node.content || {})
    .map(([key, value]) => {
      if (key === "content") return "";
      const rendered = stringifyValue(value);
      if (!rendered) return "";
      return `## ${key}\n${rendered}`;
    })
    .filter(Boolean);

  if (sections.length) return sections.join("\n\n");

  const fallbackMeta = [
    `- **Ref**: ${node.ref}`,
    `- **Kind**: ${formatKnowledgeKindLabel(node.kind)}`,
    `- **Origin**: ${formatKnowledgeOriginLabel(node.origin)}`,
    `- **Status**: ${node.package.status}`,
  ];
  return fallbackMeta.join("\n");
};

const buildNodeLevelMap = (nodes: KnowledgeNode[], links: KnowledgeLink[]) => {
  const incomingCounts = new Map<string, number>();
  nodes.forEach((node) => incomingCounts.set(node.id, 0));
  links.forEach((link) => {
    incomingCounts.set(link.toNodeId, (incomingCounts.get(link.toNodeId) || 0) + 1);
  });

  const roots = nodes
    .filter((node) => (incomingCounts.get(node.id) || 0) === 0)
    .sort((a, b) => a.package.title.localeCompare(b.package.title));

  const levels = new Map<string, number>();
  const queue: Array<{ id: string; level: number }> = roots.map((node) => ({
    id: node.id,
    level: 0,
  }));

  while (queue.length) {
    const current = queue.shift()!;
    const existing = levels.get(current.id);
    if (existing != null && existing <= current.level) continue;
    levels.set(current.id, current.level);
    links
      .filter((link) => link.fromNodeId === current.id)
      .forEach((link) => queue.push({ id: link.toNodeId, level: current.level + 1 }));
  }

  nodes.forEach((node) => {
    if (!levels.has(node.id)) levels.set(node.id, 0);
  });

  return levels;
};

const buildGridPositions = (nodes: KnowledgeNode[], links: KnowledgeLink[]) => {
  const levels = buildNodeLevelMap(nodes, links);
  const columns = new Map<number, KnowledgeNode[]>();

  nodes
    .slice()
    .sort((a, b) => {
      const levelDelta = (levels.get(a.id) || 0) - (levels.get(b.id) || 0);
      if (levelDelta !== 0) return levelDelta;
      return a.package.title.localeCompare(b.package.title);
    })
    .forEach((node) => {
      const level = levels.get(node.id) || 0;
      const bucket = columns.get(level) || [];
      bucket.push(node);
      columns.set(level, bucket);
    });

  const positioned = new Map<string, { x: number; y: number }>();
  columns.forEach((columnNodes, level) => {
    columnNodes.forEach((node, index) => {
      positioned.set(node.id, {
        x: level * COLUMN_GAP,
        y: index * ROW_GAP,
      });
    });
  });

  return positioned;
};

const buildBackbonePositions = (nodes: KnowledgeNode[], links: KnowledgeLink[]) => {
  const positioned = new Map<string, { x: number; y: number }>();
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, KnowledgeLink[]>();

  links.forEach((link) => {
    const bucket = outgoing.get(link.fromNodeId) || [];
    bucket.push(link);
    outgoing.set(link.fromNodeId, bucket);
  });

  const scriptNodes = nodes
    .filter((node) => node.kind === "source.script")
    .sort((a, b) => a.package.title.localeCompare(b.package.title));

  let cursorY = 0;

  scriptNodes.forEach((scriptNode, scriptIndex) => {
    const episodeLinks = (outgoing.get(scriptNode.id) || [])
      .map((link) => nodesById.get(link.toNodeId))
      .filter((node): node is KnowledgeNode => Boolean(node))
      .sort((a, b) => a.package.title.localeCompare(b.package.title));

    const episodeBlocks = episodeLinks.map((episodeNode) => {
      const sceneNodes = (outgoing.get(episodeNode.id) || [])
        .map((link) => nodesById.get(link.toNodeId))
        .filter((node): node is KnowledgeNode => Boolean(node))
        .sort((a, b) => a.package.title.localeCompare(b.package.title));
      return { episodeNode, sceneNodes };
    });

    const blockHeights = episodeBlocks.map(({ sceneNodes }) =>
      Math.max(CARD_HEIGHT, sceneNodes.length * (CARD_HEIGHT + 36) - 36)
    );
    const totalHeight =
      blockHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, episodeBlocks.length - 1) * 64;
    const scriptY = cursorY + Math.max(0, totalHeight / 2 - CARD_HEIGHT / 2);

    positioned.set(scriptNode.id, { x: 0, y: scriptY });

    let episodeCursorY = cursorY;
    episodeBlocks.forEach(({ episodeNode, sceneNodes }, blockIndex) => {
      const blockHeight = blockHeights[blockIndex];
      const episodeY = episodeCursorY + Math.max(0, blockHeight / 2 - CARD_HEIGHT / 2);
      positioned.set(episodeNode.id, { x: COLUMN_GAP, y: episodeY });

      sceneNodes.forEach((sceneNode, sceneIndex) => {
        positioned.set(sceneNode.id, {
          x: COLUMN_GAP * 2,
          y: episodeCursorY + sceneIndex * (CARD_HEIGHT + 36),
        });
      });

      episodeCursorY += blockHeight + 64;
    });

    cursorY += Math.max(totalHeight, CARD_HEIGHT) + (scriptIndex < scriptNodes.length - 1 ? 160 : 0);
  });

  const remaining = nodes
    .filter((node) => !positioned.has(node.id))
    .sort((a, b) => a.package.title.localeCompare(b.package.title));

  remaining.forEach((node, index) => {
    positioned.set(node.id, {
      x: COLUMN_GAP * 3 + (index % 2) * (CARD_WIDTH + 48),
      y: Math.floor(index / 2) * (CARD_HEIGHT + 48),
    });
  });

  return positioned;
};

const buildFocusPositions = (
  nodes: KnowledgeNode[],
  links: KnowledgeLink[],
  selectedNodeRef?: string | null
) => {
  const positioned = new Map<string, { x: number; y: number }>();
  const focusNode = selectedNodeRef ? nodes.find((node) => node.ref === selectedNodeRef) : null;
  if (!focusNode) return buildGridPositions(nodes, links);

  positioned.set(focusNode.id, { x: 0, y: 0 });

  const incoming = links
    .filter((link) => link.toNodeId === focusNode.id)
    .map((link) => nodes.find((node) => node.id === link.fromNodeId))
    .filter((node): node is KnowledgeNode => Boolean(node));
  const outgoing = links
    .filter((link) => link.fromNodeId === focusNode.id)
    .map((link) => nodes.find((node) => node.id === link.toNodeId))
    .filter((node): node is KnowledgeNode => Boolean(node));

  incoming.forEach((node, index) => {
    positioned.set(node.id, {
      x: -(COLUMN_GAP + 80),
      y: index * (CARD_HEIGHT + 44) - ((incoming.length - 1) * (CARD_HEIGHT + 44)) / 2,
    });
  });
  outgoing.forEach((node, index) => {
    positioned.set(node.id, {
      x: COLUMN_GAP + 80,
      y: index * (CARD_HEIGHT + 44) - ((outgoing.length - 1) * (CARD_HEIGHT + 44)) / 2,
    });
  });

  const remaining = nodes.filter((node) => !positioned.has(node.id));
  remaining.forEach((node, index) => {
    positioned.set(node.id, {
      x: (index % 3) * (CARD_WIDTH + 44) - (CARD_WIDTH + 44),
      y: CARD_HEIGHT + 120 + Math.floor(index / 3) * (CARD_HEIGHT + 44),
    });
  });

  return positioned;
};

const buildRevisionPositions = (nodes: KnowledgeNode[], links: KnowledgeLink[]) => {
  const positioned = new Map<string, { x: number; y: number }>();
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const supersedeLinks = links.filter((link) => link.type === "supersedes");
  const incomingCounts = new Map<string, number>();

  supersedeLinks.forEach((link) => {
    incomingCounts.set(link.toNodeId, (incomingCounts.get(link.toNodeId) || 0) + 1);
  });

  const heads = nodes.filter(
    (node) => supersedeLinks.some((link) => link.fromNodeId === node.id) && !incomingCounts.get(node.id)
  );

  heads.forEach((head, rowIndex) => {
    let cursor: KnowledgeNode | undefined = head;
    let column = 0;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      positioned.set(cursor.id, {
        x: column * (CARD_WIDTH + 72),
        y: rowIndex * (CARD_HEIGHT + 84),
      });
      const nextLink = supersedeLinks
        .filter((link) => link.fromNodeId === cursor!.id)
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      cursor = nextLink ? nodesById.get(nextLink.toNodeId) : undefined;
      column += 1;
    }
  });

  const remaining = nodes.filter((node) => !positioned.has(node.id));
  remaining.forEach((node, index) => {
    positioned.set(node.id, {
      x: (index % 3) * (CARD_WIDTH + 48),
      y: (heads.length + 1) * (CARD_HEIGHT + 84) + Math.floor(index / 3) * (CARD_HEIGHT + 48),
    });
  });

  return positioned;
};

const buildPositionsByMode = (
  nodes: KnowledgeNode[],
  links: KnowledgeLink[],
  layoutMode: NonNullable<Props["layoutMode"]>,
  selectedNodeRef?: string | null
) => {
  switch (layoutMode) {
    case "backbone":
      return buildBackbonePositions(nodes, links);
    case "focus":
      return buildFocusPositions(nodes, links, selectedNodeRef);
    case "revisions":
      return buildRevisionPositions(nodes, links);
    case "anchor":
    case "full":
    default:
      return buildGridPositions(nodes, links);
  }
};

const toCanvasNodes = (
  nodes: KnowledgeNode[],
  links: KnowledgeLink[],
  selectedNodeRef?: string | null,
  layoutMode: NonNullable<Props["layoutMode"]> = "full"
): Node[] => {
  const positioned = buildPositionsByMode(nodes, links, layoutMode, selectedNodeRef);

  return nodes.map((node) => {
    const markdown = buildKnowledgeMarkdown(node);
    const urls = extractUrls(markdown);
    return {
      id: node.id,
      type: "default",
      position: positioned.get(node.id) || { x: 0, y: 0 },
      data: {
        label: (
          <div className="flex h-full w-full flex-col overflow-hidden rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(36,36,38,0.98),rgba(24,24,26,0.98))] shadow-[0_18px_48px_rgba(0,0,0,0.26)]">
            <div className="border-b border-white/8 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                    {formatKnowledgeKindLabel(node.kind)}
                  </div>
                  <div className="mt-1 truncate text-[15px] font-semibold text-[var(--app-text-primary)]">
                    {node.package.title}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-white/8 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-secondary)]">
                  {node.package.status}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1 text-[10px] text-[var(--app-text-secondary)]">
                  {formatKnowledgeOriginLabel(node.origin)}
                </span>
                <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1 text-[10px] text-[var(--app-text-secondary)]">
                  anchors {node.anchors.length}
                </span>
                {urls.length ? (
                  <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1 text-[10px] text-[var(--app-text-secondary)]">
                    links {urls.length}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
              {renderMarkdownLite(markdown)}
            </div>
            <div className="border-t border-white/8 px-4 py-2 text-[10px] text-[var(--app-text-muted)]">
              {node.ref}
            </div>
          </div>
        ),
      },
      draggable: false,
      selectable: true,
      connectable: false,
      deletable: false,
      selected: selectedNodeRef === node.ref,
      style: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 26,
        border:
          selectedNodeRef === node.ref
            ? "1px solid rgba(255,255,255,0.22)"
            : "1px solid transparent",
        background: "transparent",
        color: "var(--app-text-primary)",
        boxShadow:
          selectedNodeRef === node.ref
            ? "0 0 0 1px rgba(255,255,255,0.08), 0 20px 48px rgba(0,0,0,0.32)"
            : "none",
        padding: 0,
        cursor: "pointer",
      },
    };
  });
};

const toCanvasLinks = (links: KnowledgeLink[]): Edge[] =>
  links.map((link) => ({
    id: link.id,
    source: link.fromNodeId,
    target: link.toNodeId,
    animated: false,
    selectable: false,
    deletable: false,
    style: {
      stroke: "rgba(255,255,255,0.2)",
      strokeWidth: 1.5,
    },
  }));

const KnowledgeFlowProjectionInner: React.FC<Props> = ({
  title = "Knowledge Flow Projection",
  nodes,
  links,
  selectedNodeRef,
  onSelectNodeRef,
  variant = "panel",
  layoutMode = "full",
}) => {
  const canvasNodes = React.useMemo(
    () => toCanvasNodes(nodes, links, selectedNodeRef, layoutMode),
    [layoutMode, links, nodes, selectedNodeRef]
  );
  const canvasLinks = React.useMemo(() => toCanvasLinks(links), [links]);
  const isCanvas = variant === "canvas";

  return (
    <div
      className={
        isCanvas
          ? "h-full w-full"
          : "rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)]/88 p-4"
      }
    >
      {!isCanvas ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
              Knowledge Canvas
            </div>
            <div className="mt-1 text-[13px] font-semibold text-[var(--app-text-primary)]">
              {title}
            </div>
          </div>
          <div className="text-[10px] text-[var(--app-text-secondary)]">
            {nodes.length} nodes · {links.length} links
          </div>
        </div>
      ) : null}

      <div
        className={
          isCanvas
            ? "h-full w-full overflow-hidden rounded-[28px]"
            : "h-[420px] overflow-hidden rounded-[20px] border border-[var(--app-border)] bg-[var(--app-panel-soft)]"
        }
      >
        <ReactFlow
          nodes={canvasNodes}
          edges={canvasLinks}
          fitView
          fitViewOptions={{ padding: 0.24, maxZoom: 1.1, minZoom: 0.24 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          zoomOnDoubleClick={false}
          onNodeClick={(_, node) => {
            const ref = nodes.find((item) => item.id === node.id)?.ref;
            if (ref) onSelectNodeRef?.(ref);
          }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          maxZoom={1.4}
        >
          <MiniMap
            pannable
            zoomable
            nodeColor={() => "rgba(255,255,255,0.55)"}
            maskColor="rgba(0,0,0,0.18)"
            style={{
              background: "rgba(16,16,18,0.78)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
            }}
          />
          <Controls showInteractive={false} />
          <Background gap={24} size={1} color="rgba(255,255,255,0.06)" />
        </ReactFlow>
      </div>
    </div>
  );
};

export const KnowledgeFlowProjection: React.FC<Props> = (props) => (
  <ReactFlowProvider>
    <KnowledgeFlowProjectionInner {...props} />
  </ReactFlowProvider>
);
