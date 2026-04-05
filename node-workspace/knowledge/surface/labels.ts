import type { KnowledgeNodeOrigin } from "../types";

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const formatKnowledgeKindLabel = (kind: string) => {
  const value = trim(kind);
  if (!value) return "知识节点";

  if (value === "source.script") return "剧本源";
  if (value === "source.episode") return "剧集源";
  if (value === "source.scene") return "场景源";

  const parts = value.split(".");
  const tail = trim(parts[parts.length - 1]);
  return tail || value;
};

export const formatKnowledgeOriginLabel = (origin: KnowledgeNodeOrigin) => {
  if (origin === "canonical-source") return "源事实";
  return "派生记忆";
};
