import React from "react";
import { BookOpen, Database, GitBranch, Network } from "lucide-react";
import { useKnowledgeStore } from "../../store/knowledgeStore";
import type { ProjectData } from "../../../types";

export type KnowledgeSectionKey = "overview" | "entries" | "relations" | "maps";

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
  const entries = useKnowledgeStore((state) => state.entries);
  const relations = useKnowledgeStore((state) => state.relations);
  const mapView = useKnowledgeStore((state) => state.getKnowledgeMapView());
  const seedCanonicalSource = useKnowledgeStore((state) => state.seedCanonicalSource);
  const sections: SectionItem[] = [
    {
      key: "overview",
      label: "Overview",
      icon: BookOpen,
      subtitle: "Knowledge Core is the agent long-term memory layer.",
    },
    {
      key: "entries",
      label: "Entries",
      icon: Database,
      subtitle: `${entries.length} atomic knowledge entries`,
    },
    {
      key: "relations",
      label: "Relations",
      icon: GitBranch,
      subtitle: `${relations.length} lightweight knowledge relations`,
    },
    {
      key: "maps",
      label: "Maps",
      icon: Network,
      subtitle: `${mapView.entries.length} entries / ${mapView.relations.length} relations in current debug projection`,
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
            旧的 Understanding 面板已停用。这里不再直接承接用户可读资产视图，而是为新的
            Knowledge 模块预留调试与开发承接位。Knowledge 的本体将作为 Qalam Agent
            的长期记忆数据层独立落地，未来这里只显示它的调试投影，而不是定义其本体。
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--app-text-secondary)]">
                Current Step
              </div>
              <div className="mt-2 text-[15px] font-semibold">Retire Understanding Surface</div>
              <div className="mt-2 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                先退出旧 understanding 命名和面板形态，再为独立的 knowledge 数据模型搭建代码骨架。
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--app-text-secondary)]">
                Future Surface
              </div>
              <div className="mt-2 text-[15px] font-semibold">Knowledge Inspector</div>
              <div className="mt-2 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                未来这里只用于 entry、relation、map 的调试观察，不承担用户资料库或工作流主界面的职责。
              </div>
            </div>
          </div>
          <div className="mt-5">
            <button
              type="button"
              onClick={() => seedCanonicalSource(projectData)}
              className="inline-flex items-center rounded-full border border-[var(--app-border-strong)] bg-[var(--app-panel)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-primary)] transition hover:bg-[var(--app-panel-strong)]"
            >
              Seed Canonical Sources
            </button>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">Revision</div>
              <div className="mt-2 text-[18px] font-semibold">{revision}</div>
            </div>
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">Entries</div>
              <div className="mt-2 text-[18px] font-semibold">{entries.length}</div>
            </div>
            <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">Relations</div>
              <div className="mt-2 text-[18px] font-semibold">{relations.length}</div>
            </div>
          </div>

          {activeSection === "entries" ? (
            <div className="mt-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--app-text-secondary)]">Entry Registry</div>
              <div className="mt-3 space-y-3">
                {entries.length ? (
                  entries.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[13px] font-semibold">{entry.title}</div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
                          {entry.kind}
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">{entry.ref}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-[12px] leading-6 text-[var(--app-text-secondary)]">
                    No knowledge entries yet.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeSection === "relations" ? (
            <div className="mt-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--app-text-secondary)]">Relation Registry</div>
              <div className="mt-3 space-y-3">
                {relations.length ? (
                  relations.map((relation) => (
                    <div key={relation.id} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-3">
                      <div className="text-[13px] font-semibold">{relation.type}</div>
                      <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">
                        {relation.fromEntryId} {"->"} {relation.toEntryId}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-[12px] leading-6 text-[var(--app-text-secondary)]">
                    No knowledge relations yet.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeSection === "maps" ? (
            <div className="mt-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--app-text-secondary)]">Knowledge Map Debug View</div>
              <div className="mt-3 text-[12px] leading-6 text-[var(--app-text-secondary)]">
                Current debug projection includes {mapView.entries.length} entries and {mapView.relations.length} relations.
                This is a data-level map view, not a user workflow canvas.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
