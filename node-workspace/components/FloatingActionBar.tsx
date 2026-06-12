import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  User,
  Projector,
  MessageSquare,
  Image as ImageIcon,
  Sparkles,
  Video,
  SquareStack,
  Library,
  ChevronRight,
  ChevronsRight,
  Layers,
  FileText,
  List,
  BarChart2,
  BookOpen,
  Palette,
  FileCode,
  Sun,
  Moon,
  Trash2,
  LogOut,
  Upload,
  Share,
  ScanSearch,
  Network,
} from "lucide-react";
import type { ModuleKey } from "./ModuleBar";

type AccountInfo = {
  isLoaded: boolean;
  isSignedIn: boolean;
  name?: string;
  email?: string;
  avatarUrl?: string;
  onSignIn?: () => void;
  onSignOut?: () => void;
  onUploadAvatar?: () => void;
};

type Props = {
  onAddText: () => void;
  onAddScriptBoard: () => void;
  onAddStoryboardBoard: () => void;
  onAddIdentityCard: () => void;
  onAddImage: () => void;
  onAddAudio: () => void;
  onAddVideo: () => void;
  onAddImageGen: () => void;
  onAddNanoBananaImageGen: () => void;
  onAddWanImageGen: () => void;
  onAddVideoGen: () => void;
  onAddViduVideoGen: () => void;
  onAddWanReferenceVideoGen: () => void;
  onAddSeedanceVideoGen: () => void;
  onImport: () => void;
  onExport: () => void;
  onExportCsv?: () => void;
  onExportXls?: () => void;
  onExportUnderstandingJson?: () => void;
  onRun: () => void;
  floating?: boolean;
  onOpenModule?: (key: ModuleKey) => void;
  onOpenStats?: () => void;
  onToggleTheme?: () => void;
  onOpenTheme?: (anchorRect?: DOMRect) => void;
  isDarkMode?: boolean;
  onOpenSyncPanel?: () => void;
  syncIndicator?: { label: string; color: string } | null;
  onOpenInfoPanel?: () => void;
  onOpenKnowledgePanel?: (
    section?:
      | "knowledge:overview"
      | "knowledge:nodes"
      | "knowledge:links"
      | "knowledge:maps"
  ) => void;
  onResetProject?: () => void;
  onSignOut?: () => void;
  accountInfo?: AccountInfo;
  onTryMe?: () => void;
  onToggleWorkflow?: (anchorRect?: DOMRect) => void;
  onOpenQalam?: () => void;
  variant?: "dock" | "embedded";
  onAssetLoad?: (
    type:
      | "script"
      | "globalStyleGuide"
      | "shotGuide"
      | "soraGuide"
      | "storyboardGuide"
      | "dramaGuide"
      | "csvShots"
      | "understandingJson",
    content: string,
    fileName?: string
  ) => void;
};

export const FloatingActionBar: React.FC<Props> = ({
  onAddText,
  onAddScriptBoard,
  onAddStoryboardBoard,
  onAddIdentityCard,
  onAddImage,
  onAddAudio,
  onAddVideo,
  onAddImageGen,
  onAddNanoBananaImageGen,
  onAddWanImageGen,
  onAddVideoGen,
  onAddViduVideoGen,
  onAddWanReferenceVideoGen,
  onAddSeedanceVideoGen,
  onImport,
  onExport,
  onExportCsv,
  onExportXls,
  onExportUnderstandingJson,
  onRun,
  floating = true,
  onOpenModule,
  onOpenStats,
  onToggleTheme,
  onOpenTheme,
  isDarkMode,
  syncIndicator,
  onOpenKnowledgePanel,
  onResetProject,
  onSignOut,
  accountInfo,
  onTryMe,
  onToggleWorkflow,
  onOpenQalam,
  variant = "dock",
  onAssetLoad,
}) => {
  const isEmbedded = variant === "embedded";
  const [showPalette, setShowPalette] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showWip, setShowWip] = useState(false);
  const [ioPane, setIoPane] = useState<"project" | "guides" | "export">("project");
  const [nodePaletteMode, setNodePaletteMode] = useState<"knowledge" | "workflow">("workflow");
  const scriptInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const understandingInputRef = useRef<HTMLInputElement>(null);
  const globalStyleInputRef = useRef<HTMLInputElement>(null);
  const shotGuideInputRef = useRef<HTMLInputElement>(null);
  const soraGuideInputRef = useRef<HTMLInputElement>(null);
  const storyboardGuideInputRef = useRef<HTMLInputElement>(null);
  const dramaGuideInputRef = useRef<HTMLInputElement>(null);
  const workflowButtonRef = useRef<HTMLButtonElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const projectButtonRef = useRef<HTMLButtonElement>(null);
  const nodesButtonRef = useRef<HTMLButtonElement>(null);
  const fileMenuPanelRef = useRef<HTMLDivElement>(null);
  const templatePanelRef = useRef<HTMLDivElement>(null);
  const palettePanelRef = useRef<HTMLDivElement>(null);
  const [accountAnchorRect, setAccountAnchorRect] = useState<DOMRect | null>(null);
  const [projectAnchorRect, setProjectAnchorRect] = useState<DOMRect | null>(null);
  const [nodesAnchorRect, setNodesAnchorRect] = useState<DOMRect | null>(null);
  const rootClass = isEmbedded
    ? "relative z-30 w-full"
    : floating
      ? "fixed bottom-4 right-4 z-30"
      : "relative z-30";
  const panelClass = "rounded-3xl app-panel overflow-hidden";
  const panelStyle: React.CSSProperties = {
    backgroundColor: "var(--app-panel)",
    borderColor: "var(--app-border)",
    boxShadow: "var(--app-shadow)",
  };
  const sectionEyebrowClass =
    "text-[10px] font-black uppercase tracking-[0.24em] text-[var(--app-text-secondary)]";
  const sectionCardClass =
    "rounded-[26px] border border-[var(--app-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4";
  const utilityButtonClass =
    "group flex min-h-[60px] items-center gap-3 rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3 text-left transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)] active:translate-y-px";
  const docButtonClass =
    "group w-full rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3 text-left transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)] disabled:cursor-not-allowed disabled:text-[var(--app-text-muted)] disabled:hover:border-[var(--app-border)] disabled:hover:bg-[var(--app-panel-muted)]";
  const compactTabClass =
    "inline-flex h-8 items-center justify-center rounded-full border px-3 text-[11px] font-semibold transition active:translate-y-px";
  const embeddedLabelClass =
    "group inline-flex h-8 items-center gap-2 rounded-full border border-[var(--app-border)] bg-[linear-gradient(180deg,var(--app-panel-strong),var(--app-panel))] px-3 text-[11px] font-medium tracking-[-0.01em] text-[var(--app-text-secondary)] shadow-[0_10px_24px_-18px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition hover:border-[var(--app-border-strong)] hover:bg-[linear-gradient(180deg,var(--app-panel-strong),var(--app-panel-soft))] hover:text-[var(--app-text-primary)] active:translate-y-px";
  const toolbarChipClass =
    "group inline-flex h-9 items-center gap-2 rounded-full border border-[var(--app-border)] bg-[linear-gradient(180deg,var(--app-panel-strong),var(--app-panel))] px-3.5 text-[11px] font-semibold tracking-[0.01em] text-[var(--app-text-secondary)] shadow-[0_10px_24px_-18px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition duration-200 hover:border-[var(--app-border-strong)] hover:bg-[linear-gradient(180deg,var(--app-panel-strong),var(--app-panel-soft))] hover:text-[var(--app-text-primary)] active:translate-y-px";
  const getPopoverStyle = (anchorRect: DOMRect | null, desiredWidth: number): React.CSSProperties | undefined => {
    if (typeof window === "undefined") return undefined;
    if (!anchorRect) {
      return {
        right: 24,
        bottom: 80,
        width: `min(${desiredWidth}px,calc(100vw-24px))`,
      };
    }
    const viewportPadding = 12;
    const width = Math.min(desiredWidth, window.innerWidth - viewportPadding * 2);
    const left = Math.max(
      viewportPadding,
      Math.min(anchorRect.left + anchorRect.width / 2 - width / 2, window.innerWidth - viewportPadding - width)
    );
    const gap = 12;
    const bottom = Math.max(16, window.innerHeight - anchorRect.top + gap);
    return {
      position: "fixed",
      left,
      bottom,
      width,
      maxWidth: `calc(100vw - ${viewportPadding * 2}px)`,
    };
  };
  const templatePopoverStyle = useMemo(() => getPopoverStyle(projectAnchorRect, 420), [projectAnchorRect]);
  const palettePopoverStyle = useMemo(() => getPopoverStyle(nodesAnchorRect, 580), [nodesAnchorRect]);
  const fileMenuPopoverStyle = useMemo(() => getPopoverStyle(accountAnchorRect, 420), [accountAnchorRect]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!showFileMenu && !showTemplate && !showPalette) return undefined;

    const updateAnchors = () => {
      if (showFileMenu && accountButtonRef.current) {
        setAccountAnchorRect(accountButtonRef.current.getBoundingClientRect());
      }
      if (showTemplate && projectButtonRef.current) {
        setProjectAnchorRect(projectButtonRef.current.getBoundingClientRect());
      }
      if (showPalette && nodesButtonRef.current) {
        setNodesAnchorRect(nodesButtonRef.current.getBoundingClientRect());
      }
    };

    updateAnchors();
    window.addEventListener("resize", updateAnchors);
    window.addEventListener("scroll", updateAnchors, true);

    return () => {
      window.removeEventListener("resize", updateAnchors);
      window.removeEventListener("scroll", updateAnchors, true);
    };
  }, [showFileMenu, showPalette, showTemplate]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (!showFileMenu && !showTemplate && !showPalette) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      const insideOpenPanel =
        (showFileMenu && fileMenuPanelRef.current?.contains(target)) ||
        (showTemplate && templatePanelRef.current?.contains(target)) ||
        (showPalette && palettePanelRef.current?.contains(target));

      if (insideOpenPanel) return;

      const insideTrigger =
        accountButtonRef.current?.contains(target) ||
        projectButtonRef.current?.contains(target) ||
        nodesButtonRef.current?.contains(target);

      if (insideTrigger) return;
      closeMenus();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [showFileMenu, showPalette, showTemplate]);

  const panelActions = [
    { label: "剧本面板", hint: "按集与场景浏览剧本", meta: "Panel", onClick: onAddScriptBoard, Icon: BookOpen, tone: "text-sky-300", surface: "bg-sky-500/12" },
    { label: "分镜表面板", hint: "可调列宽和行高的表格", meta: "Table", onClick: onAddStoryboardBoard, Icon: List, tone: "text-amber-300", surface: "bg-amber-500/12" },
    { label: "身份卡片", hint: "角色 / 场景与定妆照槽位", meta: "Library", onClick: onAddIdentityCard, Icon: Layers, tone: "text-emerald-300", surface: "bg-emerald-500/12" },
  ];
  const knowledgeDebugActions = [
    {
      label: "Knowledge Backbone",
      hint: "从剧本主链出发查看 Agent 当前长期记忆的整体骨架与规模。",
      meta: "Backbone",
      onClick: () => onOpenKnowledgePanel?.("knowledge:overview"),
      Icon: SquareStack,
      tone: "text-violet-300",
      surface: "bg-violet-500/12",
    },
    {
      label: "Knowledge Focus",
      hint: "围绕当前焦点节点查看一阶局部记忆结构，观察 Agent 在背面关注什么。",
      meta: "Focus",
      onClick: () => onOpenKnowledgePanel?.("knowledge:nodes"),
      Icon: Layers,
      tone: "text-emerald-300",
      surface: "bg-emerald-500/12",
    },
    {
      label: "Knowledge Revisions",
      hint: "查看长期记忆中的修正链，观察知识如何被替代、演化与沉淀。",
      meta: "Revisions",
      onClick: () => onOpenKnowledgePanel?.("knowledge:links"),
      Icon: Share,
      tone: "text-sky-300",
      surface: "bg-sky-500/12",
    },
    {
      label: "Knowledge Anchor",
      hint: "围绕 script / episode / scene anchor 观察长期记忆在某个源事实附近是如何生长的。",
      meta: "Anchor",
      onClick: () => onOpenKnowledgePanel?.("knowledge:maps"),
      Icon: Network,
      tone: "text-amber-300",
      surface: "bg-amber-500/12",
    },
  ];
  const nodeActions = [
    { label: "Text", hint: "Draft prompts, notes, and structure", meta: "Writing", onClick: onAddText, Icon: MessageSquare, tone: "text-slate-200", surface: "bg-white/5" },
    { label: "Image", hint: "Upload a reference image or still", meta: "Input", onClick: onAddImage, Icon: ImageIcon, tone: "text-emerald-300", surface: "bg-emerald-500/12" },
    { label: "Audio", hint: "Upload a reference audio clip", meta: "Input", onClick: onAddAudio, Icon: Upload, tone: "text-cyan-300", surface: "bg-cyan-500/12" },
    { label: "Video", hint: "Upload a reference video clip", meta: "Input", onClick: onAddVideo, Icon: Video, tone: "text-rose-300", surface: "bg-rose-500/12" },
    { label: "Nano Banana", hint: "Nano Banana Pro image", meta: "Generation", onClick: onAddNanoBananaImageGen, Icon: Sparkles, tone: "text-amber-300", surface: "bg-amber-500/12" },
    { label: "WAN Img", hint: "Wan 2.6 image workflow", meta: "Generation", onClick: onAddWanImageGen, Icon: Sparkles, tone: "text-teal-300", surface: "bg-teal-500/12" },
    { label: "Vidu", hint: "Vidu reference-to-video", meta: "Motion", onClick: onAddViduVideoGen, Icon: Video, tone: "text-cyan-300", surface: "bg-cyan-500/12" },
    { label: "WAN Ref Vid", hint: "Wan 2.6 reference-to-video", meta: "Motion", onClick: onAddWanReferenceVideoGen, Icon: Video, tone: "text-fuchsia-300", surface: "bg-fuchsia-500/12" },
    { label: "Seedance", hint: "Multimodal reference-to-video", meta: "Motion", onClick: onAddSeedanceVideoGen, Icon: Video, tone: "text-sky-300", surface: "bg-sky-500/12" },
  ];
  const agentSettingTopModules = [
    { key: "writing" as ModuleKey, label: "Writing", desc: "结构化写作", Icon: FileCode, tone: "text-fuchsia-300", surface: "bg-fuchsia-500/10" },
    { key: "workspace" as ModuleKey, label: "Workspace", desc: "理解 / 素材 / Sync / Info", Icon: SquareStack, tone: "text-blue-200", surface: "bg-blue-500/10" },
    { key: "provider", label: "Agent Setting", desc: "模型 / tools / dashboard", Icon: BarChart2, tone: "text-sky-300", surface: "bg-sky-500/10" },
  ];
  const agentSettingBottomModules = [
    { key: "projector" as ModuleKey, label: "Voice Lab", desc: "声音实验室", Icon: Projector, tone: "text-rose-300", surface: "bg-rose-500/10" },
    { key: "glassLab" as ModuleKey, label: "Visual Lab", desc: "视觉语言实验", Icon: ScanSearch, tone: "text-zinc-200", surface: "bg-white/5" },
  ];

  const accountLoaded = accountInfo?.isLoaded ?? true;
  const accountSignedIn = accountLoaded && !!accountInfo?.isSignedIn;
  const accountName = accountInfo?.name || accountInfo?.email || "Qalam User";
  const accountEmail = accountInfo?.email || accountInfo?.name || "登录以启用同步和项目管理";
  const handleSignOut = accountInfo?.onSignOut || onSignOut;
  const handleUploadAvatar = accountInfo?.onUploadAvatar;

  const closeMenus = () => {
    setShowPalette(false);
    setShowFileMenu(false);
    setShowTemplate(false);
    setShowWip(false);
  };

  const handleAssetFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    type:
      | "script"
      | "globalStyleGuide"
      | "shotGuide"
      | "soraGuide"
      | "storyboardGuide"
      | "dramaGuide"
      | "csvShots"
      | "understandingJson"
  ) => {
    const file = event.target.files?.[0];
    if (!file || !onAssetLoad) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      if (content) onAssetLoad(type, content, file.name);
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const ioActions: { label: string; desc: string; Icon: any; onClick?: () => void; color: string }[] = [];

  const renderAgentSettingModules = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className={sectionEyebrowClass}>Agent Setting</div>
        <div className="text-[10px] text-[var(--app-text-muted)]">{agentSettingTopModules.length + agentSettingBottomModules.length} modules</div>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {agentSettingTopModules.map(({ key, label, desc, Icon, tone, surface }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (key === "provider") {
                  onOpenStats?.();
                } else {
                  onOpenModule?.(key);
                }
                closeMenus();
              }}
              className="group flex min-h-[88px] flex-col items-start justify-between rounded-[20px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-3 text-left transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)] active:translate-y-px"
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--app-border)] ${surface} ${tone}`}>
                <Icon size={16} />
              </span>
              <span className="block min-w-0">
                <span className="block truncate text-[12px] font-semibold text-[var(--app-text-primary)]">{label}</span>
                <span className="mt-0.5 block truncate text-[10px] text-[var(--app-text-secondary)]">{desc}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {agentSettingBottomModules.map(({ key, label, desc, Icon, tone, surface }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                onOpenModule?.(key);
                closeMenus();
              }}
              className="group flex min-h-[88px] flex-col items-start justify-between rounded-[20px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-3 text-left transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)] active:translate-y-px"
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--app-border)] ${surface} ${tone}`}>
                <Icon size={16} />
              </span>
              <span className="block min-w-0">
                <span className="block truncate text-[12px] font-semibold text-[var(--app-text-primary)]">{label}</span>
                <span className="mt-0.5 block truncate text-[10px] text-[var(--app-text-secondary)]">{desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderIoPanel = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-start">
        <div className="flex items-center gap-1 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-1">
          <button
            type="button"
            onClick={() => setIoPane("project")}
            className={`${compactTabClass} ${ioPane === "project" ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]" : "border-transparent text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"}`}
          >
            Files
          </button>
          <button
            type="button"
            onClick={() => setIoPane("guides")}
            className={`${compactTabClass} ${ioPane === "guides" ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]" : "border-transparent text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"}`}
          >
            Guides
          </button>
          <button
            type="button"
            onClick={() => setIoPane("export")}
            className={`${compactTabClass} ${ioPane === "export" ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]" : "border-transparent text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"}`}
          >
            Export
          </button>
        </div>
      </div>

      {ioActions.length > 0 && (
        <div className="rounded-[22px] app-card overflow-hidden divide-y divide-white/8">
          {ioActions.map((item) => {
            const disabled = !item.onClick;
            return (
              <button
                key={item.label}
                onClick={() => {
                  if (item.onClick) item.onClick();
                  closeMenus();
                }}
                disabled={disabled}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${disabled
                    ? "bg-transparent text-[var(--app-text-muted)] cursor-not-allowed"
                    : "hover:bg-[var(--app-panel-muted)] text-[var(--app-text-primary)]"
                  }`}
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-[var(--app-border)]"
                  style={{ background: disabled ? "rgba(255,255,255,0.06)" : item.color }}
                >
                  <item.Icon size={16} className={disabled ? "text-[var(--app-text-secondary)]" : "text-black"} />
                </span>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{item.label}</div>
                  <div className="text-[11px] text-[var(--app-text-secondary)]">{item.desc}</div>
                </div>
                <ChevronRight size={14} className="text-[var(--app-text-muted)]" />
              </button>
            );
          })}
        </div>
      )}

      {ioPane === "project" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              onImport();
              closeMenus();
            }}
            className={docButtonClass}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--app-border)] bg-sky-500/10 text-sky-300">
                <SquareStack size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold text-[var(--app-text-primary)]">Node</span>
                <span className="mt-0.5 block text-[10px] text-[var(--app-text-secondary)]">节点快照</span>
              </span>
            </div>
          </button>
          <input
            ref={scriptInputRef}
            type="file"
            accept=".txt"
            className="hidden"
            onChange={(e) => handleAssetFileChange(e, "script")}
          />
          <button type="button" onClick={() => scriptInputRef.current?.click()} disabled={!onAssetLoad} className={docButtonClass}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--app-border)] bg-blue-500/10 text-blue-300">
                <FileText size={16} />
              </span>
              <span>
                <span className="block text-[12px] font-semibold text-[var(--app-text-primary)]">剧本</span>
                <span className="mt-0.5 block text-[10px] text-[var(--app-text-secondary)]">文本脚本</span>
              </span>
            </div>
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleAssetFileChange(e, "csvShots")}
          />
          <button type="button" onClick={() => csvInputRef.current?.click()} disabled={!onAssetLoad} className={docButtonClass}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--app-border)] bg-emerald-500/10 text-emerald-300">
                <List size={16} />
              </span>
              <span>
                <span className="block text-[12px] font-semibold text-[var(--app-text-primary)]">Shots CSV</span>
                <span className="mt-0.5 block text-[10px] text-[var(--app-text-secondary)]">镜头表</span>
              </span>
            </div>
          </button>
          <input
            ref={understandingInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => handleAssetFileChange(e, "understandingJson")}
          />
          <button type="button" onClick={() => understandingInputRef.current?.click()} disabled={!onAssetLoad} className={docButtonClass}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--app-border)] bg-amber-500/10 text-amber-300">
                <BookOpen size={16} />
              </span>
              <span>
                <span className="block text-[12px] font-semibold text-[var(--app-text-primary)]">Knowledge</span>
                <span className="mt-0.5 block text-[10px] text-[var(--app-text-secondary)]">知识快照</span>
              </span>
            </div>
          </button>
        </div>
      )}

      {ioPane === "guides" && (
        <div className="grid grid-cols-2 gap-2">
          <input
            ref={globalStyleInputRef}
            type="file"
            accept=".md,.txt"
            className="hidden"
            onChange={(e) => handleAssetFileChange(e, "globalStyleGuide")}
          />
          <button type="button" onClick={() => globalStyleInputRef.current?.click()} disabled={!onAssetLoad} className={docButtonClass}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--app-border)] bg-stone-500/10 text-stone-300">
                <Palette size={16} />
              </span>
              <span>
                <span className="block text-[12px] font-semibold text-[var(--app-text-primary)]">Style</span>
                <span className="mt-0.5 block text-[10px] text-[var(--app-text-secondary)]">风格说明</span>
              </span>
            </div>
          </button>
          <input
            ref={shotGuideInputRef}
            type="file"
            accept=".md,.txt"
            className="hidden"
            onChange={(e) => handleAssetFileChange(e, "shotGuide")}
          />
          <button type="button" onClick={() => shotGuideInputRef.current?.click()} disabled={!onAssetLoad} className={docButtonClass}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--app-border)] bg-yellow-500/10 text-yellow-300">
                <FileCode size={16} />
              </span>
              <span>
                <span className="block text-[12px] font-semibold text-[var(--app-text-primary)]">Shot</span>
                <span className="mt-0.5 block text-[10px] text-[var(--app-text-secondary)]">镜头提示词</span>
              </span>
            </div>
          </button>
          <input
            ref={soraGuideInputRef}
            type="file"
            accept=".md,.txt"
            className="hidden"
            onChange={(e) => handleAssetFileChange(e, "soraGuide")}
          />
          <button type="button" onClick={() => soraGuideInputRef.current?.click()} disabled={!onAssetLoad} className={docButtonClass}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--app-border)] bg-rose-500/10 text-rose-300">
                <Sparkles size={16} />
              </span>
              <span>
                <span className="block text-[12px] font-semibold text-[var(--app-text-primary)]">Sora</span>
                <span className="mt-0.5 block text-[10px] text-[var(--app-text-secondary)]">视频说明</span>
              </span>
            </div>
          </button>
          <input
            ref={storyboardGuideInputRef}
            type="file"
            accept=".md,.txt"
            className="hidden"
            onChange={(e) => handleAssetFileChange(e, "storyboardGuide")}
          />
          <button type="button" onClick={() => storyboardGuideInputRef.current?.click()} disabled={!onAssetLoad} className={docButtonClass}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--app-border)] bg-orange-500/10 text-orange-300">
                <ImageIcon size={16} />
              </span>
              <span>
                <span className="block text-[12px] font-semibold text-[var(--app-text-primary)]">Storyboard</span>
                <span className="mt-0.5 block text-[10px] text-[var(--app-text-secondary)]">分镜提示词</span>
              </span>
            </div>
          </button>
          <input
            ref={dramaGuideInputRef}
            type="file"
            accept=".md,.txt"
            className="hidden"
            onChange={(e) => handleAssetFileChange(e, "dramaGuide")}
          />
          <button type="button" onClick={() => dramaGuideInputRef.current?.click()} disabled={!onAssetLoad} className={docButtonClass}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--app-border)] bg-indigo-500/10 text-indigo-300">
                <FileCode size={16} />
              </span>
              <span>
                <span className="block text-[12px] font-semibold text-[var(--app-text-primary)]">Drama</span>
                <span className="mt-0.5 block text-[10px] text-[var(--app-text-secondary)]">剧情说明</span>
              </span>
            </div>
          </button>
        </div>
      )}

      {ioPane === "export" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              onExport();
              closeMenus();
            }}
            className={docButtonClass}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--app-border)] bg-emerald-500/10 text-emerald-300">
                <Share size={16} />
              </span>
              <span>
                <span className="block text-[12px] font-semibold text-[var(--app-text-primary)]">Node</span>
                <span className="mt-0.5 block text-[10px] text-[var(--app-text-secondary)]">节点快照</span>
              </span>
            </div>
          </button>
          {onExportCsv && (
            <button
              onClick={() => {
                onExportCsv();
                closeMenus();
              }}
              className={docButtonClass}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--app-border)] bg-sky-500/10 text-sky-300">
                  <List size={16} />
                </span>
                <span>
                  <span className="block text-[12px] font-semibold text-[var(--app-text-primary)]">Shots</span>
                  <span className="mt-0.5 block text-[10px] text-[var(--app-text-secondary)]">镜头表</span>
                </span>
              </div>
            </button>
          )}
          {onExportUnderstandingJson && (
            <button
              onClick={() => {
                onExportUnderstandingJson();
                closeMenus();
              }}
              className={docButtonClass}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--app-border)] bg-amber-500/10 text-amber-300">
                  <FileText size={16} />
                </span>
                <span>
                  <span className="block text-[12px] font-semibold text-[var(--app-text-primary)]">Knowledge</span>
                  <span className="mt-0.5 block text-[10px] text-[var(--app-text-secondary)]">知识快照</span>
                </span>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );


  return (
    <div className={rootClass}>
      {typeof document !== "undefined" && (showPalette || showFileMenu || showTemplate)
        ? createPortal(<div className="fixed inset-0 z-[58]" onClick={closeMenus} />, document.body)
        : null}

      <div className="relative z-20 flex justify-center">
        {/* Template Menu */}
        {typeof document !== "undefined" && showTemplate ? (
          createPortal(
            <div
              ref={templatePanelRef}
              className={`fixed z-[59] animate-in fade-in duration-200 ${panelClass}`}
              style={{ ...panelStyle, ...templatePopoverStyle }}
            >
              <div className="max-h-[min(72vh,620px)] space-y-4 overflow-y-auto p-4">
                {renderIoPanel()}
              </div>
            </div>,
            document.body
          )
        ) : null}

        {/* Plus Palette */}
        {typeof document !== "undefined" && showPalette ? (
          createPortal(
            <div
            ref={palettePanelRef}
            className={`fixed z-[59] animate-in fade-in duration-200 ${panelClass}`}
            style={{ ...panelStyle, ...palettePopoverStyle }}
          >
              <div className="max-h-[min(58vh,520px)] space-y-3 overflow-y-auto p-3">
              <div className="flex items-start justify-between gap-3 px-1">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-[var(--app-text-secondary)]">Add Nodes</div>
                  <div className="mt-1 max-w-[34ch] text-[11px] leading-5 text-[var(--app-text-secondary)]">
                    {nodePaletteMode === "knowledge"
                      ? "浏览项目面板类节点，并进入 Knowledge 长期记忆层调试入口。"
                      : "浏览 flow 节点，搭建输入、生成和引用链路。"}
                  </div>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-1">
                  <button
                    type="button"
                    onClick={() => setNodePaletteMode("knowledge")}
                    className={`${compactTabClass} ${
                      nodePaletteMode === "knowledge"
                        ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]"
                        : "border-transparent text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
                    }`}
                  >
                    Knowledge
                  </button>
                  <button
                    type="button"
                    onClick={() => setNodePaletteMode("workflow")}
                    className={`${compactTabClass} ${
                      nodePaletteMode === "workflow"
                        ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]"
                        : "border-transparent text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
                    }`}
                  >
                    Flow
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className={sectionEyebrowClass}>{nodePaletteMode === "knowledge" ? "Knowledge" : "Flow Nodes"}</div>
                  <div className="text-[10px] text-[var(--app-text-muted)]">
                    {nodePaletteMode === "knowledge" ? `${panelActions.length + knowledgeDebugActions.length} entries` : `${nodeActions.length} actions`}
                  </div>
                </div>
                {nodePaletteMode === "knowledge" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <div className={sectionEyebrowClass}>Panel Nodes</div>
                        <div className="text-[10px] text-[var(--app-text-muted)]">{panelActions.length} custom types</div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        {panelActions.map(({ label, hint, meta, onClick, Icon, tone, surface }) => (
                          <button
                            key={label}
                            onClick={() => {
                              onClick();
                              closeMenus();
                            }}
                            className="group/node relative overflow-hidden rounded-[18px] border border-[var(--app-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent)] px-3 py-3 text-left transition-all hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)]"
                          >
                            <div className={`flex h-9 w-9 items-center justify-center rounded-[13px] border border-[var(--app-border)] ${surface} ${tone}`}>
                              <Icon size={16} />
                            </div>
                            <div className="mt-2.5">
                              <div className="text-[13px] font-semibold tracking-[-0.02em] text-[var(--app-text-primary)]">{label}</div>
                              <div className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-[var(--app-text-secondary)]">{hint}</div>
                            </div>
                            <div className="mt-2.5">
                              <span className="inline-flex rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
                                {meta}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <div className={sectionEyebrowClass}>Knowledge Debug</div>
                        <div className="text-[10px] text-[var(--app-text-muted)]">{knowledgeDebugActions.length} entry</div>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {knowledgeDebugActions.map(({ label, hint, meta, onClick, Icon, tone, surface }) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => {
                              onClick?.();
                              closeMenus();
                            }}
                            className="group/node relative overflow-hidden rounded-[18px] border border-[var(--app-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent)] px-3 py-3 text-left transition-all hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)]"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className={`flex h-9 w-9 items-center justify-center rounded-[13px] border border-[var(--app-border)] ${surface} ${tone}`}>
                                  <Icon size={16} />
                                </div>
                                <div className="mt-2.5">
                                  <div className="text-[13px] font-semibold tracking-[-0.02em] text-[var(--app-text-primary)]">{label}</div>
                                  <div className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-[var(--app-text-secondary)]">{hint}</div>
                                </div>
                              </div>
                              <ChevronRight size={14} className="mt-1 shrink-0 text-[var(--app-text-muted)] transition-transform group-hover/node:translate-x-0.5" />
                            </div>
                            <div className="mt-2.5">
                              <span className="inline-flex rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
                                {meta}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    {nodeActions.map(({ label, hint, meta, onClick, Icon, tone, surface }) => (
                      <button
                        key={label}
                        onClick={() => {
                          onClick();
                          closeMenus();
                        }}
                        className="group/node relative overflow-hidden rounded-[18px] border border-[var(--app-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent)] px-3 py-2.5 text-left transition-all hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)]"
                      >
                        <div className={`flex h-8 w-8 items-center justify-center rounded-[12px] border border-[var(--app-border)] ${surface} ${tone}`}>
                          <Icon size={15} />
                        </div>
                        <div className="mt-2 min-w-0">
                          <div className="truncate text-[12px] font-semibold tracking-[-0.02em] text-[var(--app-text-primary)]">{label}</div>
                          <div className="mt-0.5 line-clamp-1 text-[10px] leading-4 text-[var(--app-text-secondary)]">{hint}</div>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between">
                          <span className="inline-flex rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--app-text-muted)]">
                            {meta}
                          </span>
                          <ChevronRight size={13} className="text-[var(--app-text-muted)] transition-transform group-hover/node:translate-x-0.5" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              </div>
            </div>,
            document.body
          )
        ) : null}

        {/* File Menu */}
        {typeof document !== "undefined" && showFileMenu ? (
          createPortal(
            <div
            ref={fileMenuPanelRef}
            className={`fixed z-[59] animate-in fade-in duration-200 overflow-hidden ${panelClass}`}
            style={{ ...panelStyle, ...fileMenuPopoverStyle }}
          >
            <div className="max-h-[min(74vh,640px)] space-y-4 overflow-y-auto p-4">
              <div className="space-y-3">
                {!accountLoaded ? (
                  <div className="flex items-center gap-3 animate-pulse">
                    <div className="h-14 w-14 rounded-[18px] bg-[var(--app-panel-soft)]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-32 rounded-full bg-[var(--app-panel-soft)]" />
                      <div className="h-3 w-24 rounded-full bg-[var(--app-panel-muted)]" />
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="h-[60px] rounded-[18px] bg-[var(--app-panel-soft)]" />
                        <div className="h-[60px] rounded-[18px] bg-[var(--app-panel-muted)]" />
                      </div>
                    </div>
                  </div>
                ) : accountSignedIn ? (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3.5">
                        {accountInfo?.avatarUrl ? (
                        <img
                          src={accountInfo.avatarUrl}
                          alt="Avatar"
                          className="h-14 w-14 rounded-[18px] object-cover border border-[var(--app-border)]"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] text-[var(--app-text-secondary)]">
                          <User size={18} />
                        </div>
                      )}
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--app-text-primary)]">{accountName}</div>
                            {accountEmail && <div className="truncate text-[12px] leading-6 text-[var(--app-text-secondary)]">{accountEmail}</div>}
                            <div className="flex flex-wrap gap-2 pt-1">
                          {["Agent setting", "Account state", "Theme settings"].map((chip) => (
                                <span
                                  key={chip}
                                  className="rounded-full border border-[var(--app-border)] bg-[rgba(255,255,255,0.04)] px-2 py-1 text-[10px] text-[var(--app-text-secondary)]"
                            >
                              {chip}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {handleUploadAvatar ? (
                        <button
                          type="button"
                          className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-4 text-[12px] font-semibold text-[var(--app-text-primary)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)] active:translate-y-px"
                          onClick={() => {
                            handleUploadAvatar();
                            closeMenus();
                          }}
                        >
                          Avatar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-4 text-[12px] font-semibold text-[var(--app-text-primary)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)] active:translate-y-px"
                        onClick={() => {
                          handleSignOut?.();
                          closeMenus();
                        }}
                      >
                        Sign Out
                      </button>
                    </div>
                    <div className="border-t border-[var(--app-border)] pt-3">
                      {renderAgentSettingModules()}
                    </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                    <div className="flex items-start gap-3.5">
                      <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-dashed border-[var(--app-border-strong)] bg-[var(--app-panel-muted)] text-[var(--app-text-secondary)]">
                        <User size={18} />
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <div className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--app-text-primary)]">未登录</div>
                        <div className="text-[12px] leading-6 text-[var(--app-text-secondary)]">登录后可启用 workspace 同步能力、主题偏好与项目管理。</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className={`${utilityButtonClass} border-transparent bg-[linear-gradient(180deg,rgba(122,183,160,0.18),rgba(122,183,160,0.08))] hover:border-[var(--app-border-strong)]`}
                        onClick={() => {
                          accountInfo?.onSignIn?.();
                          closeMenus();
                        }}
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-white/10 bg-white/10 text-[#d9efe5]">
                          <User size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] font-semibold text-[var(--app-text-primary)]">Sign in</span>
                          <span className="mt-0.5 block text-[10px] text-[var(--app-text-secondary)]">登录并启用同步</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={utilityButtonClass}
                        onClick={() => {
                          onOpenStats?.();
                          closeMenus();
                        }}
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-[var(--app-border)] bg-sky-500/10 text-sky-300">
                          <BarChart2 size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] font-semibold text-[var(--app-text-primary)]">Agent Setting</span>
                          <span className="mt-0.5 block text-[10px] text-[var(--app-text-secondary)]">查看 agent 设置与 dashboard</span>
                        </span>
                      </button>
                      <div className="flex items-center gap-2 rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-3 text-[10px] text-[var(--app-text-secondary)]">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-300" />
                        Account / Theme / Agent Setting
                      </div>
                    </div>
                    <div className="border-t border-[var(--app-border)] pt-3">
                      {renderAgentSettingModules()}
                    </div>
                  </div>
                )}
              </div>
              </div>
            </div>,
            document.body
          )
        ) : null}

        {/* Main Bar */}
        {isEmbedded ? (
          <div className="w-full">
            <div className="flex flex-wrap items-center gap-2">
              <button
                ref={accountButtonRef}
                data-account-trigger
                onClick={(event) => {
                  setAccountAnchorRect(event.currentTarget.getBoundingClientRect());
                  setShowFileMenu((v) => !v);
                  setShowPalette(false);
                  setShowTemplate(false);
                  setShowWip(false);
                }}
                className={`${toolbarChipClass} ${showFileMenu ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]" : ""}`}
                title="Account"
              >
                <User size={13} />
                <span>Account</span>
              </button>

              <button
                ref={projectButtonRef}
                data-project-trigger
                onClick={(event) => {
                  setProjectAnchorRect(event.currentTarget.getBoundingClientRect());
                  setShowTemplate((v) => !v);
                  setShowPalette(false);
                  setShowFileMenu(false);
                  setShowWip(false);
                }}
                className={`${toolbarChipClass} ${showTemplate ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]" : ""}`}
                title="Project"
              >
                <SquareStack size={13} />
                <span>Project</span>
              </button>

              <button
                ref={workflowButtonRef}
                onClick={() => {
                  setShowPalette(false);
                  setShowTemplate(false);
                  setShowFileMenu(false);
                  const rect = workflowButtonRef.current?.getBoundingClientRect();
                  onToggleWorkflow?.(rect);
                }}
                data-workflow-trigger
                className={toolbarChipClass}
                title="Workflow Actions"
              >
                <Layers size={13} />
                <span>Workflow</span>
              </button>

              <button
                ref={nodesButtonRef}
                data-nodes-trigger
                onClick={(event) => {
                  setNodesAnchorRect(event.currentTarget.getBoundingClientRect());
                  setShowPalette((v) => !v);
                  setShowFileMenu(false);
                  setShowTemplate(false);
                  setShowWip(false);
                }}
                className={`${toolbarChipClass} ${showPalette ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]" : ""}`}
                title="Nodes"
              >
                <Plus size={13} className={`transition-transform ${showPalette ? "rotate-45" : ""}`} />
                <span>Nodes</span>
              </button>
              <button
                onClick={(event) => {
                  setShowPalette(false);
                  setShowTemplate(false);
                  setShowFileMenu(false);
                  setShowWip(false);
                  onOpenTheme?.(event.currentTarget.getBoundingClientRect());
                  onToggleTheme?.();
                }}
                data-theme-trigger
                className={toolbarChipClass}
                title={syncIndicator?.label || "Theme"}
              >
                <Palette size={13} />
                <span>Theme</span>
                {syncIndicator ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: syncIndicator.color }}
                  />
                ) : null}
              </button>

            </div>
          </div>
        ) : (
          <div
            className="w-[min(500px,calc(100vw-96px))] rounded-[28px] border border-[var(--app-border)] bg-[linear-gradient(180deg,var(--app-panel-strong),var(--app-panel))] p-3 shadow-[0_20px_38px_-28px_rgba(0,0,0,0.28)] backdrop-blur-xl"
            style={{ boxShadow: "var(--app-shadow)" }}
          >
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              <button
                ref={accountButtonRef}
                data-account-trigger
                onClick={(event) => {
                  setAccountAnchorRect(event.currentTarget.getBoundingClientRect());
                  setShowFileMenu((v) => !v);
                  setShowPalette(false);
                  setShowTemplate(false);
                  setShowWip(false);
                }}
                className={`${embeddedLabelClass} ${showFileMenu ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]" : ""}`}
                title="Account"
              >
                <User size={13} />
                <span>Account</span>
              </button>

              <button
                ref={projectButtonRef}
                data-project-trigger
                onClick={(event) => {
                  setProjectAnchorRect(event.currentTarget.getBoundingClientRect());
                  setShowTemplate((v) => !v);
                  setShowPalette(false);
                  setShowFileMenu(false);
                  setShowWip(false);
                }}
                className={`${embeddedLabelClass} ${showTemplate ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]" : ""}`}
                title="Project"
              >
                <SquareStack size={13} />
                <span>Project</span>
              </button>
              <button
                onClick={() => {
                  setShowPalette(false);
                  setShowTemplate(false);
                  setShowFileMenu(false);
                  const rect = workflowButtonRef.current?.getBoundingClientRect();
                  onToggleWorkflow?.(rect);
                }}
                ref={workflowButtonRef}
                data-workflow-trigger
                className={embeddedLabelClass}
                title="Workflow Actions"
              >
                <Layers size={13} />
                <span>Workflow</span>
              </button>

              <button
                ref={nodesButtonRef}
                data-nodes-trigger
                onClick={(event) => {
                  setNodesAnchorRect(event.currentTarget.getBoundingClientRect());
                  setShowPalette((v) => !v);
                  setShowFileMenu(false);
                  setShowTemplate(false);
                  setShowWip(false);
                }}
                className={`${embeddedLabelClass} ${showPalette ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]" : ""}`}
                title="Nodes"
              >
                <Plus size={13} className={`transition-transform ${showPalette ? "rotate-45" : ""}`} />
                <span>Nodes</span>
              </button>
              <button
                onClick={(event) => {
                  setShowPalette(false);
                  setShowTemplate(false);
                  setShowFileMenu(false);
                  setShowWip(false);
                  onOpenTheme?.(event.currentTarget.getBoundingClientRect());
                  onToggleTheme?.();
                }}
                data-theme-trigger
                className={embeddedLabelClass}
                title={syncIndicator?.label || "Theme"}
              >
                <Palette size={13} />
                <span>Theme</span>
                {syncIndicator ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: syncIndicator.color }}
                  />
                ) : null}
              </button>

            </div>

            <button
              type="button"
              onClick={onOpenQalam}
              className="group flex min-h-[72px] w-full items-center gap-3 rounded-[22px] border border-[var(--app-border)] bg-[linear-gradient(180deg,var(--app-panel),var(--app-panel-soft))] px-4 py-3 text-left transition hover:border-[var(--app-border-strong)] hover:bg-[linear-gradient(180deg,var(--app-panel-strong),var(--app-panel-soft))] active:translate-y-px"
              title="Open Qalam"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[var(--app-border)] bg-[var(--app-panel-strong)] text-[var(--app-accent-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <MessageSquare size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
                  Qalam
                </div>
                <div className="mt-1 text-[13px] font-medium tracking-[-0.01em] text-[var(--app-text-primary)]">
                  Ask, revise, or build on the canvas
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="block h-1.5 w-14 rounded-full bg-[var(--app-accent-soft)]" />
                  <span className="block h-1.5 w-9 rounded-full bg-[var(--app-panel-muted)]" />
                  <span className="block h-1.5 w-6 rounded-full bg-[var(--app-panel-muted)]" />
                </div>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--app-border)] bg-[var(--app-panel-strong)] text-[var(--app-text-secondary)] transition group-hover:text-[var(--app-text-primary)]">
                <ChevronRight size={15} />
              </div>
            </button>
          </div>
        )}

        {/* WIP popover */}
        {showWip && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 md:px-8"
            onClick={() => setShowWip(false)}
          >
            <div
              className={`w-[92vw] max-w-5xl min-h-[70vh] ${panelClass}`}
              style={panelStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--app-border)] bg-[var(--app-panel-muted)]">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-500/12 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                    <Projector size={22} />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-[var(--app-text-primary)]">放映机 · 施工中</div>
                    <div className="text-[12px] text-[var(--app-text-secondary)]">高级视图 / 回放 / 管理模块将很快上线。</div>
                  </div>
                </div>
                <button
                  className="h-9 px-3 rounded-full border border-[var(--app-border)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-muted)] text-[12px]"
                  onClick={() => setShowWip(false)}
                >
                  关闭
                </button>
              </div>

              <div className="px-6 py-6 space-y-4 text-[13px] text-[var(--app-text-secondary)] leading-relaxed">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { title: "时间线 / 回放", desc: "查看生成历史、关键帧、回放并做版本对比。" },
                    { title: "资产管理", desc: "集中管理视频、图像与提示词，支持收藏与分发。" },
                    { title: "协同与审核", desc: "共享到团队、批注审阅、版本冻结与解冻。" },
                    { title: "发布与导出", desc: "支持多规格导出、CDN 发布与外链访问。" },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-4 py-3 hover:border-[var(--app-border-strong)] transition-all"
                    >
                      <div className="text-sm font-semibold text-[var(--app-text-primary)]">{item.title}</div>
                      <div className="text-[12px] text-[var(--app-text-secondary)] mt-1">{item.desc}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-4">
                  <div className="flex items-center gap-2 text-[var(--app-text-primary)] font-semibold mb-2">
                    <Sparkles size={16} className="text-emerald-300" />
                    体验即将解锁
                  </div>
                  <div className="text-[12px] text-[var(--app-text-secondary)]">
                    放映机将整合节点生成的全链路资产，支持分镜回放、剪辑草稿、版本分支与一键发布。
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
