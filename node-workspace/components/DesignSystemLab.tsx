import React, { useEffect } from "react";
import {
  BoundingBox,
  CursorClick,
  GridFour,
  Palette,
  TextT,
  X,
} from "@phosphor-icons/react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const futureSections = [
  { label: "Tokens", detail: "颜色、间距、圆角、层级与材质", Icon: Palette },
  { label: "Typography", detail: "编辑器、画布与出版物字体层级", Icon: TextT },
  { label: "Components", detail: "原子节点、包装器与系统控件", Icon: GridFour },
  { label: "Motion", detail: "状态转换、收展与 reduced-motion", Icon: CursorClick },
];

export const DesignSystemLab: React.FC<Props> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <section
      className="fixed inset-0 z-[90] min-h-[100dvh] overflow-auto bg-[var(--app-bg)] text-[var(--app-text-primary)]"
      role="dialog"
      aria-modal="true"
      aria-label="Design System Lab"
      data-testid="design-system-lab"
    >
      <header className="sticky top-0 z-[1] grid h-16 grid-cols-[1fr_auto] items-center border-b border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-bg)_92%,transparent)] px-6 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <BoundingBox size={19} weight="duotone" aria-hidden="true" />
          <h1 className="truncate text-[15px] font-semibold tracking-[-0.025em]">Design System</h1>
          <span className="border-l border-[var(--app-border)] pl-3 font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Lab placeholder</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭 Design System Lab"
          className="grid h-9 w-9 place-items-center rounded-full border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-text-secondary)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text-primary)] active:scale-[0.96]"
        >
          <X size={16} weight="bold" />
        </button>
      </header>

      <main className="mx-auto grid w-full max-w-[1400px] gap-12 px-6 py-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)] lg:px-10 lg:py-16">
        <section className="min-w-0">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--app-text-muted)]">UI language / draft 00</span>
          <h2 className="mt-5 max-w-[14ch] text-4xl font-semibold leading-none tracking-[-0.06em] md:text-6xl">让 Stylo 的每一种界面说同一种语言。</h2>
          <p className="mt-7 max-w-[62ch] text-[14px] leading-7 text-[var(--app-text-secondary)]">
            这里将成为视觉 token、组件行为、包装器材质与动效规范的唯一工作台。本轮先建立入口和信息架构，暂不提供编辑与发布能力。
          </p>

          <div className="mt-14 border-t border-[var(--app-border)]">
            {futureSections.map(({ label, detail, Icon }, index) => (
              <div key={label} className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-4 border-b border-[var(--app-border)] py-5">
                <Icon size={18} weight="light" aria-hidden="true" />
                <div>
                  <strong className="block text-[13px] font-semibold">{label}</strong>
                  <span className="mt-1 block text-[11px] text-[var(--app-text-muted)]">{detail}</span>
                </div>
                <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--app-text-muted)]">0{index + 1} / planned</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="min-w-0 border-l border-[var(--app-border)] pl-8 lg:pt-20">
          <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Current scope</div>
          <div className="mt-5 aspect-[4/5] border border-[var(--app-border-strong)] bg-[var(--app-panel)] p-6 shadow-[inset_0_1px_0_color-mix(in_srgb,white_8%,transparent)]">
            <div className="grid h-full grid-rows-[auto_1fr_auto]">
              <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-[var(--app-text-muted)]">Stylo interface specimen</span>
              <div className="grid place-content-center gap-3 text-center">
                <BoundingBox className="mx-auto text-[var(--app-accent-strong)]" size={42} weight="thin" aria-hidden="true" />
                <strong className="text-[18px] font-semibold tracking-[-0.04em]">Specification pending</strong>
                <span className="text-[11px] text-[var(--app-text-muted)]">Tokens and components will arrive in later iterations.</span>
              </div>
              <div className="grid grid-cols-3 border-t border-[var(--app-border)] pt-4 font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--app-text-muted)]">
                <span>Neutral</span><span className="text-center">Material</span><span className="text-right">Motion</span>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </section>
  );
};
