import React from "react";
import { ArrowRight, Cloud } from "lucide-react";

type Props = {
  isConfigured: boolean;
  onSignIn: () => void;
};

export const CloudAccountGate: React.FC<Props> = ({ isConfigured, onSignIn }) => (
  <main className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-6 text-[var(--app-text-primary)]">
    <section className="w-full max-w-[430px] rounded-[30px] border border-black/10 bg-[var(--app-panel)] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.10)] dark:border-white/10">
      <div className="mb-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white dark:bg-white dark:text-black">
        <Cloud size={21} strokeWidth={1.7} />
      </div>
      <p className="text-[11px] font-medium uppercase tracking-[0.24em] opacity-45">Stylo Cloud</p>
      <h1 className="mt-3 text-[30px] font-medium leading-[1.08] tracking-[-0.04em]">
        项目始终属于你的云账户
      </h1>
      <p className="mt-5 text-[14px] leading-6 opacity-60">
        登录后创建或打开项目。电脑、手机与网页端共享同一份云端项目，不再创建无法同步的访客项目。
      </p>
      <button
        type="button"
        onClick={onSignIn}
        disabled={!isConfigured}
        className="mt-8 flex min-h-12 w-full items-center justify-between rounded-2xl bg-black px-4 text-[13px] font-medium text-white transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-35 dark:bg-white dark:text-black"
      >
        <span>{isConfigured ? "登录并继续" : "当前环境未配置云账户"}</span>
        <ArrowRight size={17} />
      </button>
      {!isConfigured ? (
        <p className="mt-3 text-[12px] leading-5 opacity-45">
          请先配置 VITE_CLERK_PUBLISHABLE_KEY；Stylo 不会静默降级为仅本地项目。
        </p>
      ) : null}
    </section>
  </main>
);
