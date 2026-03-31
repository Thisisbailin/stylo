import React from "react";
import { X } from "lucide-react";

type Props = {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  width?: number | string;
  position?: "center" | "right";
  children: React.ReactNode;
};

// Lightweight floating panel shell with backdrop, matching Assets glass style.
export const FloatingPanelShell: React.FC<Props> = ({
  title,
  isOpen,
  onClose,
  width = 900,
  position = "center",
  children,
}) => {
  if (!isOpen) return null;

  const isRight = position === "right";
  const resolvedWidth = isRight
    ? typeof width === "number"
      ? `min(max(${width}px, calc(100vw - 456px)), calc(100vw - 32px))`
      : width
    : width;

  React.useEffect(() => {
    if (!isRight || typeof document === "undefined") return undefined;
    const root = document.documentElement;
    root.classList.add("qalam-right-panel-open");
    root.style.setProperty("--qalam-right-panel-width", typeof resolvedWidth === "string" ? resolvedWidth : `${resolvedWidth}`);
    return () => {
      root.classList.remove("qalam-right-panel-open");
      root.style.removeProperty("--qalam-right-panel-width");
    };
  }, [isRight, resolvedWidth]);

  return (
    <div className={`fixed inset-0 z-[60] flex ${isRight ? "pointer-events-none items-stretch justify-end p-4" : "items-center justify-center"}`}>
      {!isRight && (
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div
        className={`relative flex flex-col overflow-hidden app-panel ${isRight ? "pointer-events-auto h-full rounded-[30px] border border-[var(--app-border)] shadow-[0_30px_80px_rgba(0,0,0,0.24)]" : "max-h-[86vh] rounded-3xl"}`}
        style={{ width: resolvedWidth, maxWidth: isRight ? "calc(100vw - 32px)" : undefined }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--app-border)]">
          <div className="text-sm font-semibold">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full border border-[var(--app-border)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-panel-muted)] transition"
            aria-label="Close"
          >
            <X size={16} className="mx-auto text-[var(--app-text-secondary)]" />
          </button>
        </div>
        <div className={`${isRight ? "flex-1 min-h-0" : "max-h-[calc(86vh-64px)]"} overflow-auto p-5`}>{children}</div>
      </div>
    </div>
  );
};
