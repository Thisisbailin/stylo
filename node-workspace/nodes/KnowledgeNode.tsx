import React, { useLayoutEffect, useRef } from "react";
import { BookOpenText } from "lucide-react";
import { BaseNode } from "./BaseNode";
import type { KnowledgeNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";

type Props = {
  id: string;
  data: KnowledgeNodeData;
  selected?: boolean;
};

const PLANE_LABELS: Record<KnowledgeNodeData["plane"], string> = {
  source: "SOURCE",
  semantic: "SEMANTIC",
  design: "DESIGN",
};

export const KnowledgeNode: React.FC<Props> = ({ id, data, selected }) => {
  const updateNodeData = useNodeFlowStore((state) => state.updateNodeData);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    autoResize();
  }, [data.content]);

  return (
    <BaseNode
      title={data.title || "Knowledge"}
      onTitleChange={(title) => updateNodeData(id, { title })}
      inputs={["text"]}
      outputs={["text"]}
      selected={selected}
      nodeType="knowledge"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.22em] text-[var(--node-text-secondary)]">
          <span className="node-pill inline-flex items-center gap-2 px-3 py-1 shadow-sm">
            <BookOpenText size={10} className="text-[var(--node-text-secondary)]" />
            <span>{PLANE_LABELS[data.plane]}</span>
          </span>
          <span className="node-pill inline-flex items-center px-3 py-1 shadow-sm normal-case tracking-[0.08em]">
            {data.assetType || "semantic.note"}
          </span>
        </div>
        <textarea
          ref={textareaRef}
          className="node-textarea nodrag w-full resize-none bg-transparent px-1 py-1 text-[13px] leading-relaxed outline-none placeholder:text-[var(--node-text-secondary)] min-h-[120px]"
          value={data.content || ""}
          readOnly={Boolean(data.locked)}
          onChange={(event) => {
            updateNodeData(id, { content: event.target.value });
            autoResize();
          }}
          onFocus={autoResize}
          placeholder="Write a compact knowledge asset here..."
          style={{ height: "auto" }}
        />
        {!!(data.tags && data.tags.length) && (
          <div className="flex flex-wrap gap-2">
            {data.tags.slice(0, 6).map((tag) => (
              <span key={tag} className="node-pill px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--node-text-secondary)]">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </BaseNode>
  );
};
