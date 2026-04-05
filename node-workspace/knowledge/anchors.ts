import type { KnowledgeAnchor, KnowledgeAnchorType } from "./types";

export const createKnowledgeAnchor = (
  type: KnowledgeAnchorType,
  ref: string,
  span?: string
): KnowledgeAnchor => ({
  type,
  ref,
  span,
});

const KNOWN_ANCHOR_TYPES = new Set<KnowledgeAnchorType>([
  "script",
  "episode",
  "scene",
  "nodeflow",
  "asset",
]);

export const parseKnowledgeAnchorRef = (value: string): KnowledgeAnchor | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) return null;
  const type = trimmed.slice(0, separatorIndex) as KnowledgeAnchorType;
  const ref = trimmed.slice(separatorIndex + 1);
  if (!KNOWN_ANCHOR_TYPES.has(type) || !ref.trim()) return null;
  return {
    type,
    ref: ref.trim(),
  };
};

export const formatKnowledgeAnchorRef = (anchor: Pick<KnowledgeAnchor, "type" | "ref">) =>
  `${anchor.type}:${anchor.ref}`;
