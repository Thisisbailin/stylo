import React, { useEffect, useMemo, useRef, useState } from "react";

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

type PresetKey = "bare" | "mist" | "veil";

const PRESETS: Record<
  PresetKey,
  {
    width: number;
    height: number;
    blur: number;
    fillAlpha: number;
    saturate: number;
    spreadX: number;
    spreadY: number;
    softness: number;
    edgeAlpha: number;
    radius: number;
    biasX: number;
    biasY: number;
  }
> = {
  bare: {
    width: 360,
    height: 540,
    blur: 0,
    fillAlpha: 0,
    saturate: 100,
    spreadX: 80,
    spreadY: 140,
    softness: 82,
    edgeAlpha: 0.22,
    radius: 36,
    biasX: 18,
    biasY: 12,
  },
  mist: {
    width: 380,
    height: 560,
    blur: 24,
    fillAlpha: 0.045,
    saturate: 112,
    spreadX: 96,
    spreadY: 168,
    softness: 88,
    edgeAlpha: 0.3,
    radius: 42,
    biasX: 14,
    biasY: 10,
  },
  veil: {
    width: 400,
    height: 600,
    blur: 38,
    fillAlpha: 0.055,
    saturate: 118,
    spreadX: 128,
    spreadY: 220,
    softness: 93,
    edgeAlpha: 0.36,
    radius: 48,
    biasX: 12,
    biasY: 8,
  },
};

const controlChipClass =
  "pointer-events-auto rounded-[22px] border border-white/10 bg-[rgba(20,22,25,0.56)] px-4 py-3 text-white/88 shadow-[0_12px_30px_rgba(0,0,0,0.16)] backdrop-blur-xl";

export const GlassEffectLab: React.FC<Props> = ({ isOpen, onClose }) => {
  const [preset, setPreset] = useState<PresetKey>("mist");
  const [posX, setPosX] = useState(36);
  const [posY, setPosY] = useState(82);
  const [width, setWidth] = useState(PRESETS.mist.width);
  const [height, setHeight] = useState(PRESETS.mist.height);
  const [blur, setBlur] = useState(PRESETS.mist.blur);
  const [fillAlpha, setFillAlpha] = useState(PRESETS.mist.fillAlpha);
  const [saturate, setSaturate] = useState(PRESETS.mist.saturate);
  const [spreadX, setSpreadX] = useState(PRESETS.mist.spreadX);
  const [spreadY, setSpreadY] = useState(PRESETS.mist.spreadY);
  const [softness, setSoftness] = useState(PRESETS.mist.softness);
  const [edgeAlpha, setEdgeAlpha] = useState(PRESETS.mist.edgeAlpha);
  const [radius, setRadius] = useState(PRESETS.mist.radius);
  const [biasX, setBiasX] = useState(PRESETS.mist.biasX);
  const [biasY, setBiasY] = useState(PRESETS.mist.biasY);
  const [showBoundary, setShowBoundary] = useState(true);
  const [showCore, setShowCore] = useState(true);
  const [showAura, setShowAura] = useState(true);
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

  const applyPreset = (key: PresetKey) => {
    const next = PRESETS[key];
    setPreset(key);
    setWidth(next.width);
    setHeight(next.height);
    setBlur(next.blur);
    setFillAlpha(next.fillAlpha);
    setSaturate(next.saturate);
    setSpreadX(next.spreadX);
    setSpreadY(next.spreadY);
    setSoftness(next.softness);
    setEdgeAlpha(next.edgeAlpha);
    setRadius(next.radius);
    setBiasX(next.biasX);
    setBiasY(next.biasY);
  };

  const auraStyle = useMemo<React.CSSProperties>(
    () => ({
      position: "absolute",
      left: -spreadX * 0.5,
      top: -spreadY * 0.24,
      width: `calc(100% + ${spreadX}px)`,
      height: `calc(100% + ${spreadY}px)`,
      borderRadius: radius * 1.2,
      background: `rgba(255,255,255,${fillAlpha})`,
      backdropFilter: `blur(${blur}px) saturate(${saturate}%)`,
      WebkitBackdropFilter: `blur(${blur}px) saturate(${saturate}%)`,
      WebkitMaskImage: `radial-gradient(118% 88% at ${biasX}% ${biasY}%, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.68) ${Math.max(
        26,
        softness - 34
      )}%, rgba(0,0,0,0.22) ${softness}%, transparent 100%)`,
      maskImage: `radial-gradient(118% 88% at ${biasX}% ${biasY}%, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.68) ${Math.max(
        26,
        softness - 34
      )}%, rgba(0,0,0,0.22) ${softness}%, transparent 100%)`,
      pointerEvents: "none",
    }),
    [biasX, biasY, blur, fillAlpha, radius, saturate, softness, spreadX, spreadY]
  );

  const coreStyle = useMemo<React.CSSProperties>(
    () => ({
      position: "absolute",
      inset: 0,
      borderRadius: radius,
      background: `rgba(255,255,255,${fillAlpha * 0.64})`,
      backdropFilter: `blur(${Math.max(0, blur * 0.72)}px) saturate(${saturate}%)`,
      WebkitBackdropFilter: `blur(${Math.max(0, blur * 0.72)}px) saturate(${saturate}%)`,
      opacity: showCore ? 1 : 0,
      transition: "opacity 180ms ease",
      pointerEvents: "none",
    }),
    [blur, fillAlpha, radius, saturate, showCore]
  );

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
    <div className="pointer-events-none fixed inset-0 z-[85] overflow-hidden">
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
        {showAura ? <div aria-hidden="true" style={auraStyle} /> : null}
        <div
          onPointerDown={beginDrag}
          onPointerMove={updateDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative h-full w-full"
          style={{
            borderRadius: radius,
            outline: showBoundary ? `${Math.max(1, edgeAlpha * 3)}px dashed rgba(255,255,255,${edgeAlpha})` : "none",
            outlineOffset: 0,
            cursor: "grab",
          }}
        >
          {showCore ? <div aria-hidden="true" style={coreStyle} /> : null}
          <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-[rgba(12,14,16,0.42)] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-white/62 backdrop-blur-md">
            glass field
          </div>
          <div className="absolute bottom-3 left-3 rounded-full border border-white/10 bg-[rgba(12,14,16,0.38)] px-3 py-1 text-[11px] text-white/56 backdrop-blur-md">
            drag me
          </div>
        </div>
      </div>

      <div className="fixed left-5 top-5 z-[86] flex items-center gap-2">
        <button type="button" onClick={onClose} className={`${controlChipClass} text-[11px] uppercase tracking-[0.2em] text-white/72`}>
          Close Glass Lab
        </button>
        {(["bare", "mist", "veil"] as PresetKey[]).map((key) => (
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

      <div className="fixed right-5 top-5 z-[86] flex max-w-[360px] flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => setShowBoundary((value) => !value)}
          className={`${controlChipClass} px-3 py-2 text-[11px] ${showBoundary ? "border-white/22" : "text-white/54"}`}
        >
          boundary
        </button>
        <button
          type="button"
          onClick={() => setShowCore((value) => !value)}
          className={`${controlChipClass} px-3 py-2 text-[11px] ${showCore ? "border-white/22" : "text-white/54"}`}
        >
          core
        </button>
        <button
          type="button"
          onClick={() => setShowAura((value) => !value)}
          className={`${controlChipClass} px-3 py-2 text-[11px] ${showAura ? "border-white/22" : "text-white/54"}`}
        >
          aura
        </button>
      </div>

      <div className="fixed left-5 bottom-24 z-[86] grid w-[min(460px,calc(100vw-40px))] grid-cols-2 gap-2">
        {[
          { label: "x", value: posX, min: 0, max: 720, step: 1, set: setPosX },
          { label: "y", value: posY, min: 0, max: 720, step: 1, set: setPosY },
          { label: "width", value: width, min: 160, max: 720, step: 2, set: setWidth },
          { label: "height", value: height, min: 180, max: 900, step: 2, set: setHeight },
          { label: "blur", value: blur, min: 0, max: 96, step: 1, set: setBlur },
          { label: "fill", value: fillAlpha, min: 0, max: 0.12, step: 0.002, set: setFillAlpha },
          { label: "saturate", value: saturate, min: 80, max: 160, step: 1, set: setSaturate },
          { label: "spread x", value: spreadX, min: 0, max: 240, step: 2, set: setSpreadX },
          { label: "spread y", value: spreadY, min: 0, max: 320, step: 2, set: setSpreadY },
          { label: "softness", value: softness, min: 52, max: 98, step: 1, set: setSoftness },
          { label: "edge", value: edgeAlpha, min: 0.04, max: 0.56, step: 0.01, set: setEdgeAlpha },
          { label: "radius", value: radius, min: 0, max: 96, step: 1, set: setRadius },
          { label: "bias x", value: biasX, min: 0, max: 100, step: 1, set: setBiasX },
          { label: "bias y", value: biasY, min: 0, max: 100, step: 1, set: setBiasY },
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
