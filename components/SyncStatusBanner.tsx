import React, { useEffect, useState } from "react";
import type { SyncState } from "../types";

type Props = {
  syncState: SyncState;
  isSignedIn: boolean;
};

export const SyncStatusBanner: React.FC<Props> = ({
  syncState,
  isSignedIn,
}) => {
  const project = syncState.project;
  const hasPendingProjectWrite = isSignedIn
    && project.status === "syncing"
    && (project.pendingOps ?? 0) > 0;
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!hasPendingProjectWrite) {
      setIsVisible(false);
      return undefined;
    }
    // Fast acknowledgements should remain invisible instead of flashing a
    // status for work the user never perceived as waiting.
    const timer = window.setTimeout(() => setIsVisible(true), 320);
    return () => window.clearTimeout(timer);
  }, [hasPendingProjectWrite]);

  if (!isVisible || !hasPendingProjectWrite) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-4 z-[80] flex -translate-x-1/2 items-center gap-2 text-[10px] font-medium tracking-[0.08em] text-[var(--app-text-secondary)]"
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--app-accent-strong)]"
      />
      <span>正在同步更改</span>
    </div>
  );
};
