import React, { useId } from "react";
import { useStore } from "@xyflow/react";

type PatternKey = "dots" | "grid" | "cross" | "lines" | "diagonal" | "none";

type Props = {
  pattern: PatternKey;
  baseColor: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
};

const BASE_STEPS: Record<Exclude<PatternKey, "none">, number> = {
  dots: 28,
  grid: 22,
  cross: 44,
  lines: 26,
  diagonal: 34,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const positiveModulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

const MinorPattern = ({
  pattern,
  step,
  primaryColor,
  secondaryColor,
}: {
  pattern: Exclude<PatternKey, "none">;
  step: number;
  primaryColor: string;
  secondaryColor: string;
}) => {
  const center = step / 2;

  if (pattern === "dots") {
    return <circle cx={center} cy={center} r={clamp(step * 0.055, 0.8, 1.7)} fill={primaryColor} />;
  }

  if (pattern === "cross") {
    const arm = clamp(step * 0.125, 4, 7);
    return (
      <path
        d={`M ${center - arm} ${center} H ${center + arm} M ${center} ${center - arm} V ${center + arm}`}
        fill="none"
        stroke={primaryColor}
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (pattern === "lines") {
    return (
      <path
        d={`M 0 ${step - 0.5} H ${step}`}
        fill="none"
        stroke={secondaryColor}
        strokeWidth="0.7"
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (pattern === "diagonal") {
    return (
      <path
        d={`M 0 ${step} L ${step} 0`}
        fill="none"
        stroke={secondaryColor}
        strokeWidth="0.75"
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  return (
    <path
      d={`M ${step - 0.5} 0 V ${step} M 0 ${step - 0.5} H ${step}`}
      fill="none"
      stroke={secondaryColor}
      strokeWidth="0.65"
      vectorEffect="non-scaling-stroke"
    />
  );
};

const MajorPattern = ({
  pattern,
  size,
  primaryColor,
  accentColor,
}: {
  pattern: Exclude<PatternKey, "none">;
  size: number;
  primaryColor: string;
  accentColor: string;
}) => {
  if (pattern === "dots") {
    return <circle cx={size / 2} cy={size / 2} r="1.8" fill={accentColor} />;
  }

  if (pattern === "cross") return null;

  if (pattern === "lines") {
    return (
      <path
        d={`M 0 ${size - 0.5} H ${size}`}
        fill="none"
        stroke={primaryColor}
        strokeWidth="1.1"
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (pattern === "diagonal") {
    return (
      <path
        d={`M 0 ${size} L ${size} 0`}
        fill="none"
        stroke={primaryColor}
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  return (
    <path
      d={`M ${size - 0.5} 0 V ${size} M 0 ${size - 0.5} H ${size}`}
      fill="none"
      stroke={primaryColor}
      strokeWidth="1"
      vectorEffect="non-scaling-stroke"
    />
  );
};

export const CanvasBackgroundField: React.FC<Props> = ({
  pattern,
  baseColor,
  primaryColor,
  secondaryColor,
  accentColor,
}) => {
  const transform = useStore((state) => state.transform);
  const patternId = useId().replace(/:/g, "");

  if (pattern === "none") {
    return <div className="canvas-background-field pointer-events-none absolute inset-0 z-0" style={{ background: baseColor }} aria-hidden="true" />;
  }

  const [viewportX, viewportY, zoom] = transform;
  const step = clamp(BASE_STEPS[pattern] * Math.max(0.25, zoom || 1), 18, 92);
  const majorEvery = pattern === "dots" ? 4 : 5;
  const majorSize = step * majorEvery;
  const offsetX = positiveModulo(viewportX, step);
  const offsetY = positiveModulo(viewportY, step);
  const majorOffsetX = positiveModulo(viewportX + step * 0.5, majorSize);
  const majorOffsetY = positiveModulo(viewportY + step * 0.5, majorSize);
  const minorId = `${patternId}-minor`;
  const majorId = `${patternId}-major`;

  return (
    <div
      className="canvas-background-field pointer-events-none absolute inset-0 z-0"
      style={{ background: baseColor }}
      aria-hidden="true"
    >
      <svg className="block h-full w-full" width="100%" height="100%">
        <defs>
          <pattern
            id={minorId}
            x={offsetX}
            y={offsetY}
            width={step}
            height={step}
            patternUnits="userSpaceOnUse"
          >
            <MinorPattern
              pattern={pattern}
              step={step}
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
            />
          </pattern>
          <pattern
            id={majorId}
            x={majorOffsetX}
            y={majorOffsetY}
            width={majorSize}
            height={majorSize}
            patternUnits="userSpaceOnUse"
          >
            <MajorPattern
              pattern={pattern}
              size={majorSize}
              primaryColor={primaryColor}
              accentColor={accentColor}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${minorId})`} />
        {pattern !== "cross" ? <rect width="100%" height="100%" fill={`url(#${majorId})`} /> : null}
      </svg>
    </div>
  );
};
