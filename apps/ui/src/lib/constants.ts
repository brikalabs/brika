/** Refetch intervals in milliseconds for React Query */
export const REFETCH_INTERVALS = {
  /** Health check polling (5 seconds) */
  HEALTH: 5000,
  /** Workflow status polling (5 seconds) */
  WORKFLOW_STATUS: 5000,
  /** Workflow runs polling (2 seconds) */
  WORKFLOW_RUNS: 2000,
  /** Plugin metrics polling (5 seconds) */
  PLUGIN_METRICS: 5000,
  /** Log stats polling (30 seconds) */
  LOG_STATS: 30000,
} as const;

/** Stale time in milliseconds for React Query */
export const STALE_TIMES = {
  /** Default stale time (5 minutes) */
  DEFAULT: 5 * 60 * 1000,
  /** Settings stale time (10 minutes) */
  SETTINGS: 10 * 60 * 1000,
} as const;
