import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  Check,
  Crosshair,
  Cube,
  Export,
  FilmSlate,
  GridFour,
  ImageSquare,
  Pause,
  Play,
  Plus,
  Trash,
  User,
  VideoCamera,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type {
  CineworActorKeyframe,
  CineworActorTrack,
  CineworCameraShot,
  CineworSceneState,
  CineworVector3,
  CineworWorkspaceState,
  ProjectData,
  ProjectRoleIdentity,
} from "../../types";
import {
  createCineworWorkspace,
  getActiveCineworWorkspace,
  normalizeCineworWorkspace,
  withActiveCineworWorkspace,
} from "../../utils/cineworWorkspace";
import {
  CineworViewport,
  type CineworViewportHandle,
} from "./cinewor/CineworViewport";

type LabMode = "stage" | "actors" | "camera" | "delivery";
type AspectRatio = "16:9" | "2.39:1";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  projectData: ProjectData;
  setProjectData: React.Dispatch<React.SetStateAction<ProjectData>>;
};

const modes: Array<{ key: LabMode; label: string; icon: typeof Cube }> = [
  { key: "stage", label: "调度场", icon: Cube },
  { key: "actors", label: "角色轨迹", icon: User },
  { key: "camera", label: "镜头", icon: VideoCamera },
  { key: "delivery", label: "交付", icon: ImageSquare },
];

const inputClass = "h-9 w-full border-b border-[var(--app-border)] bg-transparent px-0 text-[13px] text-[var(--app-text-primary)] outline-none transition focus:border-[#758f89]";
const subtleButton = "inline-flex h-9 items-center justify-center gap-2 border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 text-[12px] font-medium text-[var(--app-text-secondary)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-soft)] hover:text-[var(--app-text-primary)] disabled:cursor-not-allowed disabled:opacity-40";
const primaryButton = "inline-flex h-9 items-center justify-center gap-2 bg-[#526e68] px-3 text-[12px] font-semibold text-white transition hover:bg-[#46615b] disabled:cursor-not-allowed disabled:opacity-40";

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const NumberField: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}> = ({ label, value, min = -3600, max = 3600, step = 0.1, suffix, onChange }) => (
  <label className="block min-w-0">
    <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--app-text-muted)]">{label}</span>
    <span className="flex items-center gap-2 border-b border-[var(--app-border)] focus-within:border-[#758f89]">
      <input
        type="number"
        value={Number.isInteger(value) ? value : Number(value.toFixed(2))}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(clamp(finite(event.target.value, value), min, max))}
        className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-[var(--app-text-primary)] outline-none"
      />
      {suffix ? <span className="text-[10px] text-[var(--app-text-muted)]">{suffix}</span> : null}
    </span>
  </label>
);

const VectorFields: React.FC<{
  label: string;
  value: CineworVector3;
  onChange: (value: CineworVector3) => void;
}> = ({ label, value, onChange }) => (
  <div>
    <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--app-text-muted)]">{label}</div>
    <div className="grid grid-cols-3 gap-3">
      {(["X", "Y", "Z"] as const).map((axis, index) => (
        <NumberField
          key={axis}
          label={axis}
          value={value[index]}
          onChange={(next) => onChange(value.map((item, itemIndex) => itemIndex === index ? next : item) as CineworVector3)}
        />
      ))}
    </div>
  </div>
);

const Section: React.FC<React.PropsWithChildren<{ title: string; detail?: string }>> = ({ title, detail, children }) => (
  <section className="border-b border-[var(--app-border)] px-5 py-5 last:border-b-0">
    <div className="mb-4">
      <h3 className="text-[13px] font-semibold text-[var(--app-text-primary)]">{title}</h3>
      {detail ? <p className="mt-1 text-[11px] leading-5 text-[var(--app-text-muted)]">{detail}</p> : null}
    </div>
    {children}
  </section>
);

const downloadDataUrl = (dataUrl: string, name: string) => {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = name;
  link.click();
};

const newActorFromRole = (role: ProjectRoleIdentity, index: number, duration: number): CineworActorTrack => ({
  id: uid("actor"),
  label: role.displayName || role.name,
  roleId: role.id,
  color: ["#91A6A0", "#A68F91", "#8D98AA", "#B29A75"][index % 4],
  trajectory: "linear",
  arcHeight: 1.2,
  keyframes: [
    { id: uid("state"), label: "入场", time: 0, position: [-2 + index, 0, 2], facing: 0, easing: "ease-in-out" },
    { id: uid("state"), label: "主状态", time: duration * 0.65, position: [index, 0, 0], facing: 20, easing: "ease-in-out" },
  ],
});

const createShot = (scene: CineworSceneState, time: number, pose?: ReturnType<CineworViewportHandle["captureCamera"]>): CineworCameraShot => ({
  id: uid("shot"),
  name: `机位 ${scene.shots.length + 1}`,
  time,
  position: pose?.position || [7, 4, 8],
  target: pose?.target || [0, 1.2, 0],
  fov: pose?.fov || 42,
  trajectory: "linear",
  arcHeight: 1.4,
});

export const CineworLab: React.FC<Props> = ({
  isOpen,
  onClose,
  projectData,
  setProjectData,
}) => {
  const initialWorkspace = useMemo(() => (
    normalizeCineworWorkspace(getActiveCineworWorkspace(projectData)) || createCineworWorkspace(projectData)
  ), [projectData.activeFlowProjectId]);
  const workspace = normalizeCineworWorkspace(getActiveCineworWorkspace(projectData)) || initialWorkspace;
  const [mode, setMode] = useState<LabMode>("stage");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedActorId, setSelectedActorId] = useState<string>();
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string>();
  const [selectedShotId, setSelectedShotId] = useState<string>();
  const [viewMode, setViewMode] = useState<"world" | "shot">("world");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("2.39:1");
  const [viewportState, setViewportState] = useState<"loading" | "ready" | "error">("loading");
  const [viewportError, setViewportError] = useState("");
  const viewportRef = useRef<CineworViewportHandle | null>(null);
  const initializedProjectRef = useRef<string | undefined>(undefined);

  const activeScene = workspace.scenes.find((scene) => scene.id === workspace.activeSceneId) || workspace.scenes[0];
  const selectedActor = activeScene?.actors.find((actor) => actor.id === selectedActorId);
  const selectedKeyframe = selectedActor?.keyframes.find((frame) => frame.id === selectedKeyframeId);
  const selectedShot = activeScene?.shots.find((shot) => shot.id === selectedShotId);
  const allProjectRoles = useMemo(() => {
    const activeProjectRoles = projectData.flowProjects?.find((project) => project.id === projectData.activeFlowProjectId)?.roles || [];
    return [...projectData.roles, ...activeProjectRoles].filter((role, index, roles) => (
      roles.findIndex((candidate) => candidate.id === role.id) === index
    ));
  }, [projectData.activeFlowProjectId, projectData.flowProjects, projectData.roles]);
  const availableRoles = allProjectRoles.filter((role) => (
    role.kind === "person" && role.status !== "archived" && !activeScene?.actors.some((actor) => actor.roleId === role.id)
  ));

  useEffect(() => {
    if (!isOpen) return;
    const projectId = projectData.activeFlowProjectId || projectData.flowProjects?.[0]?.id;
    if (!projectId || getActiveCineworWorkspace(projectData) || initializedProjectRef.current === projectId) return;
    initializedProjectRef.current = projectId;
    setProjectData((current) => withActiveCineworWorkspace(current, createCineworWorkspace(current)));
  }, [isOpen, projectData.activeFlowProjectId, projectData.flowProjects, setProjectData]);

  useEffect(() => {
    if (!activeScene) return;
    setTime((current) => Math.min(current, activeScene.duration));
    if (!activeScene.actors.some((actor) => actor.id === selectedActorId)) {
      setSelectedActorId(activeScene.actors[0]?.id);
      setSelectedKeyframeId(activeScene.actors[0]?.keyframes[0]?.id);
    }
    if (!activeScene.shots.some((shot) => shot.id === selectedShotId)) {
      setSelectedShotId(activeScene.shots[0]?.id);
    }
  }, [activeScene?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.code === "Space" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!playing || !activeScene) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = (now - previous) / 1000;
      previous = now;
      setTime((current) => {
        const next = current + delta * speed;
        if (next >= activeScene.duration) {
          setPlaying(false);
          return activeScene.duration;
        }
        return next;
      });
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [playing, speed, activeScene?.id, activeScene?.duration]);

  const commit = useCallback((update: (current: CineworWorkspaceState) => CineworWorkspaceState) => {
    setProjectData((currentProject) => {
      const currentWorkspace = normalizeCineworWorkspace(getActiveCineworWorkspace(currentProject)) || createCineworWorkspace(currentProject);
      return withActiveCineworWorkspace(currentProject, update(currentWorkspace));
    });
  }, [setProjectData]);

  const updateScene = useCallback((update: (scene: CineworSceneState) => CineworSceneState) => {
    commit((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => scene.id === current.activeSceneId
        ? { ...update(scene), updatedAt: Date.now() }
        : scene),
      updatedAt: Date.now(),
    }));
  }, [commit]);

  const updateActor = (actorId: string, update: (actor: CineworActorTrack) => CineworActorTrack) => {
    updateScene((scene) => ({
      ...scene,
      actors: scene.actors.map((actor) => actor.id === actorId ? update(actor) : actor),
    }));
  };

  const updateShot = (shotId: string, update: (shot: CineworCameraShot) => CineworCameraShot) => {
    updateScene((scene) => ({
      ...scene,
      shots: scene.shots.map((shot) => shot.id === shotId ? update(shot) : shot),
    }));
  };

  const selectScene = (sceneId: string) => {
    setPlaying(false);
    setTime(0);
    commit((current) => ({ ...current, activeSceneId: sceneId, updatedAt: Date.now() }));
  };

  const addActor = (role: ProjectRoleIdentity) => {
    if (!activeScene) return;
    const actor = newActorFromRole(role, activeScene.actors.length, activeScene.duration);
    updateScene((scene) => ({ ...scene, actors: [...scene.actors, actor] }));
    setSelectedActorId(actor.id);
    setSelectedKeyframeId(actor.keyframes[0].id);
  };

  const addKeyframe = () => {
    if (!selectedActor || !activeScene) return;
    const last = selectedActor.keyframes[selectedActor.keyframes.length - 1];
    const frame: CineworActorKeyframe = {
      id: uid("state"),
      label: `状态 ${selectedActor.keyframes.length + 1}`,
      time,
      position: last ? [...last.position] : [0, 0, 0],
      facing: last?.facing || 0,
      easing: "ease-in-out",
    };
    updateActor(selectedActor.id, (actor) => ({
      ...actor,
      keyframes: [...actor.keyframes, frame].sort((a, b) => a.time - b.time),
    }));
    setSelectedKeyframeId(frame.id);
  };

  const addShotAtCamera = () => {
    if (!activeScene) return;
    const shot = createShot(activeScene, time, viewportRef.current?.captureCamera());
    updateScene((scene) => ({ ...scene, shots: [...scene.shots, shot].sort((a, b) => a.time - b.time) }));
    setSelectedShotId(shot.id);
  };

  const exportFrame = () => {
    const dataUrl = viewportRef.current?.exportFrame(aspectRatio);
    if (!dataUrl || !activeScene) return;
    downloadDataUrl(dataUrl, `cinewor-${activeScene.title}-${aspectRatio.replace(":", "-")}.png`);
  };

  if (!isOpen) return null;

  if (!activeScene) {
    return (
      <div className="fixed inset-0 z-[90] flex min-h-[100dvh] items-center justify-center bg-[var(--app-bg)] text-[var(--app-text-primary)]">
        <div className="max-w-sm text-center">
          <WarningCircle size={30} className="mx-auto text-[#a06b58]" />
          <h2 className="mt-4 text-lg font-semibold">无法建立调度场</h2>
          <p className="mt-2 text-sm text-[var(--app-text-secondary)]">当前项目缺少可写入的 Flow 项目。返回画布新建项目后再试。</p>
          <button type="button" onClick={onClose} className={`${primaryButton} mt-5`}>返回画布</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[90] flex min-h-[100dvh] flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-text-primary)]">
      <header className="flex h-16 shrink-0 items-center border-b border-[var(--app-border)] bg-[var(--app-panel)] px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center bg-[#526e68] text-white"><Cube size={19} weight="duotone" /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[15px] font-semibold">Cinewor</h1>
              <span className="border border-[#7f938e]/35 bg-[#7f938e]/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#627a74]">Lab</span>
            </div>
            <p className="truncate text-[10px] text-[var(--app-text-muted)]">{activeScene.title} · 场面调度与虚拟摄影</p>
          </div>
        </div>
        <nav className="mx-auto hidden h-full items-center gap-1 md:flex" aria-label="Cinewor 工作模式">
          {modes.map((item) => {
            const Icon = item.icon;
            const active = mode === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setMode(item.key)}
                className={`flex h-full items-center gap-2 border-b-2 px-3 text-[12px] transition ${active ? "border-[#526e68] text-[var(--app-text-primary)]" : "border-transparent text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"}`}
              >
                <Icon size={16} weight={active ? "fill" : "regular"} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <button type="button" onClick={onClose} aria-label="关闭 Cinewor" className="ml-auto flex h-9 w-9 items-center justify-center border border-[var(--app-border)] text-[var(--app-text-secondary)] transition hover:bg-[var(--app-panel-soft)] hover:text-[var(--app-text-primary)]">
          <X size={17} />
        </button>
      </header>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 md:hidden">
        {modes.map((item) => {
          const Icon = item.icon;
          return <button key={item.key} type="button" onClick={() => setMode(item.key)} className={`${mode === item.key ? primaryButton : subtleButton} shrink-0`}><Icon size={15} />{item.label}</button>;
        })}
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[248px_minmax(0,1fr)_316px] lg:overflow-hidden">
        <aside className="hidden min-h-0 overflow-y-auto border-r border-[var(--app-border)] bg-[var(--app-panel)] lg:block">
          <Section title="场景胶囊" detail="从当前项目的场景库建立，调度数据随项目保存。">
            <div className="space-y-1">
              {workspace.scenes.map((scene, index) => (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => selectScene(scene.id)}
                  className={`flex w-full items-start gap-3 border-l-2 px-3 py-3 text-left transition ${scene.id === activeScene.id ? "border-[#526e68] bg-[var(--app-panel-soft)]" : "border-transparent hover:bg-[var(--app-panel-muted)]"}`}
                >
                  <span className="mt-0.5 font-mono text-[10px] text-[var(--app-text-muted)]">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-medium text-[var(--app-text-primary)]">{scene.title}</span>
                    <span className="mt-1 block text-[10px] text-[var(--app-text-muted)]">{scene.actors.length} 角色 · {scene.shots.length} 镜头</span>
                  </span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="项目角色库" detail={availableRoles.length ? "将已有角色绑定到当前调度场。" : "当前场景已绑定全部可用角色。"}>
            <div className="space-y-2">
              {availableRoles.slice(0, 8).map((role) => (
                <button key={role.id} type="button" onClick={() => addActor(role)} className="flex w-full items-center justify-between border-b border-[var(--app-border)] py-2 text-left text-[12px] text-[var(--app-text-secondary)] transition hover:text-[var(--app-text-primary)]">
                  <span className="truncate">{role.displayName || role.name}</span>
                  <Plus size={14} />
                </button>
              ))}
              {!allProjectRoles.some((role) => role.kind === "person") ? (
                <p className="text-[11px] leading-5 text-[var(--app-text-muted)]">先在 Info 的角色库中建立人物，Cinewor 会自动识别并提供绑定。</p>
              ) : null}
            </div>
          </Section>
        </aside>

        <section className="relative flex min-h-[420px] min-w-0 flex-col bg-[#202526]">
          <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
            <button type="button" onClick={() => setViewMode("world")} className={`${viewMode === "world" ? "bg-white text-[#25302e]" : "bg-[#202526]/78 text-white/70"} flex h-8 items-center gap-2 px-3 text-[11px] shadow-sm backdrop-blur-md`}><GridFour size={14} />世界视图</button>
            <button type="button" onClick={() => setViewMode("shot")} disabled={!activeScene.shots.length} className={`${viewMode === "shot" ? "bg-white text-[#25302e]" : "bg-[#202526]/78 text-white/70"} flex h-8 items-center gap-2 px-3 text-[11px] shadow-sm backdrop-blur-md disabled:opacity-40`}><FilmSlate size={14} />镜头视图</button>
          </div>
          <button type="button" onClick={() => viewportRef.current?.resetView()} aria-label="复位视口" className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center bg-[#202526]/78 text-white/70 shadow-sm backdrop-blur-md transition hover:text-white"><ArrowCounterClockwise size={15} /></button>

          <div className="min-h-0 flex-1">
            <CineworViewport
              ref={viewportRef}
              scene={activeScene}
              time={time}
              selectedActorId={selectedActorId}
              selectedShotId={selectedShotId}
              viewMode={viewMode}
              onReady={() => setViewportState("ready")}
              onError={(message) => { setViewportState("error"); setViewportError(message); }}
            />
            {viewportState === "loading" ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#202526] text-[12px] text-white/58">正在建立 WebGL 调度场…</div> : null}
            {viewportState === "error" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[#202526] px-6 text-center">
                <div className="max-w-sm"><WarningCircle size={28} className="mx-auto text-[#c28c73]" /><p className="mt-3 text-sm font-medium text-white/90">3D 视口不可用</p><p className="mt-2 text-xs leading-5 text-white/52">{viewportError || "当前设备没有可用的 WebGL 上下文。"}</p></div>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-white/10 bg-[#252b2c] px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => { if (time >= activeScene.duration) setTime(0); setPlaying((value) => !value); }} aria-label={playing ? "暂停" : "播放"} className="flex h-8 w-8 shrink-0 items-center justify-center bg-white text-[#26302f]">{playing ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}</button>
              <span className="w-14 shrink-0 font-mono text-[11px] text-white/62">{time.toFixed(1)}s</span>
              <input type="range" min={0} max={activeScene.duration} step={0.02} value={time} onChange={(event) => { setPlaying(false); setTime(Number(event.target.value)); }} className="min-w-0 flex-1 accent-[#90aaa4]" aria-label="时间线" />
              <span className="w-14 shrink-0 text-right font-mono text-[11px] text-white/42">{activeScene.duration.toFixed(1)}s</span>
              <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="h-8 bg-white/8 px-2 text-[11px] text-white/72 outline-none" aria-label="播放速度"><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select>
            </div>
          </div>
        </section>

        <aside className="min-h-0 overflow-y-auto border-l border-[var(--app-border)] bg-[var(--app-panel)]">
          {mode === "stage" ? (
            <>
              <Section title="调度场尺寸" detail="以米为单位的轻量场景体量，不替代最终美术资产。">
                <div className="grid grid-cols-3 gap-4">
                  <NumberField label="宽" value={activeScene.stage.width} min={4} max={160} suffix="m" onChange={(value) => updateScene((scene) => ({ ...scene, stage: { ...scene.stage, width: value } }))} />
                  <NumberField label="深" value={activeScene.stage.depth} min={4} max={160} suffix="m" onChange={(value) => updateScene((scene) => ({ ...scene, stage: { ...scene.stage, depth: value } }))} />
                  <NumberField label="高" value={activeScene.stage.height} min={2.4} max={40} suffix="m" onChange={(value) => updateScene((scene) => ({ ...scene, stage: { ...scene.stage, height: value } }))} />
                </div>
                <div className="mt-5"><NumberField label="预演时长" value={activeScene.duration} min={1} max={3600} suffix="s" onChange={(value) => { updateScene((scene) => ({ ...scene, duration: value })); setTime((current) => Math.min(current, value)); }} /></div>
              </Section>
              <Section title="视口辅助">
                <div className="space-y-3">
                  {([[
                    "gridVisible", "地面网格", "辅助判断角色距离与构图尺度",
                  ], ["axesVisible", "世界坐标轴", "显示 X、Y、Z 原点方向"]] as const).map(([key, label, detail]) => (
                    <label key={key} className="flex cursor-pointer items-center justify-between gap-4 border-b border-[var(--app-border)] pb-3 last:border-0 last:pb-0">
                      <span><span className="block text-[12px] font-medium">{label}</span><span className="mt-1 block text-[10px] text-[var(--app-text-muted)]">{detail}</span></span>
                      <input type="checkbox" checked={activeScene.stage[key]} onChange={(event) => updateScene((scene) => ({ ...scene, stage: { ...scene.stage, [key]: event.target.checked } }))} className="h-4 w-4 accent-[#526e68]" />
                    </label>
                  ))}
                </div>
              </Section>
            </>
          ) : null}

          {mode === "actors" ? (
            <>
              <Section title="角色轨迹" detail="角色与项目角色库保持绑定；轨迹用于预演，不修改角色档案。">
                <div className="space-y-1">
                  {activeScene.actors.map((actor) => (
                    <button key={actor.id} type="button" onClick={() => { setSelectedActorId(actor.id); setSelectedKeyframeId(actor.keyframes[0]?.id); }} className={`flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left ${actor.id === selectedActorId ? "border-[#526e68] bg-[var(--app-panel-soft)]" : "border-transparent hover:bg-[var(--app-panel-muted)]"}`}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: actor.color }} />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{actor.label}</span>
                      <span className="font-mono text-[9px] text-[var(--app-text-muted)]">{actor.keyframes.length}</span>
                    </button>
                  ))}
                  {!activeScene.actors.length ? <p className="py-4 text-center text-[11px] text-[var(--app-text-muted)]">从左侧项目角色库添加人物。</p> : null}
                </div>
              </Section>
              {selectedActor ? (
                <>
                  <Section title="运动模型">
                    <label className="block"><span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-muted)]">轨迹</span><select value={selectedActor.trajectory} onChange={(event) => updateActor(selectedActor.id, (actor) => ({ ...actor, trajectory: event.target.value as "linear" | "arc" }))} className={inputClass}><option value="linear">直线</option><option value="arc">弧线</option></select></label>
                    {selectedActor.trajectory === "arc" ? <div className="mt-4"><NumberField label="弧线偏移" value={selectedActor.arcHeight} min={0} max={20} suffix="m" onChange={(value) => updateActor(selectedActor.id, (actor) => ({ ...actor, arcHeight: value }))} /></div> : null}
                    <button type="button" onClick={() => { updateScene((scene) => ({ ...scene, actors: scene.actors.filter((actor) => actor.id !== selectedActor.id) })); setSelectedActorId(activeScene.actors.find((actor) => actor.id !== selectedActor.id)?.id); setSelectedKeyframeId(undefined); }} className={`${subtleButton} mt-5 text-[#9b6252]`}><Trash size={14} />从调度场移除</button>
                  </Section>
                  <Section title="关键状态" detail="拖动时间线并添加状态，按时间自动排序。">
                    <div className="mb-3 flex gap-2"><button type="button" onClick={addKeyframe} className={primaryButton}><Plus size={14} />在 {time.toFixed(1)}s 添加</button></div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedActor.keyframes.map((frame) => <button key={frame.id} type="button" onClick={() => { setSelectedKeyframeId(frame.id); setTime(frame.time); }} className={`${frame.id === selectedKeyframeId ? "border-[#526e68] bg-[#526e68] text-white" : "border-[var(--app-border)] bg-[var(--app-panel-muted)] text-[var(--app-text-secondary)]"} border px-2.5 py-1.5 text-[10px]`}>{frame.label} · {frame.time.toFixed(1)}s</button>)}
                    </div>
                  </Section>
                  {selectedKeyframe ? (
                    <Section title="状态属性">
                      <label className="block"><span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-muted)]">名称</span><input value={selectedKeyframe.label} onChange={(event) => updateActor(selectedActor.id, (actor) => ({ ...actor, keyframes: actor.keyframes.map((frame) => frame.id === selectedKeyframe.id ? { ...frame, label: event.target.value } : frame) }))} className={inputClass} /></label>
                      <div className="mt-4"><NumberField label="时间" value={selectedKeyframe.time} min={0} max={activeScene.duration} suffix="s" onChange={(value) => updateActor(selectedActor.id, (actor) => ({ ...actor, keyframes: actor.keyframes.map((frame) => frame.id === selectedKeyframe.id ? { ...frame, time: value } : frame).sort((a, b) => a.time - b.time) }))} /></div>
                      <div className="mt-4"><VectorFields label="世界坐标" value={selectedKeyframe.position} onChange={(value) => updateActor(selectedActor.id, (actor) => ({ ...actor, keyframes: actor.keyframes.map((frame) => frame.id === selectedKeyframe.id ? { ...frame, position: value } : frame) }))} /></div>
                      <div className="mt-4"><NumberField label="朝向" value={selectedKeyframe.facing} min={-360} max={360} suffix="°" onChange={(value) => updateActor(selectedActor.id, (actor) => ({ ...actor, keyframes: actor.keyframes.map((frame) => frame.id === selectedKeyframe.id ? { ...frame, facing: value } : frame) }))} /></div>
                      <button type="button" disabled={selectedActor.keyframes.length <= 1} onClick={() => { updateActor(selectedActor.id, (actor) => ({ ...actor, keyframes: actor.keyframes.filter((frame) => frame.id !== selectedKeyframe.id) })); setSelectedKeyframeId(selectedActor.keyframes.find((frame) => frame.id !== selectedKeyframe.id)?.id); }} className={`${subtleButton} mt-5 text-[#9b6252]`}><Trash size={14} />删除状态</button>
                    </Section>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {mode === "camera" ? (
            <>
              <Section title="镜头序列" detail="世界视图中摆放摄影机，再将当前观察角度记录为镜头。">
                <button type="button" onClick={addShotAtCamera} className={primaryButton}><Crosshair size={14} />记录当前机位</button>
                <div className="mt-4 space-y-1">
                  {activeScene.shots.map((shot) => <button key={shot.id} type="button" onClick={() => { setSelectedShotId(shot.id); setTime(shot.time); setViewMode("shot"); }} className={`flex w-full items-center justify-between border-l-2 px-3 py-2.5 text-left ${shot.id === selectedShotId ? "border-[#526e68] bg-[var(--app-panel-soft)]" : "border-transparent hover:bg-[var(--app-panel-muted)]"}`}><span className="truncate text-[12px] font-medium">{shot.name}</span><span className="font-mono text-[9px] text-[var(--app-text-muted)]">{shot.time.toFixed(1)}s</span></button>)}
                </div>
              </Section>
              {selectedShot ? (
                <Section title="镜头属性">
                  <label className="block"><span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-muted)]">镜头名</span><input value={selectedShot.name} onChange={(event) => updateShot(selectedShot.id, (shot) => ({ ...shot, name: event.target.value }))} className={inputClass} /></label>
                  <div className="mt-4 grid grid-cols-2 gap-4"><NumberField label="入点" value={selectedShot.time} min={0} max={activeScene.duration} suffix="s" onChange={(value) => updateShot(selectedShot.id, (shot) => ({ ...shot, time: value }))} /><NumberField label="视场角" value={selectedShot.fov} min={12} max={100} suffix="°" onChange={(value) => updateShot(selectedShot.id, (shot) => ({ ...shot, fov: value }))} /></div>
                  <div className="mt-4"><VectorFields label="机位" value={selectedShot.position} onChange={(value) => updateShot(selectedShot.id, (shot) => ({ ...shot, position: value }))} /></div>
                  <div className="mt-4"><VectorFields label="注视点" value={selectedShot.target} onChange={(value) => updateShot(selectedShot.id, (shot) => ({ ...shot, target: value }))} /></div>
                  <div className="mt-5 flex gap-2"><button type="button" onClick={() => { const pose = viewportRef.current?.captureCamera(); if (pose) updateShot(selectedShot.id, (shot) => ({ ...shot, ...pose })); }} className={subtleButton}><Check size={14} />覆盖为当前机位</button><button type="button" onClick={() => { updateScene((scene) => ({ ...scene, shots: scene.shots.filter((shot) => shot.id !== selectedShot.id) })); setSelectedShotId(activeScene.shots.find((shot) => shot.id !== selectedShot.id)?.id); }} className={`${subtleButton} px-2 text-[#9b6252]`} aria-label="删除镜头"><Trash size={14} /></button></div>
                </Section>
              ) : null}
            </>
          ) : null}

          {mode === "delivery" ? (
            <>
              <Section title="画幅" detail="导出当前时间点与当前视图的预演帧。">
                <div className="grid grid-cols-2 gap-2">
                  {(["16:9", "2.39:1"] as AspectRatio[]).map((ratio) => <button key={ratio} type="button" onClick={() => setAspectRatio(ratio)} className={`${ratio === aspectRatio ? "border-[#526e68] bg-[#526e68] text-white" : "border-[var(--app-border)] bg-[var(--app-panel-muted)] text-[var(--app-text-secondary)]"} border px-3 py-3 text-[12px] font-medium`}>{ratio}</button>)}
                </div>
                <button type="button" onClick={exportFrame} disabled={viewportState !== "ready"} className={`${primaryButton} mt-4 w-full`}><Export size={15} />导出 PNG 预演帧</button>
              </Section>
              <Section title="项目状态">
                <div className="space-y-3 text-[11px]">
                  <div className="flex justify-between border-b border-[var(--app-border)] pb-3"><span className="text-[var(--app-text-muted)]">保存范围</span><span className="font-medium">当前 Flow 项目</span></div>
                  <div className="flex justify-between border-b border-[var(--app-border)] pb-3"><span className="text-[var(--app-text-muted)]">数据版本</span><span className="font-mono">v{workspace.version}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--app-text-muted)]">场景数</span><span className="font-mono">{workspace.scenes.length}</span></div>
                </div>
              </Section>
            </>
          ) : null}
        </aside>
      </main>
    </div>
  );
};
