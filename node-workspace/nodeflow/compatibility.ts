const LEGACY_NODE_REF_FIELD = "qalamNodeRef";

export const readStyloNodeRef = (data?: Record<string, unknown> | null) => {
  const value = data?.styloNodeRef ?? data?.[LEGACY_NODE_REF_FIELD];
  return typeof value === "string" ? value : undefined;
};

export const stripLegacyNodeRef = <T extends Record<string, unknown>>(data: T) => {
  if (!(LEGACY_NODE_REF_FIELD in data)) return data;
  const next = { ...data };
  delete next[LEGACY_NODE_REF_FIELD];
  return next as T;
};

export const isNodeRefField = (key: string) =>
  key === "styloNodeRef" || key === LEGACY_NODE_REF_FIELD;

