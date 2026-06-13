import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  NodeTypes,
  OnConnectEnd,
  XYPosition,
} from "@xyflow/react";
import { Plus, Upload } from "lucide-react";
import type { Episode, ProjectData, ScriptCanvasState } from "../../types";
import { BaseNode } from "../nodes/BaseNode";
import {
  alignPositionChangesToNodeEdges,
  getEdgeAlignedPosition,
} from "../utils/edgeAlignment";
import { ConnectionDropMenu, type ConnectionDropMenuOption } from "./ConnectionDropMenu";
import type { CanvasSurfaceConfig, SharedCanvasControls } from "./canvas/types";

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
type ScriptCanvasCreateType = "scriptPage" | "scriptImage";
type ScriptHandleType = "image" | "text";

type ScriptConnectionDropState = {
  position: { x: number; y: number };
  flowPosition: { x: number; y: number };
  handleType: ScriptHandleType | null;
  connectionType: "source" | "target";
  sourceNodeId: string | null;
  sourceHandleId: string | null;
};

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  onOpenEpisode: (episodeId: number) => void;
  canvasControls: SharedCanvasControls;
  screenToFlowPosition: (position: { x: number; y: number }) => XYPosition;
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
const scriptCreateOptions: ConnectionDropMenuOption<ScriptCanvasCreateType>[] = [
  { label: "Script Page", hint: "Create a new episode page", type: "scriptPage", Icon: Plus },
  { label: "Image", hint: "Upload an inspiration image", type: "scriptImage", Icon: Upload },
];

const pickOutputHandle = (handles: ScriptHandleType[], preferred?: ScriptHandleType | null) => {
  if (preferred && handles.includes(preferred)) return preferred;
  return handles[0] || null;
};

const pickInputHandle = (
  handles: ScriptHandleType[],
  preferred?: ScriptHandleType | null,
  existingHandleId?: string | null
) => {
  if (existingHandleId === "image" || existingHandleId === "text") {
    if (handles.includes(existingHandleId) && (!preferred || existingHandleId === preferred)) return existingHandleId;
  }
  if (preferred && handles.includes(preferred)) return preferred;
  return handles[0] || null;
};

const getScriptNodeHandles = (nodeId: string) => {
  if (isImageNodeId(nodeId)) return { inputs: [] as ScriptHandleType[], outputs: ["image"] as ScriptHandleType[] };
  return { inputs: ["image", "text"] as ScriptHandleType[], outputs: ["text"] as ScriptHandleType[] };
};

const getScriptNodeHitAtPoint = (clientX: number, clientY: number, excludedNodeId?: string | null) => {
  if (typeof document === "undefined") return null;
  const magneticPadding = 46;
  let closest: { nodeId: string; side: "left" | "right"; distance: number } | null = null;

  document.querySelectorAll<HTMLElement>(".react-flow__node").forEach((nodeElement) => {
    const nodeId = nodeElement.getAttribute("data-id");
    if (!nodeId || nodeId === excludedNodeId) return;
    const rect = nodeElement.getBoundingClientRect();

    const insideMagneticBounds =
      clientX >= rect.left - magneticPadding &&
      clientX <= rect.right + magneticPadding &&
      clientY >= rect.top - magneticPadding &&
      clientY <= rect.bottom + magneticPadding;

    if (!insideMagneticBounds) return;

    const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
    const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
    const distance = Math.hypot(dx, dy);

    if (!closest || distance < closest.distance) {
      closest = {
      nodeId,
      side: clientX < rect.left + rect.width / 2 ? "left" : "right",
        distance,
      };
    }
  });

  return closest ? { nodeId: closest.nodeId, side: closest.side } : null;
};

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

export const useScriptCanvasSurface = ({
  projectData,
  setProjectData,
  onOpenEpisode,
  canvasControls,
  screenToFlowPosition,
}: Props): CanvasSurfaceConfig => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePositionRef = useRef<{ x: number; y: number } | null>(null);
  const pendingImageConnectionRef = useRef<ScriptConnectionDropState | null>(null);
  const {
    isLocked,
    snapToGrid,
    onAlignmentGuideChange,
  } = canvasControls;
  const [connectionDrop, setConnectionDrop] = useState<ScriptConnectionDropState | null>(null);
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

  const buildLinkForCreatedNode = useCallback(
    (
      currentLinks: ScriptCanvasState["links"],
      createdNodeId: string,
      dropState: ScriptConnectionDropState | null
    ) => {
      if (!dropState?.sourceNodeId) return currentLinks;

      const existingNodeHandles = getScriptNodeHandles(dropState.sourceNodeId);
      const createdNodeHandles = getScriptNodeHandles(createdNodeId);
      const existingTypedHandle =
        dropState.sourceHandleId === "image" || dropState.sourceHandleId === "text" ? dropState.sourceHandleId : null;
      const preferredHandleType = dropState.handleType || existingTypedHandle;
      let source: string | null = null;
      let target: string | null = null;
      let sourceHandle: ScriptHandleType | null = null;
      let targetHandle: ScriptHandleType | null = null;

      if (dropState.connectionType === "source") {
        source = dropState.sourceNodeId;
        target = createdNodeId;
        sourceHandle = existingTypedHandle || pickOutputHandle(existingNodeHandles.outputs, preferredHandleType);
        targetHandle = pickInputHandle(createdNodeHandles.inputs, preferredHandleType || sourceHandle);
      } else {
        source = createdNodeId;
        target = dropState.sourceNodeId;
        sourceHandle = pickOutputHandle(createdNodeHandles.outputs, preferredHandleType);
        targetHandle =
          existingTypedHandle ||
          pickInputHandle(existingNodeHandles.inputs, preferredHandleType || sourceHandle, dropState.sourceHandleId);
      }

      if (!source || !target || !sourceHandle || !targetHandle) return currentLinks;

      const id = `link-${source}-${target}`;
      return [
        ...currentLinks.filter((link) => link.id !== id),
        {
          id,
          source,
          target,
          sourceHandle,
          targetHandle,
        },
      ];
    },
    []
  );

  const handleAddScriptPage = useCallback((position?: { x: number; y: number }, dropState: ScriptConnectionDropState | null = null) => {
    let createdNodeId: string | null = null;
    setProjectData((previous) => {
      const nextId = previous.episodes.length
        ? Math.max(...previous.episodes.map((episode) => episode.id)) + 1
        : 1;
      const nextEpisode = createEmptyEpisode(nextId);
      const nextCanvas = ensureCanvas(previous.scriptCanvas);
      createdNodeId = scriptNodeId(nextId);
      return {
        ...previous,
        episodes: [...previous.episodes, nextEpisode],
        scriptCanvas: {
          ...nextCanvas,
          pages: [
            ...nextCanvas.pages,
            {
              episodeId: nextId,
              position: position || getDefaultScriptPosition(previous.episodes.length),
            },
          ],
          links: buildLinkForCreatedNode(nextCanvas.links, createdNodeId, dropState),
        },
      };
    });
    return createdNodeId;
  }, [buildLinkForCreatedNode, setProjectData]);

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
          const createdNodeId = imageNodeId(id);
          const position = pendingImagePositionRef.current || getDefaultImagePosition(nextCanvas.images.length);
          const dropState = pendingImageConnectionRef.current;
          pendingImagePositionRef.current = null;
          pendingImageConnectionRef.current = null;
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
                  position,
                  createdAt: Date.now(),
                },
              ],
              links: buildLinkForCreatedNode(nextCanvas.links, createdNodeId, dropState),
            },
          };
        });
      };
      reader.readAsDataURL(file);
      event.target.value = "";
    },
    [buildLinkForCreatedNode, setProjectData]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<ScriptCanvasNode>[]) => {
      const aligned = alignPositionChangesToNodeEdges(changes, nodes, snapToGrid && !isLocked);
      onAlignmentGuideChange(aligned.guide);
      const effectiveChanges = aligned.changes;
      const hasPositionChange = effectiveChanges.some((change) => change.type === "position" && change.position);
      const removedEpisodeIds = changes
        .filter((change): change is Extract<NodeChange<ScriptCanvasNode>, { type: "remove" }> => change.type === "remove")
        .filter((change) => change.id.startsWith("script-"))
        .map((change) => Number(change.id.replace(/^script-/, "")))
        .filter((id) => Number.isFinite(id));
      const removedImageIds = changes
        .filter((change): change is Extract<NodeChange<ScriptCanvasNode>, { type: "remove" }> => change.type === "remove")
        .filter((change) => change.id.startsWith("image-"))
        .map((change) => change.id.replace(/^image-/, ""));

      if (!hasPositionChange && removedImageIds.length === 0 && removedEpisodeIds.length === 0) return;

      const nextNodes = applyNodeChanges(effectiveChanges, nodes);
      const positionById = new Map(nextNodes.map((node) => [node.id, node.position]));

      persistCanvas((currentCanvas, previous) => {
        const removedImageSet = new Set(removedImageIds);
        const removedEpisodeSet = new Set(removedEpisodeIds);
        const nextEpisodes = previous.episodes.filter((episode) => !removedEpisodeSet.has(episode.id));
        const images = currentCanvas.images
          .filter((image) => !removedImageSet.has(image.id))
          .map((image) => ({
            ...image,
            position: positionById.get(imageNodeId(image.id)) || image.position,
          }));

        return {
          ...currentCanvas,
          pages: nextEpisodes.map((episode, index) => ({
            episodeId: episode.id,
            position:
              positionById.get(scriptNodeId(episode.id)) ||
              currentCanvas.pages.find((page) => page.episodeId === episode.id)?.position ||
              getDefaultScriptPosition(index),
          })),
          images,
          links: currentCanvas.links.filter((link) => {
            if (removedImageIds.some((id) => link.source === imageNodeId(id) || link.target === imageNodeId(id))) return false;
            return !removedEpisodeIds.some((id) => link.source === scriptNodeId(id) || link.target === scriptNodeId(id));
          }),
        };
      });

      if (removedEpisodeIds.length) {
        setProjectData((previous) => {
          const removedEpisodeSet = new Set(removedEpisodeIds);
          return {
            ...previous,
            episodes: previous.episodes.filter((episode) => !removedEpisodeSet.has(episode.id)),
          };
        });
      }
    },
    [isLocked, nodes, onAlignmentGuideChange, persistCanvas, setProjectData, snapToGrid]
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

  const commitScriptConnection = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return false;
      if (!isTextNodeId(connection.target)) return false;
      if (!isImageNodeId(connection.source) && !isTextNodeId(connection.source)) return false;

      const sourceHandle =
        connection.sourceHandle === "image" || connection.sourceHandle === "text"
          ? connection.sourceHandle
          : isImageNodeId(connection.source)
            ? "image"
            : "text";
      const targetHandle =
        connection.targetHandle === "image" || connection.targetHandle === "text"
          ? connection.targetHandle
          : isImageNodeId(connection.source)
            ? "image"
            : "text";
      const id = `link-${connection.source}-${connection.target}-${sourceHandle}-${targetHandle}`;
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
      return true;
    },
    [edges, persistCanvas]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      commitScriptConnection(connection);
    },
    [commitScriptConnection]
  );

  const updateSnapGuide = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (!snapToGrid || isLocked) {
        onAlignmentGuideChange(null);
        return;
      }
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) {
        onAlignmentGuideChange(null);
        return;
      }
      onAlignmentGuideChange(getEdgeAlignedPosition(node, nodes, position).guide);
    },
    [isLocked, nodes, onAlignmentGuideChange, snapToGrid]
  );

  useEffect(() => {
    if (!snapToGrid) onAlignmentGuideChange(null);
  }, [onAlignmentGuideChange, snapToGrid]);

  const handleConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      if (connectionState.isValid || !connectionState.fromNode) return;
      const e = event as MouseEvent | TouchEvent;
      const clientX = "clientX" in e ? e.clientX : e.touches?.[0]?.clientX;
      const clientY = "clientY" in e ? e.clientY : e.touches?.[0]?.clientY;
      if (typeof clientX !== "number" || typeof clientY !== "number") return;

      const fromHandleId = connectionState.fromHandle?.id || null;
      const fromHandleType = fromHandleId === "image" || fromHandleId === "text" ? fromHandleId : null;
      const isFromSource = connectionState.fromHandle?.type === "source";
      const hitNode = getScriptNodeHitAtPoint(clientX, clientY, connectionState.fromNode.id);
      if (hitNode) {
        const fromNodeId = connectionState.fromNode.id;
        const preferred = fromHandleType || (isImageNodeId(fromNodeId) ? "image" : "text");

        const buildConnection = (sourceNodeId: string, targetNodeId: string): Connection | null => {
          if (sourceNodeId === targetNodeId) return null;
          const sourceHandles = getScriptNodeHandles(sourceNodeId);
          const targetHandles = getScriptNodeHandles(targetNodeId);
          const sourceHandle =
            sourceNodeId === fromNodeId && isFromSource && (fromHandleId === "image" || fromHandleId === "text")
              ? fromHandleId
              : pickOutputHandle(sourceHandles.outputs, preferred);
          const targetHandle =
            targetNodeId === fromNodeId && !isFromSource
              ? pickInputHandle(targetHandles.inputs, preferred, fromHandleId)
              : pickInputHandle(targetHandles.inputs, preferred);

          if (!sourceHandle || !targetHandle) return null;
          return {
            source: sourceNodeId,
            sourceHandle,
            target: targetNodeId,
            targetHandle,
          };
        };

        const sidePreferredConnections =
          hitNode.side === "right"
            ? [buildConnection(hitNode.nodeId, fromNodeId), buildConnection(fromNodeId, hitNode.nodeId)]
            : [buildConnection(fromNodeId, hitNode.nodeId), buildConnection(hitNode.nodeId, fromNodeId)];

        for (const connection of sidePreferredConnections) {
          if (connection && commitScriptConnection(connection)) return;
        }
        return;
      }
      setConnectionDrop({
        position: { x: clientX, y: clientY },
        flowPosition: screenToFlowPosition({ x: clientX, y: clientY }),
        handleType: fromHandleType,
        connectionType: isFromSource ? "source" : "target",
        sourceNodeId: connectionState.fromNode.id,
        sourceHandleId: fromHandleId,
      });
    },
    [commitScriptConnection, screenToFlowPosition]
  );

  const handleDropCreate = useCallback(
    (type: ScriptCanvasCreateType) => {
      if (!connectionDrop) return;
      if (type === "scriptPage") {
        handleAddScriptPage(connectionDrop.flowPosition, connectionDrop);
        setConnectionDrop(null);
        return;
      }

      pendingImagePositionRef.current = connectionDrop.flowPosition;
      pendingImageConnectionRef.current = connectionDrop;
      setConnectionDrop(null);
      fileInputRef.current?.click();
    },
    [connectionDrop, handleAddScriptPage]
  );

  const overlays = (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageInput} />

      {connectionDrop ? (
        <ConnectionDropMenu
          position={connectionDrop.position}
          options={scriptCreateOptions}
          subtitle="Create script canvas node"
          onCreate={handleDropCreate}
          onClose={() => setConnectionDrop(null)}
        />
      ) : null}

      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            onClick={() => handleAddScriptPage()}
            className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-panel)] px-4 text-[13px] font-semibold text-[var(--app-text-primary)] shadow-[var(--app-shadow)] transition hover:border-[var(--app-border-strong)]"
          >
            <Plus size={16} />
            Script
          </button>
        </div>
      ) : null}
    </>
  );

  return {
    key: "script",
    nodes,
    edges,
    nodeTypes,
    onNodesChange: handleNodesChange as CanvasSurfaceConfig["onNodesChange"],
    onEdgesChange: handleEdgesChange as CanvasSurfaceConfig["onEdgesChange"],
    onConnect: handleConnect,
    onConnectEnd: handleConnectEnd,
    onNodeClick: (_, node) => {
      if (node.type === "text") onOpenEpisode((node.data as ScriptPageData).episodeId);
    },
    onNodeDragStart: (_, node) => updateSnapGuide(node.id, node.position),
    onNodeDrag: (_, node) => updateSnapGuide(node.id, node.position),
    onNodeDragStop: () => onAlignmentGuideChange(null),
    nodesDraggable: !isLocked,
    nodesConnectable: !isLocked,
    elementsSelectable: !isLocked,
    overlays,
  };
};
