import React from "react";
import {
  BookOpen,
  ChevronRight,
  Database,
  GitBranch,
  Layers3,
  Link2,
  Network,
} from "lucide-react";
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
  composerSlot?: React.ReactNode;
};

const sectionMeta: Record<
  KnowledgeCanvasSection,
  {
    label: string;
    title: string;
  }
> = {
  overview: {
    label: "Backbone",
    title: "Script Backbone",
  },
  nodes: {
    label: "Focus",
    title: "Local Focus",
  },
  links: {
    label: "Revisions",
    title: "Revision Chains",
  },
  maps: {
    label: "Anchor",
    title: "Anchor Map",
  },
};

const lensButtonClass = (active: boolean) =>
  `inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[11px] font-semibold transition active:translate-y-px ${
    active
      ? "bg-[var(--app-panel-strong)] text-[var(--app-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      : "text-[var(--app-text-secondary)] hover:bg-[var(--app-panel-soft)] hover:text-[var(--app-text-primary)]"
  }`;

const quietPanelClass =
  "rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-muted)]/72";

const SectionIcon: React.FC<{ section: KnowledgeCanvasSection; size?: number }> = ({ section, size = 14 }) => {
  if (section === "nodes") return <Database size={size} strokeWidth={2.1} />;
  if (section === "links") return <GitBranch size={size} strokeWidth={2.1} />;
  if (section === "maps") return <Network size={size} strokeWidth={2.1} />;
  return <Layers3 size={size} strokeWidth={2.1} />;
};

export const KnowledgeCanvasSurface: React.FC<Props> = ({
  section,
  onSectionChange,
  focusRequest,
  composerSlot,
}) => {
  const revision = useKnowledgeStore((state) => state.revision);
  const nodes = useKnowledgeStore((state) => state.nodes);
  const links = useKnowledgeStore((state) => state.links);
  const readNodeDetail = useKnowledgeStore((state) => state.readNodeDetail);
  const [focusNodeRef, setFocusNodeRef] = React.useState<string>("");
  const [focusAnchorRef, setFocusAnchorRef] = React.useState<string>("");
  const [inspectorOpen, setInspectorOpen] = React.useState(false);

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
    if (section === "maps") {
      return {
        title: anchorMap.anchor
          ? `Anchor Map / ${anchorMap.anchor.type}:${anchorMap.anchor.ref}`
          : "Anchor Map / No Anchor",
        nodes: anchorMap.nodes,
        links: anchorMap.links,
      };
    }
    if (section === "nodes") {
      return {
        title: `Local Focus / ${localMap.centerNode?.package.title || "No Focus"}`,
        nodes: localMap.nodes,
        links: localMap.links,
      };
    }
    if (section === "links") {
      return revisionProjection.nodes.length
        ? revisionProjection
        : {
            title: "Revision Chains / None Yet",
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
  const activeMeta = sectionMeta[section];

  const handleSelectNodeRef = React.useCallback((nodeRef: string) => {
    setFocusNodeRef(nodeRef);
    setInspectorOpen(true);
  }, []);

  return (
    <div className="absolute inset-0 z-[2] overflow-hidden">
      <KnowledgeFlowProjection
        title={projection.title}
        nodes={projection.nodes}
        links={projection.links}
        selectedNodeRef={effectiveFocusNodeRef}
        onSelectNodeRef={handleSelectNodeRef}
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

      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <div className="flex w-[min(760px,calc(100vw-32px))] flex-col items-center gap-2">
          <div className="qalam-surface pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-full p-1.5">
            {(Object.keys(sectionMeta) as KnowledgeCanvasSection[]).map((item) => (
              <button
                key={item}
                type="button"
                className={lensButtonClass(section === item)}
                onClick={() => onSectionChange(item)}
                title={sectionMeta[item].title}
              >
                <SectionIcon section={item} />
                <span>{sectionMeta[item].label}</span>
              </button>
            ))}
            <span className="mx-1 hidden h-5 w-px rounded-full bg-[var(--app-border)] sm:block" />
            <div className="hidden items-center gap-2 px-2 text-[11px] text-[var(--app-text-secondary)] md:flex">
              <span>{projection.nodes.length} nodes</span>
              <span className="h-1 w-1 rounded-full bg-[var(--app-border-strong)]" />
              <span>{projection.links.length} links</span>
            </div>
            {section === "maps" ? (
              <select
                value={effectiveAnchor ? `${effectiveAnchor.type}:${effectiveAnchor.ref}` : ""}
                onChange={(event) => setFocusAnchorRef(event.target.value)}
                className="ml-1 h-9 max-w-[220px] rounded-full border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-[11px] text-[var(--app-text-primary)] outline-none transition focus:border-[var(--app-border-strong)]"
                title="Anchor"
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
            ) : null}
          </div>
          {composerSlot ? <div className="pointer-events-auto w-full">{composerSlot}</div> : null}
        </div>
      </div>

      <div className="pointer-events-none absolute right-4 top-1/2 z-40 -translate-y-1/2">
        <button
          type="button"
          onClick={() => setInspectorOpen((open) => !open)}
          className="qalam-surface pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full text-[var(--app-text-primary)] transition hover:border-[var(--app-border-strong)]"
          title={inspectorOpen ? "Collapse inspector" : "Open inspector"}
          aria-label={inspectorOpen ? "Collapse inspector" : "Open inspector"}
        >
          {inspectorOpen ? <ChevronRight size={17} /> : <BookOpen size={17} />}
        </button>
      </div>

      <aside
        className={`absolute right-4 top-20 bottom-20 z-40 w-[340px] min-w-0 overflow-hidden rounded-[26px] border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-text-primary)] shadow-[0_26px_70px_rgba(0,0,0,0.24)] backdrop-blur-xl transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          inspectorOpen
            ? "translate-x-0 opacity-100"
            : "pointer-events-none translate-x-[calc(100%+24px)] opacity-0"
        }`}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--app-border)] px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
                <BookOpen size={13} />
                Inspector
              </div>
              <div className="mt-1 truncate text-[15px] font-semibold text-[var(--app-text-primary)]">
                {selectedNodeDetail?.package.title || activeMeta.title}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInspectorOpen(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--app-text-secondary)] transition hover:bg-[var(--app-panel-soft)] hover:text-[var(--app-text-primary)]"
              title="Collapse inspector"
              aria-label="Collapse inspector"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            <section className={quietPanelClass}>
              <div className="grid grid-cols-3 divide-x divide-[var(--app-border)] text-center">
                <div className="px-3 py-3">
                  <div className="text-[17px] font-semibold text-[var(--app-text-primary)]">{nodes.length}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-muted)]">Nodes</div>
                </div>
                <div className="px-3 py-3">
                  <div className="text-[17px] font-semibold text-[var(--app-text-primary)]">{links.length}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-muted)]">Links</div>
                </div>
                <div className="px-3 py-3">
                  <div className="text-[17px] font-semibold text-[var(--app-text-primary)]">{revision}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-muted)]">Rev</div>
                </div>
              </div>
            </section>

            <section className={quietPanelClass}>
              <div className="border-b border-[var(--app-border)] px-3 py-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--app-text-primary)]">
                  <SectionIcon section={section} />
                  {activeMeta.title}
                </div>
              </div>
              <div className="space-y-2 px-3 py-3 text-[12px] leading-5 text-[var(--app-text-secondary)]">
                {section === "overview" ? (
                  <>
                    <div>{scriptRootCount} script roots</div>
                    <div>{episodeCount} episodes / {sceneCount} scenes</div>
                    <div>{canonicalNodeCount} source / {derivedNodeCount} derived</div>
                  </>
                ) : null}

                {section === "nodes" ? (
                  <>
                    <div className="font-medium text-[var(--app-text-primary)]">
                      {localMap.centerNode?.package.title || "No focus"}
                    </div>
                    <div>{localMap.nodes.length} nodes / {localMap.links.length} relations</div>
                  </>
                ) : null}

                {section === "links" ? (
                  <>
                    <div>{lifecycle.supersedeChains.length} revision chains</div>
                    <div>{revisionProjection.nodes.length} revised nodes</div>
                  </>
                ) : null}

                {section === "maps" ? (
                  <>
                    <div>
                      {anchorTimeline.anchor
                        ? `${anchorTimeline.nodes.length} nodes / ${anchorTimeline.supersedeChains.length} revision chains`
                        : "No anchor selected"}
                    </div>
                  </>
                ) : null}
              </div>
            </section>

            <section className={quietPanelClass}>
              <div className="border-b border-[var(--app-border)] px-3 py-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--app-text-primary)]">
                  <Link2 size={13} />
                  Selected Node
                </div>
              </div>
              {selectedNodeDetail ? (
                <div className="space-y-3 px-3 py-3 text-[12px] text-[var(--app-text-secondary)]">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-muted)]">Ref</div>
                    <div className="mt-1 break-all font-mono text-[11px] text-[var(--app-text-primary)]">
                      {selectedNodeDetail.ref}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-muted)]">Kind</div>
                      <div className="mt-1 text-[var(--app-text-primary)]">
                        {formatKnowledgeKindLabel(selectedNodeDetail.kind)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-muted)]">Origin</div>
                      <div className="mt-1 text-[var(--app-text-primary)]">
                        {formatKnowledgeOriginLabel(selectedNodeDetail.origin)}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-t border-[var(--app-border)] pt-3 text-center">
                    <div>
                      <div className="font-semibold text-[var(--app-text-primary)]">{selectedNodeDetail.anchors.length}</div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-muted)]">Anchors</div>
                    </div>
                    <div>
                      <div className="font-semibold text-[var(--app-text-primary)]">{selectedNodeDetail.incomingLinks.length}</div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-muted)]">In</div>
                    </div>
                    <div>
                      <div className="font-semibold text-[var(--app-text-primary)]">{selectedNodeDetail.outgoingLinks.length}</div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-muted)]">Out</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-3 py-3 text-[12px] text-[var(--app-text-secondary)]">
                  Select a node to inspect its metadata.
                </div>
              )}
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
};
