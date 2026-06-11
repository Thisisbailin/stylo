import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Connection,
  ConnectionMode,
  Edge,
  EdgeChange,
  MiniMap,
  Node,
  NodeChange,
  NodeTypes,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { Plus, Upload } from "lucide-react";
import type { Episode, ProjectData, ScriptCanvasState } from "../../types";
import { BaseNode } from "../nodes/BaseNode";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { ViewportControls } from "./ViewportControls";

type ScriptPageData = {
  title: string;
  episodeId: number;
  preview: string;
};

type InspirationImageData = {
  title: string;
  imageUrl: string;
  filename?: string;
};

type ScriptCanvasNode =
  | Node<ScriptPageData, "text">
  | Node<InspirationImageData, "imageInput">;

type ScriptCanvasEdge = Edge<Record<string, never>>;

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  onOpenEpisode: (episodeId: number) => void;
};

const ensureCanvas = (canvas?: ScriptCanvasState): ScriptCanvasState => ({
  pages: Array.isArray(canvas?.pages) ? canvas.pages : [],
  images: Array.isArray(canvas?.images) ? canvas.images : [],
  links: Array.isArray(canvas?.links) ? canvas.links : [],
});

const scriptNodeId = (episodeId: number) => `script-${episodeId}`;
const imageNodeId = (imageId: string) => `image-${imageId}`;

const isImageNodeId = (id?: string | null) => !!id && id.startsWith("image-");
const isTextNodeId = (id?: string | null) => !!id && id.startsWith("script-");

const getDefaultScriptPosition = (index: number) => ({
  x: (index % 3) * 380,
  y: Math.floor(index / 3) * 330,
});

const getDefaultImagePosition = (index: number) => ({
  x: -420,
  y: index * 330,
});

const getLegacyScriptPosition = (index: number) => ({
  x: (index % 4) * 240,
  y: Math.floor(index / 4) * 170,
});

const isLegacyScriptPosition = (position: { x: number; y: number } | undefined, index: number) => {
  if (!position) return false;
  const legacy = getLegacyScriptPosition(index);
  return Math.abs(position.x - legacy.x) < 2 && Math.abs(position.y - legacy.y) < 2;
};

const createEmptyEpisode = (id: number): Episode => ({
  id,
  title: `第${id}集`,
  content: "",
  scenes: [],
  shots: [],
  status: "pending",
});

const compactScriptPreview = (episode: Episode) => {
  const source =
    episode.content ||
    episode.scenes?.map((scene) => [scene.title, scene.content].filter(Boolean).join("\n")).find((value) => value.trim()) ||
    "";
  const clean = source.replace(/\s+/g, " ").trim();
  if (!clean) return "Open full-screen editor to start writing.";
  return clean.length > 180 ? `${clean.slice(0, 180)}...` : clean;
};

const ScriptPageNode: React.FC<any> = ({ data, selected }) => (
  <BaseNode
    title={data.title || `第${data.episodeId}集`}
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
        Open full-screen editor
      </div>
    </div>
  </BaseNode>
);

const InspirationImageNode: React.FC<any> = ({ data, selected }) => (
  <BaseNode title={data.title || "image"} outputs={["image"]} selected={selected} variant="media" nodeType="imageInput">
    <div className="image-input-shell relative h-full w-full">
      <div className="image-input-frame">
        <div className="image-input-media">
          <img src={data.imageUrl} alt={data.filename || "preview"} className="image-input-img" />
        </div>
        <div className="image-input-caption">
          <div className="image-input-label">
            <div className="image-input-editor pointer-events-none">
              {data.filename || "Inspiration image"}
            </div>
          </div>
        </div>
      </div>
    </div>
  </BaseNode>
);

const nodeTypes: NodeTypes = {
  text: ScriptPageNode,
  imageInput: InspirationImageNode,
};

const ScriptCanvasInner: React.FC<Props> = ({ projectData, setProjectData, onOpenEpisode }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { getViewport, setViewport } = useReactFlow();
  const minZoom = 0.25;
  const maxZoom = 2.5;
  const [isLocked, setIsLocked] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [zoomValue, setZoomValue] = useState(() => getViewport().zoom ?? 1);
  const readingMode = useNodeFlowStore((state) => state.readingMode);
  const setReadingMode = useNodeFlowStore((state) => state.setReadingMode);
  const canvas = useMemo(() => ensureCanvas(projectData.scriptCanvas), [projectData.scriptCanvas]);

  const nodes = useMemo<ScriptCanvasNode[]>(() => {
    const pagePositionById = new Map(canvas.pages.map((page) => [page.episodeId, page.position]));
    const pageNodes: ScriptCanvasNode[] = (projectData.episodes || []).map((episode, index) => ({
      id: scriptNodeId(episode.id),
      type: "text",
      position:
        !pagePositionById.get(episode.id) || isLegacyScriptPosition(pagePositionById.get(episode.id), index)
          ? getDefaultScriptPosition(index)
          : pagePositionById.get(episode.id)!,
      data: {
        episodeId: episode.id,
        title: episode.title || `第${episode.id}集`,
        preview: compactScriptPreview(episode),
      },
    }));

    const imageNodes: ScriptCanvasNode[] = canvas.images.map((image, index) => ({
      id: imageNodeId(image.id),
      type: "imageInput",
      position: image.position || getDefaultImagePosition(index),
      data: {
        title: "image",
        imageUrl: image.imageUrl,
        filename: image.filename,
      },
    }));

    return [...pageNodes, ...imageNodes];
  }, [canvas.images, canvas.pages, projectData.episodes]);

  const nodeIdSet = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const edges = useMemo<ScriptCanvasEdge[]>(
    () =>
      canvas.links
        .filter((link) => nodeIdSet.has(link.source) && nodeIdSet.has(link.target))
        .map((link) => ({
          id: link.id,
          source: link.source,
          target: link.target,
          sourceHandle: link.sourceHandle || (isImageNodeId(link.source) ? "image" : "text"),
          targetHandle: link.targetHandle || (isImageNodeId(link.source) ? "image" : "text"),
          type: "default",
          animated: true,
          style: { stroke: "var(--app-accent-strong)", strokeWidth: 1.8 },
        })),
    [canvas.links, nodeIdSet]
  );

  const persistCanvas = useCallback(
    (updater: (canvas: ScriptCanvasState, previous: ProjectData) => ScriptCanvasState) => {
      setProjectData((previous) => ({
        ...previous,
        scriptCanvas: updater(ensureCanvas(previous.scriptCanvas), previous),
      }));
    },
    [setProjectData]
  );

  const handleAddScriptPage = useCallback(() => {
    setProjectData((previous) => {
      const nextId = previous.episodes.length
        ? Math.max(...previous.episodes.map((episode) => episode.id)) + 1
        : 1;
      const nextEpisode = createEmptyEpisode(nextId);
      const nextCanvas = ensureCanvas(previous.scriptCanvas);
      return {
        ...previous,
        episodes: [...previous.episodes, nextEpisode],
        scriptCanvas: {
          ...nextCanvas,
          pages: [
            ...nextCanvas.pages,
            {
              episodeId: nextId,
              position: getDefaultScriptPosition(previous.episodes.length),
            },
          ],
        },
      };
    });
  }, [setProjectData]);

  const handleImageInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const imageUrl = typeof reader.result === "string" ? reader.result : "";
        if (!imageUrl) return;

        setProjectData((previous) => {
          const nextCanvas = ensureCanvas(previous.scriptCanvas);
          const id = `inspiration-${Date.now()}`;
          return {
            ...previous,
            scriptCanvas: {
              ...nextCanvas,
              images: [
                ...nextCanvas.images,
                {
                  id,
                  imageUrl,
                  filename: file.name,
                  position: getDefaultImagePosition(nextCanvas.images.length),
                  createdAt: Date.now(),
                },
              ],
            },
          };
        });
      };
      reader.readAsDataURL(file);
      event.target.value = "";
    },
    [setProjectData]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<ScriptCanvasNode>[]) => {
      const hasPositionChange = changes.some((change) => change.type === "position" && change.position);
      const removedImageIds = changes
        .filter((change): change is Extract<NodeChange<ScriptCanvasNode>, { type: "remove" }> => change.type === "remove")
        .filter((change) => change.id.startsWith("image-"))
        .map((change) => change.id.replace(/^image-/, ""));

      if (!hasPositionChange && removedImageIds.length === 0) return;

      const nextNodes = applyNodeChanges(changes, nodes);
      const positionById = new Map(nextNodes.map((node) => [node.id, node.position]));

      persistCanvas((currentCanvas, previous) => {
        const removedImageSet = new Set(removedImageIds);
        const images = currentCanvas.images
          .filter((image) => !removedImageSet.has(image.id))
          .map((image) => ({
            ...image,
            position: positionById.get(imageNodeId(image.id)) || image.position,
          }));

        return {
          ...currentCanvas,
          pages: previous.episodes.map((episode, index) => ({
            episodeId: episode.id,
            position:
              positionById.get(scriptNodeId(episode.id)) ||
              currentCanvas.pages.find((page) => page.episodeId === episode.id)?.position ||
              getDefaultScriptPosition(index),
          })),
          images,
          links: currentCanvas.links.filter((link) => !removedImageIds.some((id) => link.source === imageNodeId(id) || link.target === imageNodeId(id))),
        };
      });
    },
    [nodes, persistCanvas]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<ScriptCanvasEdge>[]) => {
      const nextEdges = applyEdgeChanges(changes, edges);
      persistCanvas((currentCanvas) => ({
        ...currentCanvas,
        links: nextEdges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle === "image" || edge.sourceHandle === "text" ? edge.sourceHandle : undefined,
          targetHandle: edge.targetHandle === "image" || edge.targetHandle === "text" ? edge.targetHandle : undefined,
        })),
      }));
    },
    [edges, persistCanvas]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (!isTextNodeId(connection.target)) return;
      if (!isImageNodeId(connection.source) && !isTextNodeId(connection.source)) return;

      const id = `link-${connection.source}-${connection.target}`;
      const sourceHandle = isImageNodeId(connection.source) ? "image" : "text";
      const targetHandle = isImageNodeId(connection.source) ? "image" : "text";
      const nextEdges = addEdge(
        {
          ...connection,
          id,
          sourceHandle,
          targetHandle,
        },
        edges.filter((edge) => edge.id !== id)
      );

      persistCanvas((currentCanvas) => ({
        ...currentCanvas,
        links: nextEdges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: (edge.sourceHandle === "image" || edge.sourceHandle === "text" ? edge.sourceHandle : undefined),
          targetHandle: (edge.targetHandle === "image" || edge.targetHandle === "text" ? edge.targetHandle : undefined),
        })),
      }));
    },
    [edges, persistCanvas]
  );

  const handleZoomChange = useCallback(
    (value: number) => {
      const nextZoom = Math.min(maxZoom, Math.max(minZoom, value));
      setZoomValue(nextZoom);
      setViewport({ ...getViewport(), zoom: nextZoom }, { duration: 180 });
    },
    [getViewport, setViewport]
  );

  return (
    <div className="relative h-full w-full">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageInput} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={(_, node) => {
          if (node.type === "text") onOpenEpisode((node.data as ScriptPageData).episodeId);
        }}
        onMove={(_, viewport) => setZoomValue(viewport.zoom)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
        minZoom={minZoom}
        maxZoom={maxZoom}
        snapToGrid={snapToGrid}
        snapGrid={[28, 28]}
        nodesDraggable={!isLocked}
        nodesConnectable={!isLocked}
        elementsSelectable={!isLocked}
        panOnDrag={!isLocked}
        panOnScroll={!isLocked}
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnScroll={false}
        zoomOnPinch={!isLocked}
        zoomOnDoubleClick={!isLocked}
        connectionMode={ConnectionMode.Loose}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--app-pattern)" gap={28} size={1.4} />
        {showMiniMap ? (
          <div
            className="nodeflow-minimap-drawer"
            data-open={showMiniMap}
            style={{ position: "absolute", right: 24, bottom: 76, pointerEvents: "auto" }}
          >
            <MiniMap
              className="nodeflow-minimap"
              style={{ height: 130, width: 180, background: "#0b0d10", borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 18px 40px rgba(0,0,0,0.35)" }}
              maskColor="rgba(255,255,255,0.04)"
              nodeStrokeColor="#38bdf8"
              nodeColor="#0ea5e9"
            />
          </div>
        ) : null}
      </ReactFlow>

      <div
        className="qalam-viewport-control-zone absolute bottom-0 left-0 z-[80] h-64 w-28 pointer-events-auto"
        data-keep-open={showMiniMap}
        data-qalam-first="false"
      >
        <div className="absolute bottom-4 left-4 pointer-events-none">
          <div className="qalam-bottom-controls pointer-events-none opacity-0 transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
            <ViewportControls
              zoom={zoomValue}
              minZoom={minZoom}
              maxZoom={maxZoom}
              onZoomChange={handleZoomChange}
              isLocked={isLocked}
              onToggleLock={() => setIsLocked((value) => !value)}
              readingMode={readingMode}
              onToggleReadingMode={() => setReadingMode(readingMode === "identity" ? "full" : "identity")}
              snapToGrid={snapToGrid}
              onToggleSnapToGrid={() => setSnapToGrid((value) => !value)}
              showMiniMap={showMiniMap}
              onToggleMiniMap={() => setShowMiniMap((value) => !value)}
            />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute left-4 top-4 z-[14]">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-panel)]/92 px-2 py-2 shadow-[var(--app-shadow)] backdrop-blur-xl">
          <button
            type="button"
            onClick={handleAddScriptPage}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 text-[12px] font-semibold text-[var(--app-text-primary)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)]"
          >
            <Plus size={15} />
            Script
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 text-[12px] font-semibold text-[var(--app-text-primary)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)]"
          >
            <Upload size={15} />
            Image
          </button>
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            onClick={handleAddScriptPage}
            className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-panel)] px-4 text-[13px] font-semibold text-[var(--app-text-primary)] shadow-[var(--app-shadow)] transition hover:border-[var(--app-border-strong)]"
          >
            <Plus size={16} />
            Script
          </button>
        </div>
      ) : null}
    </div>
  );
};

export const ScriptCanvas: React.FC<Props> = (props) => (
  <ReactFlowProvider>
    <ScriptCanvasInner {...props} />
  </ReactFlowProvider>
);
