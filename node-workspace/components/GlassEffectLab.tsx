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

const buildSuperellipsePath = (
  width: number,
  height: number,
  exponent: number,
  offsetX = 0,
  offsetY = 0,
  segments = 72
) => {
  const a = width / 2;
  const b = height / 2;
  const cx = offsetX + a;
  const cy = offsetY + b;
  const points: string[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const theta = (Math.PI * 2 * i) / segments;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const x = cx + a * Math.sign(cos) * Math.pow(Math.abs(cos), 2 / exponent);
    const y = cy + b * Math.sign(sin) * Math.pow(Math.abs(sin), 2 / exponent);
    points.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  return `${points.join(" ")} Z`;
};

const PRESETS: Record<
  PresetKey,
  {
    width: number;
    height: number;
    blur: number;
    fillAlpha: number;
    saturate: number;
    fadeInsetX: number;
    fadeInsetY: number;
    fade: number;
    edgeAlpha: number;
    curve: number;
  }
> = {
  bare: {
    width: 360,
    height: 540,
    blur: 0,
    fillAlpha: 0,
    saturate: 100,
    fadeInsetX: 28,
    fadeInsetY: 34,
    fade: 18,
    edgeAlpha: 0.22,
    curve: 3.4,
  },
  mist: {
    width: 380,
    height: 560,
    blur: 24,
    fillAlpha: 0.045,
    saturate: 112,
    fadeInsetX: 34,
    fadeInsetY: 42,
    fade: 22,
    edgeAlpha: 0.3,
    curve: 3.85,
  },
  veil: {
    width: 400,
    height: 600,
    blur: 38,
    fillAlpha: 0.055,
    saturate: 118,
    fadeInsetX: 42,
    fadeInsetY: 54,
    fade: 28,
    edgeAlpha: 0.36,
    curve: 4.2,
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
  const [fadeInsetX, setFadeInsetX] = useState(PRESETS.mist.fadeInsetX);
  const [fadeInsetY, setFadeInsetY] = useState(PRESETS.mist.fadeInsetY);
  const [fade, setFade] = useState(PRESETS.mist.fade);
  const [edgeAlpha, setEdgeAlpha] = useState(PRESETS.mist.edgeAlpha);
  const [curve, setCurve] = useState(PRESETS.mist.curve);
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

  const applyPreset = (key: PresetKey) => {
    const next = PRESETS[key];
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

  const fieldMask = useMemo(() => {
    const maskWidth = width;
    const maskHeight = height;
    const erodeX = Math.max(0, fadeInsetX * 0.5);
    const erodeY = Math.max(0, fadeInsetY * 0.5);
    const edgeBlur = Math.max(0.1, fade);
    const path = buildSuperellipsePath(width, height, curve);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${maskWidth}" height="${maskHeight}" viewBox="0 0 ${maskWidth} ${maskHeight}">
        <defs>
          <filter id="melt" x="0" y="0" width="${maskWidth}" height="${maskHeight}" filterUnits="userSpaceOnUse">
            <feMorphology in="SourceGraphic" operator="erode" radius="${erodeX} ${erodeY}" result="eroded"/>
            <feGaussianBlur in="eroded" stdDeviation="${edgeBlur}" edgeMode="none" result="soft"/>
            <feComponentTransfer in="soft" result="alpha">
              <feFuncA type="gamma" amplitude="1" exponent="1.12" offset="0"/>
            </feComponentTransfer>
          </filter>
        </defs>
        <path d="${path}" fill="white" filter="url(#melt)"/>
      </svg>
    `.trim();
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [curve, fade, fadeInsetX, fadeInsetY, height, width]);

  const boundaryPath = useMemo(() => buildSuperellipsePath(width, height, curve), [curve, height, width]);

  const fieldStyle = useMemo<React.CSSProperties>(
    () => ({
      position: "absolute",
      inset: 0,
      background: `rgba(255,255,255,${fillAlpha})`,
      backdropFilter: `blur(${blur}px) saturate(${saturate}%)`,
      WebkitBackdropFilter: `blur(${blur}px) saturate(${saturate}%)`,
      WebkitMaskImage: fieldMask,
      maskImage: fieldMask,
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      WebkitMaskSize: "100% 100%",
      maskSize: "100% 100%",
      WebkitMaskPosition: "center",
      maskPosition: "center",
      pointerEvents: "none",
    }),
    [blur, fieldMask, fillAlpha, saturate]
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
        {showField ? <div aria-hidden="true" style={fieldStyle} /> : null}
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
          {showBoundary ? (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
            >
              <path
                d={boundaryPath}
                fill="none"
                stroke={`rgba(255,255,255,${edgeAlpha})`}
                strokeWidth="1.2"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ) : null}
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
          onClick={() => setShowField((value) => !value)}
          className={`${controlChipClass} px-3 py-2 text-[11px] ${showField ? "border-white/22" : "text-white/54"}`}
        >
          field
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
