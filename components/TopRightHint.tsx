import React from "react";

type Props = {
  children: React.ReactNode;
  right?: number;
  top?: number;
  stackIndex?: number;
  stackGap?: number;
  widthClassName?: string;
  className?: string;
  onClick?: () => void;
  action?: React.ReactNode;
  dismiss?: React.ReactNode;
};

export const TopRightHint: React.FC<Props> = ({
  children,
  right = 16,
  top = 16,
  stackIndex = 0,
  stackGap = 12,
  widthClassName = "w-[min(320px,calc(100vw-32px))]",
  className = "",
  onClick,
  action,
  dismiss,
}) => {
  const content = (
    <div
      className={`${widthClassName} rounded-[22px] border border-[var(--app-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-4 py-3 text-[var(--app-text-primary)] shadow-[0_16px_36px_-24px_rgba(0,0,0,0.42)] backdrop-blur-xl ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        {action || dismiss ? (
          <div className="flex shrink-0 items-center gap-2">
            {action}
            {dismiss}
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div
      className="pointer-events-none fixed z-[72]"
      style={{ right, top: top + stackIndex * (84 + stackGap) }}
    >
      <div
        className={`pointer-events-auto ${onClick ? "cursor-pointer" : ""}`}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        {content}
      </div>
    </div>
  );
};
