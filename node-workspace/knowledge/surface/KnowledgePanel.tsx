import React from "react";
import { BookOpen, Database, GitBranch, Network } from "lucide-react";
import { useKnowledgeStore } from "../../store/knowledgeStore";
import type { ProjectData } from "../../../types";
import { KnowledgeFlowProjection } from "./KnowledgeFlowProjection";
import { KnowledgeMutationLab } from "./KnowledgeMutationLab";
import {
  buildKnowledgeAnchorRegistryProjection,
  buildKnowledgeAnchorTimelineProjection,
  buildKnowledgeFocusMapProjection,
  buildKnowledgeKindMapProjection,
  buildKnowledgeLifecycleProjection,
  buildKnowledgeLocalMapProjection,
  buildKnowledgeMap,
  buildKnowledgeScriptMapProjection,
} from "../maps";

export type KnowledgeSectionKey = "overview" | "nodes" | "links" | "maps" | "lab";

type Props = {
  projectData: ProjectData;
  activeSection?: KnowledgeSectionKey;
  onActiveSectionChange?: (section: KnowledgeSectionKey) => void;
  showSidebar?: boolean;
};

type SectionItem = {
  key: KnowledgeSectionKey;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  subtitle: string;
};

const sectionCardClass = (isActive: boolean) =>
  `rounded-2xl border px-3 py-3 transition bg-[var(--app-panel-muted)] ${
    isActive
      ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)]"
      : "border-[var(--app-border)] hover:border-[var(--app-border-strong)]"
  }`;

export const KnowledgePanel: React.FC<Props> = ({
  projectData,
  activeSection = "overview",
  onActiveSectionChange,
  showSidebar = true,
}) => {
  const [focusNodeRef, setFocusNodeRef] = React.useState<string>("");
  const [focusAnchorRef, setFocusAnchorRef] = React.useState<string>("");
  const [focusKind, setFocusKind] = React.useState<string>("");
  const [flowProjectionMode, setFlowProjectionMode] = React.useState<
    "full" | "script" | "local" | "anchor" | "kind" | "focus"
  >("script");
  const revision = useKnowledgeStore((state) => state.revision);
  const nodes = useKnowledgeStore((state) => state.nodes);
  const links = useKnowledgeStore((state) => state.links);
  const canonicalNodeCount = nodes.filter((node) => node.origin === "canonical-source").length;
  const derivedNodeCount = nodes.filter((node) => node.origin === "agent-derived").length;
  const canonicalLinkCount = links.filter((link) => link.origin === "canonical-source").length;
  const derivedLinkCount = links.filter((link) => link.origin === "agent-derived").length;
  const readNodeDetail = useKnowledgeStore((state) => state.readNodeDetail);
  const map = React.useMemo(
    () =>
      buildKnowledgeMap({
        revision,
        nodes,
        links,
      }),
    [links, nodes, revision]
  );
  const scriptMap = buildKnowledgeScriptMapProjection({
    revision,
    nodes,
    links,
  });
  const lifecycle = buildKnowledgeLifecycleProjection({
    revision,
    nodes,
    links,
  });
  const anchorRegistry = buildKnowledgeAnchorRegistryProjection({
    revision,
    nodes,
    links,
  });
  const effectiveFocusNodeRef =
    focusNodeRef || scriptMap.scripts[0]?.node.ref || nodes[0]?.ref || "";
  const selectedNodeDetail = React.useMemo(
    () =>
      effectiveFocusNodeRef
        ? readNodeDetail({
            nodeRef: effectiveFocusNodeRef,
          })
        : null,
    [effectiveFocusNodeRef, readNodeDetail]
  );
  const localMap = buildKnowledgeLocalMapProjection(
    {
      revision,
      nodes,
      links,
    },
    {
      nodeRef: effectiveFocusNodeRef,
      depth: 1,
    }
  );
  const availableKinds = React.useMemo(
    () => Array.from(new Set(nodes.map((node) => node.kind))).sort(),
    [nodes]
  );
  const effectiveKind = focusKind || availableKinds[0] || "";
  const kindMap = buildKnowledgeKindMapProjection(
    {
      revision,
      nodes,
      links,
    },
    {
      nodeKinds: effectiveKind ? [effectiveKind] : [],
    }
  );
  const focusMap = buildKnowledgeFocusMapProjection(
    {
      revision,
      nodes,
      links,
    },
    {
      focusNodeRefs: effectiveFocusNodeRef ? [effectiveFocusNodeRef] : [],
    }
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
    () =>
      buildKnowledgeAnchorMapProjection(
        {
          revision,
          nodes,
          links,
        },
        {
          anchor: effectiveAnchor,
          depth: 1,
        }
      ),
    [effectiveAnchor, links, nodes, revision]
  );
  const anchorTimeline = buildKnowledgeAnchorTimelineProjection(
    {
      revision,
      nodes,
      links,
    },
    effectiveAnchor
  );
  const latestActiveDerivedNode =
    anchorTimeline.nodes.find(
      (node) => node.origin === "agent-derived" && node.package.status !== "superseded"
    ) || null;
  const seedCanonicalSource = useKnowledgeStore((state) => state.seedCanonicalSource);
  const sections: SectionItem[] = [
    {
      key: "overview",
      label: "Backbone",
      icon: BookOpen,
      subtitle: "Read-only backbone view of the agent long-term memory layer.",
    },
    {
      key: "nodes",
      label: "Focus",
      icon: Database,
      subtitle: `${nodes.length} memory nodes available for local focus`,
    },
    {
      key: "links",
      label: "Revisions",
      icon: GitBranch,
      subtitle: `${lifecycle.supersedeChains.length} revision chains currently visible`,
    },
    {
      key: "maps",
      label: "Anchor",
      icon: Network,
      subtitle: `${anchorRegistry.items.length} source anchors available for memory inspection`,
    },
    {
      key: "lab",
      label: "Mutation Lab",
      icon: Database,
      subtitle: "Dev-only derived node and supersede experiments",
    },
  ];

  const active = sections.find((section) => section.key === activeSection) || sections[0];
  const flowProjection = React.useMemo(() => {
    switch (flowProjectionMode) {
      case "full":
        return {
          title: "Full Knowledge Map",
          nodes: map.nodes,
          links: map.links,
        };
      case "local":
        return {
          title: `Local Lens · ${localMap.centerNode?.package.title || "No Focus"}`,
          nodes: localMap.nodes,
          links: localMap.links,
        };
      case "anchor":
        return {
          title: `Anchor Lens · ${anchorMap.anchor ? `${anchorMap.anchor.type}:${anchorMap.anchor.ref}` : "No Anchor"}`,
          nodes: anchorMap.nodes,
          links: anchorMap.links,
        };
      case "kind":
        return {
          title: `Kind Lens · ${effectiveKind || "No Kind"}`,
          nodes: kindMap.nodes,
          links: kindMap.links,
        };
      case "focus":
        return {
          title: `Focus Lens · ${effectiveFocusNodeRef || "No Focus"}`,
          nodes: focusMap.nodes,
          links: focusMap.links,
        };
      default: {
        const scriptNodes = scriptMap.scripts.flatMap((script) => [
          script.node,
          ...script.episodes.flatMap((episode) => [episode.node, ...episode.scenes.map((scene) => scene.node)]),
        ]);
        const scriptNodeIds = new Set(scriptNodes.map((node) => node.id));
        const scriptLinks = links.filter(
          (link) => scriptNodeIds.has(link.fromNodeId) && scriptNodeIds.has(link.toNodeId)
        );
        return {
          title: "Script Root Projection",
          nodes: scriptNodes,
          links: scriptLinks,
        };
      }
    }
  }, [anchorMap.anchor, anchorMap.links, anchorMap.nodes, effectiveFocusNodeRef, effectiveKind, focusMap.links, focusMap.nodes, flowProjectionMode, kindMap.links, kindMap.nodes, links, localMap.centerNode, localMap.links, localMap.nodes, map.links, map.nodes, scriptMap.scripts]);
  return (
    <div className="min-w-0 space-y-4 text-[var(--app-text-primary)]">
      <div className={`min-w-0 grid grid-cols-1 gap-4 ${showSidebar ? "lg:grid-cols-[260px_minmax(0,1fr)]" : ""}`}>
        {showSidebar ? (
          <div className="space-y-3">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <div key={section.key} className={sectionCardClass(active.key === section.key)}>
                  <button
                    type="button"
                    onClick={() => onActiveSectionChange?.(section.key)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-2 text-[12px] font-semibold">
                      <Icon size={14} />
                      {section.label}
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                      {section.subtitle}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="min-w-0 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-5">
          <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--app-text-secondary)]">
            Knowledge Surface
          </div>
          <div className="mt-2 text-lg font-semibold">Read-Only Long-Term Memory View</div>
          <div className="mt-3 max-w-3xl text-[13px] leading-6 text-[var(--app-text-secondary)]">
            Knowledge 的本体现在被定义为 Qalam Agent 的长期记忆数据层。这里不再承接旧的
            理解资产心智，而是作为正式的只读查阅面，用于观察 Agent 当前沉淀下来的
            knowledge node、knowledge link 和 knowledge map 状态。
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--app-text-secondary)]">
                Current Surface
              </div>
              <div className="mt-2 text-[15px] font-semibold">Observe Knowledge State</div>
              <div className="mt-2 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                当前围绕剧本正文三层 script、episode、scene 观察长期记忆层的 node、link、
                map 真相，让用户可以直接查看 Agent 当前记住了什么。
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--app-text-secondary)]">
                Surface Role
              </div>
              <div className="mt-2 text-[15px] font-semibold">Knowledge Surface</div>
              <div className="mt-2 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                这里是 `Nodes / Knowledge` 平面的正式只读查阅面，不承担用户手动编辑长期记忆的职责。
              </div>
            </div>
          </div>
          <div className="mt-5">
            <button
              type="button"
              onClick={() => seedCanonicalSource(projectData)}
              className="inline-flex items-center rounded-full border border-[var(--app-border-strong)] bg-[var(--app-panel)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-primary)] transition hover:bg-[var(--app-panel-strong)]"
            >
              Seed Script Sources
            </button>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">Revision</div>
              <div className="mt-2 text-[18px] font-semibold">{revision}</div>
            </div>
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">Nodes</div>
              <div className="mt-2 text-[18px] font-semibold">{nodes.length}</div>
            </div>
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">Links</div>
              <div className="mt-2 text-[18px] font-semibold">{links.length}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">Memory Sources</div>
              <div className="mt-2 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                canonical-source: {canonicalNodeCount} · agent-derived: {derivedNodeCount}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">Relation Sources</div>
              <div className="mt-2 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                canonical-source: {canonicalLinkCount} · agent-derived: {derivedLinkCount}
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
              Lifecycle
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--app-text-secondary)]">
              <span>draft: {lifecycle.nodeStatusCounts.draft}</span>
              <span>working: {lifecycle.nodeStatusCounts.working}</span>
              <span>accepted: {lifecycle.nodeStatusCounts.accepted}</span>
              <span>superseded: {lifecycle.nodeStatusCounts.superseded}</span>
              <span>rejected: {lifecycle.nodeStatusCounts.rejected}</span>
              <span>supersede chains: {lifecycle.supersedeChains.length}</span>
            </div>
          </div>

          {activeSection === "nodes" ? (
            <div className="mt-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--app-text-secondary)]">Memory Nodes</div>
              <div className="mt-3 space-y-3">
                {nodes.length ? (
                  nodes.map((node) => (
                    <div key={node.id} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[13px] font-semibold">{node.package.title}</div>
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                          <span>{node.kind}</span>
                          <span>·</span>
                          <span>{node.origin}</span>
                          <span>·</span>
                          <span>{node.package.status}</span>
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">{node.ref}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-[12px] leading-6 text-[var(--app-text-secondary)]">
                    No memory nodes retained yet.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeSection === "links" ? (
            <div className="mt-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--app-text-secondary)]">Memory Relations</div>
              <div className="mt-3 space-y-3">
                {links.length ? (
                  links.map((link) => (
                    <div key={link.id} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[13px] font-semibold">{link.type}</div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                          {link.origin}
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                        {link.fromNodeId} {"->"} {link.toNodeId}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-[12px] leading-6 text-[var(--app-text-secondary)]">
                    No memory relations retained yet.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeSection === "maps" ? (
            <div className="mt-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--app-text-secondary)]">Knowledge Maps</div>
              <div className="mt-3 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                当前视图包含 {map.nodes.length} 个 memory nodes 和 {map.links.length} 条
                memory relations。这是 Agent 长期记忆的地图视图，不是用户工作流画布。
              </div>
              <div className="mt-4 space-y-4">
                {scriptMap.scripts.length ? (
                  scriptMap.scripts.map((script) => (
                    <div
                      key={script.node.id}
                      className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4"
                    >
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                        Script Root
                      </div>
                      <div className="mt-1 text-[14px] font-semibold">{script.node.package.title}</div>
                      <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">{script.node.ref}</div>
                      <div className="mt-3 space-y-3">
                        {script.episodes.length ? (
                          script.episodes.map((episode) => (
                            <div
                              key={episode.node.id}
                              className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[13px] font-semibold">{episode.node.package.title}</div>
                                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                                  {episode.scenes.length} scenes
                                </div>
                              </div>
                              <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                                {episode.link?.type || "contains"} · {episode.node.ref}
                              </div>
                              {episode.scenes.length ? (
                                <div className="mt-3 space-y-2">
                                  {episode.scenes.map((scene) => (
                                    <div
                                      key={scene.node.id}
                                      className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2"
                                    >
                                      <div className="text-[12px] font-medium">{scene.node.package.title}</div>
                                      <div className="mt-1 text-[10px] text-[var(--app-text-secondary)]">
                                        {scene.link?.type || "contains"} · {scene.node.ref}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="mt-3 text-[11px] text-[var(--app-text-secondary)]">
                                  No scene nodes linked from this episode.
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-[var(--app-border)] px-3 py-3 text-[11px] text-[var(--app-text-secondary)]">
                            No episode nodes linked from this script root.
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--app-border)] px-3 py-3 text-[12px] text-[var(--app-text-secondary)]">
                    No script-rooted knowledge map detected yet.
                  </div>
                )}

                {(scriptMap.looseNodes.length || scriptMap.looseLinks.length) ? (
                  <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                      Unattached Structures
                    </div>
                    <div className="mt-2 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                      {scriptMap.looseNodes.length} loose nodes · {scriptMap.looseLinks.length} loose links
                    </div>
                  </div>
                ) : null}

                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                    Revision Chains
                  </div>
                  {lifecycle.supersedeChains.length ? (
                    <div className="mt-3 space-y-3">
                      {lifecycle.supersedeChains.map((chain) => (
                        <div
                          key={chain.headNode.id}
                          className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3"
                        >
                          <div className="text-[12px] font-semibold">{chain.headNode.package.title}</div>
                          <div className="mt-1 text-[10px] text-[var(--app-text-secondary)]">
                            {chain.nodes.length} nodes · {chain.links.length} supersedes links
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--app-text-secondary)]">
                            {chain.nodes.map((node, index) => (
                              <React.Fragment key={node.id}>
                                {index ? <span>{"->"}</span> : null}
                                <span className="rounded-full border border-[var(--app-border)] px-2 py-1">
                                  {node.package.title} ({node.package.status})
                                </span>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-[11px] text-[var(--app-text-secondary)]">
                      No revision chains yet.
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                      Map Lens
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-1">
                      {[
                        ["script", "Script"],
                        ["full", "Full"],
                        ["local", "Local"],
                        ["anchor", "Anchor"],
                        ["kind", "Kind"],
                        ["focus", "Focus"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setFlowProjectionMode(value as typeof flowProjectionMode)}
                          className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
                            flowProjectionMode === value
                              ? "bg-[var(--app-panel)] text-[var(--app-text-primary)]"
                              : "text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3">
                    <KnowledgeFlowProjection
                      title={flowProjection.title}
                      nodes={flowProjection.nodes}
                      links={flowProjection.links}
                      selectedNodeRef={effectiveFocusNodeRef}
                      onSelectNodeRef={(nodeRef) => {
                        setFocusNodeRef(nodeRef);
                        if (flowProjectionMode === "script" || flowProjectionMode === "full") {
                          setFlowProjectionMode("focus");
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                    Selected Memory Node
                  </div>
                  {selectedNodeDetail ? (
                    <div className="mt-3 space-y-2 text-[11px]">
                      <div className="text-[13px] font-semibold text-[var(--app-text-primary)]">
                        {selectedNodeDetail.package.title}
                      </div>
                      <div className="text-[var(--app-text-secondary)]">
                        {selectedNodeDetail.ref}
                      </div>
                      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-secondary)]">
                        <span>{selectedNodeDetail.kind}</span>
                        <span>·</span>
                        <span>{selectedNodeDetail.origin}</span>
                        <span>·</span>
                        <span>{selectedNodeDetail.package.status}</span>
                      </div>
                      <div className="text-[var(--app-text-secondary)]">
                        anchors: {selectedNodeDetail.anchors.length} · incoming: {selectedNodeDetail.incomingLinks.length} · outgoing: {selectedNodeDetail.outgoingLinks.length}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-[11px] text-[var(--app-text-secondary)]">
                      No memory node selected.
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                      Local Map
                    </div>
                    <select
                      value={effectiveFocusNodeRef}
                      onChange={(event) => setFocusNodeRef(event.target.value)}
                      className="min-w-[220px] rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-2 py-1 text-[11px] text-[var(--app-text-primary)]"
                    >
                      {nodes.map((node) => (
                        <option key={node.id} value={node.ref}>
                          {node.package.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  {localMap.centerNode ? (
                    <div className="mt-3">
                      <div className="text-[13px] font-semibold">{localMap.centerNode.package.title}</div>
                      <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                        depth {localMap.depth} · {localMap.nodes.length} nodes · {localMap.links.length} links
                      </div>
                      <div className="mt-3 space-y-2">
                        {localMap.links.length ? (
                          localMap.links.map((link) => {
                            const fromNode = localMap.nodes.find((node) => node.id === link.fromNodeId);
                            const toNode = localMap.nodes.find((node) => node.id === link.toNodeId);
                            return (
                              <div
                                key={link.id}
                                className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-2"
                              >
                                <div className="text-[11px] font-medium">
                                  {fromNode?.package.title || link.fromNodeId} {"->"} {toNode?.package.title || link.toNodeId}
                                </div>
                                <div className="mt-1 text-[10px] text-[var(--app-text-secondary)]">
                                  {link.type} · {link.origin}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-[11px] text-[var(--app-text-secondary)]">
                            No local links yet.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-[11px] text-[var(--app-text-secondary)]">
                      No focus node available.
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                      Kind Map
                    </div>
                    <select
                      value={effectiveKind}
                      onChange={(event) => setFocusKind(event.target.value)}
                      className="min-w-[220px] rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-2 py-1 text-[11px] text-[var(--app-text-primary)]"
                    >
                      {availableKinds.length ? (
                        availableKinds.map((kind) => (
                          <option key={kind} value={kind}>
                            {kind}
                          </option>
                        ))
                      ) : (
                        <option value="">No kinds</option>
                      )}
                    </select>
                  </div>
                  <div className="mt-3 text-[11px] text-[var(--app-text-secondary)]">
                    {kindMap.nodes.length} nodes · {kindMap.links.length} links
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                      Focus Map
                  </div>
                  <div className="mt-3 text-[11px] text-[var(--app-text-secondary)]">
                    {focusMap.nodes.length} nodes · {focusMap.links.length} links around current focus
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                      Anchor Map
                    </div>
                    <select
                      value={effectiveAnchor ? `${effectiveAnchor.type}:${effectiveAnchor.ref}` : ""}
                      onChange={(event) => setFocusAnchorRef(event.target.value)}
                      className="min-w-[220px] rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-2 py-1 text-[11px] text-[var(--app-text-primary)]"
                    >
                      {availableAnchors.length ? (
                        availableAnchors.map((anchor) => (
                          <option key={`${anchor.type}:${anchor.ref}`} value={`${anchor.type}:${anchor.ref}`}>
                            {anchor.type}:{anchor.ref}
                          </option>
                        ))
                      ) : (
                        <option value="">No anchors</option>
                      )}
                    </select>
                  </div>
                  {anchorMap.anchor ? (
                    <div className="mt-3">
                      <div className="text-[13px] font-semibold">
                        {anchorMap.anchor.type}:{anchorMap.anchor.ref}
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                        depth {anchorMap.depth} · {anchorMap.nodes.length} nodes · {anchorMap.links.length} links
                      </div>
                      <div className="mt-3 space-y-2">
                        {anchorMap.nodes.length ? (
                          anchorMap.nodes.map((node) => (
                            <div
                              key={node.id}
                              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-2"
                            >
                              <div className="text-[11px] font-medium">{node.package.title}</div>
                              <div className="mt-1 text-[10px] text-[var(--app-text-secondary)]">
                                {node.kind} · {node.origin}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-[11px] text-[var(--app-text-secondary)]">
                            No memory nodes attached to this anchor yet.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-[11px] text-[var(--app-text-secondary)]">
                      No anchor available.
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                      Anchor Registry
                  </div>
                  {anchorRegistry.length ? (
                    <div className="mt-3 space-y-2">
                      {anchorRegistry.map((item) => (
                        <div
                          key={`${item.anchor.type}:${item.anchor.ref}:${item.anchor.span || ""}`}
                          className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-2"
                        >
                          <div className="text-[11px] font-medium">
                            {item.anchor.type}:{item.anchor.ref}
                          </div>
                          <div className="mt-1 text-[10px] text-[var(--app-text-secondary)]">
                            {item.nodeCount} nodes · canonical {item.canonicalNodeCount} · derived {item.derivedNodeCount}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-[11px] text-[var(--app-text-secondary)]">
                      No anchors registered yet.
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                      Anchor Timeline
                  </div>
                  {anchorTimeline.anchor ? (
                    <div className="mt-3">
                      <div className="text-[13px] font-semibold">
                        {anchorTimeline.anchor.type}:{anchorTimeline.anchor.ref}
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                        {anchorTimeline.nodes.length} nodes · {anchorTimeline.supersedeChains.length} supersede chains
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                      </div>
                      <div className="mt-3 space-y-2">
                        {anchorTimeline.nodes.length ? (
                          anchorTimeline.nodes.map((node) => (
                            <div
                              key={node.id}
                              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-2"
                            >
                              <div className="text-[11px] font-medium">{node.package.title}</div>
                              <div className="mt-1 text-[10px] text-[var(--app-text-secondary)]">
                                {node.kind} · {node.origin} · {node.package.status}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-[11px] text-[var(--app-text-secondary)]">
                            No memory nodes attached to this anchor yet.
                          </div>
                        )}
                      </div>
                      {anchorTimeline.supersedeChains.length ? (
                        <div className="mt-4 space-y-2">
                          {anchorTimeline.supersedeChains.map((chain) => (
                            <div
                              key={chain.headNode.id}
                              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-3 py-2"
                            >
                              <div className="text-[11px] font-medium">{chain.headNode.package.title}</div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--app-text-secondary)]">
                                {chain.nodes.map((node, index) => (
                                  <React.Fragment key={node.id}>
                                    {index ? <span>{"->"}</span> : null}
                                    <span className="rounded-full border border-[var(--app-border)] px-2 py-1">
                                      {node.package.title} ({node.package.status})
                                    </span>
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-3 text-[11px] text-[var(--app-text-secondary)]">
                      No anchor selected.
                    </div>
                  )}
                </div>

              </div>
            </div>
          ) : null}

          {activeSection === "lab" ? (
            <div className="mt-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--app-text-secondary)]">
                Mutation Lab
              </div>
              <div className="mt-3 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                这里是单独的开发实验区，用于手工验证 anchor-first create / supersede
                行为。Knowledge Surface 的其它分区保持以只读观测为主。
              </div>
              <KnowledgeMutationLab
                anchor={anchorTimeline.anchor}
                latestActiveDerivedNode={latestActiveDerivedNode}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
