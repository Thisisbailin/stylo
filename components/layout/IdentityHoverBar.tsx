import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ProjectData } from "../../types";
import { buildProjectIdentities } from "../../utils/identityCards";

type Props = {
  projectData: ProjectData;
  onSelectIdentity: (identityId: string) => void;
};

const getAvatarLabel = (value: string) => value.trim().slice(0, 1).toUpperCase() || "I";

export const IdentityHoverBar: React.FC<Props> = ({
  projectData,
  onSelectIdentity,
}) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const identities = useMemo(() => {
    return buildProjectIdentities(projectData.context, projectData.designAssets || [])
      .filter((identity) => identity.kind === "person")
      .sort((a, b) => Number(!!b.isMain) - Number(!!a.isMain) || a.displayName.localeCompare(b.displayName, "zh-Hans-CN"));
  }, [projectData.context, projectData.designAssets]);

  const visibleIdentities = identities.slice(0, 5);
  const extraCount = Math.max(0, identities.length - visibleIdentities.length);

  useEffect(() => {
    if (!isMoreOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isMoreOpen]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[52] h-24">
      <div className="group relative h-full pointer-events-auto">
        <div className="absolute inset-x-0 top-0 h-24" />

        <div className="absolute inset-x-0 top-5 opacity-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(8,10,10,0.18),rgba(8,10,10,0))]" />

          <div className="relative flex items-start justify-center px-6">
            <div className="pointer-events-auto absolute right-6 top-0 flex items-center gap-2" ref={popoverRef}>
              {visibleIdentities.length > 0 ? (
                <div className="flex items-center justify-end -space-x-3">
                  {visibleIdentities.map((identity, index) => (
                    <button
                      key={identity.id}
                      type="button"
                      onClick={() => onSelectIdentity(identity.id)}
                      className="relative h-11 w-11 overflow-hidden rounded-full border border-white/14 bg-[rgba(14,17,16,0.82)] text-[11px] font-semibold text-white shadow-[0_12px_28px_rgba(0,0,0,0.24)] backdrop-blur-[14px] transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:z-10 hover:-translate-y-[2px] hover:border-emerald-300/36"
                      style={{ zIndex: visibleIdentities.length - index }}
                      title={`${identity.displayName} · ${identity.summary}`}
                    >
                      {identity.avatarUrl ? (
                        <img src={identity.avatarUrl} alt={identity.displayName} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(18,31,26,0.94),rgba(31,66,54,0.94))]">
                          {getAvatarLabel(identity.familyName)}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ) : null}

              {extraCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setIsMoreOpen((prev) => !prev)}
                  className="inline-flex h-11 items-center gap-1 rounded-full border border-white/10 bg-[rgba(14,17,16,0.76)] px-3.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]/84 shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-[14px] transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:bg-[rgba(18,21,20,0.88)]"
                >
                  +{extraCount}
                  <ChevronDown size={12} className={`transition-transform duration-300 ${isMoreOpen ? "rotate-180" : ""}`} />
                </button>
              ) : null}

              {isMoreOpen ? (
                <div className="absolute right-0 top-full mt-3 w-[360px] rounded-[26px] border border-white/10 bg-[rgba(10,12,12,0.92)] p-2 shadow-[0_24px_80px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[24px]">
                  <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-secondary)]/78">
                    角色身份证
                  </div>

                  <div className="max-h-[320px] space-y-1 overflow-y-auto px-1 pb-1">
                    {identities.map((identity) => (
                      <button
                        key={identity.id}
                        type="button"
                        onClick={() => {
                          onSelectIdentity(identity.id);
                          setIsMoreOpen(false);
                        }}
                        className="grid w-full grid-cols-[48px_minmax(0,1fr)] items-center gap-3 rounded-[20px] border border-transparent bg-white/[0.03] px-3 py-2.5 text-left transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-emerald-300/18 hover:bg-white/[0.06]"
                      >
                        <div className="h-12 w-12 overflow-hidden rounded-[16px] border border-white/10 bg-[linear-gradient(135deg,rgba(20,38,31,0.9),rgba(30,70,55,0.92))]">
                          {identity.avatarUrl ? (
                            <img src={identity.avatarUrl} alt={identity.displayName} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[13px] font-semibold text-white">
                              {getAvatarLabel(identity.familyName)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold tracking-[0.02em] text-[var(--text-primary)]">
                            {identity.displayName}
                          </div>
                          <div className="mt-1 truncate text-[10px] uppercase tracking-[0.14em] text-[var(--text-secondary)]/72">
                            {identity.summary}
                          </div>
                          <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-[var(--text-secondary)]/86">
                            {identity.description}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
