import React from "react";
import { BaseNode } from "./BaseNode";
import { AnnotationNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { useAnnotationStore } from "../store/annotationStore";
import { PenTool } from "lucide-react";

type Props = {
  id: string;
  data: AnnotationNodeData;
};

export const AnnotationNode: React.FC<Props & { selected?: boolean }> = ({ data, selected }) => {
  const connectedInputs = useNodeFlowStore((state) => state.getConnectedInputs);
  const openModal = useAnnotationStore((state) => state.openModal);
  const connectedImage = connectedInputs(id).images[0] || null;
  const sourceImage = data.sourceImage || data.outputImage || connectedImage;

  return (
    <BaseNode title="Annotation Overlay" inputs={["image"]} outputs={["image"]} selected={selected}>
      <div className="space-y-4 flex-1 flex flex-col">
        {data.outputImage ? (
          <div className="node-surface relative overflow-hidden rounded-[20px] shadow-[0_18px_40px_rgba(0,0,0,0.4)]">
            <img
              src={data.outputImage}
              alt="annotated"
              className="w-full h-32 object-cover transition-transform duration-700 hover:scale-105"
            />
          </div>
        ) : (
          <div className="node-surface node-surface--dashed w-full py-6 rounded-[20px] flex flex-col items-center justify-center">
            <span className="text-[10px] opacity-40 uppercase tracking-[0.2em] font-black italic">
              {sourceImage ? "Ready" : "No Image"}
            </span>
          </div>
        )}
        <button
          type="button"
          disabled={!sourceImage}
          onClick={(event) => {
            event.stopPropagation();
            if (!sourceImage) return;
            openModal(id, sourceImage, data.annotations || []);
          }}
          className="nodrag inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[var(--node-border)] bg-[var(--node-panel-muted)] px-3 text-[11px] font-semibold text-[var(--node-text-secondary)] transition hover:border-[var(--node-border-strong)] hover:text-[var(--node-text-primary)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <PenTool size={13} />
          标注
        </button>
      </div>
    </BaseNode>
  );
};
