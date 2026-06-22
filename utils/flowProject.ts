export const MIN_FLOW_PROJECT_DURATION = 1;
export const MAX_FLOW_PROJECT_DURATION = 450;
export const DEFAULT_FLOW_PROJECT_DURATION = 120;

export const normalizeFlowProjectDuration = (
  value: unknown,
  fallback = DEFAULT_FLOW_PROJECT_DURATION
) => {
  const numericValue = value === null || value === undefined || value === ""
    ? Number.NaN
    : Number(value);
  const numericFallback = Number(fallback);
  const duration = Number.isFinite(numericValue)
    ? numericValue
    : numericFallback;
  const resolvedDuration = Number.isFinite(duration)
    ? duration
    : DEFAULT_FLOW_PROJECT_DURATION;

  return Math.max(
    MIN_FLOW_PROJECT_DURATION,
    Math.min(MAX_FLOW_PROJECT_DURATION, Math.round(resolvedDuration))
  );
};
