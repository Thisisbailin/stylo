import type { NodeFlowTemplate } from "../types";

const TEMPLATE_STORAGE_KEY = "qalam_group_templates_v1";

export const loadNodeFlowTemplates = (): NodeFlowTemplate[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        item.nodeFlow &&
        typeof item.nodeFlow === "object" &&
        Array.isArray(item.nodeFlow.nodes) &&
        Array.isArray(item.nodeFlow.links)
    );
  } catch {
    return [];
  }
};

export const persistNodeFlowTemplates = (templates: NodeFlowTemplate[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Ignore persistence failures.
  }
};
