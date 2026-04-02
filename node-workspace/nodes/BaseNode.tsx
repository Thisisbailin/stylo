import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Handle, Position, NodeResizer } from "@xyflow/react";
import { HandleType } from "../types";

type NodeHandleSpec =
  | HandleType
  | {
      id: HandleType;
      top?: string;
      hidden?: boolean;
      className?: string;
      label?: string;
    };

type Props = {
  title: string;
  onTitleChange?: (newTitle: string) => void;
  children?: React.ReactNode;
  inputs?: NodeHandleSpec[];
  outputs?: NodeHandleSpec[];
  selected?: boolean;
  variant?: "default" | "text" | "media";
  resizerKeepAspect?: boolean;
  nodeType?: string;
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
  nodeType,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [showResizer, setShowResizer] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);

  const minHeight = variant === "text" ? 256 : 160;
  const keepAspectRatio = resizerKeepAspect ?? variant === "media";

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

  const resolveHandleSpec = useCallback(
    (handle: NodeHandleSpec, index: number, count: number) =>
      typeof handle === "string"
        ? { id: handle, top: getHandleTop(index, count), hidden: false, className: "", label: "" }
        : {
            id: handle.id,
            top: handle.top || getHandleTop(index, count),
            hidden: !!handle.hidden,
            className: handle.className || "",
            label: handle.label || "",
          },
    [getHandleTop]
  );

  const normalizeHandleSpecs = useCallback(
    (handles: NodeHandleSpec[]) => {
      const resolved = handles.map((handle, index) => resolveHandleSpec(handle, index, handles.length));
      const visibleMultiHandle = resolved.some((handle) => handle.id === "multi" && !handle.hidden);
      const visibleTypedHandles = resolved.filter((handle) => handle.id !== "multi" && !handle.hidden);
      if (visibleMultiHandle || visibleTypedHandles.length <= 1) return resolved;
      return [
        {
          id: "multi" as HandleType,
          top: "50%",
          hidden: false,
          className: "node-card-port--multi",
          label: "",
        },
        ...resolved.map((handle) =>
          handle.id === "multi"
            ? handle
            : {
                ...handle,
                top: "50%",
                hidden: true,
                label: "",
              }
        ),
      ];
    },
    [resolveHandleSpec]
  );

  const normalizedInputs = useMemo(() => normalizeHandleSpecs(inputs), [inputs, normalizeHandleSpecs]);
  const normalizedOutputs = useMemo(() => normalizeHandleSpecs(outputs), [outputs, normalizeHandleSpecs]);

  return (
    <div
      ref={cardRef}
      className="node-card-base transition-shadow duration-300 overflow-visible text-xs flex flex-col"
      data-selected={!!selected}
      data-variant={variant}
      data-node-type={nodeType || ""}
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

      {normalizedInputs.map((spec, idx) => {
        return (
          <Handle
            key={`in-${spec.id}-${idx}`}
            type="target"
            position={Position.Left}
            id={spec.id}
            style={{ top: spec.top }}
            className={`node-card-port node-card-port--input !border-0 !bg-[var(--node-text-secondary)] ${spec.hidden ? "node-card-port--ghost" : ""} ${spec.className}`.trim()}
            data-handletype={spec.id}
          />
        );
      })}

      {normalizedOutputs.map((spec, idx) => {
        return (
          <Handle
            key={`out-${spec.id}-${idx}`}
            type="source"
            position={Position.Right}
            id={spec.id}
            style={{ top: spec.top }}
            className={`node-card-port node-card-port--output !border-0 !bg-[var(--node-text-secondary)] ${spec.hidden ? "node-card-port--ghost" : ""} ${spec.className}`.trim()}
            data-handletype={spec.id}
          />
        );
      })}
    </div>
  );
};
