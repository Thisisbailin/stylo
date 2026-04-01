import React, { useCallback, useRef, useState } from "react";
import { NodeProps, NodeResizer } from "@xyflow/react";
import { GroupNodeData } from "../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";

export const GroupNode: React.FC<NodeProps> = ({ id, data, selected }) => {
    const { updateNodeData } = useNodeFlowStore();
    const groupData = data as GroupNodeData;
    const groupRef = useRef<HTMLDivElement>(null);
    const [showResizer, setShowResizer] = useState(false);
    const [isResizing, setIsResizing] = useState(false);

    const updateResizerVisibility = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (isResizing) return;
            const rect = groupRef.current?.getBoundingClientRect();
            if (!rect) return;
            const threshold = 30;
            const x = event.clientX;
            const y = event.clientY;
            const nearLeft = x - rect.left <= threshold;
            const nearRight = rect.right - x <= threshold;
            const nearTop = y - rect.top <= threshold;
            const nearBottom = rect.bottom - y <= threshold;
            const next = (nearLeft || nearRight) && (nearTop || nearBottom);
            if (next !== showResizer) setShowResizer(next);
        },
        [isResizing, showResizer]
    );

    const clearResizer = useCallback(() => {
        if (!isResizing) setShowResizer(false);
    }, [isResizing]);

    const handleResizeStart = useCallback(() => {
        setIsResizing(true);
        setShowResizer(true);
    }, []);

    const handleResizeEnd = useCallback(() => {
        setIsResizing(false);
        setShowResizer(false);
    }, []);

    return (
        <div
            ref={groupRef}
            className="group-surface h-full w-full rounded-[32px] transition-all duration-300 overflow-visible relative group/node"
            data-selected={selected ? "true" : "false"}
            data-resizer-visible={showResizer || isResizing}
            data-resizing={isResizing}
            onMouseMove={updateResizerVisibility}
            onMouseLeave={clearResizer}
        >
            <NodeResizer
                color="var(--node-accent)"
                isVisible
                minWidth={300}
                minHeight={200}
                handleClassName="custom-node-handle group-arc-handle"
                lineClassName="custom-node-line"
                onResizeStart={handleResizeStart}
                onResizeEnd={handleResizeEnd}
            />

            {/* Group Title - Floating above */}
            <div className="absolute -top-7 left-4 flex items-center gap-3">
                <input
                    className="node-title-input bg-transparent text-[11px] outline-none transition-colors px-1"
                    value={groupData.title}
                    onChange={(e) => updateNodeData(id, { title: e.target.value })}
                    placeholder="GROUP TITLE"
                />
                {selected && (
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--node-accent)] shadow-[0_0_8px_var(--node-accent)] animate-pulse" />
                )}
            </div>

            <div className="w-full h-full p-6 pointer-events-none" />
        </div>
    );
};
