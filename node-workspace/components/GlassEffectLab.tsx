import React, { useEffect, useRef, useState } from "react";
import { GLASS_DIFFUSION_PRESETS, GlassDiffusionField, GlassDiffusionPresetKey } from "./GlassDiffusionField";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
} | null;

const controlChipClass =
  "pointer-events-auto rounded-[22px] border border-white/10 bg-[rgba(20,22,25,0.56)] px-4 py-3 text-white/88 shadow-[0_12px_30px_rgba(0,0,0,0.16)] backdrop-blur-xl";

export const GlassEffectLab: React.FC<Props> = ({ isOpen, onClose }) => {
  const [preset, setPreset] = useState<GlassDiffusionPresetKey>("mist");
  const [posX, setPosX] = useState(16);
  const [posY, setPosY] = useState(18);
  const [width, setWidth] = useState(GLASS_DIFFUSION_PRESETS.mist.width);
  const [height, setHeight] = useState(GLASS_DIFFUSION_PRESETS.mist.height);
  const [blur, setBlur] = useState(GLASS_DIFFUSION_PRESETS.mist.blur);
  const [fillAlpha, setFillAlpha] = useState(GLASS_DIFFUSION_PRESETS.mist.fillAlpha);
  const [saturate, setSaturate] = useState(GLASS_DIFFUSION_PRESETS.mist.saturate);
  const [fadeInsetX, setFadeInsetX] = useState(GLASS_DIFFUSION_PRESETS.mist.fadeInsetX);
  const [fadeInsetY, setFadeInsetY] = useState(GLASS_DIFFUSION_PRESETS.mist.fadeInsetY);
  const [fade, setFade] = useState(GLASS_DIFFUSION_PRESETS.mist.fade);
  const [edgeAlpha, setEdgeAlpha] = useState(GLASS_DIFFUSION_PRESETS.mist.edgeAlpha);
  const [curve, setCurve] = useState(GLASS_DIFFUSION_PRESETS.mist.curve);
  const [showBoundary, setShowBoundary] = useState(true);
  const [showField, setShowField] = useState(true);
  const dragStateRef = useRef<DragState>(null);
  const regionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const applyPreset = (key: GlassDiffusionPresetKey) => {
    const next = GLASS_DIFFUSION_PRESETS[key];
    setPreset(key);
    setWidth(next.width);
    setHeight(next.height);
    setBlur(next.blur);
    setFillAlpha(next.fillAlpha);
    setSaturate(next.saturate);
    setFadeInsetX(next.fadeInsetX);
    setFadeInsetY(next.fadeInsetY);
    setFade(next.fade);
    setEdgeAlpha(next.edgeAlpha);
    setCurve(next.curve);
  };

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: posX,
      originY: posY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    setPosX(Math.max(8, state.originX + (event.clientX - state.startX)));
    setPosY(Math.max(8, state.originY + (event.clientY - state.startY)));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[95] overflow-hidden">
      <div
        ref={regionRef}
        className="absolute"
        style={{
          left: posX,
          top: posY,
          width,
          height,
        }}
      >
        <GlassDiffusionField
          className="absolute inset-0"
          width={width}
          height={height}
          config={{
            blur,
            fillAlpha,
            saturate,
            fadeInsetX,
            fadeInsetY,
            fade,
            edgeAlpha,
            curve,
          }}
          showField={showField}
          showBoundary={showBoundary}
        />
        <div
          onPointerDown={beginDrag}
          onPointerMove={updateDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative h-full w-full"
          style={{
            cursor: "grab",
          }}
        >
          <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-[rgba(12,14,16,0.42)] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-white/62 backdrop-blur-md">
            glass field
          </div>
          <div className="absolute bottom-3 left-3 rounded-full border border-white/10 bg-[rgba(12,14,16,0.38)] px-3 py-1 text-[11px] text-white/56 backdrop-blur-md">
            drag me
          </div>
        </div>
      </div>

      <div className="fixed left-5 top-5 z-[96] flex items-center gap-2">
        <button type="button" onClick={onClose} className={`${controlChipClass} text-[11px] uppercase tracking-[0.2em] text-white/72`}>
          Close Glass Lab
        </button>
        {(["bare", "mist", "veil"] as GlassDiffusionPresetKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => applyPreset(key)}
            className={`${controlChipClass} px-3 py-2 text-[11px] ${preset === key ? "border-white/22 text-white" : "text-white/68"}`}
          >
            {key}
          </button>
        ))}
      </div>

      <div className="fixed right-5 top-5 z-[96] flex max-w-[360px] flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => setShowBoundary((value) => !value)}
          className={`${controlChipClass} px-3 py-2 text-[11px] ${showBoundary ? "border-white/22" : "text-white/54"}`}
        >
          boundary
        </button>
        <button
          type="button"
          onClick={() => setShowField((value) => !value)}
          className={`${controlChipClass} px-3 py-2 text-[11px] ${showField ? "border-white/22" : "text-white/54"}`}
        >
          field
        </button>
      </div>

      <div className="fixed left-5 bottom-24 z-[96] grid w-[min(520px,calc(100vw-40px))] grid-cols-2 gap-2">
        {[
          { label: "x", value: posX, min: 0, max: 720, step: 1, set: setPosX },
          { label: "y", value: posY, min: 0, max: 720, step: 1, set: setPosY },
          { label: "width", value: width, min: 160, max: 720, step: 2, set: setWidth },
          { label: "height", value: height, min: 180, max: 900, step: 2, set: setHeight },
          { label: "blur", value: blur, min: 0, max: 96, step: 1, set: setBlur },
          { label: "fill", value: fillAlpha, min: 0, max: 0.12, step: 0.002, set: setFillAlpha },
          { label: "saturate", value: saturate, min: 80, max: 160, step: 1, set: setSaturate },
          { label: "fade inset x", value: fadeInsetX, min: 0, max: 120, step: 1, set: setFadeInsetX },
          { label: "fade inset y", value: fadeInsetY, min: 0, max: 160, step: 1, set: setFadeInsetY },
          { label: "edge blur", value: fade, min: 0, max: 48, step: 1, set: setFade },
          { label: "edge", value: edgeAlpha, min: 0.04, max: 0.56, step: 0.01, set: setEdgeAlpha },
          { label: "curve", value: curve, min: 2.2, max: 5.4, step: 0.05, set: setCurve },
        ].map((item) => (
          <label key={item.label} className={`${controlChipClass} block px-3 py-2`}>
            <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-white/68">
              <span>{item.label}</span>
              <span className="normal-case tracking-normal text-white/54">{Number(item.value).toFixed(item.step < 1 ? 3 : 0)}</span>
            </div>
            <input
              type="range"
              min={item.min}
              max={item.max}
              step={item.step}
              value={item.value}
              onChange={(event) => item.set(Number(event.target.value))}
              className="w-full accent-white"
            />
          </label>
        ))}
      </div>
    </div>
  );
};
