import React, { useId, useMemo } from "react";

export type GlassDiffusionPresetKey = "bare" | "mist" | "veil" | "qalam";

export type GlassDiffusionConfig = {
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
};

export const buildSuperellipsePath = (
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

export const GLASS_DIFFUSION_PRESETS: Record<GlassDiffusionPresetKey, GlassDiffusionConfig> = {
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
    curve: 24.2,
  },
  qalam: {
    width: 380,
    height: 560,
    blur: 12,
    fillAlpha: 0,
    saturate: 113,
    fadeInsetX: 42,
    fadeInsetY: 103,
    fade: 48,
    edgeAlpha: 0.04,
    curve: 5.4,
  },
};

export const QALAM_GLASS_LAB_CONFIG: Omit<GlassDiffusionConfig, "width" | "height"> = {
  blur: 12,
  fillAlpha: 0,
  saturate: 113,
  fadeInsetX: 42,
  fadeInsetY: 103,
  fade: 48,
  edgeAlpha: 0.04,
  curve: 5.4,
};

export const QALAM_GLASS_LAB_SHADOW = {
  offsetX: 24,
  offsetY: 18,
  blur: 96,
  alpha: 0.22,
  spread: 64,
};

type Props = {
  width: number;
  height: number;
  config: Omit<GlassDiffusionConfig, "width" | "height">;
  className?: string;
  style?: React.CSSProperties;
  showField?: boolean;
  showBoundary?: boolean;
  boundaryDasharray?: string;
  boundaryWidth?: number;
  boundaryColor?: string;
};

type MaterialShadowProps = {
  width: number;
  height: number;
  curve: number;
  offsetX: number;
  offsetY: number;
  blur: number;
  alpha: number;
  spread: number;
};

export const MaterialGlassShadow: React.FC<MaterialShadowProps> = ({
  width,
  height,
  curve,
  offsetX,
  offsetY,
  blur,
  alpha,
  spread,
}) => {
  const reactId = useId().replace(/:/g, "");
  const filterId = `glass-material-shadow-${reactId}`;
  const filterPad = Math.max(blur * 3 + Math.abs(offsetX) + Math.abs(offsetY), Math.abs(spread) + 24);
  const viewWidth = width + filterPad * 2;
  const viewHeight = height + filterPad * 2;
  const shadowPath = useMemo(
    () => buildSuperellipsePath(width + spread * 2, height + spread * 2, curve, filterPad - spread, filterPad - spread),
    [curve, filterPad, height, spread, width]
  );

  if (width <= 0 || height <= 0 || alpha <= 0 || blur <= 0) return null;

  return (
    <svg
      className="pointer-events-none absolute overflow-visible"
      style={{
        left: -filterPad,
        top: -filterPad,
        width: viewWidth,
        height: viewHeight,
      }}
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation={blur} result="shadow-blur" />
          <feOffset in="shadow-blur" dx={offsetX} dy={offsetY} result="shadow-offset" />
          <feFlood floodColor={`rgba(0,0,0,${alpha})`} result="shadow-color" />
          <feComposite in="shadow-color" in2="shadow-offset" operator="in" result="shadow" />
        </filter>
      </defs>
      <path d={shadowPath} fill="black" filter={`url(#${filterId})`} />
    </svg>
  );
};

export const GlassDiffusionField: React.FC<Props> = ({
  width,
  height,
  config,
  className = "",
  style,
  showField = true,
  showBoundary = false,
  boundaryDasharray = "4 4",
  boundaryWidth = 1.2,
  boundaryColor,
}) => {
  const { blur, curve, edgeAlpha, fade, fadeInsetX, fadeInsetY, fillAlpha, saturate } = config;
  const overscanPad = Math.ceil(Math.max(24, blur * 1.25, fade * 2));
  const fieldWidth = width + overscanPad * 2;
  const fieldHeight = height + overscanPad * 2;

  const fieldMask = useMemo(() => {
    if (width <= 0 || height <= 0) return "none";
    const bodyWidth = Math.max(24, width - fadeInsetX);
    const bodyHeight = Math.max(24, height - fadeInsetY);
    const bodyX = overscanPad + (width - bodyWidth) / 2;
    const bodyY = overscanPad + (height - bodyHeight) / 2;
    const edgeBlur = Math.max(1, fade + blur * 0.4);
    const bodyPath = buildSuperellipsePath(bodyWidth, bodyHeight, curve, bodyX, bodyY);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${fieldWidth}" height="${fieldHeight}" viewBox="0 0 ${fieldWidth} ${fieldHeight}">
        <defs>
          <filter id="melt" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="${edgeBlur}" edgeMode="none" result="soft"/>
            <feComponentTransfer in="soft" result="alpha-shaped">
              <feFuncA type="gamma" amplitude="1.42" exponent="0.76" offset="0"/>
            </feComponentTransfer>
          </filter>
        </defs>
        <path d="${bodyPath}" fill="white" filter="url(#melt)"/>
      </svg>
    `.trim();
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [blur, curve, fade, fadeInsetX, fadeInsetY, fieldHeight, fieldWidth, height, overscanPad, width]);

  const boundaryPath = useMemo(() => {
    if (width <= 0 || height <= 0) return "";
    return buildSuperellipsePath(width, height, curve, overscanPad, overscanPad);
  }, [curve, height, overscanPad, width]);

  const fieldStyle = useMemo<React.CSSProperties>(
    () => ({
      position: "absolute",
      left: -overscanPad,
      top: -overscanPad,
      width: fieldWidth,
      height: fieldHeight,
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
    [blur, fieldHeight, fieldMask, fieldWidth, fillAlpha, overscanPad, saturate]
  );

  if (width <= 0 || height <= 0) return null;

  return (
    <div className={className} style={{ ...style, overflow: "visible" }} aria-hidden="true">
      {showField ? <div style={fieldStyle} /> : null}
      {showBoundary ? (
        <svg
          className="pointer-events-none absolute overflow-visible"
          style={{
            left: -overscanPad,
            top: -overscanPad,
            width: fieldWidth,
            height: fieldHeight,
          }}
          viewBox={`0 0 ${fieldWidth} ${fieldHeight}`}
          preserveAspectRatio="none"
        >
          <path
            d={boundaryPath}
            fill="none"
            stroke={boundaryColor || `rgba(255,255,255,${edgeAlpha})`}
            strokeWidth={boundaryWidth}
            strokeDasharray={boundaryDasharray}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
    </div>
  );
};
