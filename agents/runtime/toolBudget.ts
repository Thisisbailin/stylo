const LOOKUP_TOOLS = new Set([
  "find_documents",
  "read_document",
  "list_project_resources",
  "read_project_resource",
  "search_project_resource",
]);

const MUTATION_TOOLS = new Set([
  "create_document",
  "update_document",
  "connect_flow_nodes",
  "move_flow_node",
  "operate_project_resource",
  "prepare_generation_execution",
  "cancel_generation_execution",
]);

export type QalamToolBudgetSnapshot = {
  totalCalls: number;
  lookupCalls: number;
  mutationCalls: number;
  fullReadCalls: number;
  callsByTool: Record<string, number>;
  limits: {
    totalCalls: number;
    lookupCalls: number;
    mutationCalls: number;
    fullReadCalls: number;
    perTool: Record<string, number>;
  };
};

type ToolBudgetDecision =
  | {
      allowed: true;
      snapshot: QalamToolBudgetSnapshot;
    }
  | {
      allowed: false;
      reason: string;
      snapshot: QalamToolBudgetSnapshot;
    };

const DEFAULT_LIMITS = {
  totalCalls: 32,
  lookupCalls: 22,
  mutationCalls: 8,
  fullReadCalls: 3,
  perTool: {
    find_documents: 8,
    read_document: 14,
    create_document: 5,
    update_document: 8,
    connect_flow_nodes: 6,
    move_flow_node: 6,
    list_project_resources: 4,
    search_project_resource: 8,
    read_project_resource: 10,
    operate_project_resource: 4,
    prepare_generation_execution: 2,
    cancel_generation_execution: 2,
  },
};

const stableSerialize = (value: unknown): string => {
  if (value == null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
};

const normalizeView = (args: Record<string, unknown>) =>
  typeof args.view === "string" ? args.view.trim().toLowerCase() : "";

const isFullRead = (toolName: string, args: Record<string, unknown>) =>
  (toolName === "read_project_resource" || toolName === "read_document") &&
  normalizeView(args) === "full";

const isLookupTool = (toolName: string) => LOOKUP_TOOLS.has(toolName);
const isMutationTool = (toolName: string) => MUTATION_TOOLS.has(toolName);

export class QalamToolBudgetPolicy {
  private totalCalls = 0;
  private lookupCalls = 0;
  private mutationCalls = 0;
  private fullReadCalls = 0;
  private readonly callsByTool = new Map<string, number>();
  private readonly seenLookupSignatures = new Set<string>();

  snapshot(): QalamToolBudgetSnapshot {
    return {
      totalCalls: this.totalCalls,
      lookupCalls: this.lookupCalls,
      mutationCalls: this.mutationCalls,
      fullReadCalls: this.fullReadCalls,
      callsByTool: Object.fromEntries(this.callsByTool),
      limits: {
        totalCalls: DEFAULT_LIMITS.totalCalls,
        lookupCalls: DEFAULT_LIMITS.lookupCalls,
        mutationCalls: DEFAULT_LIMITS.mutationCalls,
        fullReadCalls: DEFAULT_LIMITS.fullReadCalls,
        perTool: { ...DEFAULT_LIMITS.perTool },
      },
    };
  }

  reserve(toolName: string, args: Record<string, unknown>): ToolBudgetDecision {
    const snapshotBefore = this.snapshot();
    const nextToolCalls = (this.callsByTool.get(toolName) || 0) + 1;
    const perToolLimit = DEFAULT_LIMITS.perTool[toolName as keyof typeof DEFAULT_LIMITS.perTool];
    const lookupSignature = isLookupTool(toolName) ? `${toolName}:${stableSerialize(args)}` : "";

    if (this.totalCalls + 1 > DEFAULT_LIMITS.totalCalls) {
      return {
        allowed: false,
        reason: `Tool budget exhausted: this run already used ${snapshotBefore.totalCalls}/${DEFAULT_LIMITS.totalCalls} tool calls. Answer from the information already gathered or ask the user to narrow the task.`,
        snapshot: snapshotBefore,
      };
    }
    if (perToolLimit && nextToolCalls > perToolLimit) {
      return {
        allowed: false,
        reason: `Tool budget exhausted: ${toolName} already reached ${perToolLimit} calls in this run. Use the previous results instead of calling it again.`,
        snapshot: snapshotBefore,
      };
    }
    if (isLookupTool(toolName) && this.lookupCalls + 1 > DEFAULT_LIMITS.lookupCalls) {
      return {
        allowed: false,
        reason: `Lookup budget exhausted: this run already used ${snapshotBefore.lookupCalls}/${DEFAULT_LIMITS.lookupCalls} project-read calls. Summarize from known tool results or ask for a narrower target.`,
        snapshot: snapshotBefore,
      };
    }
    if (isMutationTool(toolName) && this.mutationCalls + 1 > DEFAULT_LIMITS.mutationCalls) {
      return {
        allowed: false,
        reason: `Mutation budget exhausted: this run already used ${snapshotBefore.mutationCalls}/${DEFAULT_LIMITS.mutationCalls} write or approval calls. Stop and report what changed so far.`,
        snapshot: snapshotBefore,
      };
    }
    if (lookupSignature && this.seenLookupSignatures.has(lookupSignature)) {
      return {
        allowed: false,
        reason: `Duplicate lookup blocked: ${toolName} was already called with the same arguments in this run. Reuse the existing result instead of repeating the query.`,
        snapshot: snapshotBefore,
      };
    }
    if (isFullRead(toolName, args) && this.fullReadCalls + 1 > DEFAULT_LIMITS.fullReadCalls) {
      return {
        allowed: false,
        reason: `Full-read budget exhausted: this run already used ${snapshotBefore.fullReadCalls}/${DEFAULT_LIMITS.fullReadCalls} detail/full document reads. Use identity/map views or answer from gathered excerpts.`,
        snapshot: snapshotBefore,
      };
    }

    this.totalCalls += 1;
    this.callsByTool.set(toolName, nextToolCalls);
    if (isLookupTool(toolName)) {
      this.lookupCalls += 1;
      if (lookupSignature) this.seenLookupSignatures.add(lookupSignature);
    }
    if (isMutationTool(toolName)) this.mutationCalls += 1;
    if (isFullRead(toolName, args)) this.fullReadCalls += 1;

    return {
      allowed: true,
      snapshot: this.snapshot(),
    };
  }
}

export const createQalamToolBudgetPolicy = () => new QalamToolBudgetPolicy();
