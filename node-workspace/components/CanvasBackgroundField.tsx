import React, { useEffect, useRef } from "react";
import type { EdgeAlignmentGuide } from "../utils/edgeAlignment";

type ViewportLike = {
  x: number;
  y: number;
  zoom: number;
};

type PatternKey = "dots" | "grid" | "cross" | "lines" | "diagonal" | "none";

type Props = {
  pattern: PatternKey;
  baseColor: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  viewport: ViewportLike;
  alignmentGuide?: EdgeAlignmentGuide | null;
  active?: boolean;
};

type PointerState = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  strength: number;
  targetStrength: number;
  lastMoveAt: number;
  inside: boolean;
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

const getStep = (pattern: PatternKey, zoom: number) => {
  if (pattern === "none") return 28;
  return clamp(BASE_STEPS[pattern] * Math.max(0.25, zoom || 1), 18, 92);
};

const getMovedPoint = (
  x: number,
  y: number,
  pointer: PointerState,
  guide: EdgeAlignmentGuide | null | undefined,
  viewport: ViewportLike,
  radius: number
) => {
  let nextX = x;
  let nextY = y;
  const pointerStrength = pointer.strength;

  if (pointerStrength > 0.01) {
    const dx = pointer.x - x;
    const dy = pointer.y - y;
    const distance = Math.hypot(dx, dy);
    if (distance > 64 && distance < radius) {
      const falloff = Math.pow(1 - distance / radius, 2.6);
      const push = 5.4 * falloff * pointerStrength;
      nextX -= (dx / distance) * push;
      nextY -= (dy / distance) * push;
    }
  }

  if (guide?.x != null) {
    const guideX = viewport.x + guide.x * viewport.zoom;
    const distance = Math.abs(guideX - x);
    if (distance < 132) {
      const falloff = Math.pow(1 - distance / 132, 2);
      nextX += (guideX - x) * falloff * 0.08 * (guide.xStrength ?? 1);
    }
  }

  if (guide?.y != null) {
    const guideY = viewport.y + guide.y * viewport.zoom;
    const distance = Math.abs(guideY - y);
    if (distance < 132) {
      const falloff = Math.pow(1 - distance / 132, 2);
      nextY += (guideY - y) * falloff * 0.08 * (guide.yStrength ?? 1);
    }
  }

  return { x: nextX, y: nextY };
};

const drawDotPattern = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  step: number,
  offsetX: number,
  offsetY: number,
  primary: string,
  secondary: string,
  pointer: PointerState,
  guide: EdgeAlignmentGuide | null | undefined,
  viewport: ViewportLike
) => {
  const radius = Math.max(0.8, Math.min(1.7, step * 0.055));
  let row = 0;
  for (let y = offsetY - step; y <= height + step; y += step) {
    let col = 0;
    for (let x = offsetX - step; x <= width + step; x += step) {
      const point = getMovedPoint(x, y, pointer, guide, viewport, 360);
      ctx.fillStyle = (row + col) % 4 === 0 ? secondary : primary;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
      col += 1;
    }
    row += 1;
  }
};

const drawGridPattern = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  step: number,
  offsetX: number,
  offsetY: number,
  primary: string,
  secondary: string,
  pointer: PointerState,
  guide: EdgeAlignmentGuide | null | undefined,
  viewport: ViewportLike
) => {
  const majorEvery = 5;
  const sample = Math.max(18, step);

  for (let x = offsetX - step; x <= width + step; x += step) {
    const major = Math.round((x - offsetX) / step) % majorEvery === 0;
    ctx.strokeStyle = major ? primary : secondary;
    ctx.lineWidth = major ? 1.1 : 0.65;
    ctx.beginPath();
    for (let y = -sample; y <= height + sample; y += sample) {
      const point = getMovedPoint(x, y, pointer, guide, viewport, 340);
      if (y <= -sample + 0.01) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }

  for (let y = offsetY - step; y <= height + step; y += step) {
    const major = Math.round((y - offsetY) / step) % majorEvery === 0;
    ctx.strokeStyle = major ? primary : secondary;
    ctx.lineWidth = major ? 1.1 : 0.65;
    ctx.beginPath();
    for (let x = -sample; x <= width + sample; x += sample) {
      const point = getMovedPoint(x, y, pointer, guide, viewport, 340);
      if (x <= -sample + 0.01) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }
};

const drawCrossPattern = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  step: number,
  offsetX: number,
  offsetY: number,
  primary: string,
  secondary: string,
  pointer: PointerState,
  guide: EdgeAlignmentGuide | null | undefined,
  viewport: ViewportLike
) => {
  const arm = clamp(step * 0.125, 4, 7);
  let row = 0;
  for (let y = offsetY - step; y <= height + step; y += step) {
    let col = 0;
    for (let x = offsetX - step; x <= width + step; x += step) {
      const point = getMovedPoint(x, y, pointer, guide, viewport, 360);
      ctx.strokeStyle = (row + col) % 3 === 0 ? secondary : primary;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(point.x - arm, point.y);
      ctx.lineTo(point.x + arm, point.y);
      ctx.moveTo(point.x, point.y - arm);
      ctx.lineTo(point.x, point.y + arm);
      ctx.stroke();
      col += 1;
    }
    row += 1;
  }
};

const drawLinePattern = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  step: number,
  offsetY: number,
  primary: string,
  secondary: string,
  pointer: PointerState,
  guide: EdgeAlignmentGuide | null | undefined,
  viewport: ViewportLike
) => {
  const sample = Math.max(18, step);
  for (let y = offsetY - step; y <= height + step; y += step) {
    const major = Math.round((y - offsetY) / step) % 4 === 0;
    ctx.strokeStyle = major ? primary : secondary;
    ctx.lineWidth = major ? 1.2 : 0.7;
    ctx.beginPath();
    for (let x = -sample; x <= width + sample; x += sample) {
      const point = getMovedPoint(x, y, pointer, guide, viewport, 340);
      if (x <= -sample + 0.01) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }
};

const drawDiagonalPattern = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  step: number,
  offsetX: number,
  offsetY: number,
  primary: string,
  secondary: string,
  pointer: PointerState,
  guide: EdgeAlignmentGuide | null | undefined,
  viewport: ViewportLike
) => {
  const span = width + height;
  const sample = Math.max(18, step);
  for (let origin = -span; origin <= span; origin += step) {
    const major = Math.round((origin - offsetX - offsetY) / step) % 4 === 0;
    ctx.strokeStyle = major ? primary : secondary;
    ctx.lineWidth = major ? 1.1 : 0.7;
    ctx.beginPath();
    for (let t = -sample; t <= span + sample; t += sample) {
      const x = origin + t + positiveModulo(offsetX + offsetY, step);
      const y = t;
      const point = getMovedPoint(x, y, pointer, guide, viewport, 330);
      if (t <= -sample + 0.01) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }
};

export const CanvasBackgroundField: React.FC<Props> = ({
  pattern,
  baseColor,
  primaryColor,
  secondaryColor,
  accentColor,
  viewport,
  alignmentGuide,
  active = true,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const scheduleDrawRef = useRef<() => void>(() => {});
  const reducedMotionRef = useRef(false);
  const propsRef = useRef({ pattern, baseColor, primaryColor, secondaryColor, accentColor, viewport, alignmentGuide, active });
  const pointerRef = useRef<PointerState>({
    x: -1000,
    y: -1000,
    targetX: -1000,
    targetY: -1000,
    strength: 0,
    targetStrength: 0,
    lastMoveAt: 0,
    inside: false,
  });

  propsRef.current = { pattern, baseColor, primaryColor, secondaryColor, accentColor, viewport, alignmentGuide, active };

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const draw = () => {
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      const rect = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const nextWidth = Math.floor(width * dpr);
      const nextHeight = Math.floor(height * dpr);
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }

      const current = propsRef.current;
      const pointer = pointerRef.current;
      const now = performance.now();
      const canAnimate = current.active && !reducedMotionRef.current;
      pointer.targetStrength = canAnimate && pointer.inside && now - pointer.lastMoveAt < 1100 ? 0.72 : 0;
      pointer.x += (pointer.targetX - pointer.x) * 0.08;
      pointer.y += (pointer.targetY - pointer.y) * 0.08;
      pointer.strength += (pointer.targetStrength - pointer.strength) * 0.045;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = current.baseColor;
      ctx.fillRect(0, 0, width, height);

      if (current.pattern !== "none") {
        const step = getStep(current.pattern, current.viewport.zoom);
        const offsetX = positiveModulo(current.viewport.x, step);
        const offsetY = positiveModulo(current.viewport.y, step);

        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        if (current.pattern === "dots") {
          drawDotPattern(ctx, width, height, step, offsetX, offsetY, current.primaryColor, current.secondaryColor, pointer, current.alignmentGuide, current.viewport);
        } else if (current.pattern === "grid") {
          drawGridPattern(ctx, width, height, step, offsetX, offsetY, current.primaryColor, current.secondaryColor, pointer, current.alignmentGuide, current.viewport);
        } else if (current.pattern === "cross") {
          drawCrossPattern(ctx, width, height, step, offsetX, offsetY, current.primaryColor, current.secondaryColor, pointer, current.alignmentGuide, current.viewport);
        } else if (current.pattern === "lines") {
          drawLinePattern(ctx, width, height, step, offsetY, current.primaryColor, current.secondaryColor, pointer, current.alignmentGuide, current.viewport);
        } else if (current.pattern === "diagonal") {
          drawDiagonalPattern(ctx, width, height, step, offsetX, offsetY, current.primaryColor, current.secondaryColor, pointer, current.alignmentGuide, current.viewport);
        }
        ctx.restore();
      }

      const shouldContinue =
        canAnimate &&
        (pointer.strength > 0.02 ||
          Math.abs(pointer.targetX - pointer.x) > 0.2 ||
          Math.abs(pointer.targetY - pointer.y) > 0.2 ||
          Boolean(current.alignmentGuide));
      frameRef.current = shouldContinue ? window.requestAnimationFrame(draw) : null;
    };

    const scheduleDraw = () => {
      if (frameRef.current != null) return;
      frameRef.current = window.requestAnimationFrame(draw);
    };
    scheduleDrawRef.current = scheduleDraw;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      const pointer = pointerRef.current;
      pointer.inside = inside;
      if (!inside) {
        pointer.lastMoveAt = 0;
        scheduleDraw();
        return;
      }
      pointer.targetX = event.clientX - rect.left;
      pointer.targetY = event.clientY - rect.top;
      if (pointer.x < -100) {
        pointer.x = pointer.targetX;
        pointer.y = pointer.targetY;
      }
      pointer.lastMoveAt = performance.now();
      scheduleDraw();
    };

    const handlePointerLeave = () => {
      pointerRef.current.inside = false;
      pointerRef.current.lastMoveAt = 0;
      scheduleDraw();
    };

    const resizeObserver = new ResizeObserver(scheduleDraw);
    resizeObserver.observe(host);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave);
    scheduleDraw();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      scheduleDrawRef.current = () => {};
    };
  }, []);

  useEffect(() => {
    scheduleDrawRef.current();
  }, [pattern, baseColor, primaryColor, secondaryColor, accentColor, viewport, alignmentGuide, active]);

  return (
    <div ref={hostRef} className="canvas-background-field pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
};
