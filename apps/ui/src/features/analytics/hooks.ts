import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Json } from '@/types';
import { analyticsApi, analyticsKeys } from './api';
import type { EventQueryParams, TimeSeriesParams } from './types';

/**
 * How often the dashboard re-queries the hub for fresh aggregates. Picked to
 * feel "live" without hammering SQLite (capture is best-effort and the
 * ring/store update fast), matches the cadence the logs feature uses.
 */
const DASHBOARD_REFETCH_MS = 30_000;
/** Recent-events stream refreshes more often so the live feed actually moves. */
const RECENT_REFETCH_MS = 5_000;

/**
 * Returns a stable `capture` function for recording feature-usage events from
 * anywhere in the UI. Fire-and-forget, calling it never throws or blocks.
 *
 * @example
 * ```tsx
 * const capture = useCapture();
 * <Button onClick={() => { capture('board.created', { columns }); create(); }} />
 * ```
 */
export function useCapture(): (name: string, props?: Record<string, Json>) => void {
  return useCallback((name: string, props?: Record<string, Json>) => {
    analyticsApi.capture(name, props);
  }, []);
}

/** Aggregate stats for the analytics dashboard. */
export function useEventStats() {
  return useQuery({
    queryKey: analyticsKeys.stats,
    queryFn: () => analyticsApi.getStats(),
    refetchInterval: DASHBOARD_REFETCH_MS,
  });
}

/** Distinct event names with counts, for usage charts. */
export function useTopEventNames() {
  return useQuery({
    queryKey: analyticsKeys.names,
    queryFn: () => analyticsApi.getNames(),
    refetchInterval: DASHBOARD_REFETCH_MS,
  });
}

/** Event counts grouped by source and by plugin, for the overview breakdowns. */
export function useEventBreakdown() {
  return useQuery({
    queryKey: analyticsKeys.breakdown,
    queryFn: () => analyticsApi.getBreakdown(),
    refetchInterval: DASHBOARD_REFETCH_MS,
  });
}

/** Query stored events with filters. */
export function useCaptureEvents(params: EventQueryParams) {
  return useQuery({
    queryKey: analyticsKeys.query(params),
    queryFn: () => analyticsApi.query(params),
    refetchInterval: RECENT_REFETCH_MS,
  });
}

/**
 * Cursor-paginated event query for the explorer. Accumulates pages so "Load
 * more" appends rather than replaces, and keeps the previous page mounted on
 * a filter change so the table never blanks to skeletons mid-browse.
 */
export function useInfiniteCaptureEvents(params: EventQueryParams) {
  return useInfiniteQuery({
    queryKey: analyticsKeys.infinite(params),
    queryFn: ({ pageParam }) => analyticsApi.query({ ...params, cursor: pageParam }),
    // `as` is load-bearing here: it sets useInfiniteQuery's page-param type to
    // `number | undefined` (matching getNextPageParam). Without it the param
    // collapses to `undefined` and the overload fails. Same pattern as logs/hooks.
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

/** Event counts bucketed over time, for the activity chart. */
export function useEventTimeSeries(params: TimeSeriesParams) {
  return useQuery({
    queryKey: analyticsKeys.timeseries(params),
    queryFn: () => analyticsApi.getTimeSeries(params),
    refetchInterval: DASHBOARD_REFETCH_MS,
  });
}
