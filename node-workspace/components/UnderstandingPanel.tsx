import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, ListChecks, MapPin, NotebookText, Users } from "lucide-react";
import type { ProjectData } from "../../types";
import { CharacterSceneLibraryPanel } from "./CharacterSceneLibraryPanel";

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  initialSection?: UnderstandingSectionKey;
  activeSection?: UnderstandingSectionKey;
  onActiveSectionChange?: (section: UnderstandingSectionKey) => void;
  showSidebar?: boolean;
};

export type UnderstandingSectionKey =
  | "overview"
  | "episodes"
  | "characters"
  | "scenes"
  | "guides";

type SectionItem = {
  key: SectionKey;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: string;
  subtitle: string;
};

export const UnderstandingPanel: React.FC<Props> = ({
  projectData,
  setProjectData,
  initialSection = "overview",
  activeSection,
  onActiveSectionChange,
  showSidebar = true,
}) => {
  const [internalActive, setInternalActive] = useState<UnderstandingSectionKey>(initialSection);
  const [selectedGuideKey, setSelectedGuideKey] = useState<string | null>(null);
  const active = activeSection ?? internalActive;
  const summary = projectData.context.projectSummary?.trim() || "";
  const episodeSummaries = projectData.context.episodeSummaries || [];
  const episodeCount = projectData.episodes.length;
  const characterCount = useMemo(
    () => (projectData.context.roles || []).filter((role) => role.kind === "person").length,
    [projectData.context.roles]
  );
  const sceneCount = useMemo(
    () => (projectData.context.roles || []).filter((role) => role.kind === "scene").length,
    [projectData.context.roles]
  );
  const guideItems = useMemo(
    () =>
      [
        { key: "globalStyleGuide", title: "Style Guide", text: projectData.globalStyleGuide || "" },
        { key: "shotGuide", title: "Shot Guide", text: projectData.shotGuide || "" },
        { key: "soraGuide", title: "Sora Guide", text: projectData.soraGuide || "" },
        { key: "storyboardGuide", title: "Storyboard Guide", text: projectData.storyboardGuide || "" },
        { key: "dramaGuide", title: "Drama Guide", text: projectData.dramaGuide || "" },
      ].filter((item) => item.text.trim().length > 0),
    [
      projectData.globalStyleGuide,
      projectData.shotGuide,
      projectData.soraGuide,
      projectData.storyboardGuide,
      projectData.dramaGuide,
    ]
  );

  useEffect(() => {
    if (activeSection !== undefined) return;
    setInternalActive(initialSection);
  }, [activeSection, initialSection]);

  useEffect(() => {
    if (!guideItems.length) {
      setSelectedGuideKey(null);
      return;
    }
    if (!selectedGuideKey || !guideItems.some((guide) => guide.key === selectedGuideKey)) {
      setSelectedGuideKey(guideItems[0].key);
    }
  }, [guideItems, selectedGuideKey]);

  const overviewCardClass = (isActive: boolean) =>
    `rounded-2xl border px-3 py-3 transition bg-[var(--app-panel-muted)] ${
      isActive
        ? "border-yellow-400/60 bg-yellow-500/10"
        : "border-[var(--app-border)] hover:border-[var(--app-border-strong)]"
    }`;

  const sections: SectionItem[] = [
    {
      key: "overview",
      label: "Overview",
      icon: BookOpen,
      tone: "text-yellow-300",
      subtitle: summary ? "Summary ready" : "No summary yet",
    },
    {
      key: "episodes",
      label: "Episodes",
      icon: ListChecks,
      tone: "text-emerald-300",
      subtitle: `${episodeSummaries.length} summaries`,
    },
    {
      key: "characters",
      label: "Characters",
      icon: Users,
      tone: "text-emerald-200",
      subtitle: `${characterCount} tracked`,
    },
    {
      key: "scenes",
      label: "Scenes",
      icon: MapPin,
      tone: "text-cyan-300",
      subtitle: `${sceneCount} parsed`,
    },
    {
      key: "guides",
      label: "Guides",
      icon: NotebookText,
      tone: "text-violet-300",
      subtitle: `${guideItems.length} loaded`,
    },
  ];
  const selectedGuide = guideItems.find((guide) => guide.key === selectedGuideKey) || guideItems[0];
  const handleSectionSelect = (section: UnderstandingSectionKey) => {
    if (activeSection === undefined) {
      setInternalActive(section);
    }
    onActiveSectionChange?.(section);
  };

  return (
    <div className="min-w-0 space-y-4 text-[var(--app-text-primary)]">
      <div className={`min-w-0 grid grid-cols-1 gap-4 ${showSidebar ? "lg:grid-cols-[260px_minmax(0,1fr)]" : ""}`}>
        {showSidebar ? (
          <div className="space-y-3">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <div key={section.key} className={overviewCardClass(active === section.key)}>
                  <button
                    type="button"
                    onClick={() => handleSectionSelect(section.key)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-2 text-[12px] font-semibold">
                      <Icon size={14} className={section.tone} />
                      {section.label}
                    </div>
                    <div className="text-[11px] text-[var(--app-text-secondary)] mt-1">
                      {section.subtitle}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        {active === "characters" || active === "scenes" ? (
          <div className="min-w-0">
            <CharacterSceneLibraryPanel
              key={active}
              projectData={projectData}
              setProjectData={setProjectData}
              initialSelectionType={active === "characters" ? "character" : "scene"}
            />
          </div>
        ) : (
          <div className="min-w-0 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4 space-y-4">
            {active === "overview" ? (
              <>
                <div className="text-lg font-semibold">Project Summary</div>
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4 text-[13px] text-[var(--app-text-secondary)] whitespace-pre-wrap min-h-[120px]">
                  {summary || "No summary generated yet."}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { label: "Episodes", value: episodeCount },
                    { label: "Characters", value: characterCount },
                    { label: "Scenes", value: sceneCount },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3"
                    >
                      <div className="text-[11px] text-[var(--app-text-secondary)] uppercase tracking-widest">
                        {item.label}
                      </div>
                      <div className="text-xl font-semibold mt-1">{item.value}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : active === "episodes" ? (
              <>
                <div className="text-lg font-semibold">Episode Summaries</div>
                {episodeSummaries.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {episodeSummaries.map((summaryItem) => (
                      <div
                        key={summaryItem.episodeId}
                        className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4 space-y-2"
                      >
                        <div className="text-[12px] font-semibold">
                          Episode {summaryItem.episodeId}
                        </div>
                        <div className="text-[12px] text-[var(--app-text-secondary)] leading-relaxed line-clamp-6">
                          {summaryItem.summary}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[12px] text-[var(--app-text-secondary)]">
                    No episode summaries yet.
                  </div>
                )}
              </>
            ) : active === "guides" ? (
              <>
                <div className="text-lg font-semibold">Project Guides</div>
                {guideItems.length ? (
                  <div className="space-y-4">
                    <div className="overflow-x-auto pb-1">
                      <div className="flex gap-2 min-w-fit">
                        {guideItems.map((guide) => {
                          const isActive = selectedGuide?.key === guide.key;
                          return (
                            <button
                              key={guide.key}
                              type="button"
                              onClick={() => setSelectedGuideKey(guide.key)}
                              className={`inline-flex min-w-fit items-center gap-2 rounded-full border px-3 py-2 text-left transition whitespace-nowrap ${
                                isActive
                                  ? "border-violet-400/60 bg-violet-500/12 text-[var(--app-text-primary)]"
                                  : "border-[var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-text-secondary)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)]"
                              }`}
                            >
                              <span className="font-medium">{guide.title}</span>
                              <span className="text-[10px] opacity-70">{guide.text.trim().length} chars</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {selectedGuide ? (
                      <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4 md:p-5 space-y-3">
                        <div className="text-[15px] font-semibold">{selectedGuide.title}</div>
                        <div className="text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap leading-relaxed">
                          {selectedGuide.text}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-[12px] text-[var(--app-text-secondary)]">
                    No guides loaded yet.
                  </div>
                )}
              </>
            ) : (
              <div className="text-[12px] text-[var(--app-text-secondary)]">No content.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
