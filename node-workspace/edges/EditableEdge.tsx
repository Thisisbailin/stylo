import React, { useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from "@xyflow/react";
import type { NodeFlowLinkData } from "../types";

type Props = {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: any;
  targetPosition: any;
  data?: NodeFlowLinkData;
  markerEnd?: string;
};

export const EditableEdge: React.FC<Props> = (props) => {
  const [edgePath, labelX, labelY] = getBezierPath(props);
  const [hover, setHover] = useState(false);

  return (
    <>
      <BaseEdge
        id={props.id}
        path={edgePath}
        markerEnd={props.markerEnd}
        style={{
          strokeWidth: hover ? 2.5 : 1.5,
          stroke: hover ? 'var(--accent-blue)' : 'var(--border-strong)',
          opacity: hover ? 1 : 0.4,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      />
      <EdgeLabelRenderer>
        <div
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className={`
            group flex items-center justify-center min-w-[32px] h-6 px-2 rounded-full border transition-all duration-300 cursor-pointer
            ${hover ? 'bg-[var(--accent-blue)] border-transparent scale-110 shadow-lg shadow-blue-500/20' : 'bg-[var(--bg-panel)]/80 border-[var(--border-subtle)]'}
          `}
        >
          <span className={`text-[9px] font-bold tracking-tighter uppercase transition-colors ${hover ? 'text-white' : 'text-[var(--text-secondary)] opacity-60 group-hover:opacity-100'}`}>
            {props.data?.hasPause ? "Pause" : "Auto"}
          </span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
