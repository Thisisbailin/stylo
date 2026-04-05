import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Boxes,
  Cloud,
  Compass,
  Film,
  FileText,
  Image,
  Layers3,
  Network,
  Shield,
  Sparkles,
  Target,
} from "lucide-react";
import type { AppConfig, ProjectData, SyncState } from "../../types";
import { useNodeFlowStore } from "../store/nodeFlowStore";
import { InfoPanel, type InfoSectionKey } from "./InfoPanel";
import { MaterialsPanel, type MaterialsSectionKey } from "./MaterialsPanel";
import { SyncPanel, type SyncSectionKey } from "./SyncPanel";
import {
  KnowledgePanel,
  type KnowledgeSectionKey,
} from "../knowledge/inspector/KnowledgePanel";
import { useKnowledgeStore } from "../store/knowledgeStore";
import { buildKnowledgeMap } from "../knowledge/maps";

export type WorkspaceSection =
  | `knowledge:${KnowledgeSectionKey}`
  | `assets:${MaterialsSectionKey}`
  | `sync:${SyncSectionKey}`
  | `info:${InfoSectionKey}`;

type Props = {
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
  isSignedIn?: boolean;
  getAuthToken?: () => Promise<string | null>;
  onForceSync?: () => void;
  syncState?: SyncState;
  syncRollout?: { enabled: boolean; percent: number; bucket?: number | null; allowlisted?: boolean };
  onResetProject?: () => void;
  onOpenLanding?: () => void;
  initialSection?: WorkspaceSection;
};

type NavItem = {
  key: WorkspaceSection;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: string;
};

type NavGroup = {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  items: NavItem[];
};

const splitSection = (section: WorkspaceSection) => {
  const [group, key] = section.split(":") as [
    "knowledge" | "assets" | "sync" | "info",
    string,
  ];
  return { group, key };
};

export const WorkspacePanel: React.FC<Props> = ({
  projectData,
  setProjectData,
  config,
  onConfigChange,
  isSignedIn,
  getAuthToken,
  onForceSync,
  syncState,
  syncRollout,
  onResetProject,
  onOpenLanding,
  initialSection = "knowledge:overview",
}) => {
  const [activeSection, setActiveSection] = useState<WorkspaceSection>(initialSection);
  const { globalAssetHistory } = useNodeFlowStore();
  const knowledgeRevision = useKnowledgeStore((state) => state.revision);
  const knowledgeNodeCount = useKnowledgeStore((state) => state.nodes.length);
  const knowledgeLinkCount = useKnowledgeStore((state) => state.links.length);
  const knowledgeNodes = useKnowledgeStore((state) => state.nodes);
  const knowledgeLinks = useKnowledgeStore((state) => state.links);
  const knowledgeMap = useMemo(
    () =>
      buildKnowledgeMap({
        revision: knowledgeRevision,
        nodes: knowledgeNodes,
        links: knowledgeLinks,
      }),
    [knowledgeLinks, knowledgeNodes, knowledgeRevision]
  );
  const knowledgeMapNodeCount = knowledgeMap.nodes.length;
  const knowledgeMapLinkCount = knowledgeMap.links.length;

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const imageCount = useMemo(
    () => globalAssetHistory.filter((item) => item.type === "image").length,
    [globalAssetHistory]
  );
  const videoCount = useMemo(
    () => globalAssetHistory.filter((item) => item.type === "video").length,
    [globalAssetHistory]
  );
  const promptCount = useMemo(
    () => globalAssetHistory.filter((item) => item.prompt.trim().length > 0).length,
    [globalAssetHistory]
  );

  const navGroups: NavGroup[] = [
    {
      title: "Knowledge",
      icon: BookOpen,
      items: [
        {
          key: "knowledge:overview",
          label: "Overview",
          description: "Knowledge Core positioning and migration status",
          icon: BookOpen,
          tone: "text-amber-300",
        },
        {
          key: "knowledge:nodes",
          label: "Nodes",
          description: `${knowledgeNodeCount} memory nodes`,
          icon: Network,
          tone: "text-emerald-300",
        },
        {
          key: "knowledge:links",
          label: "Links",
          description: `${knowledgeLinkCount} memory links`,
          icon: Sparkles,
          tone: "text-sky-300",
        },
        {
          key: "knowledge:maps",
          label: "Maps",
          description: `${knowledgeMapNodeCount} nodes / ${knowledgeMapLinkCount} links`,
          icon: Layers3,
          tone: "text-violet-300",
        },
        {
          key: "knowledge:lab",
          label: "Mutation Lab",
          description: "Dev-only write experiments",
          icon: Sparkles,
          tone: "text-rose-300",
        },
      ],
    },
    {
      title: "Assets",
      icon: Boxes,
      items: [
        {
          key: "assets:images",
          label: "Images",
          description: `${imageCount} generated`,
          icon: Image,
          tone: "text-sky-300",
        },
        {
          key: "assets:videos",
          label: "Videos",
          description: `${videoCount} generated`,
          icon: Film,
          tone: "text-emerald-300",
        },
        {
          key: "assets:prompts",
          label: "Prompt",
          description: `${promptCount} captured`,
          icon: Sparkles,
          tone: "text-amber-300",
        },
      ],
    },
    {
      title: "Sync",
      icon: Cloud,
      items: [
        {
          key: "sync:status",
          label: "Status & Keys",
          description: "Cloud handshake and local key mode",
          icon: Shield,
          tone: "text-emerald-300",
        },
        {
          key: "sync:history",
          label: "Cloud History",
          description: "Snapshots and audit trail",
          icon: Cloud,
          tone: "text-sky-300",
        },
      ],
    },
    {
      title: "Info",
      icon: Compass,
      items: [
        {
          key: "info:about",
          label: "About",
          description: "Product surface and landing entry",
          icon: FileText,
          tone: "text-amber-300",
        },
        {
          key: "info:roadmap",
          label: "Roadmap",
          description: "Pipeline and collaboration direction",
          icon: Target,
          tone: "text-rose-300",
        },
      ],
    },
  ];

  const activeItem =
    navGroups.flatMap((group) => group.items).find((item) => item.key === activeSection) ||
    navGroups[0].items[0];
  const { group, key } = splitSection(activeSection);

  return (
    <div className="min-w-0 text-[var(--app-text-primary)]">
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[292px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4">
            <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--app-text-secondary)]">
              Workspace
            </div>
            <div className="mt-2 text-[13px] leading-6 text-[var(--app-text-secondary)]">
              文学地图、素材、同步和项目信息都收进同一个工作台侧栏，只在这里切换上下文。
            </div>
          </div>

          {navGroups.map((navGroup) => {
            const GroupIcon = navGroup.icon;
            return (
              <div
                key={navGroup.title}
                className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4"
              >
                <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-[var(--app-text-secondary)]">
                  <GroupIcon size={14} />
                  {navGroup.title}
                </div>
                <div className="space-y-2">
                  {navGroup.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.key === activeSection;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setActiveSection(item.key)}
                        className={`w-full rounded-[20px] border px-3 py-3 text-left transition active:translate-y-px ${
                          isActive
                            ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)]"
                            : "border-[var(--app-border)] bg-transparent hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)]"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-[12px] font-semibold">
                          <Icon size={14} className={item.tone} />
                          {item.label}
                        </div>
                        <div className="mt-1 text-[11px] leading-5 text-[var(--app-text-secondary)]">
                          {item.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="rounded-[30px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-5">
            <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--app-text-secondary)]">
              {group}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[20px] font-semibold tracking-[-0.03em]">
              {activeItem.label}
            </div>
            <div className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--app-text-secondary)]">
              {activeItem.description}
            </div>
          </div>

          {group === "knowledge" ? (
            <KnowledgePanel
              projectData={projectData}
              activeSection={key as KnowledgeSectionKey}
              showSidebar={false}
            />
          ) : null}

          {group === "assets" ? (
            <MaterialsPanel
              activeSection={key as MaterialsSectionKey}
              showSidebar={false}
            />
          ) : null}

          {group === "sync" ? (
            <SyncPanel
              config={config}
              onConfigChange={onConfigChange}
              isSignedIn={isSignedIn}
              getAuthToken={getAuthToken}
              onForceSync={onForceSync}
              syncState={syncState}
              syncRollout={syncRollout}
              onResetProject={onResetProject}
              activeSection={key as SyncSectionKey}
              showSidebar={false}
            />
          ) : null}

          {group === "info" ? (
            <InfoPanel
              onOpenLanding={onOpenLanding}
              activeSection={key as InfoSectionKey}
              showSidebar={false}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
};
