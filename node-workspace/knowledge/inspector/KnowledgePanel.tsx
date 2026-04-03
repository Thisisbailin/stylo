import React from "react";
import { BookOpen, Database, GitBranch, Network } from "lucide-react";
import { useKnowledgeStore } from "../../store/knowledgeStore";
import type { ProjectData } from "../../../types";

export type KnowledgeSectionKey = "overview" | "nodes" | "links" | "maps";

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
  const revision = useKnowledgeStore((state) => state.revision);
  const nodes = useKnowledgeStore((state) => state.nodes);
  const links = useKnowledgeStore((state) => state.links);
  const map = useKnowledgeStore((state) => state.getKnowledgeMap());
  const seedCanonicalSource = useKnowledgeStore((state) => state.seedCanonicalSource);
  const sections: SectionItem[] = [
    {
      key: "overview",
      label: "Overview",
      icon: BookOpen,
      subtitle: "Knowledge Core is the agent long-term memory layer.",
    },
    {
      key: "nodes",
      label: "Nodes",
      icon: Database,
      subtitle: `${nodes.length} atomic knowledge nodes`,
    },
    {
      key: "links",
      label: "Links",
      icon: GitBranch,
      subtitle: `${links.length} lightweight knowledge links`,
    },
    {
      key: "maps",
      label: "Maps",
      icon: Network,
      subtitle: `${map.nodes.length} nodes / ${map.links.length} links in current debug projection`,
    },
  ];

  const active = sections.find((section) => section.key === activeSection) || sections[0];

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
            Knowledge Core
          </div>
          <div className="mt-2 text-lg font-semibold">Long-Term Memory Layer</div>
          <div className="mt-3 max-w-3xl text-[13px] leading-6 text-[var(--app-text-secondary)]">
            Knowledge 的本体现在被定义为 Qalam Agent 的长期记忆数据层。这里不再承接旧的
            understanding 心智，而是只负责调试观察 knowledge node、knowledge link
            和 knowledge map 的底层真相。
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--app-text-secondary)]">
                Current Step
              </div>
              <div className="mt-2 text-[15px] font-semibold">Build Knowledge Core</div>
              <div className="mt-2 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                当前先围绕剧本正文三层 script、episode、scene 立住长期记忆层的 node、link、map 真相，再逐步补 agent 写入与局部地图。
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--app-text-secondary)]">
                Future Surface
              </div>
              <div className="mt-2 text-[15px] font-semibold">Knowledge Inspector</div>
              <div className="mt-2 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                这里只用于 knowledge node、knowledge link、knowledge map 的调试观察，不承担用户资料库或工作流主界面的职责。
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

          {activeSection === "nodes" ? (
            <div className="mt-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--app-text-secondary)]">Node Registry</div>
              <div className="mt-3 space-y-3">
                {nodes.length ? (
                  nodes.map((node) => (
                    <div key={node.id} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[13px] font-semibold">{node.package.title}</div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                          {node.kind}
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">{node.ref}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-[12px] leading-6 text-[var(--app-text-secondary)]">
                    No knowledge nodes yet.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeSection === "links" ? (
            <div className="mt-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--app-text-secondary)]">Link Registry</div>
              <div className="mt-3 space-y-3">
                {links.length ? (
                  links.map((link) => (
                    <div key={link.id} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-3">
                      <div className="text-[13px] font-semibold">{link.type}</div>
                      <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                        {link.fromNodeId} {"->"} {link.toNodeId}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-[12px] leading-6 text-[var(--app-text-secondary)]">
                    No knowledge links yet.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeSection === "maps" ? (
            <div className="mt-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--app-text-secondary)]">Knowledge Map Debug View</div>
              <div className="mt-3 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                Current debug projection includes {map.nodes.length} nodes and {map.links.length} links. This is a data-level knowledge map, not a user workflow canvas.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
