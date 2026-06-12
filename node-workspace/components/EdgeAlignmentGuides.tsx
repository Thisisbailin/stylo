import React, { useEffect, useState } from "react";
import type { EdgeAlignmentGuide } from "../utils/edgeAlignment";

type ViewportLike = {
  x: number;
  y: number;
  zoom: number;
};

type Props = {
  guide: EdgeAlignmentGuide | null;
  viewport: ViewportLike;
};

type GuideState = "active" | "exiting";
type GuideVars = React.CSSProperties &
  Record<"--snap-guide-offset" | "--snap-guide-strength" | "--snap-guide-opacity", string | number>;

const EXIT_DURATION = 180;

const hasGuide = (guide: EdgeAlignmentGuide | null): guide is EdgeAlignmentGuide =>
  Boolean(guide && (guide.x != null || guide.y != null));

const getOpacity = (strength = 1) => Math.min(0.96, 0.38 + strength * 0.5);

export const EdgeAlignmentGuides: React.FC<Props> = ({ guide, viewport }) => {
  const [renderedGuide, setRenderedGuide] = useState<EdgeAlignmentGuide | null>(guide);
  const [state, setState] = useState<GuideState>("active");

  useEffect(() => {
    if (hasGuide(guide)) {
      setRenderedGuide(guide);
      setState("active");
      return;
    }

    if (!renderedGuide) return;
    setState("exiting");
    const timeout = window.setTimeout(() => setRenderedGuide(null), EXIT_DURATION);
    return () => window.clearTimeout(timeout);
  }, [guide, renderedGuide]);

  if (!renderedGuide) return null;

  return (
    <div className="nodeflow-snap-guides pointer-events-none absolute inset-0 z-[9]" data-state={state} aria-hidden="true">
      {renderedGuide.x != null ? (
        <div
          className="nodeflow-snap-guide nodeflow-snap-guide--vertical"
          style={
            {
              "--snap-guide-offset": `${viewport.x + renderedGuide.x * viewport.zoom}px`,
              "--snap-guide-strength": renderedGuide.xStrength ?? 1,
              "--snap-guide-opacity": getOpacity(renderedGuide.xStrength),
            } as GuideVars
          }
        />
      ) : null}
      {renderedGuide.y != null ? (
        <div
          className="nodeflow-snap-guide nodeflow-snap-guide--horizontal"
          style={
            {
              "--snap-guide-offset": `${viewport.y + renderedGuide.y * viewport.zoom}px`,
              "--snap-guide-strength": renderedGuide.yStrength ?? 1,
              "--snap-guide-opacity": getOpacity(renderedGuide.yStrength),
            } as GuideVars
          }
        />
      ) : null}
    </div>
  );
};
