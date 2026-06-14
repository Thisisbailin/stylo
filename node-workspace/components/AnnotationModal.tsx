import React, { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Arrow, Line, Text, Image as KonvaImage } from "react-konva";
import { useAnnotationStore } from "../store/annotationStore";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { AnnotationShape } from "../types";

const drawShape = (shape: AnnotationShape, isSelected: boolean) => {
  const common = { stroke: shape.stroke, strokeWidth: shape.strokeWidth, opacity: shape.opacity, draggable: true, shadowEnabled: isSelected };
  switch (shape.type) {
    case "rectangle":
      return (
        <Rect
          key={shape.id}
          x={shape.x}
          y={shape.y}
          width={(shape as any).width}
          height={(shape as any).height}
          fill={(shape as any).fill || undefined}
          {...common}
        />
      );
    case "circle":
      return (
        <Circle
          key={shape.id}
          x={shape.x}
          y={shape.y}
          radiusX={(shape as any).radiusX}
          radiusY={(shape as any).radiusY}
          fill={(shape as any).fill || undefined}
          {...common}
        />
      );
    case "arrow":
      return <Arrow key={shape.id} points={(shape as any).points} {...common} />;
    case "freehand":
      return <Line key={shape.id} points={(shape as any).points} {...common} tension={0.5} lineCap="round" lineJoin="round" />;
    case "text":
      return <Text key={shape.id} x={shape.x} y={shape.y} text={(shape as any).text} fontSize={(shape as any).fontSize} fill={(shape as any).fill} />;
    default:
      return null;
  }
};

export const AnnotationModal: React.FC = () => {
  const {
    isModalOpen,
    sourceNodeId,
    sourceImage,
    annotations,
    closeModal,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    currentTool,
    setCurrentTool,
    toolOptions,
    setToolOptions,
  } = useAnnotationStore();
  const { updateNodeData } = useNodeFlowStore();
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [drawing, setDrawing] = useState(false);
  const [newPoints, setNewPoints] = useState<number[]>([]);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);

  useEffect(() => {
    const resize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setStageSize({ width: rect.width, height: rect.height });
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    if (!isModalOpen || !sourceNodeId) return;
    updateNodeData(sourceNodeId, {
      annotations,
      sourceImage: sourceImage || null,
    });
  }, [annotations, isModalOpen, sourceImage, sourceNodeId, updateNodeData]);

  useEffect(() => {
    if (!sourceImage) {
      setImageElement(null);
      return;
    }
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => setImageElement(image);
    image.src = sourceImage;
    return () => {
      image.onload = null;
    };
  }, [sourceImage]);

  if (!isModalOpen) return null;

  const saveAndClose = () => {
    if (sourceNodeId && stageRef.current) {
      try {
        const outputImage = stageRef.current.toDataURL({ pixelRatio: 1 });
        updateNodeData(sourceNodeId, {
          annotations,
          sourceImage: sourceImage || null,
          outputImage,
        });
      } catch {
        updateNodeData(sourceNodeId, {
          annotations,
          sourceImage: sourceImage || null,
        });
      }
    }
    closeModal();
  };

  const startPoint = (e: any) => {
    const pos = e.target.getStage().getPointerPosition();
    if (!pos) return;
    setDrawing(true);
    if (currentTool === "freehand") {
      setNewPoints([pos.x, pos.y]);
    }
  };

  const movePoint = (e: any) => {
    if (!drawing) return;
    const pos = e.target.getStage().getPointerPosition();
    if (!pos) return;
    if (currentTool === "freehand") {
      setNewPoints((pts) => [...pts, pos.x, pos.y]);
    }
  };

  const endPoint = (e: any) => {
    if (!drawing) return;
    setDrawing(false);
    const pos = e.target.getStage().getPointerPosition();
    if (!pos) return;

    const base = {
      id: `${Date.now()}`,
      x: pos.x,
      y: pos.y,
      stroke: toolOptions.strokeColor,
      strokeWidth: toolOptions.strokeWidth,
      opacity: toolOptions.opacity,
      type: currentTool,
    } as AnnotationShape;

    if (currentTool === "rectangle") {
      addAnnotation({ ...base, type: "rectangle", width: 120, height: 80, fill: toolOptions.fillColor });
    } else if (currentTool === "circle") {
      addAnnotation({ ...base, type: "circle", radiusX: 60, radiusY: 60, fill: toolOptions.fillColor });
    } else if (currentTool === "arrow") {
      addAnnotation({ ...base, type: "arrow", points: [pos.x - 40, pos.y - 20, pos.x + 40, pos.y + 20] });
    } else if (currentTool === "freehand") {
      addAnnotation({ ...base, type: "freehand", points: newPoints.length ? newPoints : [pos.x, pos.y] });
      setNewPoints([]);
    } else if (currentTool === "text") {
      addAnnotation({ ...base, type: "text", text: "Text", fontSize: toolOptions.fontSize, fill: toolOptions.strokeColor });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
      <div className="app-panel rounded-xl w-[90vw] h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border)]">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold">Annotation</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <select
              value={currentTool}
              onChange={(e) => setCurrentTool(e.target.value as any)}
              className="bg-[var(--app-panel-muted)] border border-[var(--app-border)] rounded px-2 py-1 text-xs text-[var(--app-text-primary)]"
            >
              <option value="rectangle">Rectangle</option>
              <option value="circle">Circle</option>
              <option value="arrow">Arrow</option>
              <option value="freehand">Freehand</option>
              <option value="text">Text</option>
            </select>
            <input
              type="color"
              value={toolOptions.strokeColor}
              onChange={(e) => setToolOptions({ strokeColor: e.target.value })}
              className="w-8 h-8 bg-[var(--app-panel-muted)] border border-[var(--app-border)] rounded"
            />
            <input
              type="number"
              value={toolOptions.strokeWidth}
              onChange={(e) => setToolOptions({ strokeWidth: Number(e.target.value) })}
              className="w-12 bg-[var(--app-panel-muted)] border border-[var(--app-border)] rounded px-2 py-1 text-xs text-[var(--app-text-primary)]"
            />
            <button onClick={saveAndClose} className="px-3 py-1 text-xs bg-[var(--app-panel-soft)] border border-[var(--app-border)] rounded text-[var(--app-text-primary)]">
              完成
            </button>
          </div>
        </div>
        <div ref={containerRef} className="flex-1">
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            onMouseDown={startPoint}
            onMouseMove={movePoint}
            onMouseUp={endPoint}
          >
            <Layer>
              {imageElement ? (
                <KonvaImage image={imageElement} x={0} y={0} width={stageSize.width} height={stageSize.height} />
              ) : null}
              {annotations.map((s) => drawShape(s, false))}
              {drawing && currentTool === "freehand" && newPoints.length > 0 && (
                <Line points={newPoints} stroke={toolOptions.strokeColor} strokeWidth={toolOptions.strokeWidth} />
              )}
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
};
