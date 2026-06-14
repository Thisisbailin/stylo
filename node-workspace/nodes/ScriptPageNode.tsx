import React from "react";
import { BaseNode } from "./BaseNode";

type Props = {
  data: {
    title?: string;
    episodeId?: number;
    preview?: string;
  };
  selected?: boolean;
};

export const ScriptPageNode: React.FC<Props> = ({ data, selected }) => (
  <BaseNode
    title={data.title || `第${data.episodeId || ""}集`}
    inputs={["image", "text"]}
    outputs={["text"]}
    selected={selected}
    variant="text"
    nodeType="text"
  >
    <div className="text-node-shell relative flex-1" data-has-content={data.preview ? "true" : "false"}>
      <div
        className="text-node-editor pointer-events-none text-[12px] leading-6 text-[var(--node-text-primary)]"
        style={{
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 7,
          minHeight: 0,
          maxHeight: 168,
          overflow: "hidden",
        }}
      >
        {data.preview}
      </div>
      <div className="mt-3 rounded-2xl border border-[var(--node-border)] bg-[var(--node-panel-muted)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--node-text-secondary)]">
        打开全屏编辑器
      </div>
    </div>
  </BaseNode>
);
