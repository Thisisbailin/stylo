import type { KnowledgeNodeOrigin } from "../types";

const trim = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const formatKnowledgeKindLabel = (kind: string) => {
  const value = trim(kind);
  if (!value) return "Knowledge";

  if (value === "source.script") return "Script Source";
  if (value === "source.episode") return "Episode Source";
  if (value === "source.scene") return "Scene Source";
  if (value === "source.guide") return "Guide Document";

  const parts = value.split(".");
  const tail = trim(parts[parts.length - 1]);
  return tail || value;
};

export const formatKnowledgeOriginLabel = (origin: KnowledgeNodeOrigin) => {
  if (origin === "canonical-source") return "Source";
  return "Derived";
};
