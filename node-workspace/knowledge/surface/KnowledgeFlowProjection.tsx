import React from "react";
import {
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import type { KnowledgeLink, KnowledgeNode } from "../types";
import { formatKnowledgeKindLabel, formatKnowledgeOriginLabel } from "./labels";
import type { NodeFlowReadingMode } from "../../nodeflow/sessionState";
import { useNodeFlowStore } from "../../store/nodeFlowStore";
import {
  alignPositionChangesToNodeEdges,
  getEdgeAlignedPosition,
} from "../../utils/edgeAlignment";
import type { CanvasSurfaceConfig, SharedCanvasControls } from "../../components/canvas/types";

type Props = {
  title?: string;
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
  selectedNodeRef?: string | null;
  onSelectNodeRef?: (nodeRef: string) => void;
  variant?: "panel" | "canvas";
  layoutMode?: "backbone" | "focus" | "revisions" | "anchor" | "full";
  canvasControls: SharedCanvasControls;
};

const CARD_WIDTH = 320;
const CARD_HEIGHT = 226;
const COLUMN_GAP = 400;
const ROW_GAP = 274;

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
          className="rounded bg-[var(--app-panel-muted)] px-1 py-0.5 text-[11px] text-[var(--app-text-primary)]"
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
          className="text-[var(--app-text-primary)] underline decoration-[var(--app-border-strong)] underline-offset-2"
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
          className="text-[var(--app-text-primary)] underline decoration-[var(--app-border-strong)] underline-offset-2"
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
          className="overflow-x-auto rounded-md border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-2 text-[11px] leading-5 text-[var(--app-text-secondary)]"
        >
          {lang ? (
            <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-muted)]">{lang}</div>
          ) : null}
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
          ? "text-[15px] font-semibold"
          : level === 2
            ? "text-[13px] font-semibold"
            : "text-[11px] font-semibold uppercase tracking-[0.12em]";
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

    const listMatch = line.match(/^\s*(?:[-*\u2022]|\d+\.|\d+\u3001)\s+/);
    if (listMatch) {
      const items: string[] = [];
      let ordered = false;
      while (i < lines.length) {
        const current = lines[i];
        const bulletMatch = current.match(/^\s*[-*\u2022]\s+(.+)$/);
        const orderedMatch = current.match(/^\s*(?:\d+\.|\d+\u3001)\s+(.+)$/);
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
          <div key={`table-${i}`} className="overflow-x-auto rounded-md border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-2 py-2">
            <table className="min-w-full border-collapse text-[11px] text-[var(--app-text-secondary)]">
              <thead>
                <tr>
                  {headers.map((header, index) => (
                    <th
                      key={`${header}-${index}`}
                      className="border-b border-[var(--app-border)] px-2 pb-1 text-left font-semibold text-[var(--app-text-primary)]"
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
        /^\s*(?:[-*\u2022]|\d+\.|\d+\u3001)\s+/.test(current)
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
      Math.max(CARD_HEIGHT, sceneNodes.length * (CARD_HEIGHT + 28) - 28)
    );
    const totalHeight =
      blockHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, episodeBlocks.length - 1) * 48;
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
          y: episodeCursorY + sceneIndex * (CARD_HEIGHT + 28),
        });
      });

      episodeCursorY += blockHeight + 48;
    });

    cursorY += Math.max(totalHeight, CARD_HEIGHT) + (scriptIndex < scriptNodes.length - 1 ? 120 : 0);
  });

  const remaining = nodes
    .filter((node) => !positioned.has(node.id))
    .sort((a, b) => a.package.title.localeCompare(b.package.title));

  remaining.forEach((node, index) => {
    positioned.set(node.id, {
      x: COLUMN_GAP * 3 + (index % 2) * (CARD_WIDTH + 36),
      y: Math.floor(index / 2) * (CARD_HEIGHT + 36),
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
      x: -(COLUMN_GAP + 40),
      y: index * (CARD_HEIGHT + 36) - ((incoming.length - 1) * (CARD_HEIGHT + 36)) / 2,
    });
  });
  outgoing.forEach((node, index) => {
    positioned.set(node.id, {
      x: COLUMN_GAP + 40,
      y: index * (CARD_HEIGHT + 36) - ((outgoing.length - 1) * (CARD_HEIGHT + 36)) / 2,
    });
  });

  const remaining = nodes.filter((node) => !positioned.has(node.id));
  remaining.forEach((node, index) => {
    positioned.set(node.id, {
      x: (index % 3) * (CARD_WIDTH + 36) - (CARD_WIDTH + 36),
      y: CARD_HEIGHT + 96 + Math.floor(index / 3) * (CARD_HEIGHT + 36),
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
        x: column * (CARD_WIDTH + 56),
        y: rowIndex * (CARD_HEIGHT + 64),
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
      x: (index % 3) * (CARD_WIDTH + 36),
      y: (heads.length + 1) * (CARD_HEIGHT + 64) + Math.floor(index / 3) * (CARD_HEIGHT + 36),
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

const nodeMetaPillClass =
  "rounded-md border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-1.5 py-0.5 text-[10px] text-[var(--app-text-secondary)]";

const toCanvasNodes = (
  nodes: KnowledgeNode[],
  links: KnowledgeLink[],
  selectedNodeRef?: string | null,
  layoutMode: NonNullable<Props["layoutMode"]> = "full",
  readingMode: NodeFlowReadingMode = "full",
  positionOverrides: Record<string, { x: number; y: number }> = {}
): Node[] => {
  const positioned = buildPositionsByMode(nodes, links, layoutMode, selectedNodeRef);
  const isIdentityMode = readingMode === "identity";

  return nodes.map((node) => {
    const markdown = buildKnowledgeMarkdown(node);
    const urls = extractUrls(markdown);
    const selected = selectedNodeRef === node.ref;
    const position = positionOverrides[node.id] || positioned.get(node.id) || { x: 0, y: 0 };
    return {
      id: node.id,
      type: "default",
      position,
      data: {
        label: (
          <div
            className={`flex h-full w-full flex-col overflow-hidden rounded-lg border bg-[var(--app-panel)]/96 shadow-[0_12px_30px_rgba(0,0,0,0.14)] ${
              selected ? "border-[var(--app-border-strong)]" : "border-[var(--app-border)]"
            }`}
            data-reading-mode={readingMode}
          >
            <div className="border-b border-[var(--app-border)] px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-muted)]">
                    {formatKnowledgeKindLabel(node.kind)}
                  </div>
                  <div className="mt-1 truncate text-[14px] font-semibold text-[var(--app-text-primary)]">
                    {node.package.title}
                  </div>
                </div>
                <span className="shrink-0 rounded-md border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--app-text-secondary)]">
                  {node.package.status}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className={nodeMetaPillClass}>{formatKnowledgeOriginLabel(node.origin)}</span>
                <span className={nodeMetaPillClass}>anchors {node.anchors.length}</span>
                {urls.length ? <span className={nodeMetaPillClass}>links {urls.length}</span> : null}
              </div>
            </div>
            {!isIdentityMode ? (
              <>
                <div className="min-h-0 flex-1 overflow-auto px-3 py-2.5">
                  {renderMarkdownLite(markdown)}
                </div>
                <div className="truncate border-t border-[var(--app-border)] px-3 py-1.5 font-mono text-[10px] text-[var(--app-text-muted)]">
                  {node.ref}
                </div>
              </>
            ) : null}
          </div>
        ),
      },
      draggable: true,
      selectable: true,
      connectable: false,
      deletable: false,
      selected,
      style: {
        width: CARD_WIDTH,
        height: isIdentityMode ? 112 : CARD_HEIGHT,
        borderRadius: 8,
        border: selected ? "1px solid var(--app-border-strong)" : "1px solid transparent",
        background: "transparent",
        color: "var(--app-text-primary)",
        boxShadow: selected ? "0 0 0 3px var(--app-accent-soft)" : "none",
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
      stroke: "var(--app-border-strong)",
      strokeWidth: 1.4,
    },
  }));

export const useKnowledgeFlowSurface = ({
  nodes,
  links,
  selectedNodeRef,
  onSelectNodeRef,
  variant = "panel",
  layoutMode = "full",
  canvasControls,
}: Props): CanvasSurfaceConfig => {
  const {
    isLocked,
    snapToGrid,
    onAlignmentGuideChange,
  } = canvasControls;
  const [positionOverrides, setPositionOverrides] = React.useState<Record<string, { x: number; y: number }>>({});
  const readingMode = useNodeFlowStore((state) => state.readingMode);
  const canvasNodes = React.useMemo(
    () => toCanvasNodes(nodes, links, selectedNodeRef, layoutMode, readingMode, positionOverrides),
    [layoutMode, links, nodes, positionOverrides, readingMode, selectedNodeRef]
  );
  const canvasLinks = React.useMemo(() => toCanvasLinks(links), [links]);
  const isCanvas = variant === "canvas";

  React.useEffect(() => {
    setPositionOverrides((current) => {
      const validIds = new Set(nodes.map((node) => node.id));
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => validIds.has(id)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [nodes]);

  const handleNodesChange = React.useCallback(
    (changes: NodeChange[]) => {
      const aligned = alignPositionChangesToNodeEdges(changes, canvasNodes, snapToGrid && !isLocked);
      onAlignmentGuideChange(aligned.guide);
      const nextNodes = applyNodeChanges(aligned.changes, canvasNodes);
      setPositionOverrides((current) => {
        const next = { ...current };
        nextNodes.forEach((node) => {
          next[node.id] = node.position;
        });
        return next;
      });
    },
    [canvasNodes, isLocked, onAlignmentGuideChange, snapToGrid]
  );
  const updateSnapGuide = React.useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (!snapToGrid || isLocked) {
        onAlignmentGuideChange(null);
        return;
      }
      const node = canvasNodes.find((item) => item.id === nodeId);
      if (!node) {
        onAlignmentGuideChange(null);
        return;
      }
      onAlignmentGuideChange(getEdgeAlignedPosition(node, canvasNodes, position).guide);
    },
    [canvasNodes, isLocked, onAlignmentGuideChange, snapToGrid]
  );

  React.useEffect(() => {
    if (!snapToGrid) onAlignmentGuideChange(null);
  }, [onAlignmentGuideChange, snapToGrid]);

  return {
    key: "knowledge",
    nodes: canvasNodes,
    edges: canvasLinks,
    onNodesChange: handleNodesChange as CanvasSurfaceConfig["onNodesChange"],
    nodesDraggable: isCanvas && !isLocked,
    nodesConnectable: false,
    elementsSelectable: !isLocked,
    onlyRenderVisibleElements: true,
    onNodeDragStart: (_, node) => updateSnapGuide(node.id, node.position),
    onNodeDrag: (_, node) => updateSnapGuide(node.id, node.position),
    onNodeDragStop: () => onAlignmentGuideChange(null),
    onNodeClick: (_, node) => {
      const ref = nodes.find((item) => item.id === node.id)?.ref;
      if (ref) onSelectNodeRef?.(ref);
    },
  };
};
