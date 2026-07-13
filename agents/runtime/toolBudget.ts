import { getStyloToolDescriptor, STYLO_TOOL_CATALOG } from "./toolCatalog";

export type StyloToolBudgetSnapshot = {
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
      snapshot: StyloToolBudgetSnapshot;
    }
  | {
      allowed: false;
      reason: string;
      snapshot: StyloToolBudgetSnapshot;
    };

const DEFAULT_LIMITS = {
  totalCalls: 32,
  lookupCalls: 22,
  mutationCalls: 8,
  fullReadCalls: 3,
  perTool: Object.fromEntries(STYLO_TOOL_CATALOG.map((descriptor) => [descriptor.name, descriptor.maxCallsPerRun])),
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
  getStyloToolDescriptor(toolName).countsAsFullRead === true && normalizeView(args) === "full";

export class StyloToolBudgetPolicy {
  private totalCalls = 0;
  private lookupCalls = 0;
  private mutationCalls = 0;
  private fullReadCalls = 0;
  private readonly callsByTool = new Map<string, number>();
  private readonly seenLookupSignatures = new Set<string>();

  snapshot(): StyloToolBudgetSnapshot {
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
    const descriptor = getStyloToolDescriptor(toolName);
    const nextToolCalls = (this.callsByTool.get(toolName) || 0) + 1;
    const perToolLimit = descriptor.maxCallsPerRun;
    const isLookupTool = descriptor.category === "lookup";
    const isMutationTool = descriptor.category === "mutation" || descriptor.category === "approval";
    const lookupSignature = descriptor.cacheWithinRun ? `${toolName}:${stableSerialize(args)}` : "";

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
    if (isLookupTool && this.lookupCalls + 1 > DEFAULT_LIMITS.lookupCalls) {
      return {
        allowed: false,
        reason: `Lookup budget exhausted: this run already used ${snapshotBefore.lookupCalls}/${DEFAULT_LIMITS.lookupCalls} lookup calls. Summarize from known tool results or ask for a narrower target.`,
        snapshot: snapshotBefore,
      };
    }
    if (isMutationTool && this.mutationCalls + 1 > DEFAULT_LIMITS.mutationCalls) {
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
    if (isLookupTool) {
      this.lookupCalls += 1;
      if (lookupSignature) this.seenLookupSignatures.add(lookupSignature);
    }
    if (isMutationTool) this.mutationCalls += 1;
    if (isFullRead(toolName, args)) this.fullReadCalls += 1;

    return {
      allowed: true,
      snapshot: this.snapshot(),
    };
  }
}

export const createStyloToolBudgetPolicy = () => new StyloToolBudgetPolicy();
