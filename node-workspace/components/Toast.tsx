import React, { useEffect } from "react";
import { create } from "zustand";
import { TopRightHint } from "../../components/TopRightHint";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastState {
  message: string | null;
  type: ToastType;
  show: (msg: string, type?: ToastType) => void;
  clear: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  type: "info",
  show: (message, type = "info") => set({ message, type }),
  clear: () => set({ message: null }),
}));

export const Toast: React.FC = () => {
  const { message, type, clear } = useToast();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clear, 2500);
    return () => clearTimeout(t);
  }, [message, clear]);

  if (!message) return null;

  const colors: Record<ToastType, string> = {
    success: "#57c38c",
    error: "#ff6b6b",
    info: "#60a5fa",
    warning: "#f0b44c",
  };

  return (
    <TopRightHint stackIndex={1} widthClassName="w-[min(320px,calc(100vw-32px))]">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: colors[type] }}
        />
        <div className="text-[12px] leading-5 text-[var(--app-text-primary)]">{message}</div>
      </div>
    </TopRightHint>
  );
};
