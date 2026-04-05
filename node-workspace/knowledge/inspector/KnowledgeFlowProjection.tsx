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

type Props = {
  title?: string;
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
  selectedNodeRef?: string | null;
  onSelectNodeRef?: (nodeRef: string) => void;
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
    const knownLevel = levels.get(current.id);
    if (knownLevel != null && knownLevel <= current.level) continue;
    levels.set(current.id, current.level);
    links
      .filter((link) => link.fromNodeId === current.id)
      .forEach((link) => {
        queue.push({
          id: link.toNodeId,
          level: current.level + 1,
        });
      });
  }

  nodes.forEach((node) => {
    if (!levels.has(node.id)) {
      levels.set(node.id, 0);
    }
  });

  return levels;
};

const toCanvasNodes = (
  nodes: KnowledgeNode[],
  links: KnowledgeLink[],
  selectedNodeRef?: string | null
): Node[] => {
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
        x: level * 280,
        y: index * 140,
      });
    });
  });

  return nodes.map((node) => ({
    id: node.id,
    type: "default",
    position: positioned.get(node.id) || { x: 0, y: 0 },
    data: {
      label: (
        <div className="min-w-[180px]">
          <div className="text-[12px] font-semibold text-[var(--app-text-primary)]">
            {node.package.title}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-secondary)]">
            {node.kind}
          </div>
          <div className="mt-1 text-[10px] text-[var(--app-text-muted)]">
            {node.origin} · {node.package.status}
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
      width: 220,
      borderRadius: 18,
      border:
        selectedNodeRef === node.ref
          ? "1px solid var(--app-border-strong)"
          : "1px solid var(--app-border)",
      background: "var(--app-panel)",
      color: "var(--app-text-primary)",
      boxShadow:
        selectedNodeRef === node.ref
          ? "0 0 0 1px rgba(255,255,255,0.08), 0 12px 28px rgba(0,0,0,0.18)"
          : "0 10px 24px rgba(0,0,0,0.12)",
      padding: 12,
      cursor: "pointer",
    },
  }));
};

const toCanvasLinks = (links: KnowledgeLink[]): Edge[] =>
  links.map((link) => ({
    id: link.id,
    source: link.fromNodeId,
    target: link.toNodeId,
    label: link.type,
    animated: false,
    selectable: false,
    deletable: false,
    style: {
      stroke: "rgba(255,255,255,0.28)",
      strokeWidth: 1.4,
    },
    labelStyle: {
      fill: "var(--app-text-secondary)",
      fontSize: 10,
      fontWeight: 600,
    },
  }));

const KnowledgeFlowProjectionInner: React.FC<Props> = ({
  title = "Knowledge Flow Projection",
  nodes,
  links,
  selectedNodeRef,
  onSelectNodeRef,
}) => {
  const canvasNodes = React.useMemo(
    () => toCanvasNodes(nodes, links, selectedNodeRef),
    [links, nodes, selectedNodeRef]
  );
  const canvasLinks = React.useMemo(() => toCanvasLinks(links), [links]);

  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
            Flow Projection
          </div>
          <div className="mt-1 text-[13px] font-semibold text-[var(--app-text-primary)]">
            {title}
          </div>
        </div>
        <div className="text-[10px] text-[var(--app-text-secondary)]">
          {nodes.length} nodes · {links.length} links
        </div>
      </div>
      <div className="mt-3 h-[420px] overflow-hidden rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-soft)]">
        <ReactFlow
          nodes={canvasNodes}
          edges={canvasLinks}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          zoomOnDoubleClick={false}
          onNodeClick={(_, node) => {
            const ref = nodes.find((item) => item.id === node.id)?.ref;
            if (ref) onSelectNodeRef?.(ref);
          }}
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap
            pannable
            zoomable
            nodeColor={() => "rgba(255,255,255,0.55)"}
            maskColor="rgba(0,0,0,0.14)"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--app-border)",
            }}
          />
          <Controls showInteractive={false} />
          <Background gap={24} size={1} color="rgba(255,255,255,0.08)" />
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
