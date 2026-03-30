import React from "react";
import {
  ArrowRight,
  Brain,
  CirclesThree,
  ClockCountdown,
  CursorClick,
  Database,
  FileMagnifyingGlass,
  Graph,
  Path,
  PenNib,
  Sparkle,
  TreeStructure,
  Waveform,
} from "@phosphor-icons/react";
import { MagneticButton } from "./landing/MagneticButton";
import { PromptCycle } from "./landing/PromptCycle";

type Props = {
  isDarkMode?: boolean;
  onEnterApp: () => void;
  onTryMe?: () => void | Promise<void>;
};

const capabilityBlocks = [
  {
    eyebrow: "Inspect",
    title: "读取项目证据",
    description: "统一通过目录、读取与搜索接口获取 episode、storyboard、summary、character、scene 证据。",
    tools: ["list_project_resources", "read_project_resource", "search_project_resource"],
    Icon: FileMagnifyingGlass,
  },
  {
    eyebrow: "Understand",
    title: "写回知识层",
    description: "summary、profile、storyboard 不留在聊天里，而是通过统一资源写接口进入长期事实层。",
    tools: ["edit_project_resource"],
    Icon: Database,
  },
  {
    eyebrow: "Operate",
    title: "生成 NodeLab 图",
    description: "把理解继续落成节点与连线，形成最小可操作的 NodeLab 工作区。",
    tools: ["operate_project_resource"],
    Icon: TreeStructure,
  },
];

const runtimeFacts = [
  {
    label: "Dual Runtime",
    value: "Browser + Edge",
    detail: "操作类请求自动走 browser，流式与读重请求可走 Edge。",
    Icon: CirclesThree,
  },
  {
    label: "Session Memory",
    value: "user / assistant / tool",
    detail: "会话记忆保留上下文，但长期真相留在 ProjectData。",
    Icon: ClockCountdown,
  },
  {
    label: "Trace Events",
    value: "run → tool → result",
    detail: "前端消费归一化 runtime event，而不是拼原始 provider 响应。",
    Icon: Waveform,
  },
  {
    label: "Local Skills",
    value: "overlayed prompts",
    detail: "SKILL.md 叠加专业能力与约束，不把规则散落在 UI 里。",
    Icon: Sparkle,
  },
];

const knowledgeRows = [
  "Project Summary / Episode Summary",
  "Character Profile + Forms",
  "Scene Profile + Zones",
  "Node workflow as next action",
];

const eventRail = [
  "run_started",
  "tool_called",
  "tool_completed",
  "message_completed",
];

export const LandingPage: React.FC<Props> = ({ isDarkMode = true, onEnterApp, onTryMe }) => {
  return (
    <div
      className={`${isDarkMode ? "dark" : ""} relative h-[100dvh] overflow-hidden bg-[#efe8dc] text-zinc-950 dark:bg-[#101311] dark:text-zinc-50`}
      style={{ fontFamily: '"Outfit", "Avenir Next", "Segoe UI", sans-serif' }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="landing-orb landing-orb--emerald absolute left-[-10%] top-[-4%] h-[28rem] w-[28rem] rounded-full bg-emerald-500/14 blur-3xl dark:bg-emerald-400/14" />
        <div className="landing-orb landing-orb--sand absolute right-[-8%] top-[12%] h-[24rem] w-[24rem] rounded-full bg-stone-500/16 blur-3xl dark:bg-stone-300/10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.55),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.12),transparent_26%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.10),transparent_24%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.05)_1px,transparent_1px)] bg-[size:84px_84px] opacity-35 dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] dark:opacity-20" />
      </div>

      <div className="relative mx-auto flex h-full max-w-[1400px] flex-col px-4 py-4 sm:px-6 md:px-8 md:py-6">
        <header className="landing-reveal flex items-center justify-between border-b border-black/10 pb-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-black/10 bg-white/55 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04]">
              <PenNib size={18} weight="duotone" className="text-emerald-700 dark:text-emerald-300" />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-zinc-500 dark:text-zinc-400">Standalone Landing</div>
              <div className="mt-1 text-lg font-semibold tracking-[-0.04em]">QALAM / قلم / pen</div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <div className="hidden rounded-full border border-black/10 bg-white/55 px-4 py-2 text-zinc-700 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300 md:block">
              Agent-first creative operating surface
            </div>
            {onTryMe ? (
              <button
                type="button"
                onClick={async () => {
                  await onTryMe();
                  onEnterApp();
                }}
                className="group hidden items-center gap-3 rounded-[1.15rem] border border-black/10 bg-white/70 px-4 py-2.5 text-left text-zinc-800 shadow-[0_20px_50px_-34px_rgba(15,23,42,0.32)] backdrop-blur-xl transition hover:border-emerald-600/30 hover:bg-white/88 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-100 dark:hover:border-emerald-300/30 dark:hover:bg-white/[0.08] md:inline-flex"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-[0.95rem] border border-black/10 bg-black/[0.03] text-emerald-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-emerald-300">
                  <Sparkle size={15} weight="duotone" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold tracking-[-0.02em]">从示例项目开始</span>
                  <span className="mt-0.5 block text-[10px] text-zinc-500 dark:text-zinc-400">直接载入脚本、资产与节点结构</span>
                </span>
              </button>
            ) : null}
            <MagneticButton
              type="button"
              onClick={onEnterApp}
              className="bg-zinc-950 px-5 py-2.5 text-[11px] font-semibold text-white shadow-[0_18px_50px_-24px_rgba(15,23,42,0.55)] dark:bg-white dark:text-zinc-950"
              icon={<ArrowRight size={15} weight="bold" />}
            >
              立即体验
            </MagneticButton>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 pt-4 lg:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)]">
          <section className="grid min-h-0 grid-rows-[auto_auto_1fr] gap-4">
            <div className="landing-reveal rounded-[2rem] border border-black/10 bg-white/60 p-5 shadow-[0_28px_70px_-52px_rgba(15,23,42,0.35)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.04]">
              <div className="text-[10px] uppercase tracking-[0.32em] text-emerald-700 dark:text-emerald-300">Qalam Means Pen</div>
              <h1 className="mt-4 max-w-[11ch] text-4xl font-semibold leading-[0.92] tracking-[-0.07em] md:text-5xl">
                一支会读项目、会写知识、会搭工作流的 Agent 之笔。
              </h1>
              <p className="mt-4 max-w-[58ch] text-[14px] leading-7 text-zinc-700 dark:text-zinc-300">
                对 Qalam 来说，这不该只是一次换名。它应该先读取剧本与项目证据，再沉淀长期事实，最后把理解继续变成可执行的 NodeLab 图。
              </p>
            </div>

            <div className="landing-reveal grid grid-cols-2 gap-3" style={{ animationDelay: "120ms" }}>
              {[
                "Evidence-first",
                "Tool-mediated state",
                "Durable knowledge",
                "Executable graph",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-[1.5rem] border border-black/10 bg-white/58 px-4 py-3 text-[12px] font-medium text-zinc-700 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300"
                >
                  {item}
                </div>
              ))}
            </div>

            <div className="landing-reveal rounded-[2rem] border border-black/10 bg-white/60 p-4 shadow-[0_28px_70px_-52px_rgba(15,23,42,0.35)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.04]" style={{ animationDelay: "200ms" }}>
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.32em] text-zinc-500 dark:text-zinc-400">Capability Matrix</div>
                <div className="flex items-center gap-2 text-[12px] text-zinc-600 dark:text-zinc-400">
                  <CursorClick size={14} weight="duotone" />
                  无需登录
                </div>
              </div>

              <div className="mt-3 grid gap-3">
                {capabilityBlocks.map(({ eyebrow, title, description, tools, Icon }) => (
                  <div
                    key={eyebrow}
                    className="grid grid-cols-[132px_minmax(0,1fr)] gap-3 rounded-[1.5rem] border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <div className="border-r border-black/10 pr-3 dark:border-white/10">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-black/10 bg-white/60 dark:border-white/10 dark:bg-white/[0.04]">
                        <Icon size={16} weight="duotone" className="text-emerald-700 dark:text-emerald-300" />
                      </div>
                      <div className="mt-2 text-[10px] uppercase tracking-[0.26em] text-zinc-500 dark:text-zinc-400">{eyebrow}</div>
                      <div className="mt-1 text-[15px] font-semibold tracking-[-0.03em]">{title}</div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] leading-6 text-zinc-700 dark:text-zinc-300">{description}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {tools.map((tool) => (
                          <span
                            key={tool}
                            className="rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300"
                            style={{ fontFamily: '"IBM Plex Mono", "SFMono-Regular", monospace' }}
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4">
            <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.08fr)_260px]">
              <div className="landing-reveal rounded-[2rem] border border-black/10 bg-white/62 p-5 shadow-[0_32px_90px_-54px_rgba(15,23,42,0.42)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">QALAM SIGNAL</div>
                    <div className="mt-2 text-[24px] font-semibold tracking-[-0.05em]">run → inspect → understand → operate</div>
                  </div>
                  <div className="rounded-full border border-black/10 bg-black/[0.03] px-3 py-1 text-[11px] text-zinc-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300">
                    pen as agent
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_200px]">
                  <PromptCycle
                    prompts={[
                      "读取第 3 集，找出人物关系最紧张的场景，并给出证据。",
                      "把主角形态写回角色库，补充 visual tags 与 episode range。",
                      "根据当前分镜意图，生成一个 text -> imageGen 的 NodeLab 工作流。",
                      "搜索项目知识层，找出最适合做预告片的场景和对应角色状态。",
                    ]}
                  />

                  <div className="rounded-[1.5rem] border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500 dark:text-zinc-400">Event Rail</div>
                    <div className="mt-3 space-y-2">
                      {eventRail.map((item, index) => (
                        <div
                          key={item}
                          className="relative overflow-hidden rounded-[1rem] border border-black/10 bg-white/70 px-3 py-2.5 text-[11px] text-zinc-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300"
                        >
                          {index === 1 && (
                            <div className="landing-beam absolute inset-y-0 left-[-35%] w-20 bg-gradient-to-r from-transparent via-emerald-300/18 to-transparent" />
                          )}
                          <div className="relative">{item}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 rounded-[1rem] border border-black/10 bg-[#f7f2ea] px-3 py-3 dark:border-white/10 dark:bg-[#171b18]">
                      <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500 dark:text-zinc-400">Counts</div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        {[
                          { value: "04", label: "Inspect" },
                          { value: "04", label: "Knowledge" },
                          { value: "04", label: "Operate" },
                        ].map((item) => (
                          <div key={item.label}>
                            <div className="font-mono text-[20px] font-semibold tracking-[-0.05em]">{item.value}</div>
                            <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{item.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="landing-reveal rounded-[1.75rem] border border-black/10 bg-white/58 p-4 backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.04]" style={{ animationDelay: "140ms" }}>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500 dark:text-zinc-400">Meaning</div>
                  <div className="mt-3 text-[26px] font-semibold tracking-[-0.06em]">Qalam</div>
                  <div className="mt-1 text-[18px] text-zinc-500 dark:text-zinc-400">قلم</div>
                  <p className="mt-3 text-[12px] leading-6 text-zinc-700 dark:text-zinc-300">
                    不是只写文案的一支笔，而是负责记录事实、组织结构、把想法转成图。
                  </p>
                </div>

                <div className="landing-reveal rounded-[1.75rem] border border-black/10 bg-white/58 p-4 backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.04]" style={{ animationDelay: "220ms" }}>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500 dark:text-zinc-400">Flow</div>
                  <div className="mt-3 space-y-2">
                    {["Info 进入", "Landing 浏览", "立即体验", "NodeLab 继续工作"].map((item, index) => (
                      <div key={item} className="flex items-center gap-3 text-[12px] text-zinc-700 dark:text-zinc-300">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-black/[0.03] text-[10px] dark:border-white/10 dark:bg-white/[0.04]">
                          0{index + 1}
                        </div>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="landing-reveal rounded-[2rem] border border-black/10 bg-white/60 p-4 shadow-[0_26px_70px_-52px_rgba(15,23,42,0.35)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.04]" style={{ animationDelay: "180ms" }}>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">
                  <Graph size={14} weight="duotone" />
                  Runtime Architecture
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {runtimeFacts.map(({ label, value, detail, Icon }) => (
                    <div key={label} className="rounded-[1.25rem] border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-zinc-500 dark:text-zinc-400">
                        <Icon size={12} weight="duotone" className="text-emerald-700 dark:text-emerald-300" />
                        {label}
                      </div>
                      <div className="mt-2 text-[14px] font-semibold tracking-[-0.03em]">{value}</div>
                      <div className="mt-1 text-[11px] leading-5 text-zinc-700 dark:text-zinc-300">{detail}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="landing-reveal rounded-[2rem] border border-black/10 bg-zinc-950 p-4 text-white shadow-[0_36px_90px_-54px_rgba(15,23,42,0.55)] dark:border-white/10 dark:bg-[#171918]" style={{ animationDelay: "260ms" }}>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/50">
                  <Brain size={14} weight="duotone" />
                  Knowledge + Workflow
                </div>
                <div className="mt-3 space-y-2">
                  {knowledgeRows.map((item) => (
                    <div key={item} className="rounded-[1rem] border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/72">
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-4 py-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-white/45">Main entry</div>
                    <div className="mt-1 text-[13px] font-semibold">直接回到主页面继续工作</div>
                  </div>
                  <MagneticButton
                    type="button"
                    onClick={onEnterApp}
                    className="bg-white px-4 py-2 text-[11px] font-semibold text-zinc-950"
                    icon={<ArrowRight size={14} weight="bold" />}
                  >
                    立即体验
                  </MagneticButton>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};
