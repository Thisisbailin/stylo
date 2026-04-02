import React, { useMemo, useState } from "react";

type PresetKey = "clear" | "frost" | "diffuse";

const PRESETS: Record<PresetKey, { blur: number; alpha: number; spread: number; softness: number }> = {
  clear: { blur: 0, alpha: 0, spread: 56, softness: 78 },
  frost: { blur: 26, alpha: 0.08, spread: 76, softness: 84 },
  diffuse: { blur: 42, alpha: 0.055, spread: 108, softness: 92 },
};

export const GlassEffectLab: React.FC = () => {
  const [preset, setPreset] = useState<PresetKey>("frost");
  const [blur, setBlur] = useState(PRESETS.frost.blur);
  const [alpha, setAlpha] = useState(PRESETS.frost.alpha);
  const [spread, setSpread] = useState(PRESETS.frost.spread);
  const [softness, setSoftness] = useState(PRESETS.frost.softness);

  const applyPreset = (key: PresetKey) => {
    const next = PRESETS[key];
    setPreset(key);
    setBlur(next.blur);
    setAlpha(next.alpha);
    setSpread(next.spread);
    setSoftness(next.softness);
  };

  const fieldStyle = useMemo<React.CSSProperties>(
    () => ({
      position: "absolute",
      left: -spread * 0.48,
      top: -spread * 0.36,
      width: `calc(100% + ${spread}px)`,
      height: `calc(100% + ${spread * 1.45}px)`,
      background: `rgba(255,255,255,${alpha})`,
      backdropFilter: `blur(${blur}px) saturate(112%)`,
      WebkitBackdropFilter: `blur(${blur}px) saturate(112%)`,
      filter: "blur(0px)",
      WebkitMaskImage: `radial-gradient(122% 84% at 18% 10%, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.68) ${softness * 0.58}%, rgba(0,0,0,0.18) ${softness}%, transparent 100%)`,
      maskImage: `radial-gradient(122% 84% at 18% 10%, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.68) ${softness * 0.58}%, rgba(0,0,0,0.18) ${softness}%, transparent 100%)`,
      pointerEvents: "none",
    }),
    [alpha, blur, softness, spread]
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 text-[var(--app-text-primary)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--app-text-muted)]">Glass Lab</div>
          <div className="mt-2 text-[22px] font-semibold tracking-[-0.03em]">Ambient Field Test Unit</div>
          <p className="mt-2 max-w-[56ch] text-[13px] leading-6 text-[var(--app-text-secondary)]">
            这里专门测试“无边界毛玻璃扩散”这套视觉语言。它不接业务层，只验证结构是否像一片环境光学区域，而不是一张卡片。
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-muted)] p-1">
          {(["clear", "frost", "diffuse"] as PresetKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                preset === key
                  ? "bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]"
                  : "text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="relative min-h-[520px] overflow-hidden rounded-[32px] border border-[var(--app-border)] bg-[#151618]">
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.02), transparent 18%), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: "100% 100%, 28px 28px, 28px 28px",
              backgroundPosition: "0 0, -1px -1px, -1px -1px",
            }}
          />

          <div className="absolute inset-x-8 top-7 z-20 flex items-center gap-3">
            <div className="text-[30px] font-semibold tracking-[-0.065em] text-white">Qalam</div>
            <div className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/6 px-3 text-[11px] text-white/58 backdrop-blur-md">
              24,380
            </div>
          </div>

          <div aria-hidden="true" style={fieldStyle} />

          <div className="absolute inset-x-8 bottom-7 z-20">
            <div className="rounded-[28px] border border-white/8 bg-white/6 px-5 py-4 backdrop-blur-xl">
              <div className="text-[12px] text-white/62">Ask Qalam about scenes, nodes, assets, or workflows.</div>
            </div>
          </div>

          <div className="absolute left-8 top-28 z-20 max-w-[420px] space-y-3">
            <div className="text-[13px] leading-7 text-white/86">
              这里故意只保留标题、内容和底部输入，让你判断“扩散区”到底是不是像一片环境，而不是一个面板。
            </div>
            <div className="text-[12px] leading-6 text-white/48">
              如果仍然能明显读出圆角盒子、局部光斑、彩色云层，说明结构还不对。
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-[var(--app-border)] bg-[linear-gradient(180deg,var(--app-panel-strong),var(--app-panel))] p-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--app-text-muted)]">Controls</div>
          <div className="mt-4 space-y-4">
            {[
              { label: "Blur", value: blur, min: 0, max: 72, step: 1, set: setBlur },
              { label: "Alpha", value: alpha, min: 0, max: 0.14, step: 0.005, set: setAlpha },
              { label: "Spread", value: spread, min: 24, max: 160, step: 2, set: setSpread },
              { label: "Softness", value: softness, min: 60, max: 98, step: 1, set: setSoftness },
            ].map((item) => (
              <label key={item.label} className="block">
                <div className="mb-2 flex items-center justify-between text-[12px]">
                  <span className="font-medium text-[var(--app-text-primary)]">{item.label}</span>
                  <span className="text-[var(--app-text-secondary)]">{typeof item.value === "number" ? item.value : ""}</span>
                </div>
                <input
                  type="range"
                  min={item.min}
                  max={item.max}
                  step={item.step}
                  value={item.value}
                  onChange={(e) => item.set(Number(e.target.value))}
                  className="w-full accent-[var(--app-accent-strong)]"
                />
              </label>
            ))}
          </div>

          <div className="mt-5 rounded-[20px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-4 py-3 text-[12px] leading-6 text-[var(--app-text-secondary)]">
            目标不是更亮、更花，而是更难被读成组件边界。先判断轮廓，再判断气氛。
          </div>
        </div>
      </div>
    </div>
  );
};
