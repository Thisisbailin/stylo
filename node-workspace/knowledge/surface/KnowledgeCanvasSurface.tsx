import React from "react";
import { BookOpen, Database, GitBranch, Network } from "lucide-react";
import { useKnowledgeStore } from "../../store/knowledgeStore";
import { KnowledgeFlowProjection } from "./KnowledgeFlowProjection";
import {
  buildKnowledgeAnchorMapProjection,
  buildKnowledgeAnchorTimelineProjection,
  buildKnowledgeLifecycleProjection,
  buildKnowledgeLocalMapProjection,
  buildKnowledgeMap,
  buildKnowledgeScriptMapProjection,
} from "../maps";
import { formatKnowledgeKindLabel, formatKnowledgeOriginLabel } from "./labels";
import type { KnowledgeSurfaceFocusRequest } from "./focus";

export type KnowledgeCanvasSection = "overview" | "nodes" | "links" | "maps";

type Props = {
  section: KnowledgeCanvasSection;
  onSectionChange: (section: KnowledgeCanvasSection) => void;
  focusRequest?: KnowledgeSurfaceFocusRequest | null;
};

const tabClass = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
    active
      ? "bg-[var(--app-panel-strong)] text-[var(--app-text-primary)]"
      : "text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
  }`;

const statCardClass =
  "rounded-[22px] border border-[var(--app-border)] bg-[var(--app-panel)]/88 px-4 py-3 shadow-[var(--app-shadow)] backdrop-blur-xl";

const infoCardClass =
  "rounded-[20px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3";

export const KnowledgeCanvasSurface: React.FC<Props> = ({
  section,
  onSectionChange,
  focusRequest,
}) => {
  const revision = useKnowledgeStore((state) => state.revision);
  const nodes = useKnowledgeStore((state) => state.nodes);
  const links = useKnowledgeStore((state) => state.links);
  const readNodeDetail = useKnowledgeStore((state) => state.readNodeDetail);
  const [focusNodeRef, setFocusNodeRef] = React.useState<string>("");
  const [focusAnchorRef, setFocusAnchorRef] = React.useState<string>("");

  React.useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.section !== section) {
      onSectionChange(focusRequest.section);
    }
    if (typeof focusRequest.nodeRef === "string") {
      setFocusNodeRef(focusRequest.nodeRef);
    }
    if (typeof focusRequest.anchorRef === "string") {
      setFocusAnchorRef(focusRequest.anchorRef);
    }
  }, [focusRequest, onSectionChange, section]);

  const snapshot = React.useMemo(() => ({ revision, nodes, links }), [revision, nodes, links]);
  const map = React.useMemo(() => buildKnowledgeMap(snapshot), [snapshot]);
  const scriptMap = React.useMemo(() => buildKnowledgeScriptMapProjection(snapshot), [snapshot]);
  const lifecycle = React.useMemo(() => buildKnowledgeLifecycleProjection(snapshot), [snapshot]);

  const scriptRootCount = scriptMap.scripts.length;
  const episodeCount = scriptMap.scripts.reduce((count, script) => count + script.episodes.length, 0);
  const sceneCount = scriptMap.scripts.reduce(
    (count, script) => count + script.episodes.reduce((sceneTotal, episode) => sceneTotal + episode.scenes.length, 0),
    0
  );

  const effectiveFocusNodeRef = focusNodeRef || scriptMap.scripts[0]?.node.ref || nodes[0]?.ref || "";
  const selectedNodeDetail = React.useMemo(
    () => (effectiveFocusNodeRef ? readNodeDetail({ nodeRef: effectiveFocusNodeRef }) : null),
    [effectiveFocusNodeRef, readNodeDetail]
  );

  const availableAnchors = React.useMemo(() => {
    const seen = new Set<string>();
    return nodes
      .flatMap((node) => node.anchors)
      .filter((anchor) => {
        const key = `${anchor.type}:${anchor.ref}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [nodes]);

  const effectiveAnchor =
    availableAnchors.find((anchor) => `${anchor.type}:${anchor.ref}` === focusAnchorRef) ||
    availableAnchors[0] ||
    null;

  const anchorMap = React.useMemo(
    () => buildKnowledgeAnchorMapProjection(snapshot, { anchor: effectiveAnchor, depth: 1 }),
    [snapshot, effectiveAnchor]
  );
  const localMap = React.useMemo(
    () =>
      buildKnowledgeLocalMapProjection(snapshot, {
        nodeRef: effectiveFocusNodeRef,
        depth: 1,
      }),
    [snapshot, effectiveFocusNodeRef]
  );
  const anchorTimeline = React.useMemo(
    () => buildKnowledgeAnchorTimelineProjection(snapshot, effectiveAnchor),
    [snapshot, effectiveAnchor]
  );

  const revisionProjection = React.useMemo(() => {
    const nodeMap = new Map<string, typeof nodes[number]>();
    const linkMap = new Map<string, typeof links[number]>();
    lifecycle.supersedeChains.forEach((chain) => {
      chain.nodes.forEach((node) => nodeMap.set(node.id, node));
      chain.links.forEach((link) => linkMap.set(link.id, link));
    });
    return {
      title: "Revision Chains",
      nodes: Array.from(nodeMap.values()),
      links: Array.from(linkMap.values()),
    };
  }, [lifecycle.supersedeChains, links, nodes]);

  const projection = React.useMemo(() => {
    if (section === "maps" && anchorMap.anchor) {
      return {
        title: `Anchor Map · ${anchorMap.anchor.type}:${anchorMap.anchor.ref}`,
        nodes: anchorMap.nodes,
        links: anchorMap.links,
      };
    }
    if (section === "nodes") {
      return {
        title: `Local Focus · ${localMap.centerNode?.package.title || "No Focus"}`,
        nodes: localMap.nodes,
        links: localMap.links,
      };
    }
    if (section === "links") {
      return revisionProjection.nodes.length
        ? revisionProjection
        : {
            title: "Revision Chains · None Yet",
            nodes: map.nodes,
            links: map.links,
          };
    }
    const scriptNodes = scriptMap.scripts.flatMap((script) => [
      script.node,
      ...script.episodes.flatMap((episode) => [episode.node, ...episode.scenes.map((scene) => scene.node)]),
    ]);
    const scriptNodeIds = new Set(scriptNodes.map((node) => node.id));
    const scriptLinks = links.filter(
      (link) => scriptNodeIds.has(link.fromNodeId) && scriptNodeIds.has(link.toNodeId)
    );
    return {
      title: "Script Memory Map",
      nodes: scriptNodes,
      links: scriptLinks,
    };
  }, [anchorMap.anchor, anchorMap.links, anchorMap.nodes, links, localMap.centerNode, localMap.links, localMap.nodes, map.links, map.nodes, revisionProjection, scriptMap.scripts, section]);

  const canonicalNodeCount = nodes.filter((node) => node.origin === "canonical-source").length;
  const derivedNodeCount = nodes.filter((node) => node.origin === "agent-derived").length;

  return (
    <div className="absolute inset-0 z-[20] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_38%),linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.16))]" />
      <div className="absolute inset-0 px-5 pb-5 pt-4">
        <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_360px] gap-4">
          <div className="relative min-h-0 overflow-hidden rounded-[32px] border border-[var(--app-border)] bg-[var(--app-panel)]/28 shadow-[var(--app-shadow-strong)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4">
              <div className="pointer-events-auto max-w-[440px] rounded-[24px] border border-[var(--app-border)] bg-[var(--app-panel)]/92 px-4 py-3 shadow-[var(--app-shadow)] backdrop-blur-xl">
                <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--app-text-secondary)]">
                  Knowledge Surface
                </div>
                <div className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-[var(--app-text-primary)]">
                  Agent Long-Term Memory
                </div>
                <div className="mt-1 max-w-[34ch] text-[12px] leading-5 text-[var(--app-text-secondary)]">
                  这是独立的知识画布，不再挤在工作流画布的一角。默认情况下，整份剧本会作为一个 markdown 文本文档节点呈现。
                </div>
              </div>
              <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-[var(--app-border)] bg-[var(--app-panel)]/92 p-1 shadow-[var(--app-shadow)] backdrop-blur-xl">
                <button type="button" className={tabClass(section === "overview")} onClick={() => onSectionChange("overview")}>
                  Backbone
                </button>
                <button type="button" className={tabClass(section === "nodes")} onClick={() => onSectionChange("nodes")}>
                  Focus
                </button>
                <button type="button" className={tabClass(section === "links")} onClick={() => onSectionChange("links")}>
                  Revisions
                </button>
                <button type="button" className={tabClass(section === "maps")} onClick={() => onSectionChange("maps")}>
                  Anchor
                </button>
              </div>
            </div>

            <div className="absolute inset-0 pt-[88px]">
              <KnowledgeFlowProjection
                title={projection.title}
                nodes={projection.nodes}
                links={projection.links}
                selectedNodeRef={effectiveFocusNodeRef}
                onSelectNodeRef={setFocusNodeRef}
                variant="canvas"
                layoutMode={
                  section === "overview"
                    ? "backbone"
                    : section === "nodes"
                      ? "focus"
                      : section === "links"
                        ? "revisions"
                        : section === "maps"
                          ? "anchor"
                          : "full"
                }
              />
            </div>

            <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-wrap gap-3">
              <div className={`pointer-events-auto ${statCardClass}`}>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                  Memory Scale
                </div>
                <div className="mt-1 text-[13px] font-semibold text-[var(--app-text-primary)]">
                  revision {revision}
                </div>
                <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                  {nodes.length} nodes · {links.length} relations
                </div>
              </div>
              <div className={`pointer-events-auto ${statCardClass}`}>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                  Script Node
                </div>
                <div className="mt-1 text-[13px] font-semibold text-[var(--app-text-primary)]">
                  {scriptRootCount} script text node
                </div>
                <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                  {episodeCount + sceneCount > 0
                    ? "后续只有在明确要求分层拆解时，agent 才会继续拆成更细的知识节点。"
                    : "默认不自动拆成 episode / scene 层级。"}
                </div>
              </div>
              <div className={`pointer-events-auto ${statCardClass}`}>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                  Source Split
                </div>
                <div className="mt-1 text-[13px] font-semibold text-[var(--app-text-primary)]">
                  source {canonicalNodeCount} · derived {derivedNodeCount}
                </div>
                <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                  {lifecycle.supersedeChains.length} revision chains
                </div>
              </div>
            </div>
          </div>

          <aside className="min-h-0 overflow-auto rounded-[32px] border border-[var(--app-border)] bg-[var(--app-panel)]/92 p-4 shadow-[var(--app-shadow-strong)] backdrop-blur-xl">
            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--app-text-secondary)]">
                  Current Lens
                </div>
                <div className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-[var(--app-text-primary)]">
                  {section === "overview"
                    ? "Backbone"
                    : section === "nodes"
                      ? "Focus"
                      : section === "links"
                        ? "Revisions"
                        : "Anchor"}
                </div>
                <div className="mt-2 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                  {section === "overview"
                    ? "默认只看整份剧本这个主文本节点，以及后续派生出来的知识连接。"
                    : section === "nodes"
                      ? "放大当前焦点节点与它的一阶邻域。"
                      : section === "links"
                        ? "只看知识被替代、修订和演化的时间链。"
                        : "围绕指定 anchor 观察相关知识簇。"}
                </div>
              </div>

              {section === "maps" ? (
                <div className="space-y-3">
                  <div className={infoCardClass}>
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                      <Network size={14} />
                      Anchor
                    </div>
                    <select
                      value={effectiveAnchor ? `${effectiveAnchor.type}:${effectiveAnchor.ref}` : ""}
                      onChange={(event) => setFocusAnchorRef(event.target.value)}
                      className="w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-[12px] text-[var(--app-text-primary)]"
                    >
                      {availableAnchors.map((anchor) => (
                        <option key={`${anchor.type}:${anchor.ref}`} value={`${anchor.type}:${anchor.ref}`}>
                          {anchor.type}:{anchor.ref}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-[11px] text-[var(--app-text-secondary)]">
                      {anchorTimeline.anchor
                        ? `${anchorTimeline.nodes.length} nodes · ${anchorTimeline.supersedeChains.length} revision chains`
                        : "No anchor selected."}
                    </div>
                  </div>
                </div>
              ) : null}

              {section === "nodes" ? (
                <div className={infoCardClass}>
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                    <Database size={14} />
                    Local Focus
                  </div>
                  <div className="text-[12px] text-[var(--app-text-secondary)]">
                    {localMap.centerNode
                      ? `${localMap.centerNode.package.title} · ${localMap.nodes.length} nodes · ${localMap.links.length} relations`
                      : "尚未选中局部焦点节点"}
                  </div>
                </div>
              ) : null}

              {section === "links" ? (
                <div className={infoCardClass}>
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                    <GitBranch size={14} />
                    Revision Chains
                  </div>
                  <div className="text-[12px] text-[var(--app-text-secondary)]">
                    {lifecycle.supersedeChains.length
                      ? `${revisionProjection.nodes.length} nodes · ${revisionProjection.links.length} supersede relations`
                      : "当前还没有形成知识修正链"}
                  </div>
                </div>
              ) : null}

              <div className={infoCardClass}>
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                  <BookOpen size={14} />
                  Selected Node
                </div>
                {selectedNodeDetail ? (
                  <div className="space-y-2 text-[12px] text-[var(--app-text-secondary)]">
                    <div className="text-[15px] font-semibold text-[var(--app-text-primary)]">
                      {selectedNodeDetail.package.title}
                    </div>
                    <div>{selectedNodeDetail.ref}</div>
                    <div>
                      {formatKnowledgeKindLabel(selectedNodeDetail.kind)} · {formatKnowledgeOriginLabel(selectedNodeDetail.origin)} · {selectedNodeDetail.package.status}
                    </div>
                    <div>
                      anchors {selectedNodeDetail.anchors.length} · incoming {selectedNodeDetail.incomingLinks.length} · outgoing {selectedNodeDetail.outgoingLinks.length}
                    </div>
                  </div>
                ) : (
                  <div className="text-[12px] text-[var(--app-text-secondary)]">
                    在画布中选择一个 markdown 文档节点查看详情。
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
