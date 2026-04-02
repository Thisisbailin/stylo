import React, { useMemo } from "react";

export type GlassDiffusionPresetKey = "bare" | "mist" | "veil";

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
    curve: 4.2,
  },
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

  const fieldMask = useMemo(() => {
    if (width <= 0 || height <= 0) return "none";
    const innerWidth = Math.max(24, width - fadeInsetX * 2);
    const innerHeight = Math.max(24, height - fadeInsetY * 2);
    const innerX = (width - innerWidth) / 2;
    const innerY = (height - innerHeight) / 2;
    const edgeBlur = Math.max(0.1, fade);
    const outerPath = buildSuperellipsePath(width, height, curve);
    const innerPath = buildSuperellipsePath(innerWidth, innerHeight, curve, innerX, innerY);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <clipPath id="outer-clip">
            <path d="${outerPath}"/>
          </clipPath>
          <filter id="melt" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="${edgeBlur}" edgeMode="none" result="soft"/>
            <feComponentTransfer in="soft" result="alpha-shaped">
              <feFuncA type="gamma" amplitude="1" exponent="0.92" offset="0"/>
            </feComponentTransfer>
          </filter>
        </defs>
        <g clip-path="url(#outer-clip)">
          <path d="${innerPath}" fill="white" filter="url(#melt)"/>
        </g>
      </svg>
    `.trim();
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [curve, fade, fadeInsetX, fadeInsetY, height, width]);

  const boundaryPath = useMemo(() => {
    if (width <= 0 || height <= 0) return "";
    return buildSuperellipsePath(width, height, curve);
  }, [curve, height, width]);

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

  if (width <= 0 || height <= 0) return null;

  return (
    <div className={className} style={style} aria-hidden="true">
      {showField ? <div style={fieldStyle} /> : null}
      {showBoundary ? (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${width} ${height}`}
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
