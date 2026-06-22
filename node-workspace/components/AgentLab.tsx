import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Braces,
  Check,
  Copy,
  FileCode2,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  AGENT_PROMPT_CATALOG,
  type AgentPromptCatalogCategory,
} from "../../agents/runtime/promptCatalog.generated";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

type CategoryFilter = "all" | AgentPromptCatalogCategory;
type CopyTarget = "selected" | "filtered" | null;

const CATEGORY_META: Array<{
  key: CategoryFilter;
  label: string;
  color: string;
}> = [
  { key: "all", label: "全部", color: "#8b8b8b" },
  { key: "system", label: "System", color: "#f26b4f" },
  { key: "runtime", label: "Runtime", color: "#5b8def" },
  { key: "tool", label: "Tools", color: "#2ca58d" },
  { key: "guardrail", label: "Guardrails", color: "#d89b2b" },
  { key: "skill", label: "Skills", color: "#9b6bd3" },
];

const normalizeSearchText = (value: string) => value.trim().toLocaleLowerCase();
const TOTAL_PROMPT_CHARS = AGENT_PROMPT_CATALOG.reduce((sum, entry) => sum + entry.chars, 0);

export const AgentLab: React.FC<Props> = ({ isOpen, onClose }) => {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(AGENT_PROMPT_CATALOG[0]?.id ?? "");
  const [copyTarget, setCopyTarget] = useState<CopyTarget>(null);
  const copyResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
    },
    []
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilter, number> = {
      all: AGENT_PROMPT_CATALOG.length,
      system: 0,
      runtime: 0,
      tool: 0,
      guardrail: 0,
      skill: 0,
    };
    AGENT_PROMPT_CATALOG.forEach((entry) => {
      counts[entry.category] += 1;
    });
    return counts;
  }, []);

  const filteredEntries = useMemo(() => {
    const needle = normalizeSearchText(query);
    return AGENT_PROMPT_CATALOG.filter((entry) => {
      if (category !== "all" && entry.category !== category) return false;
      if (!needle) return true;
      return [entry.title, entry.content, entry.sourcePath, entry.kind]
        .some((value) => value.toLocaleLowerCase().includes(needle));
    });
  }, [category, query]);

  const selectedEntry = useMemo(
    () => filteredEntries.find((entry) => entry.id === selectedId) ?? filteredEntries[0] ?? null,
    [filteredEntries, selectedId]
  );

  const filteredChars = useMemo(
    () => filteredEntries.reduce((total, entry) => total + entry.chars, 0),
    [filteredEntries]
  );

  const copyText = async (text: string, target: Exclude<CopyTarget, null>) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyTarget(target);
      if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = window.setTimeout(() => setCopyTarget(null), 1400);
    } catch {
      setCopyTarget(null);
    }
  };

  const copyFiltered = () => {
    const content = filteredEntries
      .map((entry) => [
        `# ${entry.title}`,
        `${entry.category} · ${entry.sourcePath}:${entry.sourceLine}`,
        entry.content,
      ].join("\n\n"))
      .join("\n\n---\n\n");
    void copyText(content, "filtered");
  };

  if (!isOpen) return null;

  return (
    <section className="fixed inset-0 z-[90] flex min-h-[100dvh] flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-text-primary)]">
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-[var(--app-border)] bg-[var(--app-panel)] px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[var(--app-panel-soft)] text-[var(--app-accent-strong)]">
            <Braces size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[16px] font-semibold">Agent Lab</h1>
              <span className="flex items-center gap-1 text-[10px] text-[var(--app-text-muted)]">
                <ShieldCheck size={11} />
                只读
              </span>
            </div>
            <div className="mt-0.5 truncate text-[11px] text-[var(--app-text-secondary)]">
              {AGENT_PROMPT_CATALOG.length} 条提示词 · {TOTAL_PROMPT_CHARS.toLocaleString()} 字符
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--app-text-secondary)] transition hover:bg-[var(--app-panel-soft)] hover:text-[var(--app-text-primary)]"
          aria-label="关闭 Agent Lab"
          title="关闭"
        >
          <X size={18} />
        </button>
      </header>

      <div className="shrink-0 border-b border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[210px] flex-1 sm:max-w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)]" size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索提示词、文件或类型"
              className="h-9 w-full rounded-[8px] border border-[var(--app-border)] bg-[var(--app-panel-muted)] pl-9 pr-3 text-[12px] outline-none transition placeholder:text-[var(--app-text-muted)] focus:border-[var(--app-border-strong)]"
            />
          </label>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5">
            {CATEGORY_META.map((item) => {
              const active = category === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setCategory(item.key)}
                  className={`flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] px-2.5 text-[11px] transition ${
                    active
                      ? "bg-[var(--app-panel-soft)] text-[var(--app-text-primary)]"
                      : "text-[var(--app-text-secondary)] hover:bg-[var(--app-panel-muted)] hover:text-[var(--app-text-primary)]"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.label}
                  <span className="text-[10px] text-[var(--app-text-muted)]">{categoryCounts[item.key]}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={copyFiltered}
            disabled={filteredEntries.length === 0}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] border border-[var(--app-border)] px-2.5 text-[11px] text-[var(--app-text-secondary)] transition hover:bg-[var(--app-panel-soft)] hover:text-[var(--app-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copyTarget === "filtered" ? <Check size={13} /> : <Copy size={13} />}
            复制筛选结果
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(180px,36dvh)_minmax(0,1fr)] md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] md:grid-rows-1">
        <aside className="min-h-0 overflow-y-auto border-b border-[var(--app-border)] bg-[var(--app-panel)] md:border-b-0 md:border-r">
          <div className="sticky top-0 z-10 flex h-10 items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-panel)] px-4 text-[10px] text-[var(--app-text-muted)]">
            <span>{filteredEntries.length} 条结果</span>
            <span>{filteredChars.toLocaleString()} 字符</span>
          </div>
          <div>
            {filteredEntries.map((entry) => {
              const active = selectedEntry?.id === entry.id;
              const color = CATEGORY_META.find((item) => item.key === entry.category)?.color;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedId(entry.id)}
                  className={`block w-full border-b border-[var(--app-border)] px-4 py-3 text-left transition ${
                    active ? "bg-[var(--app-panel-soft)]" : "hover:bg-[var(--app-panel-muted)]"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-[var(--app-text-primary)]">{entry.title}</div>
                      <div className="mt-1 truncate font-mono text-[10px] text-[var(--app-text-muted)]">
                        {entry.sourcePath}:{entry.sourceLine}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-[9px] uppercase text-[var(--app-text-muted)]">
                        <span>{entry.kind}</span>
                        <span>{entry.chars.toLocaleString()} chars</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col bg-[var(--app-bg)]">
          {selectedEntry ? (
            <>
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-3 sm:px-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileCode2 size={14} className="shrink-0 text-[var(--app-text-muted)]" />
                    <h2 className="truncate text-[13px] font-semibold">{selectedEntry.title}</h2>
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-[var(--app-text-muted)]">
                    {selectedEntry.sourcePath}:{selectedEntry.sourceLine} · {selectedEntry.category} · {selectedEntry.kind}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void copyText(selectedEntry.content, "selected")}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-[7px] bg-[var(--app-panel-soft)] px-2.5 text-[11px] text-[var(--app-text-secondary)] transition hover:text-[var(--app-text-primary)]"
                >
                  {copyTarget === "selected" ? <Check size={13} /> : <Copy size={13} />}
                  {copyTarget === "selected" ? "已复制" : "复制"}
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6">
                <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-[var(--app-text-primary)] selection:bg-red-400/25">
                  {selectedEntry.content}
                </pre>
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-[12px] text-[var(--app-text-muted)]">
              没有匹配的提示词
            </div>
          )}
        </main>
      </div>
    </section>
  );
};
