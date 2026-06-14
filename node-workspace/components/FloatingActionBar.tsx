import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  User,
  MessageSquare,
  Image as ImageIcon,
  Sparkles,
  Video,
  SquareStack,
  Library,
  ChevronRight,
  Layers,
  FileText,
  Trash2,
  LogOut,
  Upload,
  Share,
} from "lucide-react";

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
  onRun: () => void;
  floating?: boolean;
  syncIndicator?: { label: string; color: string } | null;
  onResetProject?: () => void;
  onSignOut?: () => void;
  accountInfo?: AccountInfo;
  onOpenQalam?: () => void;
  variant?: "dock" | "embedded";
  onAssetLoad?: (type: "script", content: string, fileName?: string) => void;
  showGlobalAccountTrigger?: boolean;
  showToolbar?: boolean;
  accountThemeControls?: React.ReactNode;
};

export const FloatingActionBar: React.FC<Props> = ({
  onAddText,
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
  onRun,
  floating = true,
  syncIndicator,
  onResetProject,
  onSignOut,
  accountInfo,
  onOpenQalam,
  variant = "dock",
  onAssetLoad,
  showGlobalAccountTrigger = false,
  showToolbar = true,
  accountThemeControls,
}) => {
  const isEmbedded = variant === "embedded";
  const [showPalette, setShowPalette] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [ioPane, setIoPane] = useState<"project" | "export">("project");
  const [nodePaletteMode, setNodePaletteMode] = useState<"panels" | "workflow">("workflow");
  const scriptInputRef = useRef<HTMLInputElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const nodesButtonRef = useRef<HTMLButtonElement>(null);
  const fileMenuPanelRef = useRef<HTMLDivElement>(null);
  const palettePanelRef = useRef<HTMLDivElement>(null);
  const [accountAnchorRect, setAccountAnchorRect] = useState<DOMRect | null>(null);
  const [nodesAnchorRect, setNodesAnchorRect] = useState<DOMRect | null>(null);
  const rootClass = !showToolbar
    ? "contents"
    : isEmbedded
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
  const globalAccountButtonClass =
    "group inline-flex h-11 items-center gap-2 rounded-full border border-[var(--app-border)] bg-[linear-gradient(180deg,var(--app-panel-strong),var(--app-panel))] px-2.5 pr-3 text-[11px] font-semibold text-[var(--app-text-secondary)] shadow-[0_14px_34px_-20px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition duration-200 hover:border-[var(--app-border-strong)] hover:bg-[linear-gradient(180deg,var(--app-panel-strong),var(--app-panel-soft))] hover:text-[var(--app-text-primary)] active:translate-y-px";
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
    if (anchorRect.top < window.innerHeight / 2) {
      return {
        position: "fixed",
        left,
        top: Math.min(anchorRect.bottom + gap, window.innerHeight - viewportPadding),
        width,
        maxWidth: `calc(100vw - ${viewportPadding * 2}px)`,
      };
    }
    const bottom = Math.max(16, window.innerHeight - anchorRect.top + gap);
    return {
      position: "fixed",
      left,
      bottom,
      width,
      maxWidth: `calc(100vw - ${viewportPadding * 2}px)`,
    };
  };
  const palettePopoverStyle = useMemo(() => getPopoverStyle(nodesAnchorRect, 580), [nodesAnchorRect]);
  const fileMenuPopoverStyle = useMemo(() => getPopoverStyle(accountAnchorRect, 420), [accountAnchorRect]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!showFileMenu && !showPalette) return undefined;

    const updateAnchors = () => {
      if (showFileMenu && accountButtonRef.current) {
        setAccountAnchorRect(accountButtonRef.current.getBoundingClientRect());
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
  }, [showFileMenu, showPalette]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (!showFileMenu && !showPalette) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      const insideOpenPanel =
        (showFileMenu && fileMenuPanelRef.current?.contains(target)) ||
        (showPalette && palettePanelRef.current?.contains(target));

      if (insideOpenPanel) return;

      const insideTrigger =
        accountButtonRef.current?.contains(target) ||
        nodesButtonRef.current?.contains(target);

      if (insideTrigger) return;
      closeMenus();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [showFileMenu, showPalette]);

  const panelActions = [
    { label: "身份卡片", hint: "角色 / 场景与定妆照槽位", meta: "Library", onClick: onAddIdentityCard, Icon: Layers, tone: "text-emerald-300", surface: "bg-emerald-500/12" },
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
  const accountLoaded = accountInfo?.isLoaded ?? true;
  const accountSignedIn = accountLoaded && !!accountInfo?.isSignedIn;
  const accountName = accountInfo?.name || accountInfo?.email || "Qalam User";
  const accountEmail = accountInfo?.email || accountInfo?.name || "登录以启用同步和项目管理";
  const handleSignOut = accountInfo?.onSignOut || onSignOut;
  const handleUploadAvatar = accountInfo?.onUploadAvatar;
  const closeMenus = () => {
    setShowPalette(false);
    setShowFileMenu(false);
  };

  const handleAssetFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    type: "script"
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
        </div>
      )}
    </div>
  );


  return (
    <div className={rootClass}>
      {typeof document !== "undefined" && (showPalette || showFileMenu)
        ? createPortal(<div className="fixed inset-0 z-[58]" onClick={closeMenus} />, document.body)
        : null}

      <div className="relative z-20 flex justify-center">
        {showGlobalAccountTrigger ? (
          <div className="pointer-events-none fixed right-4 top-4 z-[60]">
            <button
              ref={accountButtonRef}
              data-account-trigger
              type="button"
              onClick={(event) => {
                setAccountAnchorRect(event.currentTarget.getBoundingClientRect());
                setShowFileMenu((v) => !v);
                setShowPalette(false);
              }}
              className={`${globalAccountButtonClass} pointer-events-auto ${showFileMenu ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]" : ""}`}
              title="Account"
            >
              {accountInfo?.avatarUrl ? (
                <img
                  src={accountInfo.avatarUrl}
                  alt={accountName}
                  className="h-7 w-7 rounded-full border border-[var(--app-border)] object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] text-[var(--app-text-secondary)]">
                  <User size={14} />
                </span>
              )}
              <span className="max-w-[10rem] truncate">{accountSignedIn ? accountName : "Account"}</span>
              {syncIndicator ? (
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: syncIndicator.color }} />
              ) : null}
            </button>
          </div>
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
                    {nodePaletteMode === "panels"
                      ? "浏览项目面板类节点，组织角色与档案资产。"
                      : "浏览 flow 节点，搭建输入、生成和引用链路。"}
                  </div>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-1">
                  <button
                    type="button"
                    onClick={() => setNodePaletteMode("panels")}
                    className={`${compactTabClass} ${
                      nodePaletteMode === "panels"
                        ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]"
                        : "border-transparent text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
                    }`}
                  >
                    Panels
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
                  <div className={sectionEyebrowClass}>{nodePaletteMode === "panels" ? "Panel Nodes" : "Flow Nodes"}</div>
                  <div className="text-[10px] text-[var(--app-text-muted)]">
                    {nodePaletteMode === "panels" ? `${panelActions.length} entries` : `${nodeActions.length} actions`}
                  </div>
                </div>
                {nodePaletteMode === "panels" ? (
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
                          {["Global account", "Workspace"].map((chip) => (
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
                    {accountThemeControls ? (
                      <div className="rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-2">
                        {accountThemeControls}
                      </div>
                    ) : null}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {handleUploadAvatar ? (
                        <button
                          type="button"
                          className={utilityButtonClass}
                          onClick={() => {
                            handleUploadAvatar();
                            closeMenus();
                          }}
                        >
                          <span className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]">
                            <Upload size={16} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12px] font-semibold text-[var(--app-text-primary)]">Avatar</span>
                            <span className="mt-0.5 block text-[10px] text-[var(--app-text-secondary)]">上传账户头像</span>
                          </span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={utilityButtonClass}
                        onClick={() => {
                          handleSignOut?.();
                          closeMenus();
                        }}
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]">
                          <LogOut size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] font-semibold text-[var(--app-text-primary)]">Sign Out</span>
                          <span className="mt-0.5 block text-[10px] text-[var(--app-text-secondary)]">退出当前账户</span>
                        </span>
                      </button>
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
                    <div className="grid grid-cols-1 gap-2">
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
                      {accountThemeControls ? (
                        <div className="rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-2">
                          {accountThemeControls}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-3 border-t border-[var(--app-border)] pt-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--app-text-secondary)]">
                    Project Files
                  </div>
                  <div className="mt-1 text-[11px] leading-5 text-[var(--app-text-secondary)]">
                    导入或导出 Flow 项目快照与剧本文本。
                  </div>
                </div>
                {renderIoPanel()}
              </div>
              </div>
            </div>,
            document.body
          )
        ) : null}

        {/* Main Bar */}
        {showToolbar ? (isEmbedded ? (
          <div className="w-full">
            <div className="flex flex-wrap items-center gap-2">
              <button
                ref={nodesButtonRef}
                data-nodes-trigger
                onClick={(event) => {
                  setNodesAnchorRect(event.currentTarget.getBoundingClientRect());
                  setShowPalette((v) => !v);
                  setShowFileMenu(false);
                }}
                className={`${toolbarChipClass} ${showPalette ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]" : ""}`}
                title="Nodes"
              >
                <Plus size={13} className={`transition-transform ${showPalette ? "rotate-45" : ""}`} />
                <span>Nodes</span>
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
                ref={nodesButtonRef}
                data-nodes-trigger
                onClick={(event) => {
                  setNodesAnchorRect(event.currentTarget.getBoundingClientRect());
                  setShowPalette((v) => !v);
                  setShowFileMenu(false);
                }}
                className={`${embeddedLabelClass} ${showPalette ? "border-[var(--app-border-strong)] bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]" : ""}`}
                title="Nodes"
              >
                <Plus size={13} className={`transition-transform ${showPalette ? "rotate-45" : ""}`} />
                <span>Nodes</span>
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
        )) : null}

      </div>
    </div>
  );
};
