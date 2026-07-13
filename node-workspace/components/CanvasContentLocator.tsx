import React from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "@phosphor-icons/react";
import type { CanvasContentDirection } from "./canvas/contentLocator";

type Props = {
  direction: CanvasContentDirection;
  leftInset?: number;
  onReturn: () => void;
};

const directionMeta = {
  left: { label: "节点位于左侧", Icon: ArrowLeft, shiftX: "-3px", shiftY: "0px" },
  right: { label: "节点位于右侧", Icon: ArrowRight, shiftX: "3px", shiftY: "0px" },
  up: { label: "节点位于上方", Icon: ArrowUp, shiftX: "0px", shiftY: "-3px" },
  down: { label: "节点位于下方", Icon: ArrowDown, shiftX: "0px", shiftY: "3px" },
} satisfies Record<CanvasContentDirection, {
  label: string;
  Icon: React.ComponentType<{ size?: number; weight?: "bold" }>;
  shiftX: string;
  shiftY: string;
}>;

const buildPositionStyle = (direction: CanvasContentDirection, leftInset: number): React.CSSProperties => {
  if (direction === "left") return { left: Math.max(20, leftInset + 20), top: "46%", transform: "translateY(-50%)" };
  if (direction === "right") return { right: 20, top: "46%", transform: "translateY(-50%)" };
  if (direction === "up") {
    return { left: `calc(50% + ${leftInset / 2}px)`, top: 20, transform: "translateX(-50%)" };
  }
  return { left: `calc(50% + ${leftInset / 2}px)`, bottom: 88, transform: "translateX(-50%)" };
};

export const CanvasContentLocator: React.FC<Props> = ({ direction, leftInset = 0, onReturn }) => {
  const { label, Icon, shiftX, shiftY } = directionMeta[direction];
  const iconStyle = {
    "--canvas-locator-shift-x": shiftX,
    "--canvas-locator-shift-y": shiftY,
  } as React.CSSProperties;

  return (
    <div
      className="canvas-content-locator"
      style={buildPositionStyle(direction, Math.max(0, leftInset))}
      role="status"
      aria-live="polite"
      data-direction={direction}
    >
      <button
        type="button"
        className="canvas-content-locator__button"
        onClick={onReturn}
        aria-label={`当前视口没有节点，${label}。返回节点区域`}
      >
        <span className="canvas-content-locator__icon" style={iconStyle} aria-hidden="true">
          <Icon size={15} weight="bold" />
        </span>
        <span className="canvas-content-locator__copy">
          <strong>返回节点区域</strong>
          <span>{label}</span>
        </span>
      </button>
    </div>
  );
};
