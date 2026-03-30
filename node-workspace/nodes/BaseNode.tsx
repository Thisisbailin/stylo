import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Handle, Position, NodeResizer } from "@xyflow/react";
import { HandleType } from "../types";

type Props = {
  title: string;
  onTitleChange?: (newTitle: string) => void;
  children?: React.ReactNode;
  inputs?: HandleType[];
  outputs?: HandleType[];
  selected?: boolean;
  variant?: "default" | "text" | "media";
  resizerKeepAspect?: boolean;
};

export const BaseNode: React.FC<Props> = ({
  title,
  onTitleChange,
  children,
  inputs = [],
  outputs = [],
  selected,
  variant = "default",
  resizerKeepAspect,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [showResizer, setShowResizer] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);

  const minHeight = variant === "text" ? 256 : 160;
  const keepAspectRatio = resizerKeepAspect ?? variant === "media";
  const eyebrow = useMemo(() => {
    if (variant === "media") return "媒体节点";
    if (variant === "text") return "文本节点";
    if (inputs.length === 0 && outputs.length > 0) return "输入节点";
    if (outputs.length === 0 && inputs.length > 0) return "结果节点";
    return "工作节点";
  }, [inputs.length, outputs.length, variant]);

  useEffect(() => {
    setDraftTitle(title);
  }, [title]);

  const updateResizerVisibility = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isResizing) return;
      const rect = cardRef.current?.getBoundingClientRect();
      if (!rect) return;
      const threshold = 26;
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

  const commitTitle = useCallback(() => {
    const nextTitle = draftTitle.trim() || title;
    if (nextTitle !== draftTitle) setDraftTitle(nextTitle);
    if (onTitleChange && nextTitle !== title) onTitleChange(nextTitle);
  }, [draftTitle, onTitleChange, title]);

  const getHandleTop = useCallback((index: number, count: number) => {
    if (count <= 1) return "50%";
    const start = 24;
    const end = 76;
    const ratio = count === 1 ? 0.5 : index / (count - 1);
    return `${start + (end - start) * ratio}%`;
  }, []);

  return (
    <div
      ref={cardRef}
      className="node-card-base transition-shadow duration-300 overflow-visible text-xs flex flex-col"
      data-selected={!!selected}
      data-variant={variant}
      data-resizer-visible={showResizer || isResizing}
      data-resizing={isResizing}
      onMouseMove={updateResizerVisibility}
      onMouseLeave={clearResizer}
    >
      <NodeResizer
        color="var(--node-accent)"
        isVisible
        minWidth={320}
        minHeight={minHeight}
        keepAspectRatio={keepAspectRatio}
        handleClassName="custom-node-handle"
        lineClassName="custom-node-line"
        onResizeStart={handleResizeStart}
        onResizeEnd={handleResizeEnd}
      />

      <div className="node-card-shell">
        <div className="node-card-header-shell">
          <div className="node-card-header-copy">
            <div className="node-card-eyebrow">{eyebrow}</div>
            {onTitleChange ? (
              <input
                className="node-card-title-input nodrag"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={commitTitle}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitTitle();
                    event.currentTarget.blur();
                  }
                }}
              />
            ) : (
              <div className="node-card-title">{title}</div>
            )}
          </div>
        </div>
        <div className="node-card-body">{children}</div>
      </div>

      {inputs.map((h, idx) => (
        <Handle
          key={`in-${h}-${idx}`}
          type="target"
          position={Position.Left}
          id={h}
          style={{ top: getHandleTop(idx, inputs.length) }}
          className="node-card-port node-card-port--input !w-2 !h-2 !border-0 !bg-[var(--node-text-secondary)]"
          data-handletype={h}
        />
      ))}

      {outputs.map((h, idx) => (
        <Handle
          key={`out-${h}-${idx}`}
          type="source"
          position={Position.Right}
          id={h}
          style={{ top: getHandleTop(idx, outputs.length) }}
          className="node-card-port node-card-port--output !w-2 !h-2 !border-0 !bg-[var(--node-text-secondary)]"
          data-handletype={h}
        />
      ))}
    </div>
  );
};
