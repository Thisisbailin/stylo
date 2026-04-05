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
      ? "bg-[var(--app-panel)] text-[var(--app-text-primary)]"
      : "text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
  }`;

const infoCardClass =
  "rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3";

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
  const episodeCount = scriptMap.scripts.reduce(
    (count, script) => count + script.episodes.length,
    0
  );
  const sceneCount = scriptMap.scripts.reduce(
    (count, script) =>
      count + script.episodes.reduce((sceneTotal, episode) => sceneTotal + episode.scenes.length, 0),
    0
  );

  const effectiveFocusNodeRef =
    focusNodeRef || scriptMap.scripts[0]?.node.ref || nodes[0]?.ref || "";
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
  const recentDerivedNodes = React.useMemo(
    () =>
      nodes
        .filter((node) => node.origin === "agent-derived")
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3),
    [nodes]
  );

  return (
    <div className="absolute inset-0 z-[5]">
      <div className="absolute inset-0" />
      <div className="absolute inset-0 p-4">
        <div className="flex h-full flex-col gap-4">
          <div className="pointer-events-none flex items-start justify-between gap-4">
            <div className="pointer-events-auto rounded-[22px] border border-[var(--app-border)] bg-[var(--app-panel)]/92 px-4 py-3 shadow-[var(--app-shadow)] backdrop-blur-xl">
              <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--app-text-secondary)]">
                Knowledge Surface
              </div>
              <div className="mt-1 text-[16px] font-semibold text-[var(--app-text-primary)]">
                Agent Long-Term Memory
              </div>
              <div className="mt-1 max-w-[36ch] text-[12px] leading-5 text-[var(--app-text-secondary)]">
                在同一张 Nodes 画布的背面，只读观察 Agent 当前沉淀下来的长期记忆网络。
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

          <div className="min-h-0 flex-1">
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

          <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
            <div className="pointer-events-auto w-[min(420px,42vw)] rounded-[22px] border border-[var(--app-border)] bg-[var(--app-panel)]/92 p-4 shadow-[var(--app-shadow)] backdrop-blur-xl">
              {section === "overview" ? (
                <div className="space-y-3 text-[12px] text-[var(--app-text-secondary)]">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                    <BookOpen size={14} />
                    Backbone Surface
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div className={infoCardClass}>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-secondary)]">
                        Memory Scale
                      </div>
                      <div className="mt-1 text-[12px] text-[var(--app-text-primary)]">
                        revision {revision}
                      </div>
                      <div className="mt-1">
                        {nodes.length} nodes · {links.length} relations
                      </div>
                    </div>
                    <div className={infoCardClass}>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-secondary)]">
                        Script Backbone
                      </div>
                      <div className="mt-1 text-[12px] text-[var(--app-text-primary)]">
                        {scriptRootCount} script · {episodeCount} episodes
                      </div>
                      <div className="mt-1">{sceneCount} scenes in canonical chain</div>
                    </div>
                    <div className={infoCardClass}>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-secondary)]">
                        Memory Sources
                      </div>
                      <div className="mt-1 text-[12px] text-[var(--app-text-primary)]">
                        source {canonicalNodeCount} · derived {derivedNodeCount}
                      </div>
                      <div className="mt-1">
                        active {lifecycle.nodeStatusCounts.accepted + lifecycle.nodeStatusCounts.working}
                      </div>
                    </div>
                    <div className={infoCardClass}>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-secondary)]">
                        Recent Revisions
                      </div>
                      <div className="mt-1 text-[12px] text-[var(--app-text-primary)]">
                        {lifecycle.supersedeChains.length} supersede chains
                      </div>
                      <div className="mt-1">
                        draft {lifecycle.nodeStatusCounts.draft} · superseded {lifecycle.nodeStatusCounts.superseded}
                      </div>
                    </div>
                  </div>
                  {recentDerivedNodes.length ? (
                    <div className="space-y-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-secondary)]">
                        Recently Updated Memory
                      </div>
                      {recentDerivedNodes.map((node) => (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => setFocusNodeRef(node.ref)}
                          className="flex w-full items-start justify-between gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-[var(--app-panel)]"
                        >
                          <div>
                            <div className="text-[12px] font-medium text-[var(--app-text-primary)]">
                              {node.package.title}
                            </div>
                            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-secondary)]">
                              {formatKnowledgeKindLabel(node.kind)}
                            </div>
                          </div>
                          <div className="text-[10px] text-[var(--app-text-muted)]">
                            {node.package.status}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : selectedNodeDetail ? (
                <div className="space-y-2 text-[12px] text-[var(--app-text-secondary)]">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                    <Database size={14} />
                    {section === "nodes" ? "Local Focus" : section === "links" ? "Revision Focus" : "Current Focus"}
                  </div>
                  <div className="text-[14px] font-semibold text-[var(--app-text-primary)]">
                    {selectedNodeDetail.package.title}
                  </div>
                  <div>{selectedNodeDetail.ref}</div>
                  <div>
                    {formatKnowledgeKindLabel(selectedNodeDetail.kind)} · {formatKnowledgeOriginLabel(selectedNodeDetail.origin)} · {selectedNodeDetail.package.status}
                  </div>
                  <div>
                    anchors {selectedNodeDetail.anchors.length} · incoming {selectedNodeDetail.incomingLinks.length} · outgoing {selectedNodeDetail.outgoingLinks.length}
                  </div>
                  <div className="line-clamp-3 text-[11px] leading-5 text-[var(--app-text-secondary)]">
                    {section === "nodes"
                      ? "当前背面画布会围绕这个记忆节点展开局部观察。你在这里看到的是 Agent 长期记忆中的一个焦点，而不是用户工作流节点。"
                      : section === "links"
                        ? "当前修正视图会把这个节点放回它所属的知识演化链中，帮助观察长期记忆是如何被持续修正的。"
                        : "这里显示的是当前被选中的知识节点，用来帮助你理解 Agent 背面长期记忆中的具体焦点。"}
                  </div>
                </div>
              ) : (
                <div className="text-[12px] text-[var(--app-text-secondary)]">
                  在画布中选择一个 memory node 查看详情。
                </div>
              )}
            </div>

            <div className="pointer-events-auto w-[min(360px,34vw)] rounded-[22px] border border-[var(--app-border)] bg-[var(--app-panel)]/92 p-4 shadow-[var(--app-shadow)] backdrop-blur-xl">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                <Network size={14} />
                Current Lens
              </div>
              {section === "maps" ? (
                <div className="mt-3 space-y-3 text-[12px] text-[var(--app-text-secondary)]">
                  <select
                    value={effectiveAnchor ? `${effectiveAnchor.type}:${effectiveAnchor.ref}` : ""}
                    onChange={(event) => setFocusAnchorRef(event.target.value)}
                    className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-2 py-2 text-[12px] text-[var(--app-text-primary)]"
                  >
                    {availableAnchors.map((anchor) => (
                      <option key={`${anchor.type}:${anchor.ref}`} value={`${anchor.type}:${anchor.ref}`}>
                        {anchor.type}:{anchor.ref}
                      </option>
                    ))}
                  </select>
                  {anchorTimeline.anchor ? (
                    <div className="space-y-2">
                      <div>
                        {anchorTimeline.anchor.type}:{anchorTimeline.anchor.ref}
                      </div>
                      <div>
                        {anchorTimeline.nodes.length} nodes · {anchorTimeline.supersedeChains.length} revision chains
                      </div>
                    </div>
                  ) : (
                    <div>No anchor selected.</div>
                  )}
                </div>
              ) : section === "nodes" ? (
                <div className="mt-3 space-y-3 text-[12px] text-[var(--app-text-secondary)]">
                  <div className={infoCardClass}>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-secondary)]">
                      Local Focus
                    </div>
                    <div className="mt-1">
                      {localMap.centerNode
                        ? `${localMap.centerNode.package.title} · ${localMap.nodes.length} nodes · ${localMap.links.length} relations`
                        : "尚未选中局部焦点节点"}
                    </div>
                  </div>
                  <div className={infoCardClass}>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-secondary)]">
                      Reading Mode
                    </div>
                    <div className="mt-1">
                      这个视角只放大当前记忆焦点及其一阶邻域，适合观察单个知识点附近的长期记忆结构。
                    </div>
                  </div>
                </div>
              ) : section === "links" ? (
                <div className="mt-3 space-y-3 text-[12px] text-[var(--app-text-secondary)]">
                  <div className={infoCardClass}>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-secondary)]">
                      Revision Chains
                    </div>
                    <div className="mt-1">
                      {lifecycle.supersedeChains.length
                        ? `${revisionProjection.nodes.length} nodes · ${revisionProjection.links.length} supersede relations`
                        : "当前还没有形成知识修正链"}
                    </div>
                  </div>
                  <div className={infoCardClass}>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-secondary)]">
                      Reading Mode
                    </div>
                    <div className="mt-1">
                      这个视角只观察知识被修正、替代和演化的路径，不强调整张网，而强调时间性的变化。
                    </div>
                  </div>
                </div>
              ) : section === "overview" ? (
                <div className="mt-3 space-y-3 text-[12px] text-[var(--app-text-secondary)]">
                  <div className={infoCardClass}>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-secondary)]">
                      Main Chain
                    </div>
                    <div className="mt-1">
                      script → episode → scene 是当前长期记忆的 canonical backbone。
                    </div>
                  </div>
                  <div className={infoCardClass}>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-secondary)]">
                      Current Focus
                    </div>
                    <div className="mt-1">
                      {selectedNodeDetail
                        ? `${selectedNodeDetail.package.title} · ${selectedNodeDetail.kind}`
                        : "尚未选择具体记忆节点"}
                    </div>
                  </div>
                  <div className={infoCardClass}>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--app-text-secondary)]">
                      Revision Activity
                    </div>
                    <div className="mt-1">
                      当前共有 {lifecycle.supersedeChains.length} 条知识修正链。
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-[12px] text-[var(--app-text-secondary)]">
                  当前视图以同一张无限画布观察 Agent 长期记忆网络。切换 Backbone、Focus、Anchor、Revisions 只是改变你查看这张记忆地图的方式，不会离开这块画布。
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
