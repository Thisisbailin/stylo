import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, Compass, Layers3, Network, Sparkles } from "lucide-react";
import type { ProjectData } from "../../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import {
  buildGraphNodesFromWorkflow,
  buildProjectedSourceNodes,
  buildProjectGraphMaps,
  type ProjectGraphMapRecord,
  type ProjectGraphNodeRecord,
} from "../nodeflow/projectGraph";

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  initialSection?: UnderstandingSectionKey;
  activeSection?: UnderstandingSectionKey;
  onActiveSectionChange?: (section: UnderstandingSectionKey) => void;
  showSidebar?: boolean;
};

export type UnderstandingSectionKey = "source" | "semantic" | "design" | "maps";

type SectionItem = {
  key: UnderstandingSectionKey;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: string;
  subtitle: string;
};

const previewText = (value: unknown, limit = 220) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  return text.length <= limit ? text : `${text.slice(0, limit)}...`;
};

const countByType = (nodes: ProjectGraphNodeRecord[]) => {
  const buckets = new Map<string, number>();
  nodes.forEach((node) => {
    buckets.set(node.type, (buckets.get(node.type) || 0) + 1);
  });
  return Array.from(buckets.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-Hans-CN"));
};

const sectionCardClass = (isActive: boolean) =>
  `rounded-2xl border px-3 py-3 transition bg-[var(--app-panel-muted)] ${
    isActive
      ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)]"
      : "border-[var(--app-border)] hover:border-[var(--app-border-strong)]"
  }`;

const AssetCard: React.FC<{
  node: ProjectGraphNodeRecord;
  accent: string;
  eyebrow: string;
}> = ({ node, accent, eyebrow }) => {
  const bodyText =
    previewText((node.body as Record<string, unknown>)?.content) ||
    previewText((node.body as Record<string, unknown>)?.summary) ||
    previewText(JSON.stringify(node.body));
  const tags = Array.isArray((node.body as Record<string, unknown>)?.tags)
    ? ((node.body as Record<string, unknown>).tags as unknown[]).filter((item): item is string => typeof item === "string")
    : [];
  const sourceRefs = Array.isArray((node.body as Record<string, unknown>)?.sourceRefs)
    ? ((node.body as Record<string, unknown>).sourceRefs as unknown[]).filter((item): item is string => typeof item === "string")
    : node.sourceRef
      ? [node.sourceRef]
      : [];

  return (
    <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className={`text-[10px] font-black uppercase tracking-[0.24em] ${accent}`}>{eyebrow}</div>
        <div className="rounded-full border border-[var(--app-border)] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
          {node.type}
        </div>
      </div>
      <div className="mt-3 text-[16px] font-semibold tracking-[-0.02em]">{node.title}</div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
        {node.ref}
      </div>
      <div className="mt-3 text-[12px] leading-6 text-[var(--app-text-secondary)] whitespace-pre-wrap">
        {bodyText || "Empty asset."}
      </div>
      {sourceRefs.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {sourceRefs.slice(0, 4).map((ref) => (
            <span
              key={ref}
              className="rounded-full border border-[var(--app-border)] bg-[var(--app-panel)] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]"
            >
              {ref}
            </span>
          ))}
        </div>
      ) : null}
      {tags.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[var(--app-border)] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const MapCard: React.FC<{
  map: ProjectGraphMapRecord;
  onOpen: (map: ProjectGraphMapRecord) => void;
}> = ({ map, onOpen }) => (
  <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--app-text-secondary)]">
          {map.view ? "THEMATIC MAP" : "WORKSPACE MAP"}
        </div>
        <div className="mt-2 text-[16px] font-semibold tracking-[-0.02em]">{map.name}</div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
          {map.mapId}
        </div>
      </div>
      {map.isActive ? (
        <div className="rounded-full border border-emerald-400/50 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
          Active
        </div>
      ) : null}
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">Nodes</div>
        <div className="mt-1 text-[18px] font-semibold">{map.nodeCount}</div>
      </div>
      <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">Links</div>
        <div className="mt-1 text-[18px] font-semibold">{map.linkCount}</div>
      </div>
    </div>
    <button
      type="button"
      onClick={() => onOpen(map)}
      className="mt-4 inline-flex items-center rounded-full border border-[var(--app-border-strong)] bg-[var(--app-panel)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-primary)] transition hover:bg-[var(--app-panel-strong)]"
    >
      {map.view ? "Open View" : "Open Workspace"}
    </button>
  </div>
);

export const UnderstandingPanel: React.FC<Props> = ({
  projectData,
  initialSection = "source",
  activeSection,
  onActiveSectionChange,
  showSidebar = true,
}) => {
  const [internalActive, setInternalActive] = useState<UnderstandingSectionKey>(initialSection);
  const revision = useNodeFlowStore((state) => state.revision);
  const nodes = useNodeFlowStore((state) => state.nodes);
  const links = useNodeFlowStore((state) => state.links);
  const activeView = useNodeFlowStore((state) => state.activeView);
  const setActiveView = useNodeFlowStore((state) => state.setActiveView);

  const active = activeSection ?? internalActive;

  useEffect(() => {
    if (activeSection !== undefined) return;
    setInternalActive(initialSection);
  }, [activeSection, initialSection]);

  const workflow = useMemo(
    () => ({
      version: 2,
      revision,
      name: projectData.fileName || "Qalam NodeFlow",
      nodes,
      links,
      activeView,
    }),
    [activeView, links, nodes, projectData.fileName, revision]
  );

  const sourceNodes = useMemo(() => buildProjectedSourceNodes(projectData), [projectData]);
  const graphNodes = useMemo(() => buildGraphNodesFromWorkflow(workflow), [workflow]);
  const semanticNodes = useMemo(
    () => graphNodes.filter((node) => node.plane === "semantic"),
    [graphNodes]
  );
  const designNodes = useMemo(
    () => graphNodes.filter((node) => node.plane === "design"),
    [graphNodes]
  );
  const maps = useMemo(() => buildProjectGraphMaps(workflow), [workflow]);

  const sections: SectionItem[] = [
    {
      key: "source",
      label: "Source",
      icon: BookOpen,
      tone: "text-amber-300",
      subtitle: `${sourceNodes.length} canonical nodes`,
    },
    {
      key: "semantic",
      label: "Semantic",
      icon: Network,
      tone: "text-emerald-300",
      subtitle: `${semanticNodes.length} understanding assets`,
    },
    {
      key: "design",
      label: "Design",
      icon: Sparkles,
      tone: "text-sky-300",
      subtitle: `${designNodes.length} creative assets`,
    },
    {
      key: "maps",
      label: "Maps",
      icon: Layers3,
      tone: "text-violet-300",
      subtitle: `${maps.length} projections`,
    },
  ];

  const handleSectionSelect = (section: UnderstandingSectionKey) => {
    if (activeSection === undefined) setInternalActive(section);
    onActiveSectionChange?.(section);
  };

  const sourceTypeStats = countByType(sourceNodes);
  const semanticTypeStats = countByType(semanticNodes);
  const designTypeStats = countByType(designNodes);

  return (
    <div className="min-w-0 space-y-4 text-[var(--app-text-primary)]">
      <div className={`min-w-0 grid grid-cols-1 gap-4 ${showSidebar ? "lg:grid-cols-[260px_minmax(0,1fr)]" : ""}`}>
        {showSidebar ? (
          <div className="space-y-3">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <div key={section.key} className={sectionCardClass(active === section.key)}>
                  <button
                    type="button"
                    onClick={() => handleSectionSelect(section.key)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-2 text-[12px] font-semibold">
                      <Icon size={14} className={section.tone} />
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

        <div className="min-w-0 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-4">
          {active === "source" ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Canonical Source Graph</div>
                  <div className="mt-1 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                    剧本和 guide 作为只读 source 节点投影到图层中，Agent 只能引用，不能改写。
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sourceTypeStats.slice(0, 5).map((item) => (
                    <div
                      key={item.label}
                      className="rounded-full border border-[var(--app-border)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]"
                    >
                      {item.label} · {item.count}
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {sourceNodes.map((node) => (
                  <AssetCard key={node.ref} node={node} accent="text-amber-700" eyebrow="SOURCE" />
                ))}
              </div>
            </>
          ) : null}

          {active === "semantic" ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Semantic Assets</div>
                  <div className="mt-1 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                    这里展示 Agent 的理解资产，不再是固定 overview/profile 文档，而是可组合的知识节点。
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {semanticTypeStats.slice(0, 6).map((item) => (
                    <div
                      key={item.label}
                      className="rounded-full border border-[var(--app-border)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]"
                    >
                      {item.label} · {item.count}
                    </div>
                  ))}
                </div>
              </div>
              {semanticNodes.length ? (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {semanticNodes.map((node) => (
                    <AssetCard key={node.nodeId || node.ref} node={node} accent="text-emerald-700" eyebrow="SEMANTIC" />
                  ))}
                </div>
              ) : (
                <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-5 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                  No semantic assets yet. Agent can now write them through `edit_project_resource(resource_type=graph_node)`.
                </div>
              )}
            </>
          ) : null}

          {active === "design" ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Design Assets</div>
                  <div className="mt-1 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                    导演、美术、prompt 等创作决策资产落在 design plane，下游可以继续映射到执行节点。
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {designTypeStats.slice(0, 6).map((item) => (
                    <div
                      key={item.label}
                      className="rounded-full border border-[var(--app-border)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]"
                    >
                      {item.label} · {item.count}
                    </div>
                  ))}
                </div>
              </div>
              {designNodes.length ? (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {designNodes.map((node) => (
                    <AssetCard key={node.nodeId || node.ref} node={node} accent="text-sky-700" eyebrow="DESIGN" />
                  ))}
                </div>
              ) : (
                <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-5 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                  No design assets yet.
                </div>
              )}
            </>
          ) : null}

          {active === "maps" ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Graph Maps</div>
                  <div className="mt-1 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                    map 是 node 和 link 的投影，不是第二真相。这里可以快速切回某个 thematic view。
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--app-border)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                  <Compass size={12} />
                  {activeView ? `Current · ${activeView}` : "Current · Workspace"}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {maps.map((map) => (
                  <MapCard
                    key={map.mapId}
                    map={map}
                    onOpen={(nextMap) => setActiveView(nextMap.view)}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
